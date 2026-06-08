'use strict';
const express = require('express');
const { getPool, checkDbConnection, authMiddleware } = require('../db');

const countryRouter = express.Router();
// pool은 요청 시점에 getPool()로 가져옴
const pool = { execute: (...a) => getPool().execute(...a), query: (...a) => getPool().query(...a), getConnection: () => getPool().getConnection() };
countryRouter.use(checkDbConnection);

countryRouter.get('/projects', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT p.*,
        COUNT(DISTINCT c.site_code)   AS country_count,
        COALESCE(MAX(c.row_index), 0) AS max_row
      FROM cc_projects p
      LEFT JOIN cc_project_copies c ON c.project_id = p.id
      WHERE p.deleted = 0
      GROUP BY p.id
      ORDER BY p.updated_at DESC`);
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.post('/projects', async (req, res) => {
  try {
    const { name, note, site_codes } = req.body;
    if (!name?.trim()) return res.json({ ok: false, message: '프로젝트명을 입력해주세요.' });
    const [r] = await pool.execute(
      `INSERT INTO cc_projects (name, note, site_codes) VALUES (?,?,?)`,
      [name.trim(), note || null, JSON.stringify(site_codes || [])]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.put('/projects/:id', async (req, res) => {
  try {
    const { name, note, site_codes } = req.body;
    await pool.execute(
      `UPDATE cc_projects SET name=?, note=?, site_codes=? WHERE id=?`,
      [name.trim(), note || null, JSON.stringify(site_codes || []), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.delete('/projects/:id', async (req, res) => {
  try {
    await pool.execute(`UPDATE cc_projects SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.get('/projects/:id/copies', async (req, res) => {
  try {
    const [copies] = await pool.execute(
      `SELECT site_code, row_index, copy_text FROM cc_project_copies WHERE project_id=? ORDER BY row_index, site_code`,
      [req.params.id]
    );
    const [[proj]] = await pool.execute(`SELECT site_codes FROM cc_projects WHERE id=?`, [req.params.id]);
    res.json({ ok: true, copies, site_codes: JSON.parse(proj?.site_codes || '[]') });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.post('/projects/:id/copies', async (req, res) => {
  const conn = await pool.getConnection();
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

countryRouter.put('/copies/cell', async (req, res) => {
  try {
    const { project_id, site_code, row_index, copy_text } = req.body;
    await pool.execute(
      `INSERT INTO cc_project_copies (project_id, site_code, row_index, copy_text)
       VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE copy_text=?, updated_at=NOW()`,
      [project_id, site_code, row_index, copy_text, copy_text]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ── 국가별 로컬어 변경 이력 ─────────────────────────────────
countryRouter.post('/projects/:id/locals-history', async (req, res) => {
  try {
    const { siteCode, localText, enRaw, savedBy, savedByEmail } = req.body
    if (!siteCode) return res.json({ ok: false, message: 'siteCode 필요' })
    await pool.execute(
      `INSERT INTO cc_locals_history (project_id, site_code, local_text, en_raw, saved_by, saved_by_email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, siteCode, localText || '', enRaw || '',
       savedBy || null, savedByEmail || null]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

countryRouter.get('/projects/:id/locals-history/:siteCode', async (req, res) => {
  try {
    const [rows] = await pool.execute(
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
countryRouter.post('/projects/:id/dnt', async (req, res) => {
  try {
    const { enRaw, siteCodes, resultJson, localsJson, savedBy } = req.body
    const [r] = await pool.execute(
      `INSERT INTO cc_project_dnt (project_id, en_raw, site_codes, result_json, locals_json, saved_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, enRaw || '', JSON.stringify(siteCodes || []),
       resultJson || null, localsJson || null, savedBy || null]
    )
    res.json({ ok: true, id: r.insertId })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

countryRouter.get('/projects/:id/dnt', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, en_raw, site_codes, result_json, locals_json, saved_by, saved_at
      FROM cc_project_dnt WHERE project_id = ? AND deleted = 0 ORDER BY saved_at DESC`,
      [req.params.id]
    )
    res.json({ ok: true, data: rows })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

countryRouter.delete('/projects/:id/dnt/:snapId', async (req, res) => {
  try {
   await pool.execute(
      `UPDATE cc_project_dnt SET deleted = 1 WHERE id = ? AND project_id = ?`,
      [req.params.snapId, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 즉석 검수 국가 목록 ─────────────────────────────────────
// GET: 저장된 국가 목록 조회
countryRouter.get('/quick-sites', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT site_code FROM quick_check_sites WHERE deleted = 0 ORDER BY sort_order ASC, added_at ASC`
    )
    res.json({ ok: true, data: rows.map(r => r.site_code) })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// POST: 국가 추가
countryRouter.post('/quick-sites', async (req, res) => {
  try {
    const { siteCode } = req.body
    if (!siteCode) return res.json({ ok: false, message: 'siteCode 필요' })
    // sort_order는 현재 최대값 + 1
    const [[{ maxOrder }]] = await pool.execute(
      `SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM quick_check_sites`
    )
    await pool.execute(
      `INSERT INTO quick_check_sites (site_code, sort_order) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE sort_order = sort_order, deleted = 0`,
      [siteCode, maxOrder + 1]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// DELETE: 국가 제거
countryRouter.delete('/quick-sites/:siteCode', async (req, res) => {
  try {
    await pool.execute(
      `UPDATE quick_check_sites SET deleted = 1 WHERE site_code = ?`,
      [req.params.siteCode]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

module.exports = countryRouter;