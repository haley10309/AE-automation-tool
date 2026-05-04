const express = require('express')
const cors    = require('cors')
const mysql   = require('mysql2/promise')

const app  = express()
const PORT = 4000
app.use(cors())
app.use(express.json({ limit: '50mb' }))  // base64 파일 수신을 위해 limit 확장

let pool = null

// ── 전체 Site Code 목록 (78개) ────────────────────────────────
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
]

// ── 초기 시드 데이터 ──────────────────────────────────────────
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
]

// ── DB 연결 ───────────────────────────────────────────────────
app.post('/api/connect', async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body
    pool = mysql.createPool({ host, port:Number(port), user, password, database, waitForConnections:true, connectionLimit:10 })
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
    res.json({ ok:true })
  } catch (err) { pool=null; res.json({ ok:false, message:err.message }) }
})

// ── DB 초기화 (테이블 생성 + 제품 시드) ──────────────────────
app.post('/api/init', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS copy_requests (
      id INT AUTO_INCREMENT PRIMARY KEY, product_name VARCHAR(255) NOT NULL,
      requester VARCHAR(100), request_date DATE NOT NULL,
      note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)

    await pool.execute(`CREATE TABLE IF NOT EXISTS copy_rows (
      id INT AUTO_INCREMENT PRIMARY KEY, request_id INT NOT NULL,
      row_index INT NOT NULL, as_was TEXT, to_be TEXT,
      status ENUM('변경','추가','삭제','동일') NOT NULL DEFAULT '동일',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES copy_requests(id) ON DELETE CASCADE)`)

    await pool.execute(`CREATE TABLE IF NOT EXISTS samsung_products (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      aliases JSON NOT NULL DEFAULT ('[]'),
      excluded_countries JSON NOT NULL DEFAULT ('[]'),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`)

    // 최초 1회 시드 데이터 삽입
    const [[{ cnt }]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM samsung_products`)
    if (cnt === 0) {
      for (const p of SEED_PRODUCTS) {
        await pool.execute(
          `INSERT INTO samsung_products (name, aliases, excluded_countries) VALUES (?,?,?)`,
          [p.name, JSON.stringify(p.aliases), JSON.stringify(p.excluded)]
        )
      }
    }

    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_projects (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      name       VARCHAR(255) NOT NULL COMMENT '페이지/프로젝트명',
      note       TEXT                  COMMENT '메모',
      site_codes TEXT                  COMMENT '사용 국가 코드 JSON 배열',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) COMMENT='국가별 카피 프로젝트'`)

    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_project_copies (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      project_id INT NOT NULL,
      site_code  VARCHAR(50) NOT NULL,
      row_index  INT NOT NULL,
      copy_text  TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cell (project_id, site_code, row_index),
      FOREIGN KEY (project_id) REFERENCES cc_projects(id) ON DELETE CASCADE
    ) COMMENT='국가별 카피 셀 데이터'`)

    // ── CopyStatusTracker 첨부파일 테이블 ──────────────────────
    await pool.execute(`CREATE TABLE IF NOT EXISTS page_files (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      page_id     VARCHAR(100) NOT NULL COMMENT 'CopyStatusTracker 페이지 ID (timestamp 기반)',
      site_code   VARCHAR(50)  NOT NULL,
      name        VARCHAR(500) NOT NULL,
      size        INT,
      type        VARCHAR(100),
      status      VARCHAR(100) COMMENT '업로드 당시 카피 작업 상태',
      uploaded_at DATETIME     NOT NULL,
      data_url    LONGTEXT     NOT NULL COMMENT 'base64 인코딩된 파일 데이터',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_page_site (page_id, site_code)
    ) COMMENT='CopyStatusTracker 국가별 첨부파일'`)

    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

// ── 제품 CRUD ─────────────────────────────────────────────────

app.get('/api/products', async (req, res) => {
  if (!pool) {
    const data = SEED_PRODUCTS.map((p, i) => ({
      id: i+1, name: p.name, aliases: p.aliases,
      excluded_countries: p.excluded,
      countries: ALL_SITE_CODES.filter(c => !p.excluded.includes(c))
    }))
    return res.json({ ok:true, data })
  }
  try {
    const [rows] = await pool.execute(`SELECT * FROM samsung_products ORDER BY id`)
    const data = rows.map(r => ({
      ...r,
      aliases: typeof r.aliases === 'string' ? JSON.parse(r.aliases) : r.aliases,
      excluded_countries: typeof r.excluded_countries === 'string' ? JSON.parse(r.excluded_countries) : r.excluded_countries,
    }))
    data.forEach(p => { p.countries = ALL_SITE_CODES.filter(c => !p.excluded_countries.includes(c)) })
    res.json({ ok:true, data })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.post('/api/products', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 필요합니다.' })
  try {
    const { name, aliases, excluded_countries } = req.body
    if (!name?.trim()) return res.json({ ok:false, message:'제품명을 입력해주세요.' })
    const [r] = await pool.execute(
      `INSERT INTO samsung_products (name, aliases, excluded_countries) VALUES (?,?,?)`,
      [name.trim(), JSON.stringify(aliases||[]), JSON.stringify(excluded_countries||[])]
    )
    res.json({ ok:true, id:r.insertId })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.put('/api/products/:id', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 필요합니다.' })
  try {
    const { name, aliases, excluded_countries } = req.body
    await pool.execute(
      `UPDATE samsung_products SET name=?, aliases=?, excluded_countries=? WHERE id=?`,
      [name.trim(), JSON.stringify(aliases||[]), JSON.stringify(excluded_countries||[]), req.params.id]
    )
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.delete('/api/products/:id', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 필요합니다.' })
  try {
    await pool.execute(`DELETE FROM samsung_products WHERE id=?`, [req.params.id])
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

// ── 카피 요청 CRUD ────────────────────────────────────────────
app.post('/api/save', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const { meta, allRows } = req.body
    const [r] = await conn.execute(
      `INSERT INTO copy_requests (product_name, requester, request_date, note) VALUES (?,?,?,?)`,
      [meta.product_name, meta.requester||null, meta.request_date, meta.note||null]
    )
    const requestId = r.insertId
    if (allRows?.length) {
      const values = allRows.map(row => [requestId, row.row, row.asWas, row.toBe, row.status])
      await conn.query(`INSERT INTO copy_rows (request_id, row_index, as_was, to_be, status) VALUES ?`, [values])
    }
    await conn.commit()
    res.json({ ok:true, requestId })
  } catch (err) { await conn.rollback(); res.json({ ok:false, message:err.message }) }
  finally { conn.release() }
})

app.get('/api/requests', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const [rows] = await pool.execute(`
      SELECT r.id, r.product_name, r.requester, r.request_date, r.note, r.created_at,
             COUNT(c.id) AS total_rows, SUM(c.status != '동일') AS diff_rows
      FROM copy_requests r LEFT JOIN copy_rows c ON c.request_id = r.id
      GROUP BY r.id ORDER BY r.created_at DESC`)
    res.json({ ok:true, data:rows })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.get('/api/rows', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { requestId, diffOnly } = req.query
    let sql = `SELECT * FROM copy_rows WHERE request_id = ?`
    if (diffOnly === 'true') sql += ` AND status != '동일'`
    sql += ` ORDER BY row_index`
    const [rows] = await pool.execute(sql, [requestId])
    res.json({ ok:true, data:rows })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.put('/api/rows/:id', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { as_was, to_be } = req.body
    const a = (as_was||'').trim(), b = (to_be||'').trim()
    let status = '동일'
    if (a !== b) { if (!a&&b) status='추가'; else if (a&&!b) status='삭제'; else status='변경' }
    await pool.execute(`UPDATE copy_rows SET as_was=?, to_be=?, status=? WHERE id=?`, [as_was, to_be, status, req.params.id])
    res.json({ ok:true, status })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.delete('/api/rows/:id', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    await pool.execute(`DELETE FROM copy_rows WHERE id=?`, [req.params.id])
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

// ══════════════════════════════════════════════════════════════
// 국가별 카피 프로젝트 CRUD
// ══════════════════════════════════════════════════════════════

app.get('/api/cc/projects', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const [rows] = await pool.execute(`
      SELECT p.*, COUNT(DISTINCT c.site_code) AS country_count,
             MAX(c.row_index) AS max_row
      FROM cc_projects p
      LEFT JOIN cc_project_copies c ON c.project_id = p.id
      GROUP BY p.id ORDER BY p.updated_at DESC`)
    res.json({ ok:true, data: rows })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.post('/api/cc/projects', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { name, note, site_codes } = req.body
    if (!name?.trim()) return res.json({ ok:false, message:'프로젝트명을 입력해주세요.' })
    const [r] = await pool.execute(
      `INSERT INTO cc_projects (name, note, site_codes) VALUES (?,?,?)`,
      [name.trim(), note||null, JSON.stringify(site_codes||[])]
    )
    res.json({ ok:true, id: r.insertId })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.put('/api/cc/projects/:id', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { name, note, site_codes } = req.body
    await pool.execute(
      `UPDATE cc_projects SET name=?, note=?, site_codes=? WHERE id=?`,
      [name.trim(), note||null, JSON.stringify(site_codes||[]), req.params.id]
    )
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.delete('/api/cc/projects/:id', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    await pool.execute(`DELETE FROM cc_projects WHERE id=?`, [req.params.id])
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.get('/api/cc/projects/:id/copies', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const [copies] = await pool.execute(
      `SELECT site_code, row_index, copy_text FROM cc_project_copies
       WHERE project_id=? ORDER BY row_index, site_code`,
      [req.params.id]
    )
    const [[proj]] = await pool.execute(
      `SELECT site_codes FROM cc_projects WHERE id=?`, [req.params.id]
    )
    res.json({ ok:true, copies, site_codes: JSON.parse(proj?.site_codes||'[]') })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.post('/api/cc/projects/:id/copies', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  const conn = await pool.getConnection()
  try {
    await conn.beginTransaction()
    const { site_codes, cells } = req.body
    const pid = req.params.id
    await conn.execute(
      `UPDATE cc_projects SET site_codes=?, updated_at=NOW() WHERE id=?`,
      [JSON.stringify(site_codes||[]), pid]
    )
    await conn.execute(`DELETE FROM cc_project_copies WHERE project_id=?`, [pid])
    if (cells?.length) {
      const vals = cells.filter(c => c.copy_text?.trim()).map(c => [pid, c.site_code, c.row_index, c.copy_text])
      if (vals.length) {
        await conn.query(
          `INSERT INTO cc_project_copies (project_id, site_code, row_index, copy_text) VALUES ?`,
          [vals]
        )
      }
    }
    await conn.commit()
    res.json({ ok:true })
  } catch (err) { await conn.rollback(); res.json({ ok:false, message:err.message }) }
  finally { conn.release() }
})

app.put('/api/cc/copies/cell', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { project_id, site_code, row_index, copy_text } = req.body
    await pool.execute(
      `INSERT INTO cc_project_copies (project_id, site_code, row_index, copy_text)
       VALUES (?,?,?,?)
       ON DUPLICATE KEY UPDATE copy_text=?, updated_at=NOW()`,
      [project_id, site_code, row_index, copy_text, copy_text]
    )
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

// ══════════════════════════════════════════════════════════════
// CopyStatusTracker 첨부파일
// ══════════════════════════════════════════════════════════════

// POST /api/files  — 파일 저장 (base64 dataUrl 포함)
app.post('/api/files', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { pageId, siteCode, name, size, type, status, uploadedAt, dataUrl } = req.body
    if (!pageId || !siteCode || !name || !dataUrl)
      return res.json({ ok:false, message:'필수 필드 누락 (pageId, siteCode, name, dataUrl)' })
    // ISO 8601 → MySQL DATETIME 형식 변환 ('2026-04-30T09:56:00.934Z' → '2026-04-30 09:56:00')
    const mysqlDatetime = uploadedAt
      ? new Date(uploadedAt).toISOString().slice(0, 19).replace('T', ' ')
      : new Date().toISOString().slice(0, 19).replace('T', ' ')
    await pool.execute(
      `INSERT INTO page_files (page_id, site_code, name, size, type, status, uploaded_at, data_url)
       VALUES (?,?,?,?,?,?,?,?)`,
      [String(pageId), siteCode, name, size||null, type||null, status||null, mysqlDatetime, dataUrl]
    )
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

// GET /api/files?pageId=xxx[&siteCode=yyy]  — 파일 목록 조회
app.get('/api/files', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    const { pageId, siteCode } = req.query
    if (!pageId) return res.json({ ok:false, message:'pageId가 필요합니다.' })
    let sql = `SELECT id, page_id, site_code, name, size, type, status, uploaded_at, data_url, created_at
               FROM page_files WHERE page_id = ?`
    const params = [String(pageId)]
    if (siteCode) { sql += ` AND site_code = ?`; params.push(siteCode) }
    sql += ` ORDER BY created_at ASC`
    const [rows] = await pool.execute(sql, params)
    res.json({ ok:true, data: rows })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

// DELETE /api/files/:id  — 파일 삭제
app.delete('/api/files/:id', async (req, res) => {
  if (!pool) return res.json({ ok:false, message:'DB 연결이 없습니다.' })
  try {
    await pool.execute(`DELETE FROM page_files WHERE id=?`, [req.params.id])
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

app.listen(PORT, () => console.log('✅ 서버 실행 중: http://localhost:' + PORT))