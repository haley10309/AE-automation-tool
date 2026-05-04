import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { ALL_SITES, REGIONS, REGION_COLORS, REGION_BG } from '../constants.js'

// ── 상태 정의 ─────────────────────────────────────────────────
const COPY_STATUSES = [
  { value: '',               label: '— 미설정 —',       color: '#9ca3af', bg: '#f3f4f6' },
  { value: 'tp_translation', label: 'TP 번역',           color: '#7c3aed', bg: '#ede9fe' },
  { value: 'local_confirmed',label: 'Local Confirmed',   color: '#1d4ed8', bg: '#dbeafe' },
  { value: 'deck_merge',     label: 'Deck Merge',        color: '#b45309', bg: '#fef3c7' },
  { value: 'production',     label: 'Production',        color: '#166534', bg: '#dcfce7' },
]

function getStatusStyle(value) {
  return COPY_STATUSES.find(s => s.value === value) || COPY_STATUSES[0]
}

// ── 로컬스토리지 유틸 ─────────────────────────────────────────
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
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yy}-${mm}-${dd} ${hh}:${mi}`
}

// 기본 국가 세트
const DEFAULT_COUNTRIES = ['KR', 'US', 'JP', 'DE', 'FR', 'UK', 'AU', 'CA', 'CN', 'IN']

// ── 상태 셀 ───────────────────────────────────────────────────
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
  const [uploading, setUploading] = useState(false)

  const handleChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = ev => resolve(ev.target.result)
        reader.onerror = reject
        reader.readAsDataURL(file)
      })
      await onFileUpload(siteCode, {
        name: file.name, size: file.size, type: file.type,
        uploadedAt: new Date().toISOString(),
        status: entry?.status || '',
        dataUrl,
      })
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const download = (f) => {
    if (!f.dataUrl) return
    const a = document.createElement('a')
    a.href = f.dataUrl; a.download = f.name
    document.body.appendChild(a); a.click(); document.body.removeChild(a)
  }

  const formatBytes = (b) => {
    if (!b) return ''
    if (b < 1024) return b + 'B'
    if (b < 1024 * 1024) return (b / 1024).toFixed(1) + 'KB'
    return (b / (1024 * 1024)).toFixed(1) + 'MB'
  }

  return (
    <div className="cst-file-area">
      {entry?.file ? (
        <div className="cst-file-info">
          <div className="cst-file-main">
            <button className="cst-file-name-btn"
              title={entry.file.dataUrl ? `다운로드: ${entry.file.name}` : entry.file.name}
              onClick={() => download(entry.file)} disabled={!entry.file.dataUrl}>
              📎 {entry.file.name}
            </button>
            <div className="cst-file-meta-row">
              {entry.file.status && (
                <span className="cst-file-status-badge" style={{
                  background: getStatusStyle(entry.file.status).bg,
                  color: getStatusStyle(entry.file.status).color,
                  borderColor: getStatusStyle(entry.file.status).color,
                }}>
                  {getStatusStyle(entry.file.status).label}
                </span>
              )}
              <span className="cst-file-date">{formatDateTime(entry.file.uploadedAt)}</span>
              {entry.file.size && <span className="cst-file-size">{formatBytes(entry.file.size)}</span>}
            </div>
          </div>
          <div className="cst-file-actions">
            <button className="cst-file-replace" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? '⏳' : '↑ 교체'}
            </button>
            {entry.fileHistory?.length > 1 && (
              <button className="cst-file-history-btn" onClick={() => setShowHistory(v => !v)}>
                히스토리 ({entry.fileHistory.length})
              </button>
            )}
          </div>
          {showHistory && entry.fileHistory?.length > 0 && (
            <div className="cst-file-history">
              {[...entry.fileHistory].reverse().map((f, i) => (
                <div key={i} className="cst-file-history-item">
                  <div className="cst-history-left">
                    <button className="cst-file-name-btn" style={{ fontSize: 11 }}
                      onClick={() => download(f)} disabled={!f.dataUrl}
                      title={f.dataUrl ? `다운로드: ${f.name}` : '파일 없음'}>
                      📎 {f.name}
                    </button>
                    <div className="cst-file-meta-row">
                      {f.status && (
                        <span className="cst-file-status-badge" style={{
                          background: getStatusStyle(f.status).bg,
                          color: getStatusStyle(f.status).color,
                          borderColor: getStatusStyle(f.status).color,
                        }}>
                          {getStatusStyle(f.status).label}
                        </span>
                      )}
                      <span className="cst-file-date">{formatDateTime(f.uploadedAt)}</span>
                      {f.size && <span className="cst-file-size">{formatBytes(f.size)}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <button className="cst-upload-btn" onClick={() => fileRef.current?.click()} disabled={uploading}>
          {uploading ? '⏳ 업로드 중...' : '+ 파일 첨부'}
        </button>
      )}
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleChange} />
    </div>
  )
}

// ── 페이지 상세 뷰 ────────────────────────────────────────────
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
      if (newStatus !== undefined) existing.status = newStatus
      if (note !== undefined) existing.note = note
    } else {
      updated.countries = [...updated.countries, { code: siteCode, status: newStatus || '', note: note || '', file: null }]
    }
    onUpdate(updated)
  }, [page, onUpdate])

  const handleFileUpload = useCallback(async (siteCode, fileInfo) => {
    try {
      const res = await api.saveFile({
        pageId: String(page.id), siteCode,
        name: fileInfo.name, size: fileInfo.size, type: fileInfo.type,
        uploadedAt: fileInfo.uploadedAt, status: fileInfo.status, dataUrl: fileInfo.dataUrl,
      })
      if (!res.ok) { alert('파일 저장 실패: ' + res.message); return }
    } catch (err) {
      alert('파일 저장 중 오류: ' + err.message); return
    }
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
    onUpdate({ ...page, countries: page.countries.filter(c => c.code !== code) })
  }

  const totalCountries = page.countries.length
  const completedCountries = page.countries.filter(c => c.status === 'production').length
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
          <span className="cst-detail-date">생성: {page.createdAt?.slice(0, 10)}</span>
        </div>

        <div className="cst-status-summary">
          {COPY_STATUSES.filter(s => s.value).map(s =>
            statusCounts[s.value] > 0 ? (
              <span key={s.value} className="cst-summary-badge"
                style={{ background: s.bg, color: s.color, borderColor: s.color }}>
                {s.label}: {statusCounts[s.value]}
              </span>
            ) : null
          )}
          <span className="cst-summary-badge" style={{ background: '#f3f4f6', color: '#6b7280' }}>
            미설정: {page.countries.filter(c => !c.status).length}
          </span>
        </div>

        <div className="cst-progress-wrap">
          <div className="cst-progress-label">
            <span>Production 완료</span>
            <span>{completedCountries} / {totalCountries} 국가</span>
          </div>
          <div className="cst-progress-bar">
            <div className="cst-progress-fill"
              style={{ width: totalCountries > 0 ? `${(completedCountries / totalCountries) * 100}%` : '0%' }} />
          </div>
        </div>
      </div>

      <div className="cst-filter-row">
        <div className="cst-region-tabs">
          {['ALL', ...REGIONS].map(r => (
            <button key={r} className={`cc-region-btn ${regionFilter === r ? 'active' : ''}`}
              style={regionFilter === r && r !== 'ALL' ? { background: REGION_COLORS[r], color: '#fff' } : {}}
              onClick={() => setRegionFilter(r)}>{r}</button>
          ))}
        </div>

        <div className="cst-add-country-wrap" ref={dropRef}>
          <button className="btn-sm" onClick={() => setShowAddCountry(v => !v)}>+ 국가 추가</button>
          {showAddCountry && (
            <div className="cst-country-dropdown">
              <input autoFocus className="form-input" style={{ width: '100%', fontSize: 12, marginBottom: 6 }}
                placeholder="국가명 또는 코드 검색" value={search}
                onChange={e => setSearch(e.target.value)} />
              <div className="cc-dropdown-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {available.length === 0 && <div className="cc-no-result">추가 가능한 국가 없음</div>}
                {available.map(s => (
                  <div key={s.code} className="cc-dropdown-item" onClick={() => addCountry(s)}>
                    <span className="cc-flag">{s.flag}</span>
                    <span className="cc-dropdown-name">{s.name}</span>
                    <span className="cc-card-code"
                      style={{ background: REGION_BG[s.region], color: REGION_COLORS[s.region] }}>{s.code}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <table className="result-table cst-table">
          <thead>
            <tr>
              <th className="cst-th" style={{ width: 160 }}>국가</th>
              <th className="cst-th" style={{ width: 180 }}>카피 작업 상태</th>
              <th className="cst-th">첨부 파일</th>
              <th className="cst-th" style={{ width: 200 }}>메모</th>
              <th className="cst-th" style={{ width: 50 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#9ca3af' }}>해당 지역에 국가가 없습니다.</td></tr>
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
                          style={{ background: REGION_BG[site.region], color: REGION_COLORS[site.region] }}>
                          {site.code}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="cst-td">
                    <CountryStatusCell siteCode={site.code} entry={entry} onStatusChange={handleStatusChange} />
                  </td>
                  <td className="cst-td">
                    <FileCell siteCode={site.code} entry={entry} onFileUpload={handleFileUpload} />
                  </td>
                  <td className="cst-td">
                    <input className="cst-note-input" placeholder="메모"
                      value={entry?.note || ''}
                      onChange={e => handleStatusChange(site.code, entry?.status, e.target.value)} />
                  </td>
                  <td className="cst-td" style={{ textAlign: 'center' }}>
                    <button className="act-btn act-delete" style={{ padding: '2px 6px', fontSize: 12 }}
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

// ════════════════════════════════════════════════════════════════
// ── StatusTab (메인 export) ───────────────────────────────────
// ════════════════════════════════════════════════════════════════
export default function StatusTab() {
  const [data, setData] = useState(() => loadFromStorage())
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [showNewPage, setShowNewPage] = useState(false)
  const [newPageName, setNewPageName] = useState('')
  const [newPageMsg, setNewPageMsg] = useState('')
  const [searchPages, setSearchPages] = useState('')

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
        .map(s => ({ code: s.code, status: '', note: '', file: null, fileHistory: [] })),
    }
    setData(prev => ({ ...prev, pages: [...prev.pages, newPage] }))
    setNewPageName(''); setNewPageMsg(''); setShowNewPage(false)
    setSelectedPageId(newPage.id)
  }

  const updatePage = useCallback((updated) => {
    setData(prev => ({ ...prev, pages: prev.pages.map(p => p.id === updated.id ? updated : p) }))
  }, [])

  const deletePage = (id, name) => {
    if (!window.confirm(`"${name}" 페이지를 삭제하시겠습니까?\n모든 국가별 상태 데이터가 삭제됩니다.`)) return
    setData(prev => ({ ...prev, pages: prev.pages.filter(p => p.id !== id) }))
    if (selectedPageId === id) setSelectedPageId(null)
  }

  const filteredPages = pages.filter(p =>
    !searchPages || p.name.toLowerCase().includes(searchPages.toLowerCase())
  )

  if (selectedPage) {
    return <PageDetail page={selectedPage} onBack={() => setSelectedPageId(null)} onUpdate={updatePage} />
  }

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

      {showNewPage && (
        <div className="cst-new-page-form">
          <div className="form-row" style={{ gridTemplateColumns: '1fr auto auto' }}>
            <input className="form-input" placeholder="페이지 이름 (예: Home, PDP, Promo Landing)"
              value={newPageName}
              onChange={e => setNewPageName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createPage()} />
            <button className="btn-primary" onClick={createPage}>추가</button>
            <button className="btn-ghost" onClick={() => { setShowNewPage(false); setNewPageName(''); setNewPageMsg('') }}>취소</button>
          </div>
          {newPageMsg && <div className="error-banner" style={{ marginTop: 8 }}>{newPageMsg}</div>}
          <div style={{ marginTop: 6, fontSize: 12, color: '#6b7280' }}>
            💡 기본으로 자주 쓰는 국가({DEFAULT_COUNTRIES.join(', ')})가 추가됩니다. 이후 국가 추가/제거 가능.
          </div>
        </div>
      )}

      {pages.length > 5 && (
        <div style={{ marginBottom: 12 }}>
          <input className="form-input" style={{ maxWidth: 300 }}
            placeholder="페이지 검색..."
            value={searchPages} onChange={e => setSearchPages(e.target.value)} />
        </div>
      )}

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
                <button className="act-btn act-delete" style={{ padding: '2px 6px' }}
                  onClick={e => { e.stopPropagation(); deletePage(page.id, page.name) }}>🗑</button>
              </div>
              <div className="cst-page-card-meta">{page.createdAt?.slice(0, 10)} · {total}개국</div>
              <div className="cst-page-card-badges">
                {COPY_STATUSES.filter(s => s.value && byStatus[s.value] > 0).map(s => (
                  <span key={s.value} className="cst-mini-badge" style={{ background: s.bg, color: s.color }}>
                    {s.label} {byStatus[s.value]}
                  </span>
                ))}
              </div>
              <div className="cst-mini-progress">
                <div className="cst-mini-progress-bar">
                  <div className="cst-progress-fill" style={{ width: `${pct}%` }} />
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