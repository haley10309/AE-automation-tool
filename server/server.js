// ── 에러 로깅 (최우선 실행) ──────────────────────────────────
const fs   = require('fs');
const path = require('path');
const LOG  = path.join(__dirname, 'server-error.log');

const logErr = (label, err) =>
  fs.appendFileSync(LOG, `[${new Date().toISOString()}] ${label}: ${err?.stack || err}\n`);

process.on('uncaughtException',  err  => { logErr('uncaughtException',  err); process.exit(1); });
process.on('unhandledRejection', reason => { logErr('unhandledRejection', reason); process.exit(1); });
fs.appendFileSync(LOG, `[${new Date().toISOString()}] 서버 시작 시도\n`);

// ── 기본 설정 ─────────────────────────────────────────────────
require('dotenv').config();

const express = require('express');
const cors    = require('cors');
const http    = require('http');
const { Server } = require('socket.io');
const { initPool } = require('./db');
const { setIO } = require('./realtime');
const { setDataDir } = require('./paths');

// db-environments.json 등 로컬 데이터 파일이 실제 exe 위치에 저장되도록,
// 진입점 스크립트(server.js)의 안전한 __dirname을 공유 모듈에 주입
setDataDir(__dirname);

const app  = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));

// 환경변수로 pool 초기화 (저장된 설정이 있으면 자동 연결)
if (process.env.DB_HOST) {
  try { initPool(); } catch (_) { /* 연결 실패 시 수동 연결 대기 */ }
}

// ── 라우터 마운트 ─────────────────────────────────────────────
const initRouter    = require('./routes/init');
const authRouter    = require('./routes/auth');
const productRouter = require('./routes/products');
const extractRouter = require('./routes/extract');
const countryRouter = require('./routes/country');
const statusRouter  = require('./routes/status');
const mergeRouter   = require('./routes/merge');
const serviceRouter = require('./routes/service');
const adminRouter   = require('./routes/admin');

app.use('/api',          initRouter);     // POST /api/connect, /api/init
app.use('/api/auth',     authRouter);     // POST /api/auth/register, /login, GET /me
app.use('/api/products', productRouter);  // CRUD /api/products
app.use('/api',          extractRouter);  // POST /api/save, GET /api/requests, /api/rows
app.use('/api/cc',       countryRouter);  // /api/cc/projects, /copies, /dnt, /locals-history
app.use('/api',          statusRouter);   // /api/tracker/*, /api/files
app.use('/api/merge',    mergeRouter);    // /api/merge/projects, /countries, /history
app.use('/api/services', serviceRouter);  // /api/services
app.use('/api/admin',    adminRouter);    // /api/admin/users, /environments (관리자 전용)

// ── 정적 파일 & SPA fallback ──────────────────────────────────
const clientDist = process.env.CLIENT_DIST_PATH
  || path.join(__dirname, '../client/dist');

if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res) =>
    res.sendFile(path.join(clientDist, 'index.html'))
  );
}

// ── 서버 실행 (HTTP + Socket.io) ─────────────────────────────
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: '*' },
});

io.on('connection', (socket) => {
  // 클라이언트가 특정 프로젝트(pageId) 화면을 열면 해당 room에 join
  socket.on('page:join', (pageId) => {
    if (!pageId) return;
    socket.join(`page-${pageId}`);
  });
  socket.on('page:leave', (pageId) => {
    if (!pageId) return;
    socket.leave(`page-${pageId}`);
  });
});

setIO(io);

server.listen(PORT, () =>
  console.log(`✅ 서버 안 실행 중: http://localhost:${PORT}`)
);