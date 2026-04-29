const express = require('express')
const cors    = require('cors')
const mysql   = require('mysql2/promise')

const app  = express()
const PORT = 4000
app.use(cors())
app.use(express.json())

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

// ── 초기 시드 데이터 (excluded_countries 형식) ────────────────
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
    res.json({ ok:true })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

// ── 제품 CRUD ─────────────────────────────────────────────────

// GET /api/products → 목록 조회
app.get('/api/products', async (req, res) => {
  // DB 연결 없으면 서버 메모리 시드 반환 (국가별 검수 동작 유지)
  if (!pool) {
    const data = SEED_PRODUCTS.map((p, i) => ({
      id: i+1, name: p.name, aliases: p.aliases,
      excluded_countries: p.excluded,
      // 기존 호환: countries 필드도 함께 반환
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
    // countries = ALL - excluded (기존 감지 로직 호환)
    data.forEach(p => { p.countries = ALL_SITE_CODES.filter(c => !p.excluded_countries.includes(c)) })
    res.json({ ok:true, data })
  } catch (err) { res.json({ ok:false, message:err.message }) }
})

// POST /api/products → 생성
// body: { name, aliases: string[], excluded_countries: string[] }
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

// PUT /api/products/:id → 수정
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

// DELETE /api/products/:id → 삭제
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

app.listen(PORT, () => console.log('✅ 서버 실행 중: http://localhost:' + PORT))