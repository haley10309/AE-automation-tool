// ── users.position 컬럼 확장 마이그레이션 ─────────────────────
// 기존 스키마는 position이 ENUM('intern','regular') 등으로 제한돼 있어서
// 새 5단계 역할(publisher/ae/intern_publisher/intern_ae/admin) 값이
// "Data truncated for column 'position'" 에러로 거부된다.
// VARCHAR로 넓혀서 모든 역할 문자열을 허용하도록 한다.
//
// 어떤 DB 연결(mysql2 pool 또는 connection)에도 적용 가능하도록 범용으로 작성 —
// 1) 서버가 시작/재연결될 때 "현재" DB에 적용 (db.js에서 호출)
// 2) Admin 탭에서 새 DB 환경을 연동할 때 "대상" DB에도 동일하게 적용 (admin.js에서 호출)
async function ensureUsersPositionColumn(poolOrConn) {
  try {
    await poolOrConn.execute(
      `ALTER TABLE users MODIFY COLUMN position VARCHAR(30) NOT NULL`
    );
  } catch (err) {
    // 테이블/컬럼이 아직 없는 등 다른 이유의 실패는 무시 (init.js의 CREATE TABLE이 먼저 처리)
    // 이미 VARCHAR(30) 이상으로 넓혀져 있어도 MODIFY는 에러 없이 재적용되므로 별도 분기 불필요
    if (!/doesn't exist|Unknown column/i.test(err.message)) {
      console.warn('[migration] users.position 컬럼 확장 실패:', err.message);
    }
  }
}

module.exports = { ensureUsersPositionColumn };