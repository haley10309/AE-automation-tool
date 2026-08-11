const express = require('express');
const fs      = require('fs');
const os      = require('os');
const path    = require('path');
const { execFile } = require('child_process');
const { getPool } = require('../db');
const { checkDbConnection, authMiddleware } = require('../middleware');

const router = express.Router();
router.use(authMiddleware);

// 엑셀 파싱용 python 실행 파일 / 스크립트 경로 (환경변수로 재정의 가능)
const PYTHON_BIN    = process.env.PYTHON_BIN || 'python';
const PARSE_SCRIPT   = path.join(__dirname, '..', 'python', 'parse_merge_excel.py');

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

  // data URL(base64) → 임시 파일로 저장
  const base64 = dataUrl.split(',')[1] ?? dataUrl;
  const ext = path.extname(fileName || '').toLowerCase() || '.xlsx';
  const tmpPath = path.join(os.tmpdir(), `merge_import_${Date.now()}_${Math.random().toString(36).slice(2)}${ext}`);

  try {
    fs.writeFileSync(tmpPath, Buffer.from(base64, 'base64'));

    const result = await new Promise((resolve, reject) => {
      execFile(PYTHON_BIN, [PARSE_SCRIPT, tmpPath], { maxBuffer: 1024 * 1024 * 50 }, (err, stdout, stderr) => {
        if (err) return reject(new Error(stderr || err.message));
        try { resolve(JSON.parse(stdout)); }
        catch (e) { reject(new Error(`파싱 스크립트 출력 오류: ${stdout || stderr}`)); }
      });
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