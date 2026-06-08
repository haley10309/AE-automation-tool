'use strict';
const mysql = require('mysql2/promise');
const jwt   = require('jsonwebtoken');

const JWT_SECRET  = process.env.JWT_SECRET || 'super_secret_key_for_copy_diff';
const JWT_EXPIRES = '24h';

let pool = null;

// pool은 /api/connect 호출 시 또는 index.js 시작 시 setPool()로 주입됨

function getPool() { return pool; }
function setPool(p) { pool = p; }

const checkDbConnection = (req, res, next) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결이 없습니다.' });
  next();
};

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer '))
    return res.status(401).json({ ok: false, message: '토큰이 제공되지 않았습니다.' });

  try {
    req.user = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, message: '유효하지 않거나 만료된 토큰입니다.' });
  }
};

module.exports = { getPool, setPool, checkDbConnection, authMiddleware, JWT_SECRET, JWT_EXPIRES };