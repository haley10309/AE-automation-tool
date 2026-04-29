const express = require('express')
const cors    = require('cors')
const mysql   = require('mysql2/promise')

const app  = express()
const PORT = 4000
app.use(cors())
app.use(express.json())

let pool = null

// ================================================================
// ★ 삼성 제품 출시 국가 현황 (실제 데이터 반영)
// ★ countries: 해당 Site Code 목록 (O인 국가만 포함)
// ★ 수정 시: aliases 배열에 카피에서 감지할 키워드 추가
// ================================================================
const SAMSUNG_PRODUCTS = [
  {
    name: "Galaxy S26",
    aliases: ["Galaxy S26","S26"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","BD","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","PK","EG","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Galaxy S26 Plus",
    aliases: ["Galaxy S26 Plus","Galaxy S26+","S26 Plus","S26+"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","BD","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","PK","EG","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Galaxy S26 Ultra",
    aliases: ["Galaxy S26 Ultra","S26 Ultra"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","BD","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","PK","EG","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Galaxy Z Flip7",
    aliases: ["Galaxy Z Flip7","Z Flip7","Flip7","Flip 7"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Galaxy Z Fold7",
    aliases: ["Galaxy Z Fold7","Z Fold7","Fold7","Fold 7"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Galaxy S25 FE",
    aliases: ["Galaxy S25 FE","S25 FE"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","BD","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","PK","EG","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Buds4 Pro",
    aliases: ["Buds4 Pro","Buds 4 Pro","Galaxy Buds4 Pro"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Buds4",
    aliases: ["Buds4","Buds 4","Galaxy Buds4"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Buds3 FE",
    aliases: ["Buds3 FE","Buds 3 FE","Galaxy Buds3 FE"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","PK","EG","N_AFRICA","AFRICA_EN","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Buds Core",
    aliases: ["Buds Core","Galaxy Buds Core"],
    countries: ["MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","ID","TH","VN","MY","PH","MM","IN","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","PK","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Watch 8",
    aliases: ["Watch 8","Galaxy Watch 8"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","BD","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","PK","EG","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Watch 8 Classic",
    aliases: ["Watch 8 Classic","Galaxy Watch 8 Classic"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","AR","PY","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","MM","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","BD","AE","AE_AR","IL","PS","SA","SA_EN","TR","IRAN","LEVANT","LEVANT_AR","PK","EG","N_AFRICA","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA","IQ_AR","IQ_KU","LB"]
  },
  {
    name: "Watch Ultra (2025)",
    aliases: ["Watch Ultra","Galaxy Watch Ultra","Watch Ultra 2025"],
    countries: ["CA_FR","CA","MX","BR","LATIN","LATIN_EN","CO","UY","CL","PE","SG","AU","NZ","ID","TH","VN","MY","PH","JP","UK","IE","DE","AT","CH","CH_FR","FR","IT","GR","ES","PT","BE","BE_FR","NL","SE","DK","FI","NO","PL","RO","BG","HU","CZ","SK","EE","LV","LT","HR","RS","SI","AL","MK","BA","UA","IN","AE","AE_AR","IL","SA","SA_EN","TR","IRAN","AFRICA_EN","AFRICA_FR","AFRICA_PT","ZA"]
  }
]

// ── GET /api/products ─────────────────────────────────────────
app.get('/api/products', (req, res) => {
  res.json({ ok: true, data: SAMSUNG_PRODUCTS })
})

// ── POST /api/connect ─────────────────────────────────────────
app.post('/api/connect', async (req, res) => {
  try {
    const { host, port, user, password, database } = req.body
    pool = mysql.createPool({ host, port: Number(port), user, password, database, waitForConnections: true, connectionLimit: 10 })
    const conn = await pool.getConnection()
    await conn.ping()
    conn.release()
    res.json({ ok: true })
  } catch (err) { pool = null; res.json({ ok: false, message: err.message }) }
})

// ── POST /api/init ────────────────────────────────────────────
app.post('/api/init', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결이 없습니다.' })
  try {
    await pool.execute(`CREATE TABLE IF NOT EXISTS copy_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      product_name VARCHAR(255) NOT NULL,
      requester VARCHAR(100), request_date DATE NOT NULL,
      note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    await pool.execute(`CREATE TABLE IF NOT EXISTS copy_rows (
      id INT AUTO_INCREMENT PRIMARY KEY,
      request_id INT NOT NULL, row_index INT NOT NULL,
      as_was TEXT, to_be TEXT,
      status ENUM('변경','추가','삭제','동일') NOT NULL DEFAULT '동일',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES copy_requests(id) ON DELETE CASCADE)`)
    res.json({ ok: true })
  } catch (err) { res.json({ ok: false, message: err.message }) }
})

// ── POST /api/save ────────────────────────────────────────────
app.post('/api/save', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결이 없습니다.' })
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
    res.json({ ok: true, requestId })
  } catch (err) { await conn.rollback(); res.json({ ok: false, message: err.message }) }
  finally { conn.release() }
})

// ── GET /api/requests ─────────────────────────────────────────
app.get('/api/requests', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결이 없습니다.' })
  try {
    const [rows] = await pool.execute(`
      SELECT r.id, r.product_name, r.requester, r.request_date, r.note, r.created_at,
             COUNT(c.id) AS total_rows, SUM(c.status != '동일') AS diff_rows
      FROM copy_requests r LEFT JOIN copy_rows c ON c.request_id = r.id
      GROUP BY r.id ORDER BY r.created_at DESC`)
    res.json({ ok: true, data: rows })
  } catch (err) { res.json({ ok: false, message: err.message }) }
})

// ── GET /api/rows ─────────────────────────────────────────────
app.get('/api/rows', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결이 없습니다.' })
  try {
    const { requestId, diffOnly } = req.query
    let sql = `SELECT * FROM copy_rows WHERE request_id = ?`
    if (diffOnly === 'true') sql += ` AND status != '동일'`
    sql += ` ORDER BY row_index`
    const [rows] = await pool.execute(sql, [requestId])
    res.json({ ok: true, data: rows })
  } catch (err) { res.json({ ok: false, message: err.message }) }
})

// ── PUT /api/rows/:id ─────────────────────────────────────────
// body: { as_was, to_be }
app.put('/api/rows/:id', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결이 없습니다.' })
  try {
    const { as_was, to_be } = req.body
    // status 재계산
    const a = (as_was || '').trim()
    const b = (to_be  || '').trim()
    let status = '동일'
    if (a !== b) {
      if (!a && b) status = '추가'
      else if (a && !b) status = '삭제'
      else status = '변경'
    }
    await pool.execute(
      `UPDATE copy_rows SET as_was=?, to_be=?, status=? WHERE id=?`,
      [as_was, to_be, status, req.params.id]
    )
    res.json({ ok: true, status })
  } catch (err) { res.json({ ok: false, message: err.message }) }
})

// ── DELETE /api/rows/:id ──────────────────────────────────────
app.delete('/api/rows/:id', async (req, res) => {
  if (!pool) return res.json({ ok: false, message: 'DB 연결이 없습니다.' })
  try {
    await pool.execute(`DELETE FROM copy_rows WHERE id=?`, [req.params.id])
    res.json({ ok: true })
  } catch (err) { res.json({ ok: false, message: err.message }) }
})

app.listen(PORT, () => console.log('✅ 서버 실행 중: http://localhost:' + PORT))