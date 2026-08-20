const express = require('express');
const crypto  = require('crypto');
const bcrypt  = require('bcryptjs');
const mysql   = require('mysql2/promise');
const { getPool } = require('../db');
const { checkDbConnection, authMiddleware } = require('../middleware');
const { ADMIN_EMAIL, POSITIONS, POSITION_KEYS } = require('../adminConfig');
const { ensureUsersPositionColumn } = require('../migrations');
const dbEnv = require('../dbEnvironments');

const router = express.Router();
router.use(checkDbConnection);
router.use(authMiddleware);

/** 관리자 전용 라우트 공통 가드 — position + 고정 이메일 이중 확인 */
function requireAdmin(req, res, next) {
  if (req.user.position !== 'admin' || req.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ ok: false, message: '관리자만 접근할 수 있습니다.' });
  }
  next();
}
router.use(requireAdmin);

/** 임시 비밀번호 생성 (읽기 쉬운 형태) */
function generateTempPassword() {
  return crypto.randomBytes(6).toString('base64').replace(/[+/=]/g, '').slice(0, 10) + 'A1!';
}

// ── 역할 메타 정보 ──────────────────────────────────────────
router.get('/positions', (req, res) => {
  res.json({ ok: true, positions: POSITIONS, adminEmail: ADMIN_EMAIL });
});

// ── 현재 DB의 전체 계정 목록 (+ 각 계정이 접근 가능한 DB 환경) ──
router.get('/users', async (req, res) => {
  try {
    const [rows] = await getPool().execute(
      `SELECT id, email, name, position, approved, created_at FROM users ORDER BY created_at`
    );
    const data = rows.map(u => ({
      ...u,
      accessibleEnvironments: dbEnv.environmentsForEmail(u.email),
    }));
    res.json({ ok: true, data });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ── 계정 역할 변경 ──────────────────────────────────────────
router.put('/users/:id/role', async (req, res) => {
  try {
    const { position } = req.body;
    if (!POSITION_KEYS.includes(position)) {
      return res.json({ ok: false, message: '올바르지 않은 역할입니다.' });
    }

    const [[target]] = await getPool().execute(`SELECT email FROM users WHERE id=?`, [req.params.id]);
    if (!target) return res.json({ ok: false, message: '계정을 찾을 수 없습니다.' });

    if (position === 'admin' && target.email !== ADMIN_EMAIL) {
      return res.json({ ok: false, message: `관리자 역할은 ${ADMIN_EMAIL} 계정에만 부여할 수 있습니다.` });
    }

    await getPool().execute(`UPDATE users SET position=? WHERE id=?`, [position, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ── 비밀번호 강제 초기화 (조회 불가 — 임시 비밀번호 새로 발급) ──
router.put('/users/:id/reset-password', async (req, res) => {
  try {
    const [[target]] = await getPool().execute(`SELECT id FROM users WHERE id=?`, [req.params.id]);
    if (!target) return res.json({ ok: false, message: '계정을 찾을 수 없습니다.' });

    const tempPassword = generateTempPassword();
    const hash = await bcrypt.hash(tempPassword, 10);
    await getPool().execute(`UPDATE users SET password=? WHERE id=?`, [hash, req.params.id]);

    // 임시 비밀번호는 이 응답에서 딱 한 번만 노출된다 (DB에는 해시만 저장됨)
    res.json({ ok: true, tempPassword });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ── 계정 승인/거부 (관리자 전용으로 통합) ────────────────────
router.put('/users/:id/approve', async (req, res) => {
  try {
    const { approved } = req.body;
    await getPool().execute(`UPDATE users SET approved=? WHERE id=?`, [approved ? 1 : 0, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// DB 환경 관리
// ══════════════════════════════════════════════════════════════

/** 대상 DB에 잠깐 연결해서 연결 테스트만 수행 (연결 성공 여부 확인용) */
async function testConnection(config) {
  const conn = await mysql.createConnection({
    host: config.host, port: Number(config.port) || 3306,
    user: config.user, password: config.password, database: config.database,
    charset: 'utf8mb4', connectTimeout: 8000,
  });
  try { await conn.query('SELECT 1'); }
  finally { await conn.end(); }
}

// ── 등록된 DB 환경 목록 (비밀번호는 마스킹) ──────────────────
router.get('/environments', (req, res) => {
  const envs = dbEnv.listEnvironments().map(e => ({
    id: e.id, label: e.label, host: e.host, port: e.port,
    user: e.user, database: e.database, createdAt: e.createdAt,
    grantedEmails: e.grantedEmails,
  }));
  res.json({ ok: true, data: envs });
});

// ── 새 DB 환경 등록 ───────────────────────────────────────────
router.post('/environments', async (req, res) => {
  try {
    const { label, host, port, user, password, database } = req.body;
    if (!label?.trim() || !host?.trim() || !user?.trim() || !database?.trim()) {
      return res.json({ ok: false, message: '이름/호스트/사용자명/DB명을 모두 입력해주세요.' });
    }

    try {
      await testConnection({ host, port, user, password, database });
    } catch (e) {
      return res.json({ ok: false, message: `DB 연결 테스트 실패: ${e.message}` });
    }

    const env = dbEnv.addEnvironment({ label: label.trim(), host: host.trim(), port, user: user.trim(), password, database: database.trim() });
    res.json({ ok: true, id: env.id });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.delete('/environments/:id', (req, res) => {
  try {
    dbEnv.removeEnvironment(req.params.id);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ── 특정 계정에 DB 환경 접근 권한 부여 + 실제 계정 연동(생성) ──
router.post('/environments/:id/grant', async (req, res) => {
  const { userId } = req.body;
  try {
    const env = dbEnv.findEnvironment(req.params.id);
    if (!env) return res.json({ ok: false, message: '등록되지 않은 DB 환경입니다.' });

    const [[account]] = await getPool().execute(
      `SELECT email, name, position, password FROM users WHERE id=?`, [userId]
    );
    if (!account) return res.json({ ok: false, message: '계정을 찾을 수 없습니다.' });

    // 1) 레지스트리에 접근 권한 기록
    dbEnv.grantAccess(env.id, account.email);

    // 2) 대상 DB에 실제 계정 연동 (기존 비밀번호 해시를 그대로 복사 — 평문 없이도 동일 비밀번호 유지)
    const conn = await mysql.createConnection({
      host: env.host, port: env.port, user: env.user, password: env.password, database: env.database,
      charset: 'utf8mb4', connectTimeout: 8000,
    });
    try {
      await ensureUsersPositionColumn(conn); // 대상 DB의 position 컬럼도 5단계 역할을 받을 수 있도록 확장
      const [[existing]] = await conn.execute(`SELECT id FROM users WHERE email=?`, [account.email]);
      if (existing) {
        await conn.execute(
          `UPDATE users SET name=?, password=?, position=?, approved=1 WHERE id=?`,
          [account.name, account.password, account.position, existing.id]
        );
      } else {
        await conn.execute(
          `INSERT INTO users (email, name, password, position, approved) VALUES (?,?,?,?,1)`,
          [account.email, account.name, account.password, account.position]
        );
      }
    } finally {
      await conn.end();
    }

    res.json({ ok: true, message: `${account.email} 계정이 "${env.label}" 환경에 연동되었습니다.` });
  } catch (err) {
    res.json({ ok: false, message: `연동 실패: ${err.message}` });
  }
});

// ── 접근 권한 회수 (레지스트리 기록만 제거, 대상 DB 계정은 유지) ──
router.post('/environments/:id/revoke', (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.json({ ok: false, message: '이메일이 필요합니다.' });
    dbEnv.revokeAccess(req.params.id, email);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

module.exports = router;