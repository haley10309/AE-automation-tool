'use strict';

// ── 에러 로깅 ────────────────────────────────────────────────────
const fs   = require('fs');
const path = require('path');
const LOG  = p => fs.appendFileSync(path.join(__dirname, 'server-error.log'), `[${new Date().toISOString()}] ${p}\n`);

process.on('uncaughtException',   err    => { LOG(err.stack);                       process.exit(1); });
process.on('unhandledRejection',  reason => { LOG(`UnhandledRejection: ${reason?.stack || reason}`); process.exit(1); });
LOG('서버 시작 시도');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors    = require('cors');

const { getPool, setPool, checkDbConnection } = require('./db');
const { initDB }     = require('./init');
const { SEED_PRODUCTS, SEED_SERVICE_DATA } = require('./seeds');

// .env 로드 후 환경변수로 초기 pool 생성 (require('./db') 이후에 setPool 호출)
if (process.env.DB_HOST && process.env.DB_NAME) {
  const mysql0 = require('mysql2/promise');
  setPool(mysql0.createPool({
    host:             process.env.DB_HOST,
    port:             process.env.DB_PORT || 3306,
    user:             process.env.DB_USER,
    password:         process.env.DB_PASSWORD,
    database:         process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit:  10,
    queueLimit:       0,
  }));
  console.log('✅ 환경변수로 DB pool 초기화 완료');
}

// ── 라우터 ────────────────────────────────────────────────────────
const authRouter     = require('./routes/auth');
const productRouter  = require('./routes/products');
const extractRouter  = require('./routes/extract');
const countryRouter  = require('./routes/country');
const statusRouter   = require('./routes/status');
const mergeRouter    = require('./routes/merge');
const serviceRouter  = require('./routes/services');

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// ── DB 연결 엔드포인트 ────────────────────────────────────────────
const mysql = require('mysql2/promise');

app.post('/api/connect', async (req, res) => {
  console.log('🔥 /api/connect 호출됨');
  try {
    const { host, port, user, password, database } = req.body;
    const newPool = mysql.createPool({
      host, port: Number(port), user,
      password: password || process.env.DB_PASSWORD,
      database,
      waitForConnections: true,
      connectionLimit: 10,
    });
    const conn = await newPool.getConnection();
    await conn.ping();
    conn.release();
    setPool(newPool);
    res.json({ ok: true });
  } catch (err) {
    setPool(null);
    console.error('❌ connect 실패:', err);
    res.json({ ok: false, message: err.message });
  }
});

// ── DB 초기화 엔드포인트 ─────────────────────────────────────────
app.post('/api/init', checkDbConnection, async (req, res) => {
  try {
    await initDB(getPool(), SEED_PRODUCTS, SEED_SERVICE_DATA);
    res.json({ ok: true });
  } catch (err) {
    res.json({ ok: false, message: err.message });
  }
});

// ── 라우터 마운트 ─────────────────────────────────────────────────
app.use('/api/auth',     authRouter);
app.use('/api/products', productRouter);
app.use('/api',          extractRouter);
app.use('/api/cc',       countryRouter);
app.use('/api/merge',    mergeRouter);
app.use('/api/services', serviceRouter);
app.use('/api',          statusRouter);

// ── 정적 파일 & SPA fallback ─────────────────────────────────────
const clientDist = process.env.CLIENT_DIST_PATH || path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => res.sendFile(path.join(clientDist, 'index.html')));

app.listen(PORT, () => console.log(`✅ 서버 실행 중: http://localhost:${PORT}`));