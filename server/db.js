// ── DB 연결 풀 싱글톤 ─────────────────────────────────────────
const mysql = require('mysql2/promise');

let pool = null;

/** 환경변수로 pool 초기화 (서버 시작 시 1회 호출) */
function initPool(config = {}) {
  pool = mysql.createPool({
    host:             config.host     || process.env.DB_HOST     || 'localhost',
    port:             config.port     || process.env.DB_PORT     || 3306,
    user:             config.user     || process.env.DB_USER     || 'root',
    password:         config.password || process.env.DB_PASSWORD || '',
    database:         config.database || process.env.DB_NAME     || 'ae-auto-db',
    waitForConnections: true,
    connectionLimit:  10,
    queueLimit:       0,
    charset:          'utf8mb4',
  });
  return pool;
}

/** 현재 pool 반환 (null 이면 미연결 상태) */
function getPool() {
  return pool;
}

/** 새 config로 pool 교체 (DB 설정 탭에서 수동 연결 시) */
async function reconnect(config) {
  if (pool) {
    try { await pool.end(); } catch (_) {}
  }
  pool = mysql.createPool({
    host:     config.host,
    port:     Number(config.port) || 3306,
    user:     config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit:  10,
    queueLimit:       0,
    charset:          'utf8mb4',
  });
  // 연결 테스트
  const conn = await pool.getConnection();
  conn.release();
  return pool;
}

module.exports = { getPool, initPool, reconnect };