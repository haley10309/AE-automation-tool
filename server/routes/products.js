'use strict';
const express = require('express');
const { getPool, checkDbConnection, authMiddleware } = require('../db');
const { ALL_SITE_CODES, SEED_PRODUCTS } = require('../seeds');

const productRouter = express.Router();
// pool은 요청 시점에 getPool()로 가져옴
const pool = { execute: (...a) => getPool().execute(...a), query: (...a) => getPool().query(...a), getConnection: () => getPool().getConnection() };

productRouter.get('/', async (req, res) => {
  if (!getPool()) {
    const data = SEED_PRODUCTS.map((p, i) => ({
      id: i + 1, name: p.name, aliases: p.aliases,
      excluded_countries: p.excluded,
      countries: ALL_SITE_CODES.filter(c => !p.excluded.includes(c))
    }));
    return res.json({ ok: true, data });
  }
  try {
    const [rows] = await pool.execute(`SELECT * FROM samsung_products WHERE deleted = 0 ORDER BY id`);
    const data = rows.map(r => ({
      ...r,
      aliases: typeof r.aliases === 'string' ? JSON.parse(r.aliases) : r.aliases,
      excluded_countries: typeof r.excluded_countries === 'string' ? JSON.parse(r.excluded_countries) : r.excluded_countries,
    }));
    data.forEach(p => { p.countries = ALL_SITE_CODES.filter(c => !p.excluded_countries.includes(c)); });
    res.json({ ok: true, data });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

productRouter.post('/', checkDbConnection, async (req, res) => {
  try {
    const { name, aliases, excluded_countries } = req.body;
    if (!name?.trim()) return res.json({ ok: false, message: '제품명을 입력해주세요.' });
    const [r] = await pool.execute(
      `INSERT INTO samsung_products (name, aliases, excluded_countries) VALUES (?,?,?)`,
      [name.trim(), JSON.stringify(aliases || []), JSON.stringify(excluded_countries || [])]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

productRouter.put('/:id', checkDbConnection, async (req, res) => {
  try {
    const { name, aliases, excluded_countries, changedBy } = req.body;
    const productId = req.params.id;

    // 수정 전 데이터 조회 (as-was)
    const [[before]] = await pool.execute(`SELECT name, aliases, excluded_countries FROM samsung_products WHERE id = ?`, [productId]);
    const beforeExcluded = typeof before.excluded_countries === 'string' ? JSON.parse(before.excluded_countries) : before.excluded_countries;
    const beforeAliases  = typeof before.aliases === 'string' ? JSON.parse(before.aliases) : before.aliases;

    // 실제 수정
    await pool.execute(
      `UPDATE samsung_products SET name=?, aliases=?, excluded_countries=? WHERE id=?`,
      [name.trim(), JSON.stringify(aliases || []), JSON.stringify(excluded_countries || []), productId]
    );

    // 변경된 필드만 히스토리 기록
    const historyRows = [];
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const editor = changedBy || null;

    if (before.name !== name.trim()) {
      historyRows.push([productId, editor, now, 'name', before.name, name.trim()]);
    }
    const aliasesStr   = JSON.stringify(aliases || []);
    const beforeAliasesStr = JSON.stringify(beforeAliases);
    if (aliasesStr !== beforeAliasesStr) {
      historyRows.push([productId, editor, now, 'aliases', beforeAliasesStr, aliasesStr]);
    }
    const excStr       = JSON.stringify([...(excluded_countries || [])].sort());
    const beforeExcStr = JSON.stringify([...beforeExcluded].sort());
    if (excStr !== beforeExcStr) {
      historyRows.push([productId, editor, now, 'excluded_countries', beforeExcStr, excStr]);
    }

    if (historyRows.length > 0) {
      await pool.query(
        `INSERT INTO product_launch_history (product_id, changed_by, changed_at, field, as_was, to_be) VALUES ?`,
        [historyRows]
      );
    }

    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

productRouter.get('/:id/history', checkDbConnection, async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, field, as_was, to_be, changed_by, changed_at
       FROM product_launch_history
       WHERE product_id = ?
       ORDER BY changed_at DESC`,
      [req.params.id]
    );
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

productRouter.delete('/:id', checkDbConnection, async (req, res) => {
  try {
    await pool.execute(`UPDATE samsung_products SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

module.exports = productRouter;