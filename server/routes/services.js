'use strict';
const express = require('express');
const { getPool, checkDbConnection, authMiddleware } = require('../db');

const serviceRouter = express.Router();
// pool은 요청 시점에 getPool()로 가져옴
const pool = { execute: (...a) => getPool().execute(...a), query: (...a) => getPool().query(...a), getConnection: () => getPool().getConnection() };
serviceRouter.use(checkDbConnection);

// 전체 조회 — DB → { siteCode: { samsungHealth, appsServices, carePlus, tradeIn } } 형태로 반환
serviceRouter.get('/', async (req, res) => {
  try {
    const [rows] = await pool.execute(`SELECT * FROM service_status ORDER BY site_code`);
    const data = {};
    for (const r of rows) {
      data[r.site_code] = {
        samsungHealth: r.samsung_health_text ? { text: r.samsung_health_text, url: r.samsung_health_url } : null,
        appsServices:  r.apps_services_text  ? { text: r.apps_services_text,  url: r.apps_services_url  } : null,
        carePlus:      r.care_plus_text       ? { text: r.care_plus_text,      url: r.care_plus_url      } : null,
        tradeIn:       r.trade_in_text        ? { text: r.trade_in_text,       url: r.trade_in_url       } : null,
      };
    }
    res.json({ ok: true, data });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// 국가별 단건 수정 + 히스토리 기록
serviceRouter.put('/:siteCode', async (req, res) => {
  try {
    const { siteCode } = req.params;
    const { samsungHealth, appsServices, carePlus, tradeIn, changedBy } = req.body;

    // 수정 전 조회 (as-was)
    const [[before]] = await pool.execute(`SELECT * FROM service_status WHERE site_code = ?`, [siteCode]);

    const toVal = (obj) => obj ? { text: obj.text || null, url: obj.url || null } : { text: null, url: null };
    const after = {
      samsungHealth: toVal(samsungHealth),
      appsServices:  toVal(appsServices),
      carePlus:      toVal(carePlus),
      tradeIn:       toVal(tradeIn),
    };

    if (before) {
      await pool.execute(
        `UPDATE service_status SET
          samsung_health_text=?, samsung_health_url=?,
          apps_services_text=?,  apps_services_url=?,
          care_plus_text=?,      care_plus_url=?,
          trade_in_text=?,       trade_in_url=?
         WHERE site_code=?`,
        [
          after.samsungHealth.text, after.samsungHealth.url,
          after.appsServices.text,  after.appsServices.url,
          after.carePlus.text,      after.carePlus.url,
          after.tradeIn.text,       after.tradeIn.url,
          siteCode,
        ]
      );

      // 변경된 서비스/필드만 히스토리 기록
      const histRows = [];
      const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const editor = changedBy || null;

      const SVC_MAP = [
        { key: 'samsungHealth', textCol: 'samsung_health_text', urlCol: 'samsung_health_url' },
        { key: 'appsServices',  textCol: 'apps_services_text',  urlCol: 'apps_services_url'  },
        { key: 'carePlus',      textCol: 'care_plus_text',      urlCol: 'care_plus_url'       },
        { key: 'tradeIn',       textCol: 'trade_in_text',       urlCol: 'trade_in_url'        },
      ];
      for (const { key, textCol, urlCol } of SVC_MAP) {
        const wasText = before[textCol], wasUrl = before[urlCol];
        const nowText = after[key].text,  nowUrl = after[key].url;
        const wasOperated = !!wasText, nowOperated = !!nowText;
        if (wasOperated !== nowOperated) {
          histRows.push([siteCode, editor, now, key, 'operated', wasOperated ? 'Y' : 'N', nowOperated ? 'Y' : 'N']);
        }
        if (wasText !== nowText && nowOperated) {
          histRows.push([siteCode, editor, now, key, 'text', wasText, nowText]);
        }
        if (wasUrl !== nowUrl && nowOperated) {
          histRows.push([siteCode, editor, now, key, 'url', wasUrl, nowUrl]);
        }
      }
      if (histRows.length) {
        await pool.query(
          `INSERT INTO service_history (site_code, changed_by, changed_at, service_key, field, as_was, to_be) VALUES ?`,
          [histRows]
        );
      }
    } else {
      // 시드에 없는 신규 사이트
      await pool.execute(
        `INSERT INTO service_status (site_code, samsung_health_text, samsung_health_url, apps_services_text, apps_services_url, care_plus_text, care_plus_url, trade_in_text, trade_in_url)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [siteCode,
          after.samsungHealth.text, after.samsungHealth.url,
          after.appsServices.text,  after.appsServices.url,
          after.carePlus.text,      after.carePlus.url,
          after.tradeIn.text,       after.tradeIn.url,
        ]
      );
    }
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// 전체 국가 변경 이력 한번에 조회 (__all__ 경로)
serviceRouter.get('/history/all', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, site_code, service_key, field, as_was, to_be, changed_by, changed_at
       FROM service_history
       ORDER BY changed_at DESC
       LIMIT 1000`
    );
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// 국가별 히스토리 조회
serviceRouter.get('/:siteCode/history', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, service_key, field, as_was, to_be, changed_by, changed_at
       FROM service_history WHERE site_code = ? ORDER BY changed_at DESC`,
      [req.params.siteCode]
    );
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

module.exports = serviceRouter;