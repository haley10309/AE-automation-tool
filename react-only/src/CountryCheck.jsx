import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { api } from './api.js'

// ── 전체 Site Code 목록 (78개) ────────────────────────────────
export const ALL_SITES = [
  { code:'CA_FR',      region:'NALA', name:'캐나다 (FR)',       flag:'🇨🇦' },
  { code:'CA',         region:'NALA', name:'캐나다',            flag:'🇨🇦' },
  { code:'MX',         region:'NALA', name:'멕시코',            flag:'🇲🇽' },
  { code:'BR',         region:'NALA', name:'브라질',            flag:'🇧🇷' },
  { code:'LATIN',      region:'NALA', name:'라틴아메리카',      flag:'🌎' },
  { code:'LATIN_EN',   region:'NALA', name:'라틴아메리카 (EN)', flag:'🌎' },
  { code:'CO',         region:'NALA', name:'콜롬비아',          flag:'🇨🇴' },
  { code:'AR',         region:'NALA', name:'아르헨티나',        flag:'🇦🇷' },
  { code:'PY',         region:'NALA', name:'파라과이',          flag:'🇵🇾' },
  { code:'UY',         region:'NALA', name:'우루과이',          flag:'🇺🇾' },
  { code:'CL',         region:'NALA', name:'칠레',              flag:'🇨🇱' },
  { code:'PE',         region:'NALA', name:'페루',              flag:'🇵🇪' },
  { code:'SG',         region:'APAC', name:'싱가포르',          flag:'🇸🇬' },
  { code:'AU',         region:'APAC', name:'호주',              flag:'🇦🇺' },
  { code:'NZ',         region:'APAC', name:'뉴질랜드',          flag:'🇳🇿' },
  { code:'ID',         region:'APAC', name:'인도네시아',        flag:'🇮🇩' },
  { code:'TH',         region:'APAC', name:'태국',              flag:'🇹🇭' },
  { code:'VN',         region:'APAC', name:'베트남',            flag:'🇻🇳' },
  { code:'MY',         region:'APAC', name:'말레이시아',        flag:'🇲🇾' },
  { code:'PH',         region:'APAC', name:'필리핀',            flag:'🇵🇭' },
  { code:'MM',         region:'APAC', name:'미얀마',            flag:'🇲🇲' },
  { code:'JP',         region:'APAC', name:'일본',              flag:'🇯🇵' },
  { code:'UK',         region:'EU',   name:'영국',              flag:'🇬🇧' },
  { code:'IE',         region:'EU',   name:'아일랜드',          flag:'🇮🇪' },
  { code:'DE',         region:'EU',   name:'독일',              flag:'🇩🇪' },
  { code:'AT',         region:'EU',   name:'오스트리아',        flag:'🇦🇹' },
  { code:'CH',         region:'EU',   name:'스위스',            flag:'🇨🇭' },
  { code:'CH_FR',      region:'EU',   name:'스위스 (FR)',       flag:'🇨🇭' },
  { code:'FR',         region:'EU',   name:'프랑스',            flag:'🇫🇷' },
  { code:'IT',         region:'EU',   name:'이탈리아',          flag:'🇮🇹' },
  { code:'GR',         region:'EU',   name:'그리스',            flag:'🇬🇷' },
  { code:'ES',         region:'EU',   name:'스페인',            flag:'🇪🇸' },
  { code:'PT',         region:'EU',   name:'포르투갈',          flag:'🇵🇹' },
  { code:'BE',         region:'EU',   name:'벨기에',            flag:'🇧🇪' },
  { code:'BE_FR',      region:'EU',   name:'벨기에 (FR)',       flag:'🇧🇪' },
  { code:'NL',         region:'EU',   name:'네덜란드',          flag:'🇳🇱' },
  { code:'SE',         region:'EU',   name:'스웨덴',            flag:'🇸🇪' },
  { code:'DK',         region:'EU',   name:'덴마크',            flag:'🇩🇰' },
  { code:'FI',         region:'EU',   name:'핀란드',            flag:'🇫🇮' },
  { code:'NO',         region:'EU',   name:'노르웨이',          flag:'🇳🇴' },
  { code:'PL',         region:'EU',   name:'폴란드',            flag:'🇵🇱' },
  { code:'RO',         region:'EU',   name:'루마니아',          flag:'🇷🇴' },
  { code:'BG',         region:'EU',   name:'불가리아',          flag:'🇧🇬' },
  { code:'HU',         region:'EU',   name:'헝가리',            flag:'🇭🇺' },
  { code:'CZ',         region:'EU',   name:'체코',              flag:'🇨🇿' },
  { code:'SK',         region:'EU',   name:'슬로바키아',        flag:'🇸🇰' },
  { code:'EE',         region:'EU',   name:'에스토니아',        flag:'🇪🇪' },
  { code:'LV',         region:'EU',   name:'라트비아',          flag:'🇱🇻' },
  { code:'LT',         region:'EU',   name:'리투아니아',        flag:'🇱🇹' },
  { code:'HR',         region:'EU',   name:'크로아티아',        flag:'🇭🇷' },
  { code:'RS',         region:'EU',   name:'세르비아',          flag:'🇷🇸' },
  { code:'SI',         region:'EU',   name:'슬로베니아',        flag:'🇸🇮' },
  { code:'AL',         region:'EU',   name:'알바니아',          flag:'🇦🇱' },
  { code:'MK',         region:'EU',   name:'북마케도니아',      flag:'🇲🇰' },
  { code:'BA',         region:'EU',   name:'보스니아',          flag:'🇧🇦' },
  { code:'UA',         region:'EU',   name:'우크라이나',        flag:'🇺🇦' },
  { code:'IN',         region:'SWA',  name:'인도',              flag:'🇮🇳' },
  { code:'BD',         region:'SWA',  name:'방글라데시',        flag:'🇧🇩' },
  { code:'AE',         region:'MENA', name:'UAE',               flag:'🇦🇪' },
  { code:'AE_AR',      region:'MENA', name:'UAE (AR)',          flag:'🇦🇪' },
  { code:'IL',         region:'MENA', name:'이스라엘',          flag:'🇮🇱' },
  { code:'PS',         region:'MENA', name:'팔레스타인',        flag:'🇵🇸' },
  { code:'SA',         region:'MENA', name:'사우디아라비아',    flag:'🇸🇦' },
  { code:'SA_EN',      region:'MENA', name:'사우디 (EN)',       flag:'🇸🇦' },
  { code:'TR',         region:'MENA', name:'터키',              flag:'🇹🇷' },
  { code:'IRAN',       region:'MENA', name:'이란',              flag:'🇮🇷' },
  { code:'LEVANT',     region:'MENA', name:'레반트',            flag:'🌍' },
  { code:'LEVANT_AR',  region:'MENA', name:'레반트 (AR)',       flag:'🌍' },
  { code:'PK',         region:'MENA', name:'파키스탄',          flag:'🇵🇰' },
  { code:'EG',         region:'MENA', name:'이집트',            flag:'🇪🇬' },
  { code:'N_AFRICA',   region:'MENA', name:'북아프리카',        flag:'🌍' },
  { code:'AFRICA_EN',  region:'MENA', name:'아프리카 (EN)',     flag:'🌍' },
  { code:'AFRICA_FR',  region:'MENA', name:'아프리카 (FR)',     flag:'🌍' },
  { code:'AFRICA_PT',  region:'MENA', name:'아프리카 (PT)',     flag:'🌍' },
  { code:'ZA',         region:'MENA', name:'남아프리카',        flag:'🇿🇦' },
  { code:'IQ_AR',      region:'MENA', name:'이라크 (AR)',       flag:'🇮🇶' },
  { code:'IQ_KU',      region:'MENA', name:'이라크 (KU)',       flag:'🇮🇶' },
  { code:'LB',         region:'MENA', name:'레바논',            flag:'🇱🇧' },
]

const REGIONS = ['NALA','APAC','EU','SWA','MENA']
const REGION_COLORS = { NALA:'#3b82f6', APAC:'#22c55e', EU:'#8b5cf6', SWA:'#f59e0b', MENA:'#ef4444' }
const REGION_BG     = { NALA:'#eff6ff', APAC:'#f0fdf4', EU:'#f5f3ff', SWA:'#fffbeb', MENA:'#fef2f2' }

// ── 유틸 ─────────────────────────────────────────────────────
function parseCol(raw) {
  if (!raw.trim()) return []
  return raw.split(/\r?\n/).map(l => l.trim())
}

function detectBadges(text, siteCode, products) {
  if (!text || !products.length) return []
  const lower = text.toLowerCase()
  const sorted = [...products].sort((a,b) =>
    Math.max(...b.aliases.map(x=>x.length)) - Math.max(...a.aliases.map(x=>x.length))
  )
  const used = new Set()
  const found = []
  for (const p of sorted) {
    const hit = p.aliases.find(alias => {
      const a = alias.toLowerCase()
      return lower.includes(a) && ![...used].some(u => u.includes(a)||a.includes(u))
    })
    if (hit) { found.push(p); p.aliases.forEach(a => used.add(a.toLowerCase())) }
  }
  // excluded_countries 기준으로 미출시 판단
  return found.filter(p => (p.excluded_countries||[]).includes(siteCode)).map(p => p.name)
}

function exportToCSV(result) {
  if (!result?.rows.length) return
  const now = new Date()
  const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
  const escape = v => { const s=String(v??''); return s.includes(',')||s.includes('"')||s.includes('\n') ? `"${s.replace(/"/g,'""')}"` : s }
  const rows = [
    ['#',...result.sites.map(s=>s.region)],
    ['',...result.sites.map(s=>s.code)],
    ['',...result.sites.map(s=>s.name)],
    ...result.rows.map(row=>[
      row.index,
      ...result.sites.map(s=>{
        const c=row.cells[s.code]
        return (c.text||'')+(c.badges.length?` [미출시: ${c.badges.join(', ')}]`:'')
      })
    ])
  ]
  const csv = rows.map(r=>r.map(escape).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href=url; a.download=`카피덱_검수결과_${ds}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ════════════════════════════════════════════════════════════════
// ── 제품 관리 패널 ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
function ProductPanel({ onClose, onProductsChanged }) {
  const [products, setProducts]       = useState([])
  const [loading, setLoading]         = useState(true)
  const [editingId, setEditingId]     = useState(null) // null=목록, 'new'=생성, number=수정
  const [formData, setFormData]       = useState({ name:'', aliases:'', excluded_countries:[] })
  const [msg, setMsg]                 = useState('')
  const [saving, setSaving]           = useState(false)
  const [regionFilter, setRegionFilter] = useState('ALL')

  const load = async () => {
    setLoading(true)
    const res = await api.getProducts()
    if (res.ok) setProducts(res.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setFormData({ name:'', aliases:'', excluded_countries:[] })
    setMsg(''); setEditingId('new')
  }

  const openEdit = (p) => {
    setFormData({
      name: p.name,
      aliases: (p.aliases||[]).join('\n'),
      excluded_countries: p.excluded_countries||[],
    })
    setMsg(''); setEditingId(p.id)
  }

  const toggleExclude = (code) => {
    setFormData(prev => ({
      ...prev,
      excluded_countries: prev.excluded_countries.includes(code)
        ? prev.excluded_countries.filter(c=>c!==code)
        : [...prev.excluded_countries, code]
    }))
  }

  const handleSave = async () => {
    if (!formData.name.trim()) { setMsg('❌ 제품명을 입력해주세요.'); return }
    setSaving(true)
    const payload = {
      name: formData.name.trim(),
      aliases: formData.aliases.split('\n').map(s=>s.trim()).filter(Boolean),
      excluded_countries: formData.excluded_countries,
    }
    const res = editingId === 'new'
      ? await api.createProduct(payload)
      : await api.updateProduct(editingId, payload)
    setSaving(false)
    if (res.ok) {
      setMsg(editingId === 'new' ? '✅ 생성 완료' : '✅ 수정 완료')
      await load()
      onProductsChanged()
      setTimeout(() => { setMsg(''); setEditingId(null) }, 1200)
    } else {
      setMsg('❌ 실패: ' + res.message)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`"${name}"을(를) 삭제하시겠습니까?`)) return
    const res = await api.deleteProduct(id)
    if (res.ok) { await load(); onProductsChanged() }
    else setMsg('❌ 삭제 실패: ' + res.message)
  }

  // 지역별 그룹
  const sitesByRegion = {}
  REGIONS.forEach(r => { sitesByRegion[r] = ALL_SITES.filter(s=>s.region===r) })
  const filteredRegions = regionFilter==='ALL' ? REGIONS : [regionFilter]

  return (
    <div className="product-panel-overlay" onClick={onClose}>
      <div className="product-panel" onClick={e=>e.stopPropagation()}>
        {/* 패널 헤더 */}
        <div className="pp-header">
          <div className="pp-title-row">
            {editingId !== null ? (
              <button className="pp-back-btn" onClick={()=>setEditingId(null)}>← 목록</button>
            ) : (
              <span className="pp-title">제품 데이터 관리</span>
            )}
            <button className="pp-close-btn" onClick={onClose}>✕</button>
          </div>
          {editingId === null && (
            <div className="pp-subtitle">{products.length}종 등록됨 · 미출시 국가만 지정하면 나머지는 전부 출시로 처리됩니다.</div>
          )}
        </div>

        {msg && (
          <div className={`pp-msg ${msg.startsWith('✅')?'pp-ok':'pp-err'}`}>{msg}</div>
        )}

        {/* ── 목록 뷰 ── */}
        {editingId === null && (
          <div className="pp-body">
            <button className="btn-primary pp-new-btn" onClick={openNew}>+ 새 제품 추가</button>
            {loading && <div className="loading">불러오는 중...</div>}
            <div className="pp-list">
              {products.map(p => (
                <div key={p.id} className="pp-item">
                  <div className="pp-item-info">
                    <div className="pp-item-name">{p.name}</div>
                    <div className="pp-item-aliases">{(p.aliases||[]).join(' · ')}</div>
                    <div className="pp-item-excluded">
                      {(p.excluded_countries||[]).length === 0
                        ? <span className="pp-all-launch">전 국가 출시</span>
                        : <>
                            <span className="pp-excl-label">미출시 {p.excluded_countries.length}개국: </span>
                            {p.excluded_countries.map(c => (
                              <span key={c} className="pp-excl-tag">{c}</span>
                            ))}
                          </>
                      }
                    </div>
                  </div>
                  <div className="pp-item-actions">
                    <button className="act-btn act-edit" onClick={()=>openEdit(p)}>✏ 수정</button>
                    <button className="act-btn act-delete" onClick={()=>handleDelete(p.id, p.name)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── 생성 / 수정 폼 ── */}
        {editingId !== null && (
          <div className="pp-body pp-form-body">
            <div className="pp-form-title">
              {editingId === 'new' ? '새 제품 추가' : '제품 수정'}
            </div>

            {/* 제품명 */}
            <div className="form-row" style={{gridTemplateColumns:'100px 1fr'}}>
              <label className="form-label">제품명 *</label>
              <input className="form-input" placeholder="예: Galaxy S27 Ultra"
                value={formData.name} onChange={e=>setFormData(p=>({...p,name:e.target.value}))} />
            </div>

            {/* 별칭 */}
            <div className="form-row" style={{gridTemplateColumns:'100px 1fr'}}>
              <label className="form-label" style={{paddingTop:4}}>감지 키워드</label>
              <div>
                <textarea className="form-input pp-alias-area"
                  placeholder={"카피에서 감지할 키워드 (줄바꿈으로 구분)\n예:\nGalaxy S27 Ultra\nS27 Ultra\nS27"}
                  value={formData.aliases}
                  onChange={e=>setFormData(p=>({...p,aliases:e.target.value}))} />
                <div className="pp-field-hint">카피 텍스트에서 이 키워드 중 하나라도 발견되면 출시 여부를 확인합니다.</div>
              </div>
            </div>

            {/* 미출시 국가 선택 */}
            <div className="pp-excl-section">
              <div className="pp-excl-header">
                <span className="pp-excl-title">
                  미출시 국가 지정
                  {formData.excluded_countries.length > 0 &&
                    <span className="pp-excl-count">{formData.excluded_countries.length}개국 선택됨</span>
                  }
                </span>
                <div className="pp-excl-hint">선택하지 않은 국가는 모두 <strong>출시</strong>로 처리됩니다.</div>
              </div>

              {/* 지역 필터 탭 */}
              <div className="pp-region-tabs">
                {['ALL',...REGIONS].map(r => (
                  <button key={r}
                    className={`cc-region-btn ${regionFilter===r?'active':''}`}
                    style={regionFilter===r&&r!=='ALL'?{background:REGION_COLORS[r],color:'#fff'}:{}}
                    onClick={()=>setRegionFilter(r)}>
                    {r}
                  </button>
                ))}
                {formData.excluded_countries.length > 0 && (
                  <button className="cc-region-btn pp-clear-btn"
                    onClick={()=>setFormData(p=>({...p,excluded_countries:[]}))}>
                    전체 해제
                  </button>
                )}
              </div>

              {/* 국가 체크박스 그리드 */}
              <div className="pp-country-grid">
                {filteredRegions.map(region => (
                  <div key={region} className="pp-region-group">
                    <div className="pp-region-label" style={{color:REGION_COLORS[region]}}>
                      {region}
                    </div>
                    <div className="pp-country-checks">
                      {sitesByRegion[region].map(s => {
                        const isExcluded = formData.excluded_countries.includes(s.code)
                        return (
                          <label key={s.code}
                            className={`pp-country-check ${isExcluded?'pp-check-on':''}`}
                            style={isExcluded?{borderColor:REGION_COLORS[region],background:REGION_BG[region]}:{}}>
                            <input type="checkbox" checked={isExcluded}
                              onChange={()=>toggleExclude(s.code)} style={{display:'none'}} />
                            <span className="pp-check-flag">{s.flag}</span>
                            <span className="pp-check-code">{s.code}</span>
                            {isExcluded && <span className="pp-check-x">✕</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="pp-form-actions">
              <button className="btn-primary" onClick={handleSave} disabled={saving}>
                {saving ? '저장 중...' : (editingId==='new' ? '추가하기' : '저장하기')}
              </button>
              <button className="btn-ghost" onClick={()=>setEditingId(null)} disabled={saving}>취소</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 메인 컴포넌트 ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
export default function CountryCheck() {
  const [active, setActive]         = useState([{ ...ALL_SITES[0], input:'' }])
  const [products, setProducts]     = useState([])
  const [loaded, setLoaded]         = useState(false)
  const [loadErr, setLoadErr]       = useState('')
  const [result, setResult]         = useState(null)
  const [showDrop, setShowDrop]     = useState(false)
  const [search, setSearch]         = useState('')
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [showProductPanel, setShowProductPanel] = useState(false)
  const dropRef = useRef(null)

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.getProducts()
      if (res.ok) { setProducts(res.data); setLoaded(true) }
      else setLoadErr(res.message)
    } catch { setLoadErr('서버를 먼저 실행해주세요 (npm start)') }
  }, [])

  useEffect(() => { loadProducts() }, [loadProducts])

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowDrop(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const addSite = s => {
    if (active.find(a=>a.code===s.code)) return
    setActive(prev=>[...prev,{...s,input:''}])
    setShowDrop(false); setSearch('')
  }
  const removeSite = code => setActive(prev=>prev.filter(a=>a.code!==code))
  const updateInput = (code, val) => setActive(prev=>prev.map(a=>a.code===code?{...a,input:val}:a))

  const runCheck = () => {
    const parsed = active.map(a=>({...a,rows:parseCol(a.input)}))
    const maxRows = Math.max(...parsed.map(a=>a.rows.length),0)
    const rows = []
    for (let i=0;i<maxRows;i++) {
      const cells={}; let hasBadge=false
      parsed.forEach(a=>{
        const text=a.rows[i]||''
        const badges=detectBadges(text,a.code,products)
        if (badges.length) hasBadge=true
        cells[a.code]={text,badges}
      })
      rows.push({index:i+1,cells,hasBadge})
    }
    const total=rows.reduce((acc,r)=>acc+Object.values(r.cells).reduce((a,c)=>a+c.badges.length,0),0)
    setResult({sites:parsed,rows,totalBadges:total})
  }

  const available = ALL_SITES
    .filter(s=>!active.find(a=>a.code===s.code))
    .filter(s=>regionFilter==='ALL'||s.region===regionFilter)
    .filter(s=>!search||s.name.includes(search)||s.code.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="country-check">
      {loadErr && <div className="error-banner">{loadErr}</div>}

      {/* 상태 바 */}
      <div className="cc-product-status">
        <span className={`db-badge ${loaded?'badge-green':'badge-yellow'}`}>
          {loaded ? `제품 ${products.length}종 로드됨` : '로딩 중...'}
        </span>
        <span className="cc-hint">카피에 제품명이 포함되면 미출시 국가에서 자동으로 배지를 표시합니다.</span>
        <button className="btn-manage-product" onClick={()=>setShowProductPanel(true)}>
          ⚙ 제품 데이터 관리
        </button>
      </div>

      {/* 국가 카드 그리드 */}
      <div className="cc-cards-grid">
        {active.map(a => {
          const rc=REGION_COLORS[a.region]||'#6b7280', rb=REGION_BG[a.region]||'#f9fafb'
          return (
            <div key={a.code} className="cc-card" style={{borderTopColor:rc}}>
              <div className="cc-card-header">
                <span className="cc-flag">{a.flag}</span>
                <div className="cc-card-title">
                  <span className="cc-card-name">{a.name}</span>
                  <span className="cc-card-code" style={{background:rb,color:rc}}>{a.code}</span>
                </div>
                <span className="cc-region-tag" style={{background:rb,color:rc}}>{a.region}</span>
                <button className="cc-remove-btn" onClick={()=>removeSite(a.code)}>✕</button>
              </div>
              <textarea className="paste-area" style={{height:120}} value={a.input}
                onChange={e=>updateInput(a.code,e.target.value)}
                placeholder={`${a.flag} ${a.name} (${a.code})\n카피 열 전체 복사 후 Ctrl+V`} />
              <div className="input-hint">
                {a.input ? `${parseCol(a.input).length}행 입력됨` : '해당 국가 카피 열 붙여넣기'}
              </div>
            </div>
          )
        })}

        {/* 국가 추가 드롭다운 */}
        <div className="cc-add-wrap" ref={dropRef}>
          <button className="cc-add-btn" onClick={()=>setShowDrop(v=>!v)}>
            + 국가 추가<br/>
            <span style={{fontSize:11,fontWeight:400,marginTop:4,display:'block'}}>78개 Site Code</span>
          </button>
          {showDrop && (
            <div className="cc-dropdown">
              <div className="cc-dropdown-search">
                <input autoFocus className="form-input" style={{width:'100%',fontSize:12}}
                  placeholder="국가명 또는 코드 검색" value={search}
                  onChange={e=>setSearch(e.target.value)} />
              </div>
              <div className="cc-dropdown-regions">
                {['ALL',...REGIONS].map(r=>(
                  <button key={r} className={`cc-region-btn ${regionFilter===r?'active':''}`}
                    style={regionFilter===r&&r!=='ALL'?{background:REGION_COLORS[r],color:'#fff'}:{}}
                    onClick={()=>setRegionFilter(r)}>{r}</button>
                ))}
              </div>
              <div className="cc-dropdown-list">
                {available.length===0 && <div className="cc-no-result">검색 결과 없음</div>}
                {available.map(s=>(
                  <div key={s.code} className="cc-dropdown-item" onClick={()=>addSite(s)}>
                    <span className="cc-flag">{s.flag}</span>
                    <span className="cc-dropdown-name">{s.name}</span>
                    <span className="cc-card-code" style={{background:REGION_BG[s.region],color:REGION_COLORS[s.region]}}>{s.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 액션 */}
      <div className="action-row" style={{marginTop:20}}>
        <button className="btn-primary" onClick={runCheck}
          disabled={!loaded||active.filter(a=>a.input.trim()).length===0}>
          검수하기
        </button>
        <span className="cc-status-text">
          {active.length}개국 선택 · {active.filter(a=>a.input.trim()).length}개국 입력 완료
        </span>
        {result && (
          <span className={`cc-badge-count ${result.totalBadges>0?'has-issue':'no-issue'}`}>
            {result.totalBadges>0?`⚠ 미출시 감지 ${result.totalBadges}건`:'✓ 미출시 없음'}
          </span>
        )}
      </div>

      {/* 결과 테이블 */}
      {result && (
        <div className="cc-result">
          <div className="result-toolbar" style={{marginBottom:12}}>
            <span className="result-title">
              국가별 카피 검수 · {result.rows.length}행 · {result.sites.length}개국
            </span>
            <div style={{display:'flex',alignItems:'center',gap:10}}>
              <span className="cc-scroll-hint">← 가로 스크롤 →</span>
              <button className="btn-export" onClick={()=>exportToCSV(result)}>⬇ 엑셀 추출 (.csv)</button>
            </div>
          </div>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th className="cc-th cc-th-idx">#</th>
                  {result.sites.map(s=>(
                    <th key={s.code} className="cc-th cc-th-country"
                      style={{borderTop:`3px solid ${REGION_COLORS[s.region]}`}}>
                      <div className="cc-th-inner">
                        <span className="cc-flag">{s.flag}</span>
                        <span className="cc-th-name">{s.name}</span>
                        <span className="cc-card-code" style={{background:REGION_BG[s.region],color:REGION_COLORS[s.region]}}>{s.code}</span>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.rows.map(row=>(
                  <tr key={row.index} className={row.hasBadge?'cc-row-issue':''}>
                    <td className="cc-td cc-td-idx">{row.index}</td>
                    {result.sites.map(s=>{
                      const cell=row.cells[s.code]
                      return (
                        <td key={s.code} className={`cc-td cc-td-cell ${cell.badges.length>0?'cc-cell-issue':''}`}>
                          <div className="cc-cell-text">{cell.text||<em className="empty-val">빈 값</em>}</div>
                          {cell.badges.map(b=>(
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

      {/* 제품 관리 패널 */}
      {showProductPanel && (
        <ProductPanel
          onClose={()=>setShowProductPanel(false)}
          onProductsChanged={loadProducts}
        />
      )}
    </div>
  )
}