import { useState, useCallback, useEffect, useRef } from 'react'

// ── 상태 정의 ──────────────────────────────────────────────────
const COPY_STATUSES = [
  { value: '', label: '— 미설정 —', color: '#9ca3af', bg: '#f3f4f6' },
  { value: 'tp_translation', label: 'TP 번역', color: '#7c3aed', bg: '#ede9fe' },
  { value: 'local_confirmed', label: 'Local Confirmed', color: '#1d4ed8', bg: '#dbeafe' },
  { value: 'deck_merge',      label: 'Deck Merge',      color: '#b45309', bg: '#fef3c7' },
  { value: 'production',      label: 'Production',      color: '#166534', bg: '#dcfce7' },
]

function getStatusStyle(value) {
  const s = COPY_STATUSES.find(s => s.value === value)
  return s || COPY_STATUSES[0]
}

// ── 국가 목록 (CountryCheck에서 동일하게 사용) ─────────────────
const ALL_SITES = [
  { code:'CA_FR', region:'NALA', name:'캐나다 (FR)', flag:'🇨🇦' },
  { code:'CA',    region:'NALA', name:'캐나다',      flag:'🇨🇦' },
  { code:'MX',    region:'NALA', name:'멕시코',      flag:'🇲🇽' },
  { code:'BR',    region:'NALA', name:'브라질',      flag:'🇧🇷' },
  { code:'LATIN', region:'NALA', name:'라틴아메리카', flag:'🌎' },
  { code:'LATIN_EN', region:'NALA', name:'라틴아메리카 (EN)', flag:'🌎' },
  { code:'CO',    region:'NALA', name:'콜롬비아',    flag:'🇨🇴' },
  { code:'AR',    region:'NALA', name:'아르헨티나',  flag:'🇦🇷' },
  { code:'PY',    region:'NALA', name:'파라과이',    flag:'🇵🇾' },
  { code:'UY',    region:'NALA', name:'우루과이',    flag:'🇺🇾' },
  { code:'CL',    region:'NALA', name:'칠레',        flag:'🇨🇱' },
  { code:'PE',    region:'NALA', name:'페루',        flag:'🇵🇪' },
  { code:'SG',    region:'APAC', name:'싱가포르',    flag:'🇸🇬' },
  { code:'AU',    region:'APAC', name:'호주',        flag:'🇦🇺' },
  { code:'NZ',    region:'APAC', name:'뉴질랜드',    flag:'🇳🇿' },
  { code:'ID',    region:'APAC', name:'인도네시아',  flag:'🇮🇩' },
  { code:'TH',    region:'APAC', name:'태국',        flag:'🇹🇭' },
  { code:'VN',    region:'APAC', name:'베트남',      flag:'🇻🇳' },
  { code:'MY',    region:'APAC', name:'말레이시아',  flag:'🇲🇾' },
  { code:'PH',    region:'APAC', name:'필리핀',      flag:'🇵🇭' },
  { code:'MM',    region:'APAC', name:'미얀마',      flag:'🇲🇲' },
  { code:'JP',    region:'APAC', name:'일본',        flag:'🇯🇵' },
  { code:'UK',    region:'EU',   name:'영국',        flag:'🇬🇧' },
  { code:'IE',    region:'EU',   name:'아일랜드',    flag:'🇮🇪' },
  { code:'DE',    region:'EU',   name:'독일',        flag:'🇩🇪' },
  { code:'AT',    region:'EU',   name:'오스트리아',  flag:'🇦🇹' },
  { code:'CH',    region:'EU',   name:'스위스',      flag:'🇨🇭' },
  { code:'CH_FR', region:'EU',   name:'스위스 (FR)', flag:'🇨🇭' },
  { code:'FR',    region:'EU',   name:'프랑스',      flag:'🇫🇷' },
  { code:'IT',    region:'EU',   name:'이탈리아',    flag:'🇮🇹' },
  { code:'GR',    region:'EU',   name:'그리스',      flag:'🇬🇷' },
  { code:'ES',    region:'EU',   name:'스페인',      flag:'🇪🇸' },
  { code:'PT',    region:'EU',   name:'포르투갈',    flag:'🇵🇹' },
  { code:'BE',    region:'EU',   name:'벨기에',      flag:'🇧🇪' },
  { code:'BE_FR', region:'EU',   name:'벨기에 (FR)', flag:'🇧🇪' },
  { code:'NL',    region:'EU',   name:'네덜란드',    flag:'🇳🇱' },
  { code:'SE',    region:'EU',   name:'스웨덴',      flag:'🇸🇪' },
  { code:'DK',    region:'EU',   name:'덴마크',      flag:'🇩🇰' },
  { code:'FI',    region:'EU',   name:'핀란드',      flag:'🇫🇮' },
  { code:'NO',    region:'EU',   name:'노르웨이',    flag:'🇳🇴' },
  { code:'PL',    region:'EU',   name:'폴란드',      flag:'🇵🇱' },
  { code:'RO',    region:'EU',   name:'루마니아',    flag:'🇷🇴' },
  { code:'BG',    region:'EU',   name:'불가리아',    flag:'🇧🇬' },
  { code:'HU',    region:'EU',   name:'헝가리',      flag:'🇭🇺' },
  { code:'CZ',    region:'EU',   name:'체코',        flag:'🇨🇿' },
  { code:'SK',    region:'EU',   name:'슬로바키아',  flag:'🇸🇰' },
  { code:'EE',    region:'EU',   name:'에스토니아',  flag:'🇪🇪' },
  { code:'LV',    region:'EU',   name:'라트비아',    flag:'🇱🇻' },
  { code:'LT',    region:'EU',   name:'리투아니아',  flag:'🇱🇹' },
  { code:'HR',    region:'EU',   name:'크로아티아',  flag:'🇭🇷' },
  { code:'RS',    region:'EU',   name:'세르비아',    flag:'🇷🇸' },
  { code:'SI',    region:'EU',   name:'슬로베니아',  flag:'🇸🇮' },
  { code:'AL',    region:'EU',   name:'알바니아',    flag:'🇦🇱' },
  { code:'MK',    region:'EU',   name:'북마케도니아', flag:'🇲🇰' },
  { code:'BA',    region:'EU',   name:'보스니아',    flag:'🇧🇦' },
  { code:'UA',    region:'EU',   name:'우크라이나',  flag:'🇺🇦' },
  { code:'IN',    region:'SWA',  name:'인도',        flag:'🇮🇳' },
  { code:'BD',    region:'SWA',  name:'방글라데시',  flag:'🇧🇩' },
  { code:'AE',    region:'MENA', name:'UAE',         flag:'🇦🇪' },
  { code:'AE_AR', region:'MENA', name:'UAE (AR)',    flag:'🇦🇪' },
  { code:'IL',    region:'MENA', name:'이스라엘',    flag:'🇮🇱' },
  { code:'PS',    region:'MENA', name:'팔레스타인',  flag:'🇵🇸' },
  { code:'SA',    region:'MENA', name:'사우디아라비아', flag:'🇸🇦' },
  { code:'SA_EN', region:'MENA', name:'사우디 (EN)', flag:'🇸🇦' },
  { code:'TR',    region:'MENA', name:'터키',        flag:'🇹🇷' },
  { code:'IRAN',  region:'MENA', name:'이란',        flag:'🇮🇷' },
  { code:'LEVANT',    region:'MENA', name:'레반트',       flag:'🌍' },
  { code:'LEVANT_AR', region:'MENA', name:'레반트 (AR)', flag:'🌍' },
  { code:'PK',       region:'MENA', name:'파키스탄',    flag:'🇵🇰' },
  { code:'EG',       region:'MENA', name:'이집트',      flag:'🇪🇬' },
  { code:'N_AFRICA',  region:'MENA', name:'북아프리카',  flag:'🌍' },
  { code:'AFRICA_EN', region:'MENA', name:'아프리카 (EN)', flag:'🌍' },
  { code:'AFRICA_FR', region:'MENA', name:'아프리카 (FR)', flag:'🌍' },
  { code:'AFRICA_PT', region:'MENA', name:'아프리카 (PT)', flag:'🌍' },
  { code:'ZA',       region:'MENA', name:'남아프리카',  flag:'🇿🇦' },
  { code:'IQ_AR',    region:'MENA', name:'이라크 (AR)', flag:'🇮🇶' },
  { code:'IQ_KU',    region:'MENA', name:'이라크 (KU)', flag:'🇮🇶' },
  { code:'LB',       region:'MENA', name:'레바논',      flag:'🇱🇧' },
]

const REGIONS = ['NALA','APAC','EU','SWA','MENA']
const REGION_COLORS = { NALA:'#3b82f6', APAC:'#22c55e', EU:'#8b5cf6', SWA:'#f59e0b', MENA:'#ef4444' }
const REGION_BG     = { NALA:'#eff6ff', APAC:'#f0fdf4', EU:'#f5f3ff', SWA:'#fffbeb', MENA:'#fef2f2' }

// ── 로컬스토리지 유틸 ──────────────────────────────────────────
const STORAGE_KEY = 'ae_copy_status_tracker_v1'

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : { pages: [] }
  } catch { return { pages: [] } }
}

function saveToStorage(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
}

function formatDateTime(isoStr) {
  if (!isoStr) return ''
  const d = new Date(isoStr)
  const yy = d.getFullYear()
  const mm = String(d.getMonth()+1).padStart(2,'0')
  const dd = String(d.getDate()).padStart(2,'0')
  const hh = String(d.getHours()).padStart(2,'0')
  const mi = String(d.getMinutes()).padStart(2,'0')
  return `${yy}-${mm}-${dd} ${hh}:${mi}`
}

function today() { return new Date().toISOString().slice(0,10) }

// ── 기본 국가 세트 (일반적으로 많이 쓰는 국가들) ────────────────
const DEFAULT_COUNTRIES = ['KR','US','JP','DE','FR','UK','AU','CA','CN','IN']

// ── 단일 국가 행 컴포넌트 ──────────────────────────────────────
function CountryRow({ site, entry, onStatusChange, onFileUpload }) {
  const fileRef = useRef(null)
  const statusStyle = getStatusStyle(entry?.status || '')

  const handleFileChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    onFileUpload(site.code, {
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    })
    e.target.value = ''
  }

  return (
    <tr className="cst-row">
      <td className="cst-td cst-td-country">
        <div className="cst-country-cell">
          <span className="cst-flag">{site.flag}</span>
          <div className="cst-country-info">
            <span className="cst-country-name">{site.name}</span>
            <span className="cst-country-code"
              style={{ background: REGION_BG[site.region], color: REGION_COLORS[site.region] }}>
              {site.code}
            </span>
          </div>
        </div>
      </td>
      <td className="cst-td cst-td-status">
        <select
          className="cst-status-select"
          value={entry?.status || ''}
          onChange={e => onStatusChange(site.code, e.target.value)}
          style={{ borderColor: statusStyle.color, color: statusStyle.color, background: statusStyle.bg }}
        >
          {COPY_STATUSES.map(s => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </td>
      <td className="cst-td cst-td-file">
        <div className="cst-file-area">
          {entry?.file ? (
            <div className="cst-file-info">
              <span className="cst-file-name" title={entry.file.name}>📎 {entry.file.name}</span>
              <span className="cst-file-date">{formatDateTime(entry.file.uploadedAt)}</span>
              <button className="cst-file-replace" onClick={() => fileRef.current?.click()} title="파일 교체">↑</button>
            </div>
          ) : (
            <button className="cst-upload-btn" onClick={() => fileRef.current?.click()}>
              + 파일 첨부
            </button>
          )}
          <input ref={fileRef} type="file" style={{ display:'none' }} onChange={handleFileChange} />
        </div>
      </td>
      <td className="cst-td cst-td-note">
        <input
          className="cst-note-input"
          placeholder="메모"
          value={entry?.note || ''}
          onChange={e => onStatusChange(site.code, entry?.status || '', e.target.value)}
        />
      </td>
    </tr>
  )
}

// ── 페이지 상세 뷰 ─────────────────────────────────────────────
function PageDetail({ page, onBack, onUpdate }) {
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [showAddCountry, setShowAddCountry] = useState(false)
  const [search, setSearch] = useState('')
  const dropRef = useRef(null)

  useEffect(() => {
    const h = e => { if (dropRef.current && !dropRef.current.contains(e.target)) setShowAddCountry(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const activeSiteCodes = page.countries.map(c => c.code)
  const activeSites = ALL_SITES.filter(s => activeSiteCodes.includes(s.code))
  const filtered = activeSites.filter(s => regionFilter === 'ALL' || s.region === regionFilter)

  const available = ALL_SITES
    .filter(s => !activeSiteCodes.includes(s.code))
    .filter(s => !search || s.name.includes(search) || s.code.toLowerCase().includes(search.toLowerCase()))
    .filter(s => regionFilter === 'ALL' || s.region === regionFilter)

  const handleStatusChange = useCallback((siteCode, newStatus, note) => {
    const updated = { ...page }
    const existing = updated.countries.find(c => c.code === siteCode)
    if (existing) {
      existing.status = newStatus !== undefined ? newStatus : existing.status
      if (note !== undefined) existing.note = note
    } else {
      updated.countries = [...updated.countries, { code: siteCode, status: newStatus || '', note: note || '', file: null }]
    }
    onUpdate(updated)
  }, [page, onUpdate])

  const handleFileUpload = useCallback((siteCode, fileInfo) => {
    const updated = { ...page }
    const existing = updated.countries.find(c => c.code === siteCode)
    if (existing) {
      existing.file = fileInfo
      existing.fileHistory = [...(existing.fileHistory || []), fileInfo]
    }
    onUpdate(updated)
  }, [page, onUpdate])

  const addCountry = (site) => {
    const updated = { ...page }
    if (!updated.countries.find(c => c.code === site.code)) {
      updated.countries = [...updated.countries, { code: site.code, status: '', note: '', file: null, fileHistory: [] }]
    }
    onUpdate(updated)
    setSearch('')
  }

  const removeCountry = (code) => {
    if (!window.confirm(`${code} 국가를 이 페이지에서 제거하시겠습니까?`)) return
    const updated = { ...page, countries: page.countries.filter(c => c.code !== code) }
    onUpdate(updated)
  }

  // 진행률 계산
  const totalCountries = page.countries.length
  const completedCountries = page.countries.filter(c => c.status === 'production').length
  const inProgressCountries = page.countries.filter(c => c.status && c.status !== '').length

  // 상태별 카운트
  const statusCounts = {}
  COPY_STATUSES.forEach(s => {
    if (s.value) statusCounts[s.value] = page.countries.filter(c => c.status === s.value).length
  })

  return (
    <div className="cst-page-detail">
      <div className="cst-detail-header">
        <button className="cst-back-btn" onClick={onBack}>← 페이지 목록</button>
        <div className="cst-detail-title-row">
          <h2 className="cst-detail-title">{page.name}</h2>
          <span className="cst-detail-date">생성: {page.createdAt?.slice(0,10)}</span>
        </div>

        {/* 요약 뱃지 */}
        <div className="cst-status-summary">
          {COPY_STATUSES.filter(s => s.value).map(s => (
            statusCounts[s.value] > 0 ? (
              <span key={s.value} className="cst-summary-badge"
                style={{ background: s.bg, color: s.color, borderColor: s.color }}>
                {s.label}: {statusCounts[s.value]}
              </span>
            ) : null
          ))}
          <span className="cst-summary-badge" style={{ background:'#f3f4f6', color:'#6b7280' }}>
            미설정: {page.countries.filter(c => !c.status).length}
          </span>
        </div>

        {/* 진행률 바 */}
        <div className="cst-progress-wrap">
          <div className="cst-progress-label">
            <span>Production 완료</span>
            <span>{completedCountries} / {totalCountries} 국가</span>
          </div>
          <div className="cst-progress-bar">
            <div className="cst-progress-fill"
              style={{ width: totalCountries > 0 ? `${(completedCountries/totalCountries)*100}%` : '0%' }} />
          </div>
        </div>
      </div>

      {/* 필터 + 국가 추가 */}
      <div className="cst-filter-row">
        <div className="cst-region-tabs">
          {['ALL',...REGIONS].map(r => (
            <button key={r} className={`cc-region-btn ${regionFilter===r?'active':''}`}
              style={regionFilter===r&&r!=='ALL'?{background:REGION_COLORS[r],color:'#fff'}:{}}
              onClick={() => setRegionFilter(r)}>{r}</button>
          ))}
        </div>

        <div className="cst-add-country-wrap" ref={dropRef}>
          <button className="btn-sm" onClick={() => setShowAddCountry(v => !v)}>+ 국가 추가</button>
          {showAddCountry && (
            <div className="cst-country-dropdown">
              <input autoFocus className="form-input" style={{width:'100%', fontSize:12, marginBottom:6}}
                placeholder="국가명 또는 코드 검색" value={search}
                onChange={e => setSearch(e.target.value)} />
              <div className="cc-dropdown-list" style={{maxHeight:200, overflowY:'auto'}}>
                {available.length === 0 && <div className="cc-no-result">추가 가능한 국가 없음</div>}
                {available.map(s => (
                  <div key={s.code} className="cc-dropdown-item" onClick={() => addCountry(s)}>
                    <span className="cc-flag">{s.flag}</span>
                    <span className="cc-dropdown-name">{s.name}</span>
                    <span className="cc-card-code"
                      style={{background:REGION_BG[s.region],color:REGION_COLORS[s.region]}}>{s.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 테이블 */}
      <div className="table-wrap">
        <table className="result-table cst-table">
          <thead>
            <tr>
              <th className="cst-th" style={{width:160}}>국가</th>
              <th className="cst-th" style={{width:180}}>카피 작업 상태</th>
              <th className="cst-th">첨부 파일</th>
              <th className="cst-th" style={{width:200}}>메모</th>
              <th className="cst-th" style={{width:50}}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{textAlign:'center',padding:24,color:'#9ca3af'}}>해당 지역에 국가가 없습니다.</td></tr>
            )}
            {filtered.map(site => {
              const entry = page.countries.find(c => c.code === site.code)
              return (
                <tr key={site.code} className="cst-row">
                  <td className="cst-td">
                    <div className="cst-country-cell">
                      <span className="cst-flag">{site.flag}</span>
                      <div className="cst-country-info">
                        <span className="cst-country-name">{site.name}</span>
                        <span className="cst-country-code"
                          style={{background:REGION_BG[site.region],color:REGION_COLORS[site.region]}}>
                          {site.code}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="cst-td">
                    <CountryStatusCell
                      siteCode={site.code}
                      entry={entry}
                      onStatusChange={handleStatusChange}
                    />
                  </td>
                  <td className="cst-td">
                    <FileCell
                      siteCode={site.code}
                      entry={entry}
                      onFileUpload={handleFileUpload}
                    />
                  </td>
                  <td className="cst-td">
                    <input className="cst-note-input" placeholder="메모"
                      value={entry?.note || ''}
                      onChange={e => handleStatusChange(site.code, entry?.status, e.target.value)} />
                  </td>
                  <td className="cst-td" style={{textAlign:'center'}}>
                    <button className="act-btn act-delete" style={{padding:'2px 6px', fontSize:12}}
                      onClick={() => removeCountry(site.code)} title="국가 제거">✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ── 상태 셀 (메모이제이션 없이 간단하게) ──────────────────────
function CountryStatusCell({ siteCode, entry, onStatusChange }) {
  const statusStyle = getStatusStyle(entry?.status || '')
  return (
    <select className="cst-status-select"
      value={entry?.status || ''}
      onChange={e => onStatusChange(siteCode, e.target.value, entry?.note)}
      style={{ borderColor: statusStyle.color, color: statusStyle.color, background: statusStyle.bg }}>
      {COPY_STATUSES.map(s => (
        <option key={s.value} value={s.value}>{s.label}</option>
      ))}
    </select>
  )
}

// ── 파일 셀 ───────────────────────────────────────────────────
function FileCell({ siteCode, entry, onFileUpload }) {
  const fileRef = useRef(null)
  const [showHistory, setShowHistory] = useState(false)

  const handleChange = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    onFileUpload(siteCode, {
      name: file.name,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    })
    e.target.value = ''
  }

  return (
    <div className="cst-file-area">
      {entry?.file ? (
        <div className="cst-file-info">
          <div className="cst-file-main">
            <span className="cst-file-name" title={entry.file.name}>📎 {entry.file.name}</span>
            <span className="cst-file-date">{formatDateTime(entry.file.uploadedAt)}</span>
          </div>
          <div className="cst-file-actions">
            <button className="cst-file-replace" onClick={() => fileRef.current?.click()} title="파일 교체">↑ 교체</button>
            {(entry.fileHistory?.length > 1) && (
              <button className="cst-file-history-btn" onClick={() => setShowHistory(v=>!v)}>
                히스토리 ({entry.fileHistory.length})
              </button>
            )}
          </div>
          {showHistory && entry.fileHistory?.length > 0 && (
            <div className="cst-file-history">
              {[...entry.fileHistory].reverse().map((f, i) => (
                <div key={i} className="cst-file-history-item">
                  <span>📎 {f.name}</span>
                  <span className="cst-file-date">{formatDateTime(f.uploadedAt)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button className="cst-upload-btn" onClick={() => fileRef.current?.click()}>
          + 파일 첨부
        </button>
      )}
      <input ref={fileRef} type="file" style={{display:'none'}} onChange={handleChange} />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 메인 컴포넌트 ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
export default function CopyStatusTracker() {
  const [data, setData] = useState(() => loadFromStorage())
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [showNewPage, setShowNewPage] = useState(false)
  const [newPageName, setNewPageName] = useState('')
  const [newPageMsg, setNewPageMsg] = useState('')
  const [searchPages, setSearchPages] = useState('')

  // 데이터 변경시 자동 저장
  useEffect(() => { saveToStorage(data) }, [data])

  const pages = data.pages || []
  const selectedPage = pages.find(p => p.id === selectedPageId)

  const createPage = () => {
    if (!newPageName.trim()) { setNewPageMsg('❌ 페이지 이름을 입력해주세요.'); return }
    if (pages.find(p => p.name === newPageName.trim())) { setNewPageMsg('❌ 같은 이름의 페이지가 이미 있습니다.'); return }

    const newPage = {
      id: Date.now(),
      name: newPageName.trim(),
      createdAt: new Date().toISOString(),
      countries: ALL_SITES
        .filter(s => DEFAULT_COUNTRIES.includes(s.code))
        .map(s => ({ code: s.code, status: '', note: '', file: null, fileHistory: [] }))
    }
    setData(prev => ({ ...prev, pages: [...prev.pages, newPage] }))
    setNewPageName('')
    setNewPageMsg('')
    setShowNewPage(false)
    setSelectedPageId(newPage.id)
  }

  const updatePage = useCallback((updated) => {
    setData(prev => ({
      ...prev,
      pages: prev.pages.map(p => p.id === updated.id ? updated : p)
    }))
  }, [])

  const deletePage = (id, name) => {
    if (!window.confirm(`"${name}" 페이지를 삭제하시겠습니까?\n모든 국가별 상태 데이터가 삭제됩니다.`)) return
    setData(prev => ({ ...prev, pages: prev.pages.filter(p => p.id !== id) }))
    if (selectedPageId === id) setSelectedPageId(null)
  }

  const filteredPages = pages.filter(p =>
    !searchPages || p.name.toLowerCase().includes(searchPages.toLowerCase())
  )

  // 상세 뷰
  if (selectedPage) {
    return (
      <PageDetail
        page={selectedPage}
        onBack={() => setSelectedPageId(null)}
        onUpdate={updatePage}
      />
    )
  }

  // 목록 뷰
  return (
    <div className="cst-container">
      <div className="cst-list-header">
        <div>
          <h2 className="cst-list-title">페이지별 국가 카피 작업 현황</h2>
          <p className="cst-list-subtitle">
            페이지마다 국가별 카피 작업 상태(TP 번역 / Local Confirmed / Deck Merge / Production)와
            파일 업로드 이력을 관리합니다.
          </p>
        </div>
        <button className="btn-primary" onClick={() => { setShowNewPage(true); setNewPageMsg('') }}>
          + 새 페이지 추가
        </button>
      </div>

      {/* 새 페이지 추가 폼 */}
      {showNewPage && (
        <div className="cst-new-page-form">
          <div className="form-row" style={{gridTemplateColumns:'1fr auto auto'}}>
            <input className="form-input" placeholder="페이지 이름 (예: Home, PDP, Promo Landing)"
              value={newPageName}
              onChange={e => setNewPageName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPage()} />
            <button className="btn-primary" onClick={createPage}>추가</button>
            <button className="btn-ghost" onClick={() => { setShowNewPage(false); setNewPageName(''); setNewPageMsg('') }}>취소</button>
          </div>
          {newPageMsg && <div className="error-banner" style={{marginTop:8}}>{newPageMsg}</div>}
          <div style={{marginTop:6, fontSize:12, color:'#6b7280'}}>
            💡 기본으로 자주 쓰는 국가({DEFAULT_COUNTRIES.join(', ')})가 추가됩니다. 이후 국가 추가/제거 가능.
          </div>
        </div>
      )}

      {/* 검색 */}
      {pages.length > 5 && (
        <div style={{marginBottom:12}}>
          <input className="form-input" style={{maxWidth:300}}
            placeholder="페이지 검색..."
            value={searchPages} onChange={e => setSearchPages(e.target.value)} />
        </div>
      )}

      {/* 페이지 목록 */}
      {filteredPages.length === 0 && (
        <div className="empty-state">
          <div className="empty-icon">📄</div>
          <p>{pages.length === 0 ? '아직 추가된 페이지가 없습니다.' : '검색 결과가 없습니다.'}</p>
          {pages.length === 0 && <small>"+ 새 페이지 추가" 버튼으로 첫 번째 페이지를 만들어보세요.</small>}
        </div>
      )}

      <div className="cst-page-grid">
        {filteredPages.map(page => {
          const total = page.countries.length
          const byStatus = {}
          COPY_STATUSES.forEach(s => {
            if (s.value) byStatus[s.value] = page.countries.filter(c => c.status === s.value).length
          })
          const production = byStatus['production'] || 0
          const pct = total > 0 ? Math.round((production / total) * 100) : 0

          return (
            <div key={page.id} className="cst-page-card" onClick={() => setSelectedPageId(page.id)}>
              <div className="cst-page-card-header">
                <h3 className="cst-page-card-name">{page.name}</h3>
                <button className="act-btn act-delete" style={{padding:'2px 6px'}}
                  onClick={e => { e.stopPropagation(); deletePage(page.id, page.name) }}>🗑</button>
              </div>
              <div className="cst-page-card-meta">{page.createdAt?.slice(0,10)} · {total}개국</div>

              {/* 미니 상태 뱃지 */}
              <div className="cst-page-card-badges">
                {COPY_STATUSES.filter(s => s.value && byStatus[s.value] > 0).map(s => (
                  <span key={s.value} className="cst-mini-badge"
                    style={{background: s.bg, color: s.color}}>
                    {s.label} {byStatus[s.value]}
                  </span>
                ))}
              </div>

              {/* 미니 진행률 */}
              <div className="cst-mini-progress">
                <div className="cst-mini-progress-bar">
                  <div className="cst-progress-fill" style={{width:`${pct}%`}} />
                </div>
                <span className="cst-mini-pct">{pct}%</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}