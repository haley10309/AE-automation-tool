import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { ALL_SITES, REGIONS, REGION_COLORS, REGION_BG } from '../constants.js'

// ── 확장된 상태 정의 ─────────────────────────────────────────
const COPY_STATUSES = [
  { value: '', label: '— 미설정 —', color: '#9ca3af', bg: '#f3f4f6' },
  { value: 'inquiry_needed', label: '문의 필요', color: '#ef4444', bg: '#fef2f2' },
  { value: 'tp_req', label: 'tp 번역 요청', color: '#8b5cf6', bg: '#f5f3ff' },
  { value: 'tp_done', label: 'tp 번역 완료', color: '#7c3aed', bg: '#ede9fe' },
  { value: 'local_survey', label: 'local survey 시작', color: '#3b82f6', bg: '#eff6ff' },
  { value: 'cmu_req_needed', label: 'cmu 컨펌 요청필요', color: '#0ea5e9', bg: '#f0f9ff' },
  { value: 'cmu_req_done', label: 'cmu 컨펌 요청 완료', color: '#0284c7', bg: '#e0f2fe' },
  { value: 'cmu_reply_done', label: 'cmu 답변 완료', color: '#0369a1', bg: '#d0eaff' },
  { value: 'local_confirmed', label: 'local confirmed', color: '#2563eb', bg: '#dbeafe' },
  { value: 'deck_merge', label: 'deck merge', color: '#f59e0b', bg: '#fffbeb' },
  { value: 'prod_req_needed', label: 'production 요청 필요', color: '#10b981', bg: '#ecfdf5' },
  { value: 'prod_ing', label: 'production 중', color: '#059669', bg: '#d1fae5' },
  { value: 'prod_done', label: 'production 완료', color: '#166534', bg: '#dcfce7' },
  { value: 'qa_needed', label: 'QA 필요', color: '#0891b2', bg: '#ecfeff' },
  { value: 'qa_ing', label: 'QA 중', color: '#0e7490', bg: '#cffafe' },
  { value: 'qa_done', label: 'QA 완료', color: '#155e75', bg: '#e0f7fa' },
]

function getStatusStyle(value) {
  return COPY_STATUSES.find(s => s.value === value) || COPY_STATUSES[0]
}

// ── 로컬스토리지 및 유틸 ──────────────────────────────────────
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

// ── 파일 셀 (히스토리에 상태 기록 포함) ──────────────────────────
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
      
      // 파일 업로드 시점의 '현재 국가 상태'를 함께 저장
      await onFileUpload(siteCode, {
        name: file.name, size: file.size, type: file.type,
        uploadedAt: new Date().toISOString(),
        statusAtUpload: entry?.status || '', // 업로드 당시 상태 기록
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
              {/* 업로드 당시의 상태 배지 표시 */}
              {entry.file.statusAtUpload && (
                <span className="cst-file-status-badge" style={{
                  background: getStatusStyle(entry.file.statusAtUpload).bg,
                  color: getStatusStyle(entry.file.statusAtUpload).color,
                  borderColor: getStatusStyle(entry.file.statusAtUpload).color,
                }}>
                  {getStatusStyle(entry.file.statusAtUpload).label}
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
                      onClick={() => download(f)} disabled={!f.dataUrl}>
                      📎 {f.name}
                    </button>
                    <div className="cst-file-meta-row">
                      {f.statusAtUpload && (
                        <span className="cst-file-status-badge" style={{
                          background: getStatusStyle(f.statusAtUpload).bg,
                          color: getStatusStyle(f.statusAtUpload).color,
                          borderColor: getStatusStyle(f.statusAtUpload).color,
                        }}>
                          {getStatusStyle(f.statusAtUpload).label}
                        </span>
                      )}
                      <span className="cst-file-date">{formatDateTime(f.uploadedAt)}</span>
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
    }
    onUpdate(updated)
  }, [page, onUpdate])

  const handleFileUpload = useCallback(async (siteCode, fileInfo) => {
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

  // 통계 계산 (확장된 상태 기준)
  const totalCountries = page.countries.length
  const completedCountries = page.countries.filter(c => c.status === 'prod_done' || c.status === 'qa_done').length
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
          {COPY_STATUSES.filter(s => s.value && statusCounts[s.value] > 0).map(s => (
            <span key={s.value} className="cst-summary-badge"
              style={{ background: s.bg, color: s.color, borderColor: s.color }}>
              {s.label}: {statusCounts[s.value]}
            </span>
          ))}
        </div>

        <div className="cst-progress-wrap">
          <div className="cst-progress-label">
            <span>Production/QA 완료</span>
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
                placeholder="국가 검색" value={search} onChange={e => setSearch(e.target.value)} />
              <div className="cc-dropdown-list" style={{ maxHeight: 200, overflowY: 'auto' }}>
                {available.map(s => (
                  <div key={s.code} className="cc-dropdown-item" onClick={() => addCountry(s)}>
                    <span className="cc-flag">{s.flag}</span>
                    <span>{s.name} ({s.code})</span>
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
              <th className="cst-th" style={{ width: 220 }}>카피 작업 상태</th>
              <th className="cst-th">첨부 파일 (업로드 당시 상태 기록)</th>
              <th className="cst-th" style={{ width: 180 }}>메모</th>
              <th className="cst-th" style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(site => {
              const entry = page.countries.find(c => c.code === site.code)
              return (
                <tr key={site.code} className="cst-row">
                  <td className="cst-td">
                    <div className="cst-country-cell">
                      <span className="cst-flag">{site.flag}</span>
                      <div className="cst-country-info">
                        <span className="cst-country-name">{site.name}</span>
                        <span className="cst-country-code" style={{ color: REGION_COLORS[site.region] }}>{site.code}</span>
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
                  <td className="cst-td">
                    <button className="act-btn act-delete" onClick={() => removeCountry(site.code)}>✕</button>
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

// ... StatusTab 메인 함수는 기존과 동일하게 유지하되, 
// createPage 시 초기 status를 빈 값으로 설정하는 부분 등을 확인하면 됩니다.
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
    if (!newPageName.trim()) { setNewPageMsg('❌ 이름을 입력하세요.'); return }
    const newPage = {
      id: Date.now(),
      name: newPageName.trim(),
      createdAt: new Date().toISOString(),
      countries: ALL_SITES
        .filter(s => DEFAULT_COUNTRIES.includes(s.code))
        .map(s => ({ code: s.code, status: '', note: '', file: null, fileHistory: [] })),
    }
    setData(prev => ({ ...prev, pages: [...prev.pages, newPage] }))
    setNewPageName(''); setShowNewPage(false); setSelectedPageId(newPage.id)
  }

  const updatePage = useCallback((updated) => {
    setData(prev => ({ ...prev, pages: prev.pages.map(p => p.id === updated.id ? updated : p) }))
  }, [])

  if (selectedPage) {
    return <PageDetail page={selectedPage} onBack={() => setSelectedPageId(null)} onUpdate={updatePage} />
  }

  return (
    <div className="cst-container">
      <div className="cst-list-header">
        <h2 className="cst-list-title">페이지별 국가 카피 작업 현황</h2>
        <button className="btn-primary" onClick={() => setShowNewPage(true)}>+ 새 페이지 추가</button>
      </div>

      {showNewPage && (
        <div className="cst-new-page-form" style={{ marginBottom: 20 }}>
          <input className="form-input" placeholder="페이지 이름" value={newPageName} onChange={e => setNewPageName(e.target.value)} />
          <button className="btn-primary" onClick={createPage}>추가</button>
          <button className="btn-ghost" onClick={() => setShowNewPage(false)}>취소</button>
        </div>
      )}

      <div className="cst-page-grid">
        {pages.map(page => {
          const total = page.countries.length
          const prodDone = page.countries.filter(c => c.status === 'prod_done' || c.status === 'qa_done').length
          const pct = total > 0 ? Math.round((prodDone / total) * 100) : 0
          return (
            <div key={page.id} className="cst-page-card" onClick={() => setSelectedPageId(page.id)}>
              <h3 className="cst-page-card-name">{page.name}</h3>
              <div className="cst-page-card-meta">{page.countries.length}개국 참여 중</div>
              <div className="cst-mini-progress">
                <div className="cst-mini-progress-bar"><div className="cst-progress-fill" style={{ width: `${pct}%` }} /></div>
                <span className="cst-mini-pct">{pct}% 완료</span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}