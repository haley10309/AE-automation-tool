// ── DB 연결 풀 싱글톤 ─────────────────────────────────────────
const mysql = require('mysql2/promise');
const { ensureUsersPositionColumn } = require('./migrations');

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
  // 마이그레이션은 서버 시작을 막지 않도록 논블로킹으로 실행 (실패해도 무시)
  ensureUsersPositionColumn(pool).catch(() => {});
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
  // 이 DB에 5단계 역할을 위한 컬럼 확장 마이그레이션 적용
  await ensureUsersPositionColumn(pool);
  return pool;
}

module.exports = { getPool, initPool, reconnect };