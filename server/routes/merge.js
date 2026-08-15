const express = require('express');
const fs      = require('fs');
const os      = require('os');
const path    = require('path');
const { execFile } = require('child_process');
const { getPool } = require('../db');
const { checkDbConnection, authMiddleware } = require('../middleware');

const router = express.Router();
router.use(authMiddleware);

// 엑셀 파싱용 python 실행 파일 / 스크립트 경로
// PYTHON_BIN 환경변수로 강제 지정 가능. 없으면 PC마다 다른 설치 상태
// (python / python3 / py 중 뭐가 PATH에 있는지)를 자동 탐지해서 첫 성공한 걸 재사용한다.
const PYTHON_BIN_OVERRIDE = process.env.PYTHON_BIN || null;
const PYTHON_BIN_CANDIDATES = ['python', 'python3', 'py'];
let resolvedPythonBin = PYTHON_BIN_OVERRIDE; // 한 번 찾으면 캐싱

const PARSE_SCRIPT    = path.join(__dirname, '..', 'python', 'parse_merge_excel.py');
const PARSE_TIMEOUT_MS = Number(process.env.NASCA_PARSE_TIMEOUT_MS) || 60000; // 60초

/** python 실행 파일 후보를 순서대로 시도해서 실제 동작하는 걸 찾는다 (버전 확인만, 가볍게) */
function resolvePythonBin() {
  return new Promise((resolve, reject) => {
    if (resolvedPythonBin) return resolve(resolvedPythonBin);

    const tryNext = (i) => {
      if (i >= PYTHON_BIN_CANDIDATES.length) {
        return reject(new Error(
          `이 PC에서 python 실행 파일을 찾지 못했습니다. (시도한 이름: ${PYTHON_BIN_CANDIDATES.join(', ')})\n` +
          `Python이 설치돼 있는지, PATH에 등록돼 있는지 확인해주세요.\n` +
          `설치 후에도 안 되면 서버 실행 시 환경변수 PYTHON_BIN=실제_경로 로 직접 지정할 수 있습니다.\n` +
          `(예: PYTHON_BIN="C:\\\\Users\\\\사용자명\\\\AppData\\\\Local\\\\Programs\\\\Python\\\\Python311\\\\python.exe")`
        ));
      }
      const bin = PYTHON_BIN_CANDIDATES[i];
      execFile(bin, ['--version'], { timeout: 5000 }, (err) => {
        if (!err) { resolvedPythonBin = bin; resolve(bin); }
        else tryNext(i + 1);
      });
    };
    tryNext(0);
  });
}

/** stderr에서 python이 찍은 "EXCEL_PID:1234" 라인을 찾아 PID를 추출 */
function extractExcelPid(stderrText) {
  const m = /EXCEL_PID:(\d+)/.exec(stderrText || '');
  return m ? m[1] : null;
}

/** 타임아웃/오류로 python이 죽어도 COM으로 띄운 EXCEL.EXE는 자식 프로세스가 아니라
 *  고아로 남으므로, 알아낸 PID로 직접 강제 종료해서 좀비 프로세스 누적을 방지 */
function killZombieExcel(pid) {
  if (!pid) return;
  execFile('taskkill', ['/PID', pid, '/F'], () => { /* 실패해도 무시 (이미 종료됐을 수 있음) */ });
}

// ── [신규] 엑셀 파일 업로드 → NASCA DRM 우회(xlwings)로 파싱 후 원본 그리드 반환 ──
// NASCA DRM이 걸린 xlsx는 openpyxl/pandas로 직접 못 열기 때문에
// xlwings(COM)로 실제 Excel 앱을 띄워 열고(해당 PC의 NASCA 플러그인이 복호화 처리),
// 병합 셀도 함께 해제해 값을 채운 뒤 그리드 전체를 반환한다.
// AS-WAS: 드래그→복사→붙여넣기를 국가마다 반복 (공수↑, 휴먼 에러↑)
// TO-BE : 엑셀을 통째로 업로드하면 grid를 반환하고, 클라이언트에서
//         원문(original copy) 컬럼과 국가(local) 컬럼을 선택해 한번에 매핑
router.post('/parse-excel', async (req, res) => {
  const { fileName, dataUrl } = req.body;
  if (!dataUrl) return res.json({ ok: false, message: '파일 데이터가 없습니다.' });

  if (!fs.existsSync(PARSE_SCRIPT)) {
    return res.json({
      ok: false,
      message: `파싱 스크립트를 찾을 수 없습니다: ${PARSE_SCRIPT}\n` +
        `해당 경로에 parse_merge_excel.py 파일이 있는지 확인해주세요.`,
    });
  }

  // data URL(base64) → 임시 파일로 저장
  const base64 = dataUrl.split(',')[1] ?? dataUrl;
  const ext = path.extname(fileName || '').toLowerCase() || '.xlsx';
  const tmpPath = path.join(os.tmpdir(), `merge_import_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);

  try {
    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));

    const pythonBin = await resolvePythonBin(); // 이 PC에서 실제로 동작하는 python 실행 파일 자동 탐지

    const result = await new Promise((resolve, reject) => {
      execFile(
        pythonBin,
        [PARSE_SCRIPT, tmpPath],
        { maxBuffer: 1024 * 1024 * 50, timeout: PARSE_TIMEOUT_MS, killSignal: 'SIGTERM' },
        (err, stdout, stderr) => {
          if (err) {
            const excelPid = extractExcelPid(stderr);
            if (excelPid) killZombieExcel(excelPid); // 타임아웃/에러 시 고아 Excel 프로세스 정리

            const timedOut = err.killed || err.signal;
            console.error('[merge/parse-excel] python 실행 실패', {
              timedOut: !!timedOut, code: err.code, signal: err.signal,
              stdout, stderr, excelPid,
            });

            if (err.code === 'ENOENT') {
              // resolvePythonBin에서 --version은 성공했는데 실제 실행 시 ENOENT가 나는 드문 케이스
              // (예: 캐싱된 값이 이후 삭제/변경됨) → 캐시 무효화 후 명확한 에러 전달
              resolvedPythonBin = null;
              return reject(new Error(
                `python 실행 파일(${pythonBin})을 찾을 수 없습니다. 설치 상태나 PATH를 다시 확인해주세요.`
              ));
            }

            const detail = (stderr && stderr.trim()) || (stdout && stdout.trim()) || err.message;
            const prefix = timedOut
              ? `NASCA 처리 시간 초과(${PARSE_TIMEOUT_MS / 1000}초). ` +
                `NASCA 인증/팝업 창이 화면 뒤에 떠 있을 수 있습니다. ` +
                `NASCA_DEBUG_VISIBLE=1 환경변수로 서버를 재실행해 Excel 창이 뜨는지 확인해보세요.\n\n`
              : '';
            return reject(new Error(prefix + detail));
          }
          try { resolve(JSON.parse(stdout)); }
          catch (e) {
            console.error('[merge/parse-excel] JSON 파싱 실패', { stdout, stderr });
            reject(new Error(`파싱 스크립트 출력이 JSON이 아닙니다.\nstdout: ${stdout}\nstderr: ${stderr}`));
          }
        }
      );
    });

    if (result.errorMsg) return res.json({ ok: false, message: result.errorMsg });
    res.json({ ok: true, grid: result.grid, rowCount: result.rowCount, colCount: result.colCount });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  } finally {
    try { fs.unlinkSync(tmpPath); } catch (_) { /* 이미 없으면 무시 */ }
  }
});



// ── 프로젝트 목록
router.get('/projects', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [rows] = await getPool().execute(
      `SELECT p.id, p.title, p.en_lines, p.created_at, p.updated_at,
              COUNT(c.id) AS country_count
       FROM merge_projects p
       LEFT JOIN merge_countries c ON c.project_id = p.id AND c.deleted = 0
       WHERE p.deleted = 0
       GROUP BY p.id
       ORDER BY p.updated_at DESC`
    )
    const data = rows.map(p => {
      const enLines = (p.en_lines || '').split('\n').filter(l => l.trim() !== '')
      const { en_lines, ...rest } = p
      return { ...rest, row_count: enLines.length }
    })
    res.json({ ok: true, data })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 프로젝트 상세 (en_lines + 국가 목록)
router.get('/projects/:id', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [[project]] = await getPool().execute(
      `SELECT id, title, en_lines, created_at, updated_at FROM merge_projects WHERE id = ?`,
      [req.params.id]
    )
    if (!project) return res.json({ ok: false, message: '프로젝트 없음' })
    const [countries] = await getPool().execute(
      `SELECT id, label, raw_paste, mapped_json, created_at, updated_at FROM merge_countries WHERE project_id = ? AND deleted = 0 ORDER BY id ASC`,
      [req.params.id]
    )
    res.json({ ok: true, project, countries })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 프로젝트 생성
router.post('/projects', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const { title, enLines } = req.body
    if (!title?.trim()) return res.json({ ok: false, message: '프로젝트 이름을 입력하세요.' })
    const [result] = await getPool().execute(
      `INSERT INTO merge_projects (title, en_lines) VALUES (?, ?)`,
      [title.trim(), enLines || '']
    )
    res.json({ ok: true, id: result.insertId })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 프로젝트 수정 (제목 / en_lines 업데이트)
router.put('/projects/:id', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const { title, enLines } = req.body
    await getPool().execute(
      `UPDATE merge_projects SET title = COALESCE(?, title), en_lines = COALESCE(?, en_lines) WHERE id = ?`,
      [title ?? null, enLines ?? null, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 프로젝트 삭제 (cascade → 국가도 삭제)
router.delete('/projects/:id', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    await getPool().execute(`UPDATE merge_projects SET deleted = 1 WHERE id = ?`, [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 국가 upsert (label로 식별 — 있으면 UPDATE, 없으면 INSERT)
// ── 국가 upsert (label로 식별 — 있으면 UPDATE, 없으면 INSERT)
router.post('/projects/:id/countries', authMiddleware, async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const projectId = req.params.id
    const { countryId, label, rawPaste, mappedJson } = req.body
    const savedBy      = req.user?.name  || '알 수 없음'
    const savedByEmail = req.user?.email || ''
    if (!label?.trim()) return res.json({ ok: false, message: '국가명을 입력하세요.' })

    let finalCountryId = countryId;

    if (countryId) {
      // 1. 기존 국가 업데이트
      await getPool().execute(
        `UPDATE merge_countries SET label = ?, raw_paste = ?, mapped_json = ? WHERE id = ? AND project_id = ?`,
        [label, rawPaste || '', mappedJson || null, countryId, projectId]
      )
    } else {
      // 2. 신규 국가 추가
      const [result] = await getPool().execute(
        `INSERT INTO merge_countries (project_id, label, raw_paste, mapped_json) VALUES (?, ?, ?, ?)`,
        [projectId, label, rawPaste || '', mappedJson || null]
      )
      finalCountryId = result.insertId;
    }

    // 💡 [핵심 추가] 수정/추가 시 무조건 히스토리 테이블에 한 줄 쌓기
    // 이전 mapped_json과 비교해서 변경된 행만 diff_json으로 저장
    let prevMapped = []
    try {
      const [[prev]] = await getPool().execute(
        `SELECT mapped_json FROM merge_country_history
         WHERE country_id = ? AND project_id = ?
         ORDER BY saved_at DESC LIMIT 1`,
        [finalCountryId, projectId]
      )
      if (prev?.mapped_json) {
        prevMapped = typeof prev.mapped_json === 'string'
          ? JSON.parse(prev.mapped_json)
          : prev.mapped_json
      }
    } catch (_) { /* 첫 저장이면 무시 */ }

    // 변경된 행만 추출 (local 값이 다른 행)
    let newMapped = []
    try {
      newMapped = typeof mappedJson === 'string' ? JSON.parse(mappedJson) : (mappedJson || [])
    } catch (_) {}

    const diffRows = newMapped.reduce((acc, row, i) => {
      const prev = prevMapped[i]
      const localChanged = !prev || prev.local !== row.local
      const missingChanged = !prev || prev.missing !== row.missing
      if (localChanged || missingChanged) {
        acc.push({
          row: i + 1,
          en: row.en,
          prev_local: prev?.local ?? null,
          new_local: row.local,
          missing: row.missing || false,
        })
      }
      return acc
    }, [])

    // 최초 저장이거나 변경이 있을 때만 히스토리 기록
    if (prevMapped.length === 0 || diffRows.length > 0) {
      await getPool().execute(
        `INSERT INTO merge_country_history (project_id, country_id, label, raw_paste, mapped_json, diff_json, saved_by, saved_by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, finalCountryId, label, rawPaste || '', mappedJson || null, JSON.stringify(diffRows), savedBy, savedByEmail]
      )
    }

    res.json({ ok: true, id: Number(finalCountryId) })

  } catch (e) { 
    if (e.code === 'ER_DUP_ENTRY') {
      return res.json({ ok: false, message: '이미 이 프로젝트에 같은 이름의 국가가 존재합니다.' })
    }
    res.json({ ok: false, message: e.message }) 
  }
})
// ── 국가 삭제
router.delete('/projects/:id/countries/:countryId', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    await getPool().execute(
      `UPDATE merge_countries SET deleted = 1 WHERE id = ? AND project_id = ?`,
      [req.params.countryId, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})
// ── [3] 히스토리 조회 엔드포인트 추가 ─────────────────────────
// router.delete(...) 바로 아래에 추가
 
router.get('/projects/:id/countries/:countryId/history', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [rows] = await getPool().execute(
      `SELECT id, label, raw_paste, mapped_json, diff_json, saved_by, saved_by_email, saved_at
       FROM merge_country_history
       WHERE country_id = ? AND project_id = ?
       ORDER BY saved_at DESC`,
      [req.params.countryId, req.params.id]
    )
    res.json({ ok: true, data: rows })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})



module.exports = router;