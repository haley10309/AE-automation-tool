import { useState, useEffect, useRef } from 'react'
import { api } from './api.js'

// ── 엑셀(CSV) 추출 ────────────────────────────────────────────
function exportToCSV(result) {
  if (!result || !result.rows.length) return

  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}_${String(now.getHours()).padStart(2,'0')}${String(now.getMinutes()).padStart(2,'0')}`

  // 헤더 행 1: Region
  const regionRow = ['#', ...result.sites.map(s => s.region)]
  // 헤더 행 2: Site Code
  const codeRow   = ['',  ...result.sites.map(s => s.code)]
  // 헤더 행 3: 국가명
  const nameRow   = ['',  ...result.sites.map(s => s.name)]

  // 데이터 행
  const dataRows = result.rows.map(row => {
    const cells = [String(row.index)]
    result.sites.forEach(s => {
      const cell = row.cells[s.code]
      const badges = cell.badges.length > 0 ? ` [미출시: ${cell.badges.join(', ')}]` : ''
      cells.push((cell.text || '') + badges)
    })
    return cells
  })

  const allRows = [regionRow, codeRow, nameRow, ...dataRows]

  // CSV 직렬화 (쉼표·줄바꿈 포함 셀은 따옴표로 감싸기)
  const escape = v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = allRows.map(r => r.map(escape).join(',')).join('\r\n')

  // UTF-8 BOM: 엑셀이 한글을 올바르게 인식
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `카피덱_국가별검수_${dateStr}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ── 전체 Site Code 목록 (실제 데이터 기반, 78개) ──────────────
export const ALL_SITES = [
  // NALA
  { code:'CA_FR',      region:'NALA', name:'캐나다 (FR)',      flag:'🇨🇦' },
  { code:'CA',         region:'NALA', name:'캐나다',           flag:'🇨🇦' },
  { code:'MX',         region:'NALA', name:'멕시코',           flag:'🇲🇽' },
  { code:'BR',         region:'NALA', name:'브라질',           flag:'🇧🇷' },
  { code:'LATIN',      region:'NALA', name:'라틴아메리카',     flag:'🌎' },
  { code:'LATIN_EN',   region:'NALA', name:'라틴아메리카 (EN)',flag:'🌎' },
  { code:'CO',         region:'NALA', name:'콜롬비아',         flag:'🇨🇴' },
  { code:'AR',         region:'NALA', name:'아르헨티나',       flag:'🇦🇷' },
  { code:'PY',         region:'NALA', name:'파라과이',         flag:'🇵🇾' },
  { code:'UY',         region:'NALA', name:'우루과이',         flag:'🇺🇾' },
  { code:'CL',         region:'NALA', name:'칠레',             flag:'🇨🇱' },
  { code:'PE',         region:'NALA', name:'페루',             flag:'🇵🇪' },
  // APAC
  { code:'SG',         region:'APAC', name:'싱가포르',         flag:'🇸🇬' },
  { code:'AU',         region:'APAC', name:'호주',             flag:'🇦🇺' },
  { code:'NZ',         region:'APAC', name:'뉴질랜드',         flag:'🇳🇿' },
  { code:'ID',         region:'APAC', name:'인도네시아',       flag:'🇮🇩' },
  { code:'TH',         region:'APAC', name:'태국',             flag:'🇹🇭' },
  { code:'VN',         region:'APAC', name:'베트남',           flag:'🇻🇳' },
  { code:'MY',         region:'APAC', name:'말레이시아',       flag:'🇲🇾' },
  { code:'PH',         region:'APAC', name:'필리핀',           flag:'🇵🇭' },
  { code:'MM',         region:'APAC', name:'미얀마',           flag:'🇲🇲' },
  { code:'JP',         region:'APAC', name:'일본',             flag:'🇯🇵' },
  // EU
  { code:'UK',         region:'EU',   name:'영국',             flag:'🇬🇧' },
  { code:'IE',         region:'EU',   name:'아일랜드',         flag:'🇮🇪' },
  { code:'DE',         region:'EU',   name:'독일',             flag:'🇩🇪' },
  { code:'AT',         region:'EU',   name:'오스트리아',       flag:'🇦🇹' },
  { code:'CH',         region:'EU',   name:'스위스',           flag:'🇨🇭' },
  { code:'CH_FR',      region:'EU',   name:'스위스 (FR)',      flag:'🇨🇭' },
  { code:'FR',         region:'EU',   name:'프랑스',           flag:'🇫🇷' },
  { code:'IT',         region:'EU',   name:'이탈리아',         flag:'🇮🇹' },
  { code:'GR',         region:'EU',   name:'그리스',           flag:'🇬🇷' },
  { code:'ES',         region:'EU',   name:'스페인',           flag:'🇪🇸' },
  { code:'PT',         region:'EU',   name:'포르투갈',         flag:'🇵🇹' },
  { code:'BE',         region:'EU',   name:'벨기에',           flag:'🇧🇪' },
  { code:'BE_FR',      region:'EU',   name:'벨기에 (FR)',      flag:'🇧🇪' },
  { code:'NL',         region:'EU',   name:'네덜란드',         flag:'🇳🇱' },
  { code:'SE',         region:'EU',   name:'스웨덴',           flag:'🇸🇪' },
  { code:'DK',         region:'EU',   name:'덴마크',           flag:'🇩🇰' },
  { code:'FI',         region:'EU',   name:'핀란드',           flag:'🇫🇮' },
  { code:'NO',         region:'EU',   name:'노르웨이',         flag:'🇳🇴' },
  { code:'PL',         region:'EU',   name:'폴란드',           flag:'🇵🇱' },
  { code:'RO',         region:'EU',   name:'루마니아',         flag:'🇷🇴' },
  { code:'BG',         region:'EU',   name:'불가리아',         flag:'🇧🇬' },
  { code:'HU',         region:'EU',   name:'헝가리',           flag:'🇭🇺' },
  { code:'CZ',         region:'EU',   name:'체코',             flag:'🇨🇿' },
  { code:'SK',         region:'EU',   name:'슬로바키아',       flag:'🇸🇰' },
  { code:'EE',         region:'EU',   name:'에스토니아',       flag:'🇪🇪' },
  { code:'LV',         region:'EU',   name:'라트비아',         flag:'🇱🇻' },
  { code:'LT',         region:'EU',   name:'리투아니아',       flag:'🇱🇹' },
  { code:'HR',         region:'EU',   name:'크로아티아',       flag:'🇭🇷' },
  { code:'RS',         region:'EU',   name:'세르비아',         flag:'🇷🇸' },
  { code:'SI',         region:'EU',   name:'슬로베니아',       flag:'🇸🇮' },
  { code:'AL',         region:'EU',   name:'알바니아',         flag:'🇦🇱' },
  { code:'MK',         region:'EU',   name:'북마케도니아',     flag:'🇲🇰' },
  { code:'BA',         region:'EU',   name:'보스니아',         flag:'🇧🇦' },
  { code:'UA',         region:'EU',   name:'우크라이나',       flag:'🇺🇦' },
  // SWA
  { code:'IN',         region:'SWA',  name:'인도',             flag:'🇮🇳' },
  { code:'BD',         region:'SWA',  name:'방글라데시',       flag:'🇧🇩' },
  // MENA
  { code:'AE',         region:'MENA', name:'UAE',              flag:'🇦🇪' },
  { code:'AE_AR',      region:'MENA', name:'UAE (AR)',         flag:'🇦🇪' },
  { code:'IL',         region:'MENA', name:'이스라엘',         flag:'🇮🇱' },
  { code:'PS',         region:'MENA', name:'팔레스타인',       flag:'🇵🇸' },
  { code:'SA',         region:'MENA', name:'사우디아라비아',   flag:'🇸🇦' },
  { code:'SA_EN',      region:'MENA', name:'사우디 (EN)',      flag:'🇸🇦' },
  { code:'TR',         region:'MENA', name:'터키',             flag:'🇹🇷' },
  { code:'IRAN',       region:'MENA', name:'이란',             flag:'🇮🇷' },
  { code:'LEVANT',     region:'MENA', name:'레반트',           flag:'🌍' },
  { code:'LEVANT_AR',  region:'MENA', name:'레반트 (AR)',      flag:'🌍' },
  { code:'PK',         region:'MENA', name:'파키스탄',         flag:'🇵🇰' },
  { code:'EG',         region:'MENA', name:'이집트',           flag:'🇪🇬' },
  { code:'N_AFRICA',   region:'MENA', name:'북아프리카',       flag:'🌍' },
  { code:'AFRICA_EN',  region:'MENA', name:'아프리카 (EN)',    flag:'🌍' },
  { code:'AFRICA_FR',  region:'MENA', name:'아프리카 (FR)',    flag:'🌍' },
  { code:'AFRICA_PT',  region:'MENA', name:'아프리카 (PT)',    flag:'🌍' },
  { code:'ZA',         region:'MENA', name:'남아프리카',       flag:'🇿🇦' },
  { code:'IQ_AR',      region:'MENA', name:'이라크 (AR)',      flag:'🇮🇶' },
  { code:'IQ_KU',      region:'MENA', name:'이라크 (KU)',      flag:'🇮🇶' },
  { code:'LB',         region:'MENA', name:'레바논',           flag:'🇱🇧' },
]

const REGION_COLORS = {
  NALA: '#3b82f6', APAC: '#22c55e', EU: '#8b5cf6', SWA: '#f59e0b', MENA: '#ef4444'
}
const REGION_BG = {
  NALA: '#eff6ff', APAC: '#f0fdf4', EU: '#f5f3ff', SWA: '#fffbeb', MENA: '#fef2f2'
}

function parseCol(raw) {
  if (!raw.trim()) return []
  return raw.split(/\r?\n/).map(l => l.trim())
}

function detectBadges(text, siteCode, products) {
  if (!text || !products.length) return []
  const lower = text.toLowerCase()
  const sorted = [...products].sort((a, b) =>
    Math.max(...b.aliases.map(x => x.length)) - Math.max(...a.aliases.map(x => x.length))
  )
  const usedAliases = new Set()
  const found = []
  for (const product of sorted) {
    const hit = product.aliases.find(alias => {
      const a = alias.toLowerCase()
      return lower.includes(a) && ![...usedAliases].some(u => u.includes(a) || a.includes(u))
    })
    if (hit) {
      found.push(product)
      product.aliases.forEach(a => usedAliases.add(a.toLowerCase()))
    }
  }
  return found.filter(p => !p.countries.includes(siteCode)).map(p => p.name)
}

export default function CountryCheck() {
  const [active, setActive]           = useState([{ ...ALL_SITES[0], input:'' }])
  const [products, setProducts]       = useState([])
  const [loaded, setLoaded]           = useState(false)
  const [loadErr, setLoadErr]         = useState('')
  const [result, setResult]           = useState(null)
  const [showDrop, setShowDrop]       = useState(false)
  const [search, setSearch]           = useState('')
  const [regionFilter, setRegionFilter] = useState('ALL')
  const dropRef = useRef(null)

  useEffect(() => {
    api.getProducts()
      .then(res => { if (res.ok) { setProducts(res.data); setLoaded(true) } else setLoadErr(res.message) })
      .catch(() => setLoadErr('서버를 먼저 실행해주세요 (npm start)'))
  }, [])

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addSite = site => {
    if (active.find(a => a.code === site.code)) return
    setActive(prev => [...prev, { ...site, input:'' }])
    setShowDrop(false); setSearch('')
  }
  const removeSite = code => setActive(prev => prev.filter(a => a.code !== code))
  const updateInput = (code, val) => setActive(prev => prev.map(a => a.code===code ? {...a, input:val} : a))

  const exportCSV = () => exportToCSV(result)

  const runCheck = () => {
    const parsed = active.map(a => ({ ...a, rows: parseCol(a.input) }))
    const maxRows = Math.max(...parsed.map(a => a.rows.length), 0)
    const rows = []
    for (let i=0; i<maxRows; i++) {
      const cells = {}
      let hasBadge = false
      parsed.forEach(a => {
        const text = a.rows[i] || ''
        const badges = detectBadges(text, a.code, products)
        if (badges.length) hasBadge = true
        cells[a.code] = { text, badges }
      })
      rows.push({ index:i+1, cells, hasBadge })
    }
    const total = rows.reduce((acc,r) => acc + Object.values(r.cells).reduce((a,c)=>a+c.badges.length,0), 0)
    setResult({ sites: parsed, rows, totalBadges: total })
  }

  const regions = ['ALL', 'NALA', 'APAC', 'EU', 'SWA', 'MENA']
  const available = ALL_SITES
    .filter(s => !active.find(a => a.code === s.code))
    .filter(s => regionFilter === 'ALL' || s.region === regionFilter)
    .filter(s => !search || s.name.includes(search) || s.code.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="country-check">
      {loadErr && <div className="error-banner">{loadErr}</div>}

      {/* 상태 바 */}
      <div className="cc-product-status">
        <span className={`db-badge ${loaded ? 'badge-green' : 'badge-yellow'}`}>
          {loaded ? `제품 ${products.length}종 데이터 로드됨` : '로딩 중...'}
        </span>
        <span className="cc-hint">카피에 제품명이 포함되면 Site Code별 출시 여부를 자동 확인합니다.</span>
      </div>

      {/* 국가 카드 */}
      <div className="cc-cards-grid">
        {active.map(a => {
          const rc = REGION_COLORS[a.region] || '#6b7280'
          const rb = REGION_BG[a.region] || '#f9fafb'
          return (
            <div key={a.code} className="cc-card" style={{ borderTopColor: rc }}>
              <div className="cc-card-header">
                <span className="cc-flag">{a.flag}</span>
                <div className="cc-card-title">
                  <span className="cc-card-name">{a.name}</span>
                  <span className="cc-card-code" style={{ background: rb, color: rc }}>{a.code}</span>
                </div>
                <span className="cc-region-tag" style={{ background: rb, color: rc }}>{a.region}</span>
                <button className="cc-remove-btn" onClick={() => removeSite(a.code)}>✕</button>
              </div>
              <textarea
                className="paste-area"
                style={{ height: 120 }}
                value={a.input}
                onChange={e => updateInput(a.code, e.target.value)}
                placeholder={`${a.flag} ${a.name} (${a.code})\n카피 열 전체 복사 후 Ctrl+V`}
              />
              <div className="input-hint">
                {a.input ? `${parseCol(a.input).length}행 입력됨` : '해당 국가 카피 열 붙여넣기'}
              </div>
            </div>
          )
        })}

        {/* 국가 추가 */}
        <div className="cc-add-wrap" ref={dropRef}>
          <button className="cc-add-btn" onClick={() => setShowDrop(v => !v)}>
            + 국가 추가<br/>
            <span style={{fontSize:11, fontWeight:400, marginTop:4, display:'block'}}>
              78개 Site Code
            </span>
          </button>
          {showDrop && (
            <div className="cc-dropdown">
              <div className="cc-dropdown-search">
                <input autoFocus className="form-input" style={{width:'100%', fontSize:12}}
                  placeholder="국가명 또는 코드 검색" value={search}
                  onChange={e => setSearch(e.target.value)} />
              </div>
              <div className="cc-dropdown-regions">
                {regions.map(r => (
                  <button key={r}
                    className={`cc-region-btn ${regionFilter===r?'active':''}`}
                    style={regionFilter===r && r!=='ALL' ? {background: REGION_COLORS[r], color:'#fff'} : {}}
                    onClick={() => setRegionFilter(r)}
                  >{r}</button>
                ))}
              </div>
              <div className="cc-dropdown-list">
                {available.length === 0 && <div className="cc-no-result">검색 결과 없음</div>}
                {available.map(s => (
                  <div key={s.code} className="cc-dropdown-item" onClick={() => addSite(s)}>
                    <span className="cc-flag">{s.flag}</span>
                    <span className="cc-dropdown-name">{s.name}</span>
                    <span className="cc-card-code"
                      style={{ background: REGION_BG[s.region], color: REGION_COLORS[s.region] }}>
                      {s.code}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 액션 */}
      <div className="action-row" style={{ marginTop:20 }}>
        <button className="btn-primary" onClick={runCheck}
          disabled={!loaded || active.filter(a=>a.input.trim()).length === 0}>
          검수하기
        </button>
        <span className="cc-status-text">
          {active.length}개국 선택 · {active.filter(a=>a.input.trim()).length}개국 입력 완료
        </span>
        {result && (
          <span className={`cc-badge-count ${result.totalBadges > 0 ? 'has-issue' : 'no-issue'}`}>
            {result.totalBadges > 0 ? `⚠ 미출시 감지 ${result.totalBadges}건` : '✓ 미출시 없음'}
          </span>
        )}
      </div>

      {/* 결과 테이블 */}
      {result && (
        <div className="cc-result">
          <div className="result-toolbar" style={{ marginBottom:12 }}>
            <span className="result-title">
              국가별 카피 검수 · {result.rows.length}행 · {result.sites.length}개국
            </span>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span className="cc-scroll-hint">← 가로 스크롤 →</span>
              <button className="btn-export" onClick={exportCSV}>
                ⬇ 엑셀 추출 (.csv)
              </button>
            </div>
          </div>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th className="cc-th cc-th-idx">#</th>
                  {result.sites.map(s => (
                    <th key={s.code} className="cc-th cc-th-country"
                      style={{ borderTop: `3px solid ${REGION_COLORS[s.region]}` }}>
                      <div className="cc-th-inner">
                        <span className="cc-flag">{s.flag}</span>
                        <span className="cc-th-name">{s.name}</span>
                        <span className="cc-card-code"
                          style={{ background: REGION_BG[s.region], color: REGION_COLORS[s.region] }}>
                          {s.code}
                        </span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map(row => (
                  <tr key={row.index} className={row.hasBadge ? 'cc-row-issue' : ''}>
                    <td className="cc-td cc-td-idx">{row.index}</td>
                    {result.sites.map(s => {
                      const cell = row.cells[s.code]
                      return (
                        <td key={s.code}
                          className={`cc-td cc-td-cell ${cell.badges.length > 0 ? 'cc-cell-issue' : ''}`}>
                          <div className="cc-cell-text">
                            {cell.text || <em className="empty-val">빈 값</em>}
                          </div>
                          {cell.badges.map(b => (
                            <div key={b} className="cc-launch-badge">⚠ 미출시: {b}</div>
                          ))}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}