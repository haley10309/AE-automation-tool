const express = require('express');
const { getPool } = require('../db');
const { checkDbConnection, authMiddleware } = require('../middleware');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { JWT_SECRET, JWT_EXPIRES } = require('../constants');
const { ADMIN_EMAIL, POSITION_KEYS, STAFF_POSITIONS } = require('../adminConfig');

const router = express.Router();



router.post('/register', async (req, res) => {
  if (!getPool()) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { email, name, password, position } = req.body
    if (!email?.trim())    return res.json({ ok:false, message:'이메일을 입력해주세요.' })
    if (!name?.trim())     return res.json({ ok:false, message:'이름을 입력해주세요.' })
    if (!password?.trim()) return res.json({ ok:false, message:'비밀번호를 입력해주세요.' })
    if (password.length < 8) return res.json({ ok:false, message:'비밀번호는 8자 이상이어야 합니다.' })

    const normalizedEmail = email.trim().toLowerCase()
    const isAdminEmail = normalizedEmail === ADMIN_EMAIL

    // 'admin' 역할은 고정된 관리자 이메일 계정에만 자동 부여되고,
    // 그 외 계정은 직접 'admin'을 선택할 수 없다.
    let finalPosition = position
    if (isAdminEmail) {
      finalPosition = 'admin'
    } else if (!POSITION_KEYS.includes(position) || position === 'admin') {
      return res.json({ ok:false, message:'직책을 선택해주세요.' })
    }

    // 이메일 중복 확인
    const [[existing]] = await getPool().execute(`SELECT id FROM users WHERE email=?`, [normalizedEmail])
    if (existing) return res.json({ ok:false, message:'이미 가입된 이메일입니다.' })

    const hash = await bcrypt.hash(password, 10)
    // 관리자 이메일 또는 첫 번째 가입자는 자동 승인
    const [[{ cnt }]] = await getPool().execute(`SELECT COUNT(*) AS cnt FROM users`)
    const approved = (cnt === 0 || isAdminEmail) ? 1 : 0

    await getPool().execute(
      `INSERT INTO users (email, name, password, position, approved) VALUES (?,?,?,?,?)`,
      [normalizedEmail, name.trim(), hash, finalPosition, approved]
    )
    res.json({ ok:true, message: approved ? '가입이 완료되었습니다. 로그인해주세요.' : '가입 신청이 완료되었습니다. 관리자 승인 후 로그인하실 수 있습니다.' })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

router.post('/login', async (req, res) => {
  if (!getPool()) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { email, password } = req.body
    if (!email || !password) return res.json({ ok:false, message:'이메일과 비밀번호를 입력해주세요.' })

    let [[user]] = await getPool().execute(`SELECT * FROM users WHERE email=?`, [email.trim().toLowerCase()])
    if (!user) return res.json({ ok:false, message:'이메일 또는 비밀번호가 올바르지 않습니다.' })

    // 관리자 이메일인데 아직 admin 역할이 아니거나 미승인 상태인 경우 자동 승격/승인
    // (이 기능 도입 이전에 이미 가입해있던 관리자 계정을 위한 self-heal)
    if (user.email === ADMIN_EMAIL && (user.position !== 'admin' || !user.approved)) {
      await getPool().execute(`UPDATE users SET position='admin', approved=1 WHERE id=?`, [user.id])
      user = { ...user, position: 'admin', approved: 1 }
    }

    if (!user.approved) return res.json({ ok:false, message:'관리자 승인 대기 중입니다. 승인 후 로그인하실 수 있습니다.' })

    const valid = await bcrypt.compare(password, user.password)
    if (!valid) return res.json({ ok:false, message:'이메일 또는 비밀번호가 올바르지 않습니다.' })

    const token = jwt.sign(
      { id:user.id, email:user.email, name:user.name, position:user.position },
      JWT_SECRET, { expiresIn: JWT_EXPIRES }
    )
    res.json({ ok:true, token, user:{ id:user.id, email:user.email, name:user.name, position:user.position } })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

router.get('/me', authMiddleware, async (req, res) => {
  try {
    let [[user]] = await getPool().execute(`SELECT id,email,name,position,approved FROM users WHERE id=?`, [req.user.id])
    if (!user) return res.status(401).json({ ok:false, message:'사용자를 찾을 수 없습니다.' })

    if (user.email === ADMIN_EMAIL && (user.position !== 'admin' || !user.approved)) {
      await getPool().execute(`UPDATE users SET position='admin', approved=1 WHERE id=?`, [user.id])
      user = { ...user, position: 'admin', approved: 1 }
    }

    res.json({ ok:true, user: { id:user.id, email:user.email, name:user.name, position:user.position } })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

router.get('/users', authMiddleware, async (req, res) => {
  if (!STAFF_POSITIONS.includes(req.user.position) && req.user.position !== 'admin')
    return res.status(403).json({ ok:false, message:'권한이 없습니다.' })
  try {
    const [rows] = await getPool().execute(`SELECT id,email,name,position,approved,created_at FROM users ORDER BY created_at`)
    res.json({ ok:true, data:rows })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

router.put('/users/:id/approve', authMiddleware, async (req, res) => {
  if (!STAFF_POSITIONS.includes(req.user.position) && req.user.position !== 'admin')
    return res.status(403).json({ ok:false, message:'권한이 없습니다.' })
  try {
    const { approved } = req.body
    await getPool().execute(`UPDATE users SET approved=? WHERE id=?`, [approved ? 1 : 0, req.params.id])
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

module.exports = router;