const jwt = require('jsonwebtoken');
const { getPool } = require('./db');
const { JWT_SECRET } = require('./constants');

/** DB pool이 없으면 즉시 에러 반환 */
const checkDbConnection = (req, res, next) => {
  if (!getPool()) return res.json({ ok: false, message: 'DB 연결이 없습니다.' });
  next();
};

/** JWT Bearer 토큰 검증 → req.user 주입 */
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: '토큰이 제공되지 않았습니다.' });
  }
  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, message: '유효하지 않거나 만료된 토큰입니다.' });
  }
};

module.exports = { checkDbConnection, authMiddleware };