const express = require('express');
const { getPool } = require('../db');
const { checkDbConnection, authMiddleware } = require('../middleware');


const router = express.Router();
router.use(checkDbConnection);

router.post('/save', async (req, res) => {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const { meta, allRows } = req.body;
    const [r] = await conn.execute(
      `INSERT INTO copy_requests (product_name, requester, request_date, note) VALUES (?,?,?,?)`,
      [meta.product_name, meta.requester || null, meta.request_date, meta.note || null]
    );
    const requestId = r.insertId;
    if (allRows?.length) {
      const values = allRows.map(row => [requestId, row.row, row.asWas, row.toBe, row.status]);
      await conn.query(`INSERT INTO copy_rows (request_id, row_index, as_was, to_be, status) VALUES ?`, [values]);
    }
    await conn.commit();
    res.json({ ok: true, requestId });
  } catch (err) { 
    await conn.rollback(); 
    res.json({ ok: false, message: err.message }); 
  } finally { conn.release(); }
});

router.get('/requests', async (req, res) => {
  try {
    const [rows] = await getPool().execute(`
      SELECT r.id, r.product_name, r.requester, r.request_date, r.note, r.created_at,
             COUNT(c.id) AS total_rows, SUM(c.status != '동일') AS diff_rows
      FROM copy_requests r LEFT JOIN copy_rows c ON c.request_id = r.id AND c.deleted = 0
      WHERE r.deleted = 0
      GROUP BY r.id ORDER BY r.created_at DESC`);
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.delete('/requests/:id', async (req, res) => {
  try {
    await getPool().execute(`UPDATE copy_requests SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.get('/rows', async (req, res) => {
  try {
    const { requestId, diffOnly } = req.query;
    let sql = `SELECT * FROM copy_rows WHERE request_id = ? AND deleted = 0`;
    if (diffOnly === 'true') sql += ` AND status != '동일'`;
    sql += ` ORDER BY row_index`;
    const [rows] = await getPool().execute(sql, [requestId]);
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.put('/rows/:id', async (req, res) => {
  try {
    const { as_was, to_be } = req.body;
    const a = (as_was || '').trim(), b = (to_be || '').trim();
    let status = '동일';
    if (a !== b) { 
      if (!a && b) status = '추가'; 
      else if (a && !b) status = '삭제'; 
      else status = '변경'; 
    }
    await getPool().execute(`UPDATE copy_rows SET as_was=?, to_be=?, status=? WHERE id=?`, [as_was, to_be, status, req.params.id]);
    res.json({ ok: true, status });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.delete('/rows/:id', async (req, res) => {
  try {
    await getPool().execute(`UPDATE copy_rows SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

module.exports = router;