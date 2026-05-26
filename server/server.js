process.on('uncaughtException', (err) => {
  const fs = require('fs');
  const path = require('path');
  fs.appendFileSync(
    path.join(__dirname, 'server-error.log'),
    `[${new Date().toISOString()}] ${err.stack}\n`
  );
  process.exit(1);
});
// 시작 로그
const fs = require('fs');
const path = require('path');
fs.appendFileSync(
  path.join(__dirname, 'server-error.log'),
  `[${new Date().toISOString()}] 서버 시작 시도\n`
);
require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
const PORT = process.env.PORT || 4000;
app.use(cors());
app.use(express.json({ limit: '50mb' }));

let pool = null;
pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

fs.appendFileSync(
  path.join(__dirname, 'server-error.log'),
  `[${new Date().toISOString()}] __dirname: ${__dirname}\n`
);
fs.appendFileSync(
  path.join(__dirname, 'server-error.log'),
  `[${new Date().toISOString()}] .env 경로: ${path.join(__dirname, '.env')}\n`
);
fs.appendFileSync(
  path.join(__dirname, 'server-error.log'),
  `[${new Date().toISOString()}] .env 존재: ${fs.existsSync(path.join(__dirname, '.env'))}\n`
);

// ── 환경 변수 및 설정 ───────────────────────────────────────────────
const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_key_for_copy_diff';
const JWT_EXPIRES = '24h';

// ── 전역 설정 및 시드 데이터 ──────────────────────────────────────────
const ALL_SITE_CODES = [
  'CA_FR','CA','MX','BR','LATIN','LATIN_EN','CO','AR','PY','UY','CL','PE',
  'SG','AU','NZ','ID','TH','VN','MY','PH','MM','JP',
  'UK','IE','DE','AT','CH','CH_FR','FR','IT','GR','ES','PT',
  'BE','BE_FR','NL','SE','DK','FI','NO','PL','RO','BG','HU',
  'CZ','SK','EE','LV','LT','HR','RS','SI','AL','MK','BA','UA',
  'IN','BD',
  'AE','AE_AR','IL','PS','SA','SA_EN','TR','IRAN',
  'LEVANT','LEVANT_AR','PK','EG','N_AFRICA',
  'AFRICA_EN','AFRICA_FR','AFRICA_PT','ZA','IQ_AR','IQ_KU','LB'
];

const SEED_PRODUCTS = [
  { name:'Galaxy S26',       aliases:['Galaxy S26','S26'],                                         excluded:[] },
  { name:'Galaxy S26 Plus',  aliases:['Galaxy S26 Plus','Galaxy S26+','S26 Plus','S26+'],          excluded:[] },
  { name:'Galaxy S26 Ultra', aliases:['Galaxy S26 Ultra','S26 Ultra'],                             excluded:[] },
  { name:'Galaxy Z Flip7',   aliases:['Galaxy Z Flip7','Z Flip7','Flip7','Flip 7'],                excluded:['BD','PK'] },
  { name:'Galaxy Z Fold7',   aliases:['Galaxy Z Fold7','Z Fold7','Fold7','Fold 7'],                excluded:['BD','PK'] },
  { name:'Galaxy S25 FE',    aliases:['Galaxy S25 FE','S25 FE'],                                   excluded:['JP'] },
  { name:'Buds4 Pro',        aliases:['Buds4 Pro','Buds 4 Pro','Galaxy Buds4 Pro'],               excluded:['BD','PK'] },
  { name:'Buds4',            aliases:['Buds4','Buds 4','Galaxy Buds4'],                            excluded:['BD','PK'] },
  { name:'Buds3 FE',         aliases:['Buds3 FE','Buds 3 FE','Galaxy Buds3 FE'],                 excluded:['MM','BD','AFRICA_FR'] },
  { name:'Buds Core',        aliases:['Buds Core','Galaxy Buds Core'],
    excluded:['CA_FR','CA','SG','AU','NZ','JP','UK','IE','DE','AT','CH','CH_FR','FR','IT','GR','ES','PT','BE','BE_FR','NL','SE','DK','FI','NO','PL','RO','BG','HU','CZ','SK','EE','LV','LT','HR','RS','SI','AL','MK','BA','UA'] },
  { name:'Watch 8',          aliases:['Watch 8','Galaxy Watch 8'],                                 excluded:[] },
  { name:'Watch 8 Classic',  aliases:['Watch 8 Classic','Galaxy Watch 8 Classic'],                excluded:[] },
  { name:'Watch Ultra (2025)', aliases:['Watch Ultra','Galaxy Watch Ultra','Watch Ultra 2025'],
    excluded:['AR','PY','MM','BD','PS','LEVANT','LEVANT_AR','PK','EG','N_AFRICA','IQ_AR','IQ_KU','LB'] },
];

// ── 공통 미들웨어 ───────────────────────────────────────────────────────
const checkDbConnection = (req, res, next) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결이 없습니다.' });
  next();
};

// [신규] JWT 검증 미들웨어
const authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ ok: false, message: '토큰이 제공되지 않았습니다.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // 인증된 유저 정보를 req 객체에 담아 다음 라우트로 넘김
    next();
  } catch (err) {
    return res.status(401).json({ ok: false, message: '유효하지 않거나 만료된 토큰입니다.' });
  }
};

// ═════════════════════════════════════════════════════════════════════
// 1. DB 설정 및 초기화 관련 라우터
// ═════════════════════════════════════════════════════════════════════
const dbRouter = express.Router();

dbRouter.post('/connect', async (req, res) => {
  console.log('🔥 /api/connect 호출됨');

  try {
    const { host, port, user, password, database } = req.body;

    console.log({
      host,
      port,
      user,
      database
    });

    console.log('🔑 password source:', password ? 'from UI' : 'from .env', '/ DB_PASSWORD set:', !!process.env.DB_PASSWORD)

    pool = mysql.createPool({
      host,
      port: Number(port),
      user,
      password: password || process.env.DB_PASSWORD,
      database,
      waitForConnections: true,
      connectionLimit: 10
    });

    const conn = await pool.getConnection();

    console.log('✅ getConnection 성공');

    await conn.ping();

    console.log('✅ ping 성공');

    conn.release();

    res.json({ ok: true });

  } catch (err) {

    console.error('❌ connect 실패:', err);

    pool = null;

    res.json({
      ok: false,
      message: err.message
    });
  }
});

dbRouter.post('/init', checkDbConnection, async (req, res) => {
  try {
    // [신규] 인증용 users 테이블 생성
    await pool.execute(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      password VARCHAR(255) NOT NULL,
      position ENUM('intern', 'regular') NOT NULL,
      approved TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    //머지 db 
      await pool.execute(`
    CREATE TABLE IF NOT EXISTS merge_projects (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      title       VARCHAR(300) NOT NULL,
      en_lines    LONGTEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
   // (server.js의 /api/init 내부)
    await pool.execute(`CREATE TABLE IF NOT EXISTS merge_countries (
      id INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      label VARCHAR(100) NOT NULL,
      raw_paste TEXT,
      mapped_json JSON,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      -- 💡 [여기에 추가] 프로젝트 내 동일 국가 중복 방지      UNIQUE KEY idx_proj_label (project_id, label)
    )`);

    // 기존 merge_countries 테이블에 updated_at 컬럼이 없으면 추가
    try {
      await pool.execute(`ALTER TABLE merge_countries ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    // ── merge_country_history 테이블 (변경 이력) ──────────────
    await pool.execute(`CREATE TABLE IF NOT EXISTS merge_country_history (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      project_id  INT NOT NULL,
      country_id  INT NOT NULL,
      label       VARCHAR(100),
      raw_paste   TEXT,
      mapped_json JSON COMMENT '전체 매핑 결과',
      diff_json   JSON COMMENT '이전 버전 대비 변경된 행만',
      saved_by    VARCHAR(100) COMMENT '저장한 사용자 이름',
      saved_by_email VARCHAR(255) COMMENT '저장한 사용자 이메일',
      saved_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_country (country_id, project_id)
    ) COMMENT='국가별 Merge 변경 이력'`);

    // 기존 DB에 diff_json 컬럼이 없으면 추가
    try {
      await pool.execute(`ALTER TABLE merge_country_history ADD COLUMN diff_json JSON COMMENT '변경된 행만' AFTER mapped_json`);
    } catch (_) { /* 이미 존재하면 무시 */ }
    try {
      await pool.execute(`ALTER TABLE merge_country_history ADD COLUMN saved_by VARCHAR(100) AFTER diff_json`);
    } catch (_) {}
    try {
      await pool.execute(`ALTER TABLE merge_country_history ADD COLUMN saved_by_email VARCHAR(255) AFTER saved_by`);
    } catch (_) {}

    await pool.execute(`CREATE TABLE IF NOT EXISTS copy_requests (
      id INT AUTO_INCREMENT PRIMARY KEY, product_name VARCHAR(255) NOT NULL,
      requester VARCHAR(100), request_date DATE NOT NULL,
      note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS copy_rows (
      id INT AUTO_INCREMENT PRIMARY KEY, request_id INT NOT NULL,
      row_index INT NOT NULL, as_was TEXT, to_be TEXT,
      status ENUM('변경','추가','삭제','동일') NOT NULL DEFAULT '동일',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES copy_requests(id) ON DELETE CASCADE)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS samsung_products (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL,
      aliases JSON NOT NULL DEFAULT ('[]'), excluded_countries JSON NOT NULL DEFAULT ('[]'),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS tracker_pages (
      id VARCHAR(100) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS tracker_site_status (
      page_id VARCHAR(100) NOT NULL,
      site_code VARCHAR(50) NOT NULL,
      status VARCHAR(100),
      note TEXT,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (page_id, site_code),
      FOREIGN KEY (page_id) REFERENCES tracker_pages(id) ON DELETE CASCADE)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS page_files (
      id INT AUTO_INCREMENT PRIMARY KEY, page_id VARCHAR(100) NOT NULL,
      site_code VARCHAR(50) NOT NULL, name VARCHAR(500) NOT NULL,
      size INT, type VARCHAR(100), status VARCHAR(100) COMMENT '업로드 당시 상태',
      note_at_upload TEXT COMMENT '업로드 당시 메모',
      uploaded_by VARCHAR(100) DEFAULT NULL COMMENT '업로더 이름',
      uploaded_at DATETIME NOT NULL,
      data_url LONGTEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_page_site (page_id, site_code))`);

    // 기존 DB에 uploaded_by 컬럼이 없으면 추가 (이미 있으면 무시)
    try {
      await pool.execute(`ALTER TABLE page_files ADD COLUMN uploaded_by VARCHAR(100) DEFAULT NULL COMMENT '업로더 이름' AFTER note_at_upload`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    const [[{ cnt }]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM samsung_products`);
    if (cnt === 0) {
      for (const p of SEED_PRODUCTS) {
        await pool.execute(
          `INSERT INTO samsung_products (name, aliases, excluded_countries) VALUES (?,?,?)`,
          [p.name, JSON.stringify(p.aliases), JSON.stringify(p.excluded)]
        );
      }
    }

    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_projects (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL COMMENT '페이지/프로젝트명',
      note TEXT COMMENT '메모', site_codes TEXT COMMENT '사용 국가 코드 JSON 배열',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) COMMENT='국가별 카피 프로젝트'`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_project_copies (
      id INT AUTO_INCREMENT PRIMARY KEY, project_id INT NOT NULL,
      site_code VARCHAR(50) NOT NULL, row_index INT NOT NULL, copy_text TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cell (project_id, site_code, row_index),
      FOREIGN KEY (project_id) REFERENCES cc_projects(id) ON DELETE CASCADE
    ) COMMENT='국가별 카피 셀 데이터'`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_project_dnt (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      project_id   INT NOT NULL,
      en_raw       TEXT          COMMENT '영문 원본',
      site_codes   TEXT          COMMENT '선택 국가 코드 JSON',
      result_json  LONGTEXT      COMMENT 'DNT 분석 결과 JSON',
      locals_json  LONGTEXT      COMMENT '로컬어 입력 JSON',
      saved_by     VARCHAR(100)  COMMENT '저장한 사용자',
      saved_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES cc_projects(id) ON DELETE CASCADE
    ) COMMENT='DNT 사전 검증 스냅샷'`);
// 즉석 검수 국가 목록 (영구 보존)
    await pool.execute(`CREATE TABLE IF NOT EXISTS quick_check_sites (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      site_code  VARCHAR(20) NOT NULL UNIQUE COMMENT '국가 코드',
      sort_order INT NOT NULL DEFAULT 0      COMMENT '표시 순서',
      added_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    ) COMMENT='즉석 검수 선택 국가 영구 목록'`);
    // 국가별 로컬어 변경 이력
    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_locals_history (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      project_id   INT NOT NULL,
      site_code    VARCHAR(20)   NOT NULL  COMMENT '국가 코드',
      local_text   LONGTEXT               COMMENT '변경된 로컬어 전체',
      en_raw       TEXT                   COMMENT '당시 영문 원본',
      saved_by     VARCHAR(100)           COMMENT '저장한 사용자 이름',
      saved_by_email VARCHAR(255)         COMMENT '저장한 사용자 이메일',
      saved_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES cc_projects(id) ON DELETE CASCADE
    ) COMMENT='국가별 로컬어 변경 이력'`);
 // ── soft delete 컬럼 추가 (기존 테이블 호환) ──
    for (const ddl of [
      `ALTER TABLE page_files          ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE samsung_products    ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE copy_requests       ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE copy_rows           ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE cc_projects         ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE cc_project_dnt      ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE quick_check_sites   ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE merge_projects      ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE merge_countries     ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
    ]) {
      try { await pool.execute(ddl) } catch (_) { /* 이미 존재하면 무시 */ }
    }    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

app.use('/api', dbRouter);

// ══════════════════════════════════════════════════════════════
// [신규] 인증 라우트 (authRouter 구조로 모듈화)
// ══════════════════════════════════════════════════════════════
const authRouter = express.Router();

authRouter.post('/register', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { email, name, password, position } = req.body
    if (!email?.trim())    return res.json({ ok:false, message:'이메일을 입력해주세요.' })
    if (!name?.trim())     return res.json({ ok:false, message:'이름을 입력해주세요.' })
    if (!password?.trim()) return res.json({ ok:false, message:'비밀번호를 입력해주세요.' })
    if (password.length < 8) return res.json({ ok:false, message:'비밀번호는 8자 이상이어야 합니다.' })
    if (!['intern','regular'].includes(position)) return res.json({ ok:false, message:'직책을 선택해주세요.' })

    // 이메일 중복 확인
    const [[existing]] = await pool.execute(`SELECT id FROM users WHERE email=?`, [email.trim()])
    if (existing) return res.json({ ok:false, message:'이미 가입된 이메일입니다.' })

    const hash = await bcrypt.hash(password, 10)
    // 첫 번째 가입자는 자동 승인 (관리자)
    const [[{ cnt }]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM users`)
    const approved = cnt === 0 ? 1 : 0

    await pool.execute(
      `INSERT INTO users (email, name, password, position, approved) VALUES (?,?,?,?,?)`,
      [email.trim().toLowerCase(), name.trim(), hash, position, approved]
    )
    res.json({ ok:true, message: approved ? '가입이 완료되었습니다. 로그인해주세요.' : '가입 신청이 완료되었습니다. 관리자 승인 후 로그인하실 수 있습니다.' })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

authRouter.post('/login', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { email, password } = req.body
    if (!email || !password) return res.json({ ok:false, message:'이메일과 비밀번호를 입력해주세요.' })

    const [[user]] = await pool.execute(`SELECT * FROM users WHERE email=?`, [email.trim().toLowerCase()])
    if (!user) return res.json({ ok:false, message:'이메일 또는 비밀번호가 올바르지 않습니다.' })
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

authRouter.get('/me', authMiddleware, async (req, res) => {
  try {
    const [[user]] = await pool.execute(`SELECT id,email,name,position FROM users WHERE id=?`, [req.user.id])
    if (!user) return res.status(401).json({ ok:false, message:'사용자를 찾을 수 없습니다.' })
    res.json({ ok:true, user })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

authRouter.get('/users', authMiddleware, async (req, res) => {
  if (req.user.position !== 'regular') return res.status(403).json({ ok:false, message:'권한이 없습니다.' })
  try {
    const [rows] = await pool.execute(`SELECT id,email,name,position,approved,created_at FROM users ORDER BY created_at`)
    res.json({ ok:true, data:rows })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

authRouter.put('/users/:id/approve', authMiddleware, async (req, res) => {
  if (req.user.position !== 'regular') return res.status(403).json({ ok:false, message:'권한이 없습니다.' })
  try {
    const { approved } = req.body
    await pool.execute(`UPDATE users SET approved=? WHERE id=?`, [approved ? 1 : 0, req.params.id])
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message: err.message }) }
});

app.use('/api/auth', authRouter);

// ═════════════════════════════════════════════════════════════════════
// 2. 공통 도메인: 제품(Products) 관련 라우터
// ═════════════════════════════════════════════════════════════════════
const productRouter = express.Router();

productRouter.get('/', async (req, res) => {
  if (!pool) {
    const data = SEED_PRODUCTS.map((p, i) => ({
      id: i + 1, name: p.name, aliases: p.aliases,
      excluded_countries: p.excluded,
      countries: ALL_SITE_CODES.filter(c => !p.excluded.includes(c))
    }));
    return res.json({ ok: true, data });
  }
  try {
    const [rows] = await pool.execute(`SELECT * FROM samsung_products WHERE deleted = 0 ORDER BY id`);
    const data = rows.map(r => ({
      ...r,
      aliases: typeof r.aliases === 'string' ? JSON.parse(r.aliases) : r.aliases,
      excluded_countries: typeof r.excluded_countries === 'string' ? JSON.parse(r.excluded_countries) : r.excluded_countries,
    }));
    data.forEach(p => { p.countries = ALL_SITE_CODES.filter(c => !p.excluded_countries.includes(c)); });
    res.json({ ok: true, data });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

productRouter.post('/', checkDbConnection, async (req, res) => {
  try {
    const { name, aliases, excluded_countries } = req.body;
    if (!name?.trim()) return res.json({ ok: false, message: '제품명을 입력해주세요.' });
    const [r] = await pool.execute(
      `INSERT INTO samsung_products (name, aliases, excluded_countries) VALUES (?,?,?)`,
      [name.trim(), JSON.stringify(aliases || []), JSON.stringify(excluded_countries || [])]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

productRouter.put('/:id', checkDbConnection, async (req, res) => {
  try {
    const { name, aliases, excluded_countries } = req.body;
    await pool.execute(
      `UPDATE samsung_products SET name=?, aliases=?, excluded_countries=? WHERE id=?`,
      [name.trim(), JSON.stringify(aliases || []), JSON.stringify(excluded_countries || []), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

productRouter.delete('/:id', checkDbConnection, async (req, res) => {
  try {
    await pool.execute(`UPDATE samsung_products SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

app.use('/api/products', productRouter);

// ═════════════════════════════════════════════════════════════════════
// 3. ExtractTab 도메인: 카피 요청/추출 영역 (이전 카피와 앞으로의 카피 업데이트)
// ═════════════════════════════════════════════════════════════════════
const extractRouter = express.Router();
extractRouter.use(checkDbConnection);

extractRouter.post('/save', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { meta, allRows } = req.body;
    const [r] = await conn.execute(
      `INSERT INTO copy_requests (product_name, requester, request_date, note) VALUES (?,?,?,?)`,
      [meta.product_name, meta.requester || null, meta.request_date, meta.note || null]
    );
    const requestId = r.insertId;
    if (allRows?.length) {
      const values = allRows.map(row => [requestId, row.row, row.asWas, row.toBe, row.status]);
      await conn.query(`INSERT INTO copy_rows (request_id, row_index, as_was, to_be, status) VALUES ?`, [values]);
    }
    await conn.commit();
    res.json({ ok: true, requestId });
  } catch (err) { 
    await conn.rollback(); 
    res.json({ ok: false, message: err.message }); 
  } finally { conn.release(); }
});

extractRouter.get('/requests', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT r.id, r.product_name, r.requester, r.request_date, r.note, r.created_at,
             COUNT(c.id) AS total_rows, SUM(c.status != '동일') AS diff_rows
      FROM copy_requests r LEFT JOIN copy_rows c ON c.request_id = r.id AND c.deleted = 0
      WHERE r.deleted = 0
      GROUP BY r.id ORDER BY r.created_at DESC`);
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

extractRouter.delete('/requests/:id', async (req, res) => {
  try {
    await pool.execute(`UPDATE copy_requests SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

extractRouter.get('/rows', async (req, res) => {
  try {
    const { requestId, diffOnly } = req.query;
    let sql = `SELECT * FROM copy_rows WHERE request_id = ?`;
    if (diffOnly === 'true') sql += ` AND status != '동일'`;
    sql += ` ORDER BY row_index`;
    const [rows] = await pool.execute(sql, [requestId]);
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

extractRouter.put('/rows/:id', async (req, res) => {
  try {
    const { as_was, to_be } = req.body;
    const a = (as_was || '').trim(), b = (to_be || '').trim();
    let status = '동일';
    if (a !== b) { 
      if (!a && b) status = '추가'; 
      else if (a && !b) status = '삭제'; 
      else status = '변경'; 
    }
    await pool.execute(`UPDATE copy_rows SET as_was=?, to_be=?, status=? WHERE id=?`, [as_was, to_be, status, req.params.id]);
    res.json({ ok: true, status });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

extractRouter.delete('/rows/:id', async (req, res) => {
  try {
    await pool.execute(`DELETE FROM copy_rows WHERE id=?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

app.use('/api', extractRouter);

// ═════════════════════════════════════════════════════════════════════
// 4. CountryTab 도메인: 국가마다 제품 출시 베리에이션 및 카피 반영 프로젝트
// ═════════════════════════════════════════════════════════════════════
const countryRouter = express.Router();
countryRouter.use(checkDbConnection);

countryRouter.get('/projects', async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT p.*, dnt.site_codes AS dnt_site_codes, dnt.en_raw AS dnt_en_raw
      FROM cc_projects p
      LEFT JOIN (
        SELECT project_id, site_codes, en_raw
        FROM cc_project_dnt
        WHERE deleted = 0
        AND id IN (
          SELECT MAX(id) FROM cc_project_dnt WHERE deleted = 0 GROUP BY project_id
        )
      ) dnt ON dnt.project_id = p.id
      WHERE p.deleted = 0
      ORDER BY p.updated_at DESC`);

    const data = rows.map(p => {
      const siteCodes = (() => {
        try { return JSON.parse(p.dnt_site_codes || '[]') } catch { return [] }
      })()
      const enLines = (p.dnt_en_raw || '').split('\n').filter(l => l.trim() !== '')
      const { dnt_site_codes, dnt_en_raw, ...rest } = p
      return { ...rest, country_count: siteCodes.length, max_row: enLines.length }
    })
    res.json({ ok: true, data });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.post('/projects', async (req, res) => {
  try {
    const { name, note, site_codes } = req.body;
    if (!name?.trim()) return res.json({ ok: false, message: '프로젝트명을 입력해주세요.' });
    const [r] = await pool.execute(
      `INSERT INTO cc_projects (name, note, site_codes) VALUES (?,?,?)`,
      [name.trim(), note || null, JSON.stringify(site_codes || [])]
    );
    res.json({ ok: true, id: r.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.put('/projects/:id', async (req, res) => {
  try {
    const { name, note, site_codes } = req.body;
    await pool.execute(
      `UPDATE cc_projects SET name=?, note=?, site_codes=? WHERE id=?`,
      [name.trim(), note || null, JSON.stringify(site_codes || []), req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.delete('/projects/:id', async (req, res) => {
  try {
    await pool.execute(`UPDATE cc_projects SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.get('/projects/:id/copies', async (req, res) => {
  try {
    const [copies] = await pool.execute(
      `SELECT site_code, row_index, copy_text FROM cc_project_copies WHERE project_id=? ORDER BY row_index, site_code`,
      [req.params.id]
    );
    const [[proj]] = await pool.execute(`SELECT site_codes FROM cc_projects WHERE id=?`, [req.params.id]);
    res.json({ ok: true, copies, site_codes: JSON.parse(proj?.site_codes || '[]') });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

countryRouter.post('/projects/:id/copies', async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { site_codes, cells } = req.body;
    const pid = req.params.id;
    await conn.execute(
      `UPDATE cc_projects SET site_codes=?, updated_at=NOW() WHERE id=?`,
      [JSON.stringify(site_codes || []), pid]
    );
    await conn.execute(`DELETE FROM cc_project_copies WHERE project_id=?`, [pid]);
    
    if (cells?.length) {
      const vals = cells.filter(c => c.copy_text?.trim()).map(c => [pid, c.site_code, c.row_index, c.copy_text]);
      if (vals.length) {
        await conn.query(`INSERT INTO cc_project_copies (project_id, site_code, row_index, copy_text) VALUES ?`, [vals]);
      }
    }
    await conn.commit();
    res.json({ ok: true });
  } catch (err) { 
    await conn.rollback(); 
    res.json({ ok: false, message: err.message }); 
  } finally { conn.release(); }
});

countryRouter.put('/copies/cell', async (req, res) => {
  try {
    const { project_id, site_code, row_index, copy_text } = req.body;
    await pool.execute(
      `INSERT INTO cc_project_copies (project_id, site_code, row_index, copy_text)
       VALUES (?,?,?,?) ON DUPLICATE KEY UPDATE copy_text=?, updated_at=NOW()`,
      [project_id, site_code, row_index, copy_text, copy_text]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ── 국가별 로컬어 변경 이력 ─────────────────────────────────
countryRouter.post('/projects/:id/locals-history', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const { siteCode, localText, enRaw, savedBy, savedByEmail } = req.body
    if (!siteCode) return res.json({ ok: false, message: 'siteCode 필요' })
    await pool.execute(
      `INSERT INTO cc_locals_history (project_id, site_code, local_text, en_raw, saved_by, saved_by_email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, siteCode, localText || '', enRaw || '',
       savedBy || null, savedByEmail || null]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

countryRouter.get('/projects/:id/locals-history/:siteCode', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [rows] = await pool.execute(
      `SELECT id, site_code, local_text, en_raw, saved_by, saved_by_email, saved_at
       FROM cc_locals_history
       WHERE project_id = ? AND site_code = ?
       ORDER BY saved_at DESC LIMIT 50`,
      [req.params.id, req.params.siteCode]
    )
    res.json({ ok: true, data: rows })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── DNT 사전 검증 스냅샷 ────────────────────────────────────
countryRouter.post('/projects/:id/dnt', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const { enRaw, siteCodes, resultJson, localsJson, savedBy } = req.body
    const [r] = await pool.execute(
      `INSERT INTO cc_project_dnt (project_id, en_raw, site_codes, result_json, locals_json, saved_by)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [req.params.id, enRaw || '', JSON.stringify(siteCodes || []),
       resultJson || null, localsJson || null, savedBy || null]
    )
    res.json({ ok: true, id: r.insertId })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

countryRouter.get('/projects/:id/dnt', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [rows] = await pool.execute(
      `SELECT id, en_raw, site_codes, result_json, locals_json, saved_by, saved_at
      FROM cc_project_dnt WHERE project_id = ? AND deleted = 0 ORDER BY saved_at DESC`,
      [req.params.id]
    )
    res.json({ ok: true, data: rows })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

countryRouter.delete('/projects/:id/dnt/:snapId', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
   await pool.execute(
      `UPDATE cc_project_dnt SET deleted = 1 WHERE id = ? AND project_id = ?`,
      [req.params.snapId, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 즉석 검수 국가 목록 ─────────────────────────────────────
// GET: 저장된 국가 목록 조회
countryRouter.get('/quick-sites', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT site_code FROM quick_check_sites WHERE deleted = 0 ORDER BY sort_order ASC, added_at ASC`
    )
    res.json({ ok: true, data: rows.map(r => r.site_code) })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// POST: 국가 추가
countryRouter.post('/quick-sites', async (req, res) => {
  try {
    const { siteCode } = req.body
    if (!siteCode) return res.json({ ok: false, message: 'siteCode 필요' })
    // sort_order는 현재 최대값 + 1
    const [[{ maxOrder }]] = await pool.execute(
      `SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM quick_check_sites`
    )
    await pool.execute(
      `INSERT INTO quick_check_sites (site_code, sort_order) VALUES (?, ?)
      ON DUPLICATE KEY UPDATE sort_order = sort_order, deleted = 0`,
      [siteCode, maxOrder + 1]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// DELETE: 국가 제거
countryRouter.delete('/quick-sites/:siteCode', async (req, res) => {
  try {
    await pool.execute(
      `UPDATE quick_check_sites SET deleted = 1 WHERE site_code = ?`,
      [req.params.siteCode]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

app.use('/api/cc', countryRouter);

// ═════════════════════════════════════════════════════════════════════
// 5. StatusTab 도메인: 국가마다 카피 작업 현황 정리 및 첨부파일 관리
// ═════════════════════════════════════════════════════════════════════
const statusRouter = express.Router();
statusRouter.use(checkDbConnection);

statusRouter.post('/tracker/pages', async (req, res) => {
  try {
    const { id, title } = req.body;
    if (!id || !title) return res.json({ ok: false, message: 'id와 title이 필요합니다.' });
    await pool.execute(
      `INSERT INTO tracker_pages (id, title) VALUES (?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title)`,
      [String(id), title]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

statusRouter.get('/tracker/pages', async (req, res) => {
  if (!pool) return res.json({ ok: false });
  try {
    const [pages] = await pool.execute(`SELECT * FROM tracker_pages WHERE deleted = 0 ORDER BY created_at DESC`);
    const [statuses] = await pool.execute(`SELECT page_id, site_code, status FROM tracker_site_status WHERE deleted = 0`);
    res.json({ ok: true, data: pages, statuses });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

statusRouter.get('/tracker/pages/:id', async (req, res) => {
  try {
    const pageId = req.params.id;
    const [statuses] = await pool.execute(
      `SELECT site_code, status, note FROM tracker_site_status WHERE page_id = ? AND deleted = 0`, [pageId]
    );
    const [files] = await pool.execute(
      `SELECT id, site_code, name, size, status, note_at_upload, uploaded_by, uploaded_at
       FROM page_files WHERE page_id = ? ORDER BY uploaded_at ASC`, [pageId]
    );
    res.json({ ok: true, statuses, files });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

statusRouter.delete('/tracker/pages/:id', async (req, res) => {
  try {
    await pool.execute(`UPDATE tracker_pages SET deleted = 1 WHERE id = ?`, [req.params.id]);
    await pool.execute(`UPDATE tracker_site_status SET deleted = 1 WHERE page_id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});
statusRouter.delete('/tracker/status', async (req, res) => {
  try {
    const { pageId, siteCode } = req.query
    await pool.execute(
      'UPDATE tracker_site_status SET deleted = 1 WHERE page_id = ? AND site_code = ?',
      [pageId, siteCode]
    )
    res.json({ ok: true })
  } catch (err) { res.json({ ok: false, message: err.message }) }
})
statusRouter.post('/tracker/status', async (req, res) => {
  try {
    const { pageId, siteCode, status, note } = req.body;
    await pool.execute(
      `INSERT INTO tracker_site_status (page_id, site_code, status, note, deleted) VALUES (?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), deleted = 0`,
      [pageId, siteCode, status || '', note || '']
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

statusRouter.post('/files', async (req, res) => {
  try {
    const { pageId, siteCode, name, size, status, noteAtUpload, uploadedAt, dataUrl, uploadedBy } = req.body;
    const mysqlDatetime = new Date(uploadedAt).toISOString().slice(0, 19).replace('T', ' ');
    const [result] = await pool.execute(
      `INSERT INTO page_files (page_id, site_code, name, size, status, note_at_upload, uploaded_by, uploaded_at, data_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pageId, siteCode, name, size, status, noteAtUpload, uploadedBy || null, mysqlDatetime, dataUrl]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

statusRouter.put('/files/:id/note', async (req, res) => {
  try {
    const { noteAtUpload } = req.body;
    await pool.execute(`UPDATE page_files SET note_at_upload = ? WHERE id = ?`, [noteAtUpload, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

statusRouter.get('/files', async (req, res) => {
  try {
    const { pageId, siteCode } = req.query;
    if (!pageId) return res.json({ ok: false, message: 'pageId가 필요합니다.' });
    let sql = `SELECT id, page_id, site_code, name, size, type, status, uploaded_by, uploaded_at, created_at FROM page_files WHERE page_id = ? AND deleted = 0`;
    const params = [String(pageId)];
    if (siteCode) { 
      sql += ` AND site_code = ?`; 
      params.push(siteCode); 
    }
    sql += ` ORDER BY created_at ASC`;
    const [rows] = await pool.execute(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// 다운로드: data_url은 클릭 시에만 단건 조회
statusRouter.get('/files/:id/data', async (req, res) => {
  try {
    const [[row]] = await pool.execute(
      `SELECT id, name, data_url FROM page_files WHERE id = ?`, [req.params.id]
    );
    if (!row) return res.json({ ok: false, message: '파일을 찾을 수 없습니다.' });
    res.json({ ok: true, data: row });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

statusRouter.delete('/files/:id', async (req, res) => {
  try {
    await pool.execute(`UPDATE page_files SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// merge Deck api 
// ══════════════════════════════════════════════════════════════


const mergeRouter = express.Router()

// ── 프로젝트 목록
mergeRouter.get('/projects', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [rows] = await pool.execute(
      `SELECT p.id, p.title, p.en_lines, p.created_at, p.updated_at,
              COUNT(c.id) AS country_count
       FROM merge_projects p
       LEFT JOIN merge_countries c ON c.project_id = p.id AND c.deleted = 0
       WHERE p.deleted = 0
       GROUP BY p.id
       ORDER BY p.updated_at DESC`
    )
    const data = rows.map(p => {
      const enLines = (p.en_lines || '').split('\n').filter(l => l.trim() !== '')
      const { en_lines, ...rest } = p
      return { ...rest, row_count: enLines.length }
    })
    res.json({ ok: true, data })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 프로젝트 상세 (en_lines + 국가 목록)
mergeRouter.get('/projects/:id', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [[project]] = await pool.execute(
      `SELECT id, title, en_lines, created_at, updated_at FROM merge_projects WHERE id = ?`,
      [req.params.id]
    )
    if (!project) return res.json({ ok: false, message: '프로젝트 없음' })
    const [countries] = await pool.execute(
      `SELECT id, label, raw_paste, mapped_json, created_at, updated_at FROM merge_countries WHERE project_id = ? AND deleted = 0 ORDER BY id ASC`,
      [req.params.id]
    )
    res.json({ ok: true, project, countries })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 프로젝트 생성
mergeRouter.post('/projects', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const { title, enLines } = req.body
    if (!title?.trim()) return res.json({ ok: false, message: '프로젝트 이름을 입력하세요.' })
    const [result] = await pool.execute(
      `INSERT INTO merge_projects (title, en_lines) VALUES (?, ?)`,
      [title.trim(), enLines || '']
    )
    res.json({ ok: true, id: result.insertId })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 프로젝트 수정 (제목 / en_lines 업데이트)
mergeRouter.put('/projects/:id', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const { title, enLines } = req.body
    await pool.execute(
      `UPDATE merge_projects SET title = COALESCE(?, title), en_lines = COALESCE(?, en_lines) WHERE id = ?`,
      [title ?? null, enLines ?? null, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 프로젝트 삭제 (cascade → 국가도 삭제)
mergeRouter.delete('/projects/:id', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    await pool.execute(`UPDATE merge_projects SET deleted = 1 WHERE id = ?`, [req.params.id])
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

// ── 국가 upsert (label로 식별 — 있으면 UPDATE, 없으면 INSERT)
// ── 국가 upsert (label로 식별 — 있으면 UPDATE, 없으면 INSERT)
mergeRouter.post('/projects/:id/countries', authMiddleware, async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const projectId = req.params.id
    const { countryId, label, rawPaste, mappedJson } = req.body
    const savedBy      = req.user?.name  || '알 수 없음'
    const savedByEmail = req.user?.email || ''
    if (!label?.trim()) return res.json({ ok: false, message: '국가명을 입력하세요.' })

    let finalCountryId = countryId;

    if (countryId) {
      // 1. 기존 국가 업데이트
      await pool.execute(
        `UPDATE merge_countries SET label = ?, raw_paste = ?, mapped_json = ? WHERE id = ? AND project_id = ?`,
        [label, rawPaste || '', mappedJson || null, countryId, projectId]
      )
    } else {
      // 2. 신규 국가 추가
      const [result] = await pool.execute(
        `INSERT INTO merge_countries (project_id, label, raw_paste, mapped_json) VALUES (?, ?, ?, ?)`,
        [projectId, label, rawPaste || '', mappedJson || null]
      )
      finalCountryId = result.insertId;
    }

    // 💡 [핵심 추가] 수정/추가 시 무조건 히스토리 테이블에 한 줄 쌓기
    // 이전 mapped_json과 비교해서 변경된 행만 diff_json으로 저장
    let prevMapped = []
    try {
      const [[prev]] = await pool.execute(
        `SELECT mapped_json FROM merge_country_history
         WHERE country_id = ? AND project_id = ?
         ORDER BY saved_at DESC LIMIT 1`,
        [finalCountryId, projectId]
      )
      if (prev?.mapped_json) {
        prevMapped = typeof prev.mapped_json === 'string'
          ? JSON.parse(prev.mapped_json)
          : prev.mapped_json
      }
    } catch (_) { /* 첫 저장이면 무시 */ }

    // 변경된 행만 추출 (local 값이 다른 행)
    let newMapped = []
    try {
      newMapped = typeof mappedJson === 'string' ? JSON.parse(mappedJson) : (mappedJson || [])
    } catch (_) {}

    const diffRows = newMapped.reduce((acc, row, i) => {
      const prev = prevMapped[i]
      const localChanged = !prev || prev.local !== row.local
      const missingChanged = !prev || prev.missing !== row.missing
      if (localChanged || missingChanged) {
        acc.push({
          row: i + 1,
          en: row.en,
          prev_local: prev?.local ?? null,
          new_local: row.local,
          missing: row.missing || false,
        })
      }
      return acc
    }, [])

    // 최초 저장이거나 변경이 있을 때만 히스토리 기록
    if (prevMapped.length === 0 || diffRows.length > 0) {
      await pool.execute(
        `INSERT INTO merge_country_history (project_id, country_id, label, raw_paste, mapped_json, diff_json, saved_by, saved_by_email)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [projectId, finalCountryId, label, rawPaste || '', mappedJson || null, JSON.stringify(diffRows), savedBy, savedByEmail]
      )
    }

    res.json({ ok: true, id: Number(finalCountryId) })

  } catch (e) { 
    if (e.code === 'ER_DUP_ENTRY') {
      return res.json({ ok: false, message: '이미 이 프로젝트에 같은 이름의 국가가 존재합니다.' })
    }
    res.json({ ok: false, message: e.message }) 
  }
})
// ── 국가 삭제
mergeRouter.delete('/projects/:id/countries/:countryId', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    await pool.execute(
      `UPDATE merge_countries SET deleted = 1 WHERE id = ? AND project_id = ?`,
      [req.params.countryId, req.params.id]
    )
    res.json({ ok: true })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})
// ── [3] 히스토리 조회 엔드포인트 추가 ─────────────────────────
// mergeRouter.delete(...) 바로 아래에 추가
 
mergeRouter.get('/projects/:id/countries/:countryId/history', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결 없음' })
  try {
    const [rows] = await pool.execute(
      `SELECT id, label, raw_paste, mapped_json, diff_json, saved_by, saved_by_email, saved_at
       FROM merge_country_history
       WHERE country_id = ? AND project_id = ?
       ORDER BY saved_at DESC`,
      [req.params.countryId, req.params.id]
    )
    res.json({ ok: true, data: rows })
  } catch (e) { res.json({ ok: false, message: e.message }) }
})

app.use('/api/merge', mergeRouter)

app.use('/api', statusRouter);

// ── 서버 실행 ───────────────────────────────────────────────────────────
// ── 정적 파일 서빙 & SPA fallback (API 라우터 등록 후 마지막에 위치) ──
const clientDist = process.env.CLIENT_DIST_PATH || path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

app.listen(PORT, () => console.log('✅ 서버 실행 중: http://localhost:' + PORT));