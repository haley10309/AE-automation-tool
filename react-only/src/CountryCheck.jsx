import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { api } from './api.js'

// ── 전체 Site Code 목록 ───────────────────────────────────────
export const ALL_SITES = [
  { code:'CA_FR',     region:'NALA', name:'캐나다 (FR)',       flag:'🇨🇦' },
  { code:'CA',        region:'NALA', name:'캐나다',            flag:'🇨🇦' },
  { code:'MX',        region:'NALA', name:'멕시코',            flag:'🇲🇽' },
  { code:'BR',        region:'NALA', name:'브라질',            flag:'🇧🇷' },
  { code:'LATIN',     region:'NALA', name:'라틴아메리카',      flag:'🌎' },
  { code:'LATIN_EN',  region:'NALA', name:'라틴아메리카 (EN)', flag:'🌎' },
  { code:'CO',        region:'NALA', name:'콜롬비아',          flag:'🇨🇴' },
  { code:'AR',        region:'NALA', name:'아르헨티나',        flag:'🇦🇷' },
  { code:'PY',        region:'NALA', name:'파라과이',          flag:'🇵🇾' },
  { code:'UY',        region:'NALA', name:'우루과이',          flag:'🇺🇾' },
  { code:'CL',        region:'NALA', name:'칠레',              flag:'🇨🇱' },
  { code:'PE',        region:'NALA', name:'페루',              flag:'🇵🇪' },
  { code:'SG',        region:'APAC', name:'싱가포르',          flag:'🇸🇬' },
  { code:'AU',        region:'APAC', name:'호주',              flag:'🇦🇺' },
  { code:'NZ',        region:'APAC', name:'뉴질랜드',          flag:'🇳🇿' },
  { code:'ID',        region:'APAC', name:'인도네시아',        flag:'🇮🇩' },
  { code:'TH',        region:'APAC', name:'태국',              flag:'🇹🇭' },
  { code:'VN',        region:'APAC', name:'베트남',            flag:'🇻🇳' },
  { code:'MY',        region:'APAC', name:'말레이시아',        flag:'🇲🇾' },
  { code:'PH',        region:'APAC', name:'필리핀',            flag:'🇵🇭' },
  { code:'MM',        region:'APAC', name:'미얀마',            flag:'🇲🇲' },
  { code:'JP',        region:'APAC', name:'일본',              flag:'🇯🇵' },
  { code:'UK',        region:'EU',   name:'영국',              flag:'🇬🇧' },
  { code:'IE',        region:'EU',   name:'아일랜드',          flag:'🇮🇪' },
  { code:'DE',        region:'EU',   name:'독일',              flag:'🇩🇪' },
  { code:'AT',        region:'EU',   name:'오스트리아',        flag:'🇦🇹' },
  { code:'CH',        region:'EU',   name:'스위스',            flag:'🇨🇭' },
  { code:'CH_FR',     region:'EU',   name:'스위스 (FR)',       flag:'🇨🇭' },
  { code:'FR',        region:'EU',   name:'프랑스',            flag:'🇫🇷' },
  { code:'IT',        region:'EU',   name:'이탈리아',          flag:'🇮🇹' },
  { code:'GR',        region:'EU',   name:'그리스',            flag:'🇬🇷' },
  { code:'ES',        region:'EU',   name:'스페인',            flag:'🇪🇸' },
  { code:'PT',        region:'EU',   name:'포르투갈',          flag:'🇵🇹' },
  { code:'BE',        region:'EU',   name:'벨기에',            flag:'🇧🇪' },
  { code:'BE_FR',     region:'EU',   name:'벨기에 (FR)',       flag:'🇧🇪' },
  { code:'NL',        region:'EU',   name:'네덜란드',          flag:'🇳🇱' },
  { code:'SE',        region:'EU',   name:'스웨덴',            flag:'🇸🇪' },
  { code:'DK',        region:'EU',   name:'덴마크',            flag:'🇩🇰' },
  { code:'FI',        region:'EU',   name:'핀란드',            flag:'🇫🇮' },
  { code:'NO',        region:'EU',   name:'노르웨이',          flag:'🇳🇴' },
  { code:'PL',        region:'EU',   name:'폴란드',            flag:'🇵🇱' },
  { code:'RO',        region:'EU',   name:'루마니아',          flag:'🇷🇴' },
  { code:'BG',        region:'EU',   name:'불가리아',          flag:'🇧🇬' },
  { code:'HU',        region:'EU',   name:'헝가리',            flag:'🇭🇺' },
  { code:'CZ',        region:'EU',   name:'체코',              flag:'🇨🇿' },
  { code:'SK',        region:'EU',   name:'슬로바키아',        flag:'🇸🇰' },
  { code:'EE',        region:'EU',   name:'에스토니아',        flag:'🇪🇪' },
  { code:'LV',        region:'EU',   name:'라트비아',          flag:'🇱🇻' },
  { code:'LT',        region:'EU',   name:'리투아니아',        flag:'🇱🇹' },
  { code:'HR',        region:'EU',   name:'크로아티아',        flag:'🇭🇷' },
  { code:'RS',        region:'EU',   name:'세르비아',          flag:'🇷🇸' },
  { code:'SI',        region:'EU',   name:'슬로베니아',        flag:'🇸🇮' },
  { code:'AL',        region:'EU',   name:'알바니아',          flag:'🇦🇱' },
  { code:'MK',        region:'EU',   name:'북마케도니아',      flag:'🇲🇰' },
  { code:'BA',        region:'EU',   name:'보스니아',          flag:'🇧🇦' },
  { code:'UA',        region:'EU',   name:'우크라이나',        flag:'🇺🇦' },
  { code:'IN',        region:'SWA',  name:'인도',              flag:'🇮🇳' },
  { code:'BD',        region:'SWA',  name:'방글라데시',        flag:'🇧🇩' },
  { code:'AE',        region:'MENA', name:'UAE',               flag:'🇦🇪' },
  { code:'AE_AR',     region:'MENA', name:'UAE (AR)',          flag:'🇦🇪' },
  { code:'IL',        region:'MENA', name:'이스라엘',          flag:'🇮🇱' },
  { code:'PS',        region:'MENA', name:'팔레스타인',        flag:'🇵🇸' },
  { code:'SA',        region:'MENA', name:'사우디아라비아',    flag:'🇸🇦' },
  { code:'SA_EN',     region:'MENA', name:'사우디 (EN)',       flag:'🇸🇦' },
  { code:'TR',        region:'MENA', name:'터키',              flag:'🇹🇷' },
  { code:'IRAN',      region:'MENA', name:'이란',              flag:'🇮🇷' },
  { code:'LEVANT',    region:'MENA', name:'레반트',            flag:'🌍' },
  { code:'LEVANT_AR', region:'MENA', name:'레반트 (AR)',       flag:'🌍' },
  { code:'PK',        region:'MENA', name:'파키스탄',          flag:'🇵🇰' },
  { code:'EG',        region:'MENA', name:'이집트',            flag:'🇪🇬' },
  { code:'N_AFRICA',  region:'MENA', name:'북아프리카',        flag:'🌍' },
  { code:'AFRICA_EN', region:'MENA', name:'아프리카 (EN)',     flag:'🌍' },
  { code:'AFRICA_FR', region:'MENA', name:'아프리카 (FR)',     flag:'🌍' },
  { code:'AFRICA_PT', region:'MENA', name:'아프리카 (PT)',     flag:'🌍' },
  { code:'ZA',        region:'MENA', name:'남아프리카',        flag:'🇿🇦' },
  { code:'IQ_AR',     region:'MENA', name:'이라크 (AR)',       flag:'🇮🇶' },
  { code:'IQ_KU',     region:'MENA', name:'이라크 (KU)',       flag:'🇮🇶' },
  { code:'LB',        region:'MENA', name:'레바논',            flag:'🇱🇧' },
]

const REGIONS = ['NALA','APAC','EU','SWA','MENA']
const RC = { NALA:'#3b82f6', APAC:'#22c55e', EU:'#8b5cf6', SWA:'#f59e0b', MENA:'#ef4444' }
const RB = { NALA:'#eff6ff', APAC:'#f0fdf4', EU:'#f5f3ff', SWA:'#fffbeb', MENA:'#fef2f2' }
const siteMap = Object.fromEntries(ALL_SITES.map(s => [s.code, s]))

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
  return found.filter(p => (p.excluded_countries||[]).includes(siteCode)).map(p => p.name)
}
function exportToCSV(sites, rows, cellsMap) {
  const now = new Date()
  const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
  const esc = v => { const s=String(v??''); return s.includes(',')||s.includes('"')||s.includes('\n')?`"${s.replace(/"/g,'""')}"`  :s }
  const header1 = ['#',...sites.map(s=>s.region)]
  const header2 = ['',...sites.map(s=>s.code)]
  const header3 = ['',...sites.map(s=>s.name)]
  const dataRows = rows.map(ri => [
    ri, ...sites.map(s => {
      const txt = cellsMap[`${s.code}__${ri}`] || ''
      return txt
    })
  ])
  const csv = [header1,header2,header3,...dataRows].map(r=>r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href=url; a.download=`카피프로젝트_${ds}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ── 국가 선택 드롭다운 (공통) ──────────────────────────────────
function SiteDropdown({ excludeCodes=[], onAdd }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('ALL')
  const ref = useRef(null)
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const available = ALL_SITES
    .filter(s => !excludeCodes.includes(s.code))
    .filter(s => region==='ALL' || s.region===region)
    .filter(s => !search || s.name.includes(search) || s.code.toLowerCase().includes(search.toLowerCase()))
  return (
    <div className="cc-add-wrap" ref={ref} style={{position:'relative'}}>
      <button className="cc-add-col-btn" onClick={()=>setOpen(v=>!v)}>+ 국가 추가</button>
      {open && (
        <div className="cc-dropdown" style={{top:'calc(100% + 4px)',left:0}}>
          <div className="cc-dropdown-search">
            <input autoFocus className="form-input" style={{width:'100%',fontSize:12}}
              placeholder="국가명/코드 검색" value={search} onChange={e=>setSearch(e.target.value)} />
          </div>
          <div className="cc-dropdown-regions">
            {['ALL',...REGIONS].map(r=>(
              <button key={r} className={`cc-region-btn ${region===r?'active':''}`}
                style={region===r&&r!=='ALL'?{background:RC[r],color:'#fff'}:{}}
                onClick={()=>setRegion(r)}>{r}</button>
            ))}
          </div>
          <div className="cc-dropdown-list">
            {available.length===0 && <div className="cc-no-result">검색 결과 없음</div>}
            {available.map(s=>(
              <div key={s.code} className="cc-dropdown-item" onClick={()=>{ onAdd(s); setOpen(false); setSearch('') }}>
                <span className="cc-flag">{s.flag}</span>
                <span className="cc-dropdown-name">{s.name}</span>
                <span className="cc-card-code" style={{background:RB[s.region],color:RC[s.region]}}>{s.code}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 즉석 검수 탭 (기존 기능) ──────────────────────────────────
// ════════════════════════════════════════════════════════════════
function QuickCheck({ products }) {
  const [active, setActive]   = useState([{ ...ALL_SITES[0], input:'' }])
  const [result, setResult]   = useState(null)

  const addSite = s => setActive(prev => [...prev, {...s, input:''}])
  const removeSite = code => setActive(prev => prev.filter(a=>a.code!==code))
  const updateInput = (code, val) => setActive(prev => prev.map(a=>a.code===code?{...a,input:val}:a))

  const runCheck = () => {
    const parsed = active.map(a=>({...a, rows:parseCol(a.input)}))
    const maxRows = Math.max(...parsed.map(a=>a.rows.length), 0)
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
    setResult({sites:parsed, rows, totalBadges:total})
  }

  const doExport = () => {
    if (!result) return
    const cellsMap = {}
    result.rows.forEach(row => result.sites.forEach(s => {
      cellsMap[`${s.code}__${row.index}`] = row.cells[s.code]?.text||''
    }))
    exportToCSV(result.sites, result.rows.map(r=>r.index), cellsMap)
  }

  return (
    <div>
      <div className="cc-cards-grid">
        {active.map(a => (
          <div key={a.code} className="cc-card" style={{borderTopColor:RC[a.region]}}>
            <div className="cc-card-header">
              <span className="cc-flag">{a.flag}</span>
              <div className="cc-card-title">
                <span className="cc-card-name">{a.name}</span>
                <span className="cc-card-code" style={{background:RB[a.region],color:RC[a.region]}}>{a.code}</span>
              </div>
              <span className="cc-region-tag" style={{background:RB[a.region],color:RC[a.region]}}>{a.region}</span>
              <button className="cc-remove-btn" onClick={()=>removeSite(a.code)}>✕</button>
            </div>
            <textarea className="paste-area" style={{height:120}} value={a.input}
              onChange={e=>updateInput(a.code,e.target.value)}
              placeholder={`${a.flag} ${a.name}\n카피 열 전체 복사 후 Ctrl+V`} />
            <div className="input-hint">{a.input ? `${parseCol(a.input).length}행 입력됨` : '붙여넣기'}</div>
          </div>
        ))}
        <SiteDropdown excludeCodes={active.map(a=>a.code)} onAdd={addSite} />
      </div>

      <div className="action-row" style={{marginTop:16}}>
        <button className="btn-primary" onClick={runCheck}
          disabled={active.filter(a=>a.input.trim()).length===0}>검수하기</button>
        {result && (
          <>
            <span className={`cc-badge-count ${result.totalBadges>0?'has-issue':'no-issue'}`}>
              {result.totalBadges>0?`⚠ 미출시 감지 ${result.totalBadges}건`:'✓ 미출시 없음'}
            </span>
            <button className="btn-export" onClick={doExport}>⬇ 엑셀 추출</button>
          </>
        )}
      </div>

      {result && (
        <div className="cc-result" style={{marginTop:16}}>
          <div className="cc-table-wrap">
            <table className="cc-table">
              <thead>
                <tr>
                  <th className="cc-th cc-th-idx">#</th>
                  {result.sites.map(s=>(
                    <th key={s.code} className="cc-th cc-th-country" style={{borderTop:`3px solid ${RC[s.region]}`}}>
                      <div className="cc-th-inner">
                        <span className="cc-flag">{s.flag}</span>
                        <span className="cc-th-name">{s.name}</span>
                        <span className="cc-card-code" style={{background:RB[s.region],color:RC[s.region]}}>{s.code}</span>
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
                          {cell.badges.map(b=><div key={b} className="cc-launch-badge">⚠ 미출시: {b}</div>)}
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

// ════════════════════════════════════════════════════════════════
// ── 프로젝트 상세 (편집 가능 테이블) ─────────────────────────
// ════════════════════════════════════════════════════════════════
function ProjectDetail({ project, products, onBack, onUpdated }) {
  const [sites, setSites]       = useState([])
  const [rowCount, setRowCount] = useState(5)
  const [cells, setCells]       = useState({})   // "code__ri" → text, state로 관리해야 배지 실시간 반영
  const [pasteInputs, setPasteInputs] = useState({}) // "code" → 붙여넣기 textarea 임시값
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')
  const [editName, setEditName] = useState(false)
  const [nameVal, setNameVal]   = useState(project.name)
  const [noteVal, setNoteVal]   = useState(project.note||'')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.ccGetCopies(project.id)
    if (res.ok) {
      const codes = res.site_codes || []
      setSites(codes.map(c => siteMap[c]).filter(Boolean))
      const cm = {}
      res.copies.forEach(c => { cm[`${c.site_code}__${c.row_index}`] = c.copy_text||'' })
      setCells(cm)
      const maxRow = res.copies.reduce((m,c)=>Math.max(m,c.row_index),0)
      setRowCount(Math.max(maxRow, 5))
    }
    setLoading(false)
  }, [project.id])

  useEffect(() => { load() }, [load])

  const addSite = s => setSites(prev => [...prev, s])
  const removeSite = code => {
    setSites(prev => prev.filter(s=>s.code!==code))
    setPasteInputs(prev => { const n={...prev}; delete n[code]; return n })
    setCells(prev => {
      const n = {}
      Object.entries(prev).forEach(([k,v]) => { if (!k.startsWith(code+'__')) n[k]=v })
      return n
    })
  }
  const addRow = () => setRowCount(n => n+1)
  const removeLastRow = () => setRowCount(n => Math.max(1, n-1))

  // ── 열 붙여넣기: 줄바꿈 기준으로 각 행에 분배 ───────────────
  const handlePaste = (code, raw) => {
    setPasteInputs(prev => ({...prev, [code]: raw}))
    const lines = raw.split(/\r?\n/).filter(l => l.trim() !== '')
    const needed = Math.max(lines.length, rowCount)
    setRowCount(needed)
    setCells(prev => {
      const next = {...prev}
      lines.forEach((text, i) => {
        next[`${code}__${i+1}`] = text
      })
      return next
    })
  }

  // 셀 직접 수정
  const handleCellChange = (code, ri, text) => {
    setCells(prev => ({...prev, [`${code}__${ri}`]: text}))
  }

  const handleSave = async () => {
    setSaving(true); setMsg('')
    const allCells = []
    for (let ri=1; ri<=rowCount; ri++) {
      sites.forEach(s => {
        const text = cells[`${s.code}__${ri}`] ?? ''
        if (text.trim()) allCells.push({ site_code:s.code, row_index:ri, copy_text:text })
      })
    }
    const res = await api.ccSaveCopies(project.id, {
      site_codes: sites.map(s=>s.code),
      cells: allCells,
    })
    setSaving(false)
    if (res.ok) {
      setMsg('✅ 저장 완료')
      onUpdated()
      setTimeout(()=>setMsg(''),2000)
    } else {
      setMsg('❌ 저장 실패: ' + res.message)
    }
  }

  const handleRename = async () => {
    if (!nameVal.trim()) return
    await api.ccUpdateProject(project.id, { name:nameVal.trim(), note:noteVal, site_codes:sites.map(s=>s.code) })
    setEditName(false)
    onUpdated()
  }

  const doExport = () => {
    const cm = {}
    for (let ri=1; ri<=rowCount; ri++) {
      sites.forEach(s => { cm[`${s.code}__${ri}`] = cells[`${s.code}__${ri}`] || '' })
    }
    exportToCSV(sites, Array.from({length:rowCount},(_,i)=>i+1), cm)
  }

  // 배지: cells state 기반이므로 붙여넣기 즉시 반영
  const getBadges = (code, ri) => detectBadges(cells[`${code}__${ri}`]||'', code, products)

  // 열 전체 미출시 감지 건수
  const getColIssueCount = (code) => {
    let n = 0
    for (let ri=1; ri<=rowCount; ri++) n += getBadges(code,ri).length
    return n
  }

  if (loading) return <div className="loading" style={{padding:40}}>불러오는 중...</div>

  const rows = Array.from({length:rowCount}, (_,i)=>i+1)

  return (
    <div className="pj-detail">
      {/* 헤더 */}
      <div className="pj-detail-header">
        <button className="pj-back-btn" onClick={onBack}>← 프로젝트 목록</button>
        <div className="pj-detail-title-row">
          {editName ? (
            <div className="pj-rename-row">
              <input className="form-input" value={nameVal} onChange={e=>setNameVal(e.target.value)}
                style={{fontSize:15,fontWeight:700,width:240}} />
              <input className="form-input" value={noteVal} onChange={e=>setNoteVal(e.target.value)}
                placeholder="메모 (선택)" style={{fontSize:13,width:180}} />
              <button className="act-btn act-save" onClick={handleRename}>저장</button>
              <button className="act-btn act-cancel" onClick={()=>setEditName(false)}>취소</button>
            </div>
          ) : (
            <div className="pj-title-info">
              <span className="pj-detail-name">{project.name}</span>
              {project.note && <span className="pj-detail-note">{project.note}</span>}
              <button className="act-btn act-edit" onClick={()=>setEditName(true)}>✏ 이름 수정</button>
            </div>
          )}
        </div>
      </div>

      {msg && <div className={msg.startsWith('✅')?'success-banner':'error-banner'}>{msg}</div>}

      {/* 툴바 */}
      <div className="pj-toolbar">
        <div className="pj-toolbar-left">
          <SiteDropdown excludeCodes={sites.map(s=>s.code)} onAdd={addSite} />
          <button className="btn-sm" onClick={addRow}>+ 행 추가</button>
          {rowCount > 1 && <button className="btn-sm" onClick={removeLastRow}>− 마지막 행</button>}
          <span className="cc-status-text">{sites.length}개국 · {rowCount}행</span>
        </div>
        <div className="pj-toolbar-right">
          <button className="btn-export" onClick={doExport}>⬇ 엑셀 추출</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? '저장 중...' : '💾 저장하기'}
          </button>
        </div>
      </div>

      {sites.length === 0 ? (
        <div className="empty-state" style={{marginTop:24}}>
          <div className="empty-icon">🌍</div>
          <p>국가를 추가해주세요</p>
          <small>위 "+ 국가 추가" 버튼으로 열(국가)을 추가할 수 있습니다.</small>
        </div>
      ) : (
        <div className="cc-table-wrap" style={{marginTop:12}}>
          <table className="cc-table pj-table">
            <thead>
              {/* ── 붙여넣기 행 ── */}
              <tr className="pj-paste-row">
                <th className="cc-th cc-th-idx" style={{verticalAlign:'bottom',paddingBottom:6}}>
                  <span style={{fontSize:10,color:'#9ca3af'}}>붙여넣기</span>
                </th>
                {sites.map(s => {
                  const issueCount = getColIssueCount(s.code)
                  return (
                    <th key={s.code} className="cc-th" style={{padding:'6px 8px',borderTop:`3px solid ${RC[s.region]}`}}>
                      {/* 국가 정보 */}
                      <div className="cc-th-inner" style={{marginBottom:6}}>
                        <span className="cc-flag">{s.flag}</span>
                        <span className="cc-th-name">{s.name}</span>
                        <span className="cc-card-code" style={{background:RB[s.region],color:RC[s.region]}}>{s.code}</span>
                        {issueCount > 0 && (
                          <span className="cc-launch-badge" style={{fontSize:10,marginLeft:4}}>⚠ {issueCount}건</span>
                        )}
                        <button className="pj-col-remove" onClick={()=>removeSite(s.code)} title="열 제거">✕</button>
                      </div>
                      {/* 붙여넣기 영역 */}
                      <textarea
                        className="paste-area pj-paste-area"
                        placeholder={`${s.flag} 카피 열 전체\nCtrl+V로 붙여넣기`}
                        value={pasteInputs[s.code] || ''}
                        onChange={e => handlePaste(s.code, e.target.value)}
                        style={{width:'100%', height:64, fontSize:11, resize:'vertical'}}
                      />
                      <div className="input-hint" style={{fontSize:10}}>
                        {pasteInputs[s.code]
                          ? `${pasteInputs[s.code].split(/\r?\n/).length}행 입력됨`
                          : '붙여넣기 후 자동 분류'}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map(ri => (
                <tr key={ri}>
                  <td className="cc-td cc-td-idx">{ri}</td>
                  {sites.map(s => {
                    const key = `${s.code}__${ri}`
                    const val = cells[key] || ''
                    const badges = getBadges(s.code, ri)
                    return (
                      <td key={s.code} className={`cc-td cc-td-cell pj-cell ${badges.length?'cc-cell-issue':''}`}>
                        <textarea
                          className="pj-cell-input"
                          value={val}
                          onChange={e => handleCellChange(s.code, ri, e.target.value)}
                          placeholder="카피 입력"
                          rows={2}
                        />
                        {badges.map(b=><div key={b} className="cc-launch-badge" style={{fontSize:10}}>⚠ 미출시: {b}</div>)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 프로젝트 목록 ────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
function ProjectManager({ products }) {
  const [projects, setProjects]     = useState([])
  const [loading, setLoading]       = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]       = useState('')
  const [newNote, setNewNote]       = useState('')
  const [creating, setCreating]     = useState(false)
  const [msg, setMsg]               = useState('')
  const [search, setSearch]         = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.ccListProjects()
    if (res.ok) setProjects(res.data)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const handleCreate = async () => {
    if (!newName.trim()) { setMsg('❌ 프로젝트명을 입력해주세요.'); return }
    setCreating(true)
    const res = await api.ccCreateProject({ name:newName.trim(), note:newNote, site_codes:[] })
    setCreating(false)
    if (res.ok) {
      setNewName(''); setNewNote(''); setShowCreate(false); setMsg('')
      await load()
      setSelectedId(res.id)
    } else {
      setMsg('❌ ' + res.message)
    }
  }

  const handleDelete = async (id, name, e) => {
    e.stopPropagation()
    if (!window.confirm(`"${name}" 프로젝트를 삭제하시겠습니까?\n저장된 카피 데이터도 모두 삭제됩니다.`)) return
    await api.ccDeleteProject(id)
    if (selectedId === id) setSelectedId(null)
    load()
  }

  const selected = projects.find(p=>p.id===selectedId)

  if (selectedId && selected) {
    return (
      <ProjectDetail
        project={selected}
        products={products}
        onBack={()=>setSelectedId(null)}
        onUpdated={load}
      />
    )
  }

  const filtered = projects.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="pj-manager">
      {/* 헤더 */}
      <div className="pj-list-header">
        <div className="pj-list-title-row">
          <span className="pj-list-title">프로젝트 목록</span>
          <span className="cc-status-text">{projects.length}개 프로젝트</span>
        </div>
        <div className="pj-list-actions">
          <input className="form-input" placeholder="프로젝트 검색" value={search}
            onChange={e=>setSearch(e.target.value)} style={{fontSize:13,width:200}} />
          <button className="btn-primary" onClick={()=>setShowCreate(v=>!v)}>
            {showCreate ? '취소' : '+ 새 프로젝트'}
          </button>
        </div>
      </div>

      {/* 생성 폼 */}
      {showCreate && (
        <div className="pj-create-form">
          <input className="form-input" placeholder="페이지/프로젝트명 *" value={newName}
            onChange={e=>setNewName(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&handleCreate()} style={{flex:1}} />
          <input className="form-input" placeholder="메모 (선택)" value={newNote}
            onChange={e=>setNewNote(e.target.value)} style={{width:200}} />
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating?'생성 중...':'생성'}
          </button>
          {msg && <span className="form-err">{msg}</span>}
        </div>
      )}

      {/* 프로젝트 그리드 */}
      {loading && <div className="loading" style={{padding:40}}>불러오는 중...</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state" style={{marginTop:24}}>
          <div className="empty-icon">📁</div>
          <p>{projects.length===0 ? '아직 프로젝트가 없습니다.' : '검색 결과 없음'}</p>
          {projects.length===0 && <small>"+ 새 프로젝트" 버튼으로 시작해보세요.</small>}
        </div>
      )}
      <div className="pj-grid">
        {filtered.map(p => (
          <div key={p.id} className="pj-card" onClick={()=>setSelectedId(p.id)}>
            <div className="pj-card-header">
              <span className="pj-card-name">{p.name}</span>
              <button className="act-btn act-delete" style={{padding:'2px 7px'}}
                onClick={e=>handleDelete(p.id,p.name,e)}>🗑</button>
            </div>
            {p.note && <div className="pj-card-note">{p.note}</div>}
            <div className="pj-card-meta">
              <span>{p.country_count||0}개국</span>
              <span>·</span>
              <span>{p.max_row||0}행</span>
              <span>·</span>
              <span>{p.updated_at?.slice(0,10)||p.created_at?.slice(0,10)}</span>
            </div>
            <div className="pj-card-arrow">열기 →</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 제품 관리 패널 (기존 유지) ────────────────────────────────
// ════════════════════════════════════════════════════════════════
function ProductPanel({ onClose, onProductsChanged }) {
  const [products, setProducts] = useState([])
  const [loading, setLoading]   = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData] = useState({ name:'', aliases:'', excluded_countries:[] })
  const [msg, setMsg]           = useState('')
  const [saving, setSaving]     = useState(false)
  const [regionFilter, setRegionFilter] = useState('ALL')

  const load = async () => {
    setLoading(true)
    const res = await api.getProducts()
    if (res.ok) setProducts(res.data)
    setLoading(false)
  }
  useEffect(()=>{ load() },[])

  const openNew = () => { setFormData({name:'',aliases:'',excluded_countries:[]}); setMsg(''); setEditingId('new') }
  const openEdit = p => { setFormData({name:p.name, aliases:(p.aliases||[]).join('\n'), excluded_countries:p.excluded_countries||[]}); setMsg(''); setEditingId(p.id) }
  const toggleExclude = code => setFormData(prev=>({...prev, excluded_countries: prev.excluded_countries.includes(code)?prev.excluded_countries.filter(c=>c!==code):[...prev.excluded_countries,code]}))

  const handleSave = async () => {
    if (!formData.name.trim()) { setMsg('❌ 제품명을 입력해주세요.'); return }
    setSaving(true)
    const payload = { name:formData.name.trim(), aliases:formData.aliases.split('\n').map(s=>s.trim()).filter(Boolean), excluded_countries:formData.excluded_countries }
    const res = editingId==='new' ? await api.createProduct(payload) : await api.updateProduct(editingId,payload)
    setSaving(false)
    if (res.ok) { setMsg(editingId==='new'?'✅ 생성 완료':'✅ 수정 완료'); await load(); onProductsChanged(); setTimeout(()=>{setMsg('');setEditingId(null)},1200) }
    else setMsg('❌ 실패: '+res.message)
  }
  const handleDelete = async (id,name) => {
    if (!window.confirm(`"${name}"을(를) 삭제하시겠습니까?`)) return
    const res = await api.deleteProduct(id)
    if (res.ok) { await load(); onProductsChanged() }
    else setMsg('❌ 삭제 실패: '+res.message)
  }

  const sitesByRegion = {}
  REGIONS.forEach(r=>{ sitesByRegion[r]=ALL_SITES.filter(s=>s.region===r) })
  const filteredRegions = regionFilter==='ALL' ? REGIONS : [regionFilter]

  return (
    <div className="product-panel-overlay" onClick={onClose}>
      <div className="product-panel" onClick={e=>e.stopPropagation()}>
        <div className="pp-header">
          <div className="pp-title-row">
            {editingId!==null
              ? <button className="pp-back-btn" onClick={()=>setEditingId(null)}>← 목록</button>
              : <span className="pp-title">제품 데이터 관리</span>}
            <button className="pp-close-btn" onClick={onClose}>✕</button>
          </div>
          {editingId===null && <div className="pp-subtitle">{products.length}종 등록됨</div>}
        </div>
        {msg && <div className={`pp-msg ${msg.startsWith('✅')?'pp-ok':'pp-err'}`}>{msg}</div>}

        {editingId===null && (
          <div className="pp-body">
            <button className="btn-primary pp-new-btn" onClick={openNew}>+ 새 제품 추가</button>
            {loading && <div className="loading">불러오는 중...</div>}
            <div className="pp-list">
              {products.map(p=>(
                <div key={p.id} className="pp-item">
                  <div className="pp-item-info">
                    <div className="pp-item-name">{p.name}</div>
                    <div className="pp-item-aliases">{(p.aliases||[]).join(' · ')}</div>
                    <div className="pp-item-excluded">
                      {(p.excluded_countries||[]).length===0
                        ? <span className="pp-all-launch">전 국가 출시</span>
                        : <>{<span className="pp-excl-label">미출시 {p.excluded_countries.length}개국: </span>}{p.excluded_countries.map(c=><span key={c} className="pp-excl-tag">{c}</span>)}</>}
                    </div>
                  </div>
                  <div className="pp-item-actions">
                    <button className="act-btn act-edit" onClick={()=>openEdit(p)}>✏ 수정</button>
                    <button className="act-btn act-delete" onClick={()=>handleDelete(p.id,p.name)}>🗑</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {editingId!==null && (
          <div className="pp-body pp-form-body">
            <div className="pp-form-title">{editingId==='new'?'새 제품 추가':'제품 수정'}</div>
            <div className="form-row" style={{gridTemplateColumns:'100px 1fr'}}>
              <label className="form-label">제품명 *</label>
              <input className="form-input" placeholder="예: Galaxy S27 Ultra" value={formData.name} onChange={e=>setFormData(p=>({...p,name:e.target.value}))} />
            </div>
            <div className="form-row" style={{gridTemplateColumns:'100px 1fr'}}>
              <label className="form-label" style={{paddingTop:4}}>감지 키워드</label>
              <div>
                <textarea className="form-input pp-alias-area" placeholder={"줄바꿈으로 구분\n예:\nGalaxy S27 Ultra\nS27 Ultra"} value={formData.aliases} onChange={e=>setFormData(p=>({...p,aliases:e.target.value}))} />
              </div>
            </div>
            <div className="pp-excl-section">
              <div className="pp-excl-header">
                <span className="pp-excl-title">미출시 국가 지정{formData.excluded_countries.length>0&&<span className="pp-excl-count">{formData.excluded_countries.length}개국 선택됨</span>}</span>
                <div className="pp-excl-hint">선택하지 않은 국가는 모두 <strong>출시</strong>로 처리됩니다.</div>
              </div>
              <div className="pp-region-tabs">
                {['ALL',...REGIONS].map(r=>(
                  <button key={r} className={`cc-region-btn ${regionFilter===r?'active':''}`}
                    style={regionFilter===r&&r!=='ALL'?{background:RC[r],color:'#fff'}:{}} onClick={()=>setRegionFilter(r)}>{r}</button>
                ))}
                {formData.excluded_countries.length>0&&<button className="cc-region-btn pp-clear-btn" onClick={()=>setFormData(p=>({...p,excluded_countries:[]}))}>전체 해제</button>}
              </div>
              <div className="pp-country-grid">
                {filteredRegions.map(region=>(
                  <div key={region} className="pp-region-group">
                    <div className="pp-region-label" style={{color:RC[region]}}>{region}</div>
                    <div className="pp-country-checks">
                      {sitesByRegion[region].map(s=>{
                        const isExcluded=formData.excluded_countries.includes(s.code)
                        return (
                          <label key={s.code} className={`pp-country-check ${isExcluded?'pp-check-on':''}`}
                            style={isExcluded?{borderColor:RC[region],background:RB[region]}:{}}>
                            <input type="checkbox" checked={isExcluded} onChange={()=>toggleExclude(s.code)} style={{display:'none'}} />
                            <span className="pp-check-flag">{s.flag}</span>
                            <span className="pp-check-code">{s.code}</span>
                            {isExcluded&&<span className="pp-check-x">✕</span>}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="pp-form-actions">
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving?'저장 중...':(editingId==='new'?'추가하기':'저장하기')}</button>
              <button className="btn-ghost" onClick={()=>setEditingId(null)} disabled={saving}>취소</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 메인: CountryCheck ────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
export default function CountryCheck() {
  const [subTab, setSubTab]           = useState('quick')  // quick | project
  const [products, setProducts]       = useState([])
  const [loaded, setLoaded]           = useState(false)
  const [loadErr, setLoadErr]         = useState('')
  const [showProductPanel, setShowProductPanel] = useState(false)

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.getProducts()
      if (res.ok) { setProducts(res.data); setLoaded(true) }
      else setLoadErr(res.message)
    } catch { setLoadErr('서버를 먼저 실행해주세요 (npm start)') }
  }, [])

  useEffect(()=>{ loadProducts() },[loadProducts])

  return (
    <div className="country-check">
      {loadErr && <div className="error-banner">{loadErr}</div>}

      {/* 공통 상태 바 */}
      <div className="cc-product-status">
        <span className={`db-badge ${loaded?'badge-green':'badge-yellow'}`}>
          {loaded ? `제품 ${products.length}종 로드됨` : '로딩 중...'}
        </span>
        <div className="cc-subtab-nav">
          <button className={`cc-subtab-btn ${subTab==='quick'?'active':''}`} onClick={()=>setSubTab('quick')}>
            즉석 검수
          </button>
          <button className={`cc-subtab-btn ${subTab==='project'?'active':''}`} onClick={()=>setSubTab('project')}>
            📁 프로젝트 관리
          </button>
        </div>
        <button className="btn-manage-product" onClick={()=>setShowProductPanel(true)}>
          ⚙ 제품 데이터 관리
        </button>
      </div>

      {/* 서브탭 콘텐츠 */}
      {subTab === 'quick'   && <QuickCheck   products={products} />}
      {subTab === 'project' && <ProjectManager products={products} />}

      {/* 제품 관리 패널 */}
      {showProductPanel && (
        <ProductPanel onClose={()=>setShowProductPanel(false)} onProductsChanged={loadProducts} />
      )}
    </div>
  )
}