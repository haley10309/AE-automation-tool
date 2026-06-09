const express = require('express');
const { getPool } = require('../db');
const { checkDbConnection, authMiddleware } = require('../middleware');


const router = express.Router();


router.use(checkDbConnection);

// ── 1. 프로젝트 목록 (GET /projects) ──
router.get('/projects', async (req, res) => {
  try {
    const [rows] = await getPool().execute(`
      SELECT 
        p.*, 
        dnt.site_codes AS dnt_site_codes, 
        dnt.en_raw AS dnt_en_raw
      FROM cc_projects p
      LEFT JOIN (
        SELECT project_id, site_codes, en_raw
        FROM cc_project_dnt
        WHERE deleted = 0
        AND id IN (
          SELECT MAX(id) FROM cc_project_dnt WHERE deleted = 0 GROUP BY project_id
        )
      ) dnt ON dnt.project_id = p.id
      WHERE p.deleted = 0
      ORDER BY p.updated_at DESC
    `);

    const data = rows.map(p => {
      // 1. 우선순위: DNT 기록의 site_codes를 우선 사용하고, 없으면 프로젝트 기본값 사용
      const activeSiteCodes = (p.dnt_site_codes && p.dnt_site_codes !== '[]') 
                              ? p.dnt_site_codes 
                              : (p.site_codes || '[]');
      
      // 2. 국가 개수 계산
      let cCount = 0;
      try { cCount = JSON.parse(activeSiteCodes).length; } catch {}

      // 3. 행 개수 계산 (DNT 원본 데이터 기준)
      let mRow = 0;
      if (p.dnt_en_raw) {
        mRow = p.dnt_en_raw.split(/\r?\n/).filter(l => l.trim() !== '').length;
      }

      return { 
        ...p, 
        site_codes: activeSiteCodes, // 실제 데이터로 덮어쓰기
        country_count: cCount, 
        max_row: mRow 
      };
    });

    res.json({ ok: true, data });
  } catch (err) { 
    res.json({ ok: false, message: err.message }); 
  }
});


// ── 2. DNT 스냅샷 저장 (POST /projects/:id/dnt) ──
router.post('/projects/:id/dnt', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' });
  try {
    const projectId = req.params.id; // URL의 ID를 확실하게 사용
    const { enRaw, siteCodes, resultJson, localsJson, savedBy } = req.body;
    
    // 1. DNT 데이터 저장 (반드시 URL의 projectId를 사용)
    const [r] = await getPool().execute(
      `INSERT INTO cc_project_dnt (project_id, en_raw, site_codes, result_json, locals_json, saved_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [projectId, enRaw || '', JSON.stringify(siteCodes || []),
       resultJson || null, localsJson || null, savedBy || null]
    );
    
    // 2. 메인 프로젝트 테이블도 해당 ID의 데이터를 업데이트
    await getPool().execute(
      `UPDATE cc_projects SET site_codes = ?, updated_at = NOW() WHERE id = ?`,
      [JSON.stringify(siteCodes || []), projectId]
    );

    res.json({ ok: true, id: r.insertId });
  } catch (e) { 
    res.json({ ok: false, message: e.message }); 
  }
});

router.post('/projects', async (req, res) => {
  try {
    const { name, note, site_codes } = req.body;
    if (!name?.trim()) return res.json({ ok: false, message: '프로젝트명을 입력해주세요.' });
    const [r] = await getPool().execute(
      `INSERT INTO cc_projects (name, note, site_codes) VALUES (?,?,?)`,
      [name.trim(), note || null, JSON.stringify(site_codes || [])]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.put('/projects/:id', async (req, res) => {
  try {
    const { name, note, site_codes } = req.body;
    await getPool().execute(
      `UPDATE cc_projects SET name=?, note=?, site_codes=? WHERE id=?`,
      [name.trim(), note || null, JSON.stringify(site_codes || []), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.delete('/projects/:id', async (req, res) => {
  try {
    await getPool().execute(`UPDATE cc_projects SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.get('/projects/:id/copies', async (req, res) => {
  try {
    const [copies] = await getPool().execute(
      `SELECT site_code, row_index, copy_text FROM cc_project_copies WHERE project_id=? ORDER BY row_index, site_code`,
      [req.params.id]
    );
    const [[proj]] = await getPool().execute(`SELECT site_codes FROM cc_projects WHERE id=?`, [req.params.id]);
    res.json({ ok: true, copies, site_codes: JSON.parse(proj?.site_codes || '[]') });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.post('/projects/:id/copies', async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const { site_codes, cells } = req.body;
    const pid = req.params.id;
    await conn.execute(
      `UPDATE cc_projects SET site_codes=?, updated_at=NOW() WHERE id=?`,
      [JSON.stringify(site_codes || []), pid]
    );
    await conn.execute(`DELETE FROM cc_project_copies WHERE project_id=?`, [pid]);
    
    if (cells?.length) {
      const vals = cells.filter(c => c.copy_text?.trim()).map(c => [pid, c.site_code, c.row_index, c.copy_text]);
      if (vals.length) {
        await conn.query(`INSERT INTO cc_project_copies (project_id, site_code, row_index, copy_text) VALUES ?`, [vals]);
      }
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) { 
    await conn.rollback(); 
    res.json({ ok: false, message: err.message }); 
  } finally { conn.release(); }
});

router.put('/copies/cell', async (req, res) => {
  try {
    const { project_id, site_code, row_index, copy_text } = req.body;
    await getPool().execute(
      `INSERT INTO cc_project_copies (project_id, site_code, row_index, copy_text)
       VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE copy_text=?, updated_at=NOW()`,
      [project_id, site_code, row_index, copy_text, copy_text]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ── 국가별 로컬어 변경 이력 ─────────────────────────────────
router.post('/projects/:id/locals-history', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const { siteCode, localText, enRaw, savedBy, savedByEmail } = req.body
    if (!siteCode) return res.json({ ok: false, message: 'siteCode 필요' })
    await getPool().execute(
      `INSERT INTO cc_locals_history (project_id, site_code, local_text, en_raw, saved_by, saved_by_email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, siteCode, localText || '', enRaw || '',
       savedBy || null, savedByEmail || null]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

router.get('/projects/:id/locals-history/:siteCode', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [rows] = await getPool().execute(
      `SELECT id, site_code, local_text, en_raw, saved_by, saved_by_email, saved_at
       FROM cc_locals_history
       WHERE project_id = ? AND site_code = ?
       ORDER BY saved_at DESC LIMIT 50`,
      [req.params.id, req.params.siteCode]
    )
    res.json({ ok: true, data: rows })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── DNT 사전 검증 스냅샷 ────────────────────────────────────


router.get('/projects/:id/dnt', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [rows] = await getPool().execute(
      `SELECT id, en_raw, site_codes, result_json, locals_json, saved_by, saved_at
      FROM cc_project_dnt WHERE project_id = ? AND deleted = 0 ORDER BY saved_at DESC`,
      [req.params.id]
    )
    res.json({ ok: true, data: rows })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

router.delete('/projects/:id/dnt/:snapId', async (req, res) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
   await getPool().execute(
      `UPDATE cc_project_dnt SET deleted = 1 WHERE id = ? AND project_id = ?`,
      [req.params.snapId, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 즉석 검수 국가 목록 ─────────────────────────────────────
// GET: 저장된 국가 목록 조회
router.get('/quick-sites', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT site_code FROM quick_check_sites WHERE deleted = 0 ORDER BY sort_order ASC, added_at ASC`
    )
    res.json({ ok: true, data: rows.map(r => r.site_code) })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// POST: 국가 추가
router.post('/quick-sites', async (req, res) => {
  try {
    const { siteCode } = req.body
    if (!siteCode) return res.json({ ok: false, message: 'siteCode 필요' })
    // sort_order는 현재 최대값 + 1
    const [[{ maxOrder }]] = await getPool().execute(
      `SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM quick_check_sites`
    )
    await getPool().execute(
      `INSERT INTO quick_check_sites (site_code, sort_order) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE sort_order = sort_order, deleted = 0`,
      [siteCode, maxOrder + 1]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// DELETE: 국가 제거
router.delete('/quick-sites/:siteCode', async (req, res) => {
  try {
    await getPool().execute(
      `UPDATE quick_check_sites SET deleted = 1 WHERE site_code = ?`,
      [req.params.siteCode]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

module.exports = router;