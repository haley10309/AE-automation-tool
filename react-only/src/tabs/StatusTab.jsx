import { useState, useCallback, useEffect, useRef, memo } from 'react'
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
// ── [최적화] 메인 메모 입력 컴포넌트 (반응성 향상) ────────────────
const NoteInput = memo(({ initialNote, onSave }) => {
  const [val, setVal] = useState(initialNote || '')
  useEffect(() => { setVal(initialNote || '') }, [initialNote])

  return (
    <input 
      className="cst-note-input" 
      placeholder="메모 입력..."
      value={val} 
      onChange={e => setVal(e.target.value)}
      onBlur={() => onSave(val)} // 포커스 나갈 때만 전체 상태 업데이트
      onKeyDown={e => e.key === 'Enter' && onSave(val)}
    />
  )
})
const HistoryItem = ({ file, index, onUpdateNote, download }) => {
  const [isEditing, setIsEditing] = useState(false)
  const [tempNote, setTempNote] = useState(file.noteAtUpload || '')

  const handleSave = () => {
    onUpdateNote(index, tempNote)
    setIsEditing(false)
  }

  const statusStyle = getStatusStyle(file.statusAtUpload || '')

  return (
    <div className="cst-file-history-item">
      <div className="cst-history-left">
        <div className="cst-file-meta-row" style={{ marginBottom: 4 }}>
          <button className="cst-file-name-btn" style={{ fontSize: 11 }}
            onClick={() => download(file)} disabled={!file.dataUrl}>
            📎 {file.name}
          </button>
          <span className="cst-file-date">{formatDateTime(file.uploadedAt)}</span>
        </div>

        
        
        {/* 상태 + 메모 한 줄 */}
        <div 
          className="cst-history-note-row" 
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          {/* 상태 */}
          <span style={{
            display: 'inline-block',
            fontSize: 10,
            padding: '1px 6px',
            borderRadius: 4,
            border: `1px solid ${statusStyle.color}`,
            color: statusStyle.color,
            background: statusStyle.bg,
            whiteSpace: 'nowrap'
          }}>
            {statusStyle.label}
          </span>

          {/* 메모 영역 */}
          {isEditing ? (
            <>
              <input 
                className="form-input" 
                style={{ fontSize: 11, padding: '2px 5px', flex: 1 }}
                value={tempNote}
                onChange={e => setTempNote(e.target.value)}
                autoFocus
              />
              <button className="btn-sm" onClick={handleSave} style={{ padding: '2px 5px' }}>저장</button>
              <button className="btn-ghost" onClick={() => setIsEditing(false)} style={{ padding: '2px 5px' }}>취소</button>
            </>
          ) : (
            <>
              <span className="cst-file-note" style={{ fontSize: 11 }}>
                📝 {file.noteAtUpload || '(메모 없음)'}
              </span>
              <button 
                className="btn-icon-edit" 
                onClick={() => setIsEditing(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12 }}
                title="메모 수정"
              >
                ✏️
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
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
function FileCell({ siteCode, entry, onFileUpload, onUpdateHistoryNote }) {
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
        name: file.name,
        size: file.size,
        uploadedAt: new Date().toISOString(),
        statusAtUpload: entry?.status || '',
        noteAtUpload: entry?.note || '', // 현재 메모 캡처
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

  return (
    <div className="cst-file-area">
      {entry?.file ? (
        <div className="cst-file-info">
          <div className="cst-file-main">
            <button className="cst-file-name-btn" onClick={() => download(entry.file)}>
              📎 {entry.file.name}
            </button>
            <span className="cst-file-date">{formatDateTime(entry.file.uploadedAt)}</span>
          </div>
          <div className="cst-file-actions">
            <button className="cst-file-replace" onClick={() => fileRef.current?.click()} disabled={uploading}>
              {uploading ? '⏳' : '↑ 교체'}
            </button>
            {entry.fileHistory?.length > 0 && (
              <button className="cst-file-history-btn" onClick={() => setShowHistory(v => !v)}>
                히스토리 ({entry.fileHistory.length})
              </button>
            )}
          </div>
          
          {showHistory && (
            <div className="cst-file-history">
              {/* 히스토리는 역순으로 보여주되 인덱스 계산을 위해 원본 배열 활용 */}
              {[...entry.fileHistory].reverse().map((f, revIdx) => {
                const originalIdx = entry.fileHistory.length - 1 - revIdx;
                return (
                  <HistoryItem 
                    key={originalIdx}
                    file={f}
                    index={originalIdx}
                    download={download}
                    onUpdateNote={(idx, newNote) => onUpdateHistoryNote(siteCode, idx, newNote)}
                  />
                )
              })}
            </div>
          )}
        </div>
      ) : (
        <button className="cst-upload-btn" onClick={() => fileRef.current?.click()}>+ 파일 첨부</button>
      )}
      <input ref={fileRef} type="file" style={{ display: 'none' }} onChange={handleChange} />
    </div>
  )
}
// ── [최적화] 테이블 행 (React.memo) ───────────────────────────
const StatusRow = memo(({ site, entry, handleStatusChange, handleFileUpload, handleHistoryNoteUpdate, removeCountry }) => {
  return (
    <tr className="cst-row">
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
        <FileCell 
          siteCode={site.code} 
          entry={entry} 
          onFileUpload={handleFileUpload} 
          onUpdateHistoryNote={handleHistoryNoteUpdate}
        />
      </td>
      <td className="cst-td">
        <NoteInput 
          initialNote={entry?.note} 
          onSave={(note) => handleStatusChange(site.code, entry?.status, note)} 
        />
      </td>
      <td className="cst-td">
        <button className="act-btn act-delete" onClick={() => removeCountry(site.code)}>✕</button>
      </td>
    </tr>
  )
})

// ── 페이지 상세 뷰 ────────────────────────────────────────────
function PageDetail({ page, onBack, onUpdate }) {
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [showAddCountry, setShowAddCountry] = useState(false)
  const [search, setSearch] = useState('')
  const dropRef = useRef(null)

  // ── 페이지 진입 시 DB에서 상태+파일 히스토리 로드 ──────────
  useEffect(() => {
    async function loadFromDB() {
      try {
        // 1. tracker_pages upsert (기존 localStorage 페이지도 DB에 등록 보장)
        await api.createTrackerPage({ id: String(page.id), title: page.name })

        // 2. 상태/메모 + 파일 히스토리 한번에 조회
        const res = await api.getTrackerDetail(String(page.id))
        if (!res.ok) return

        // 3. DB 데이터 → countries 구조로 병합
        const baseCountries = page.countries?.length
          ? page.countries
          : ALL_SITES
              .filter(s => DEFAULT_COUNTRIES.includes(s.code))
              .map(s => ({ code: s.code, status: '', note: '', file: null, fileHistory: [] }))

        const statusMap = {}
        for (const s of (res.statuses || [])) statusMap[s.site_code] = s

        // 파일을 site_code별로 그룹핑
        const fileMap = {}
        for (const f of (res.files || [])) {
          if (!fileMap[f.site_code]) fileMap[f.site_code] = []
          fileMap[f.site_code].push({
            dbId: f.id,
            name: f.name,
            size: f.size,
            uploadedAt: f.uploaded_at,
            statusAtUpload: f.status,
            noteAtUpload: f.note_at_upload,
            dataUrl: f.data_url,
          })
        }

        // 기존 countries에 DB 값 덮어씌우기
        const mergedCountries = baseCountries.map(c => {
          const st = statusMap[c.code]
          const history = fileMap[c.code] || []
          return {
            ...c,
            status: st ? st.status : c.status,
            note:   st ? st.note   : c.note,
            fileHistory: history,
            file: history.length ? history[history.length - 1] : c.file,
          }
        })

        // DB에만 있는 국가 (나중에 추가된 국가) 도 병합
        for (const code of Object.keys(statusMap)) {
          if (!mergedCountries.find(c => c.code === code)) {
            const st = statusMap[code]
            const history = fileMap[code] || []
            mergedCountries.push({
              code,
              status: st.status,
              note: st.note,
              fileHistory: history,
              file: history.length ? history[history.length - 1] : null,
            })
          }
        }

        onUpdate({ ...page, countries: mergedCountries }, true) // true = DB에서 로드 완료, localStorage 저장 허용
      } catch (e) {
        console.error('[DB] 페이지 상세 로드 실패:', e?.message || e)
      }
    }
    loadFromDB()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id])

  const activeSiteCodes = (page.countries || []).map(c => c.code)
  const activeSites = ALL_SITES.filter(s => activeSiteCodes.includes(s.code))
  const filtered = activeSites.filter(s => regionFilter === 'ALL' || s.region === regionFilter)

  const available = ALL_SITES
    .filter(s => !activeSiteCodes.includes(s.code))
    .filter(s => !search || s.name.includes(search) || s.code.toLowerCase().includes(search.toLowerCase()))
    .filter(s => regionFilter === 'ALL' || s.region === regionFilter)

  const handleStatusChange = useCallback(async (siteCode, newStatus, note) => {
    const updated = { ...page }
    const existing = updated.countries.find(c => c.code === siteCode)
    if (existing) {
      if (newStatus !== undefined) existing.status = newStatus
      if (note !== undefined) existing.note = note
    }
    onUpdate(updated, true)
    // DB 저장 (비동기, 실패해도 UI는 유지)
    try {
      await api.updateTrackerStatus({
        pageId: page.id,
        siteCode,
        status: newStatus ?? existing?.status ?? '',
        note: note ?? existing?.note ?? '',
      })
    } catch (e) { console.warn('status DB 저장 실패', e) }
  }, [page, onUpdate])

  

  const handleFileUpload = useCallback(async (siteCode, fileInfo) => {
    // DB에 파일 저장 후 insertId를 받아 fileHistory에 기록
    let dbId = null
    try {
      const res = await api.saveFile({
        pageId: page.id,
        siteCode,
        name: fileInfo.name,
        size: fileInfo.size,
        status: fileInfo.statusAtUpload || '',
        noteAtUpload: fileInfo.noteAtUpload || '',
        uploadedAt: fileInfo.uploadedAt,
        dataUrl: fileInfo.dataUrl,
      })
      if (res.ok) dbId = res.id
    } catch (e) { console.warn('파일 DB 저장 실패', e) }

    const fileInfoWithId = { ...fileInfo, dbId }
    const updatedCountries = page.countries.map(c => {
      if (c.code === siteCode) {
        return {
          ...c,
          file: fileInfoWithId,
          fileHistory: [...(c.fileHistory || []), fileInfoWithId],
          note: '' // 업로드 완료 시 현재 메모 비우기
        }
      }
      return c
    })
    onUpdate({ ...page, countries: updatedCountries }, true)
  }, [page, onUpdate])
  // [신규] 히스토리 메모 수정 핸들러
  const handleHistoryNoteUpdate = useCallback(async (siteCode, historyIdx, newNote) => {
    const updatedCountries = page.countries.map(c => {
      if (c.code === siteCode) {
        const newHistory = [...c.fileHistory];
        newHistory[historyIdx] = { ...newHistory[historyIdx], noteAtUpload: newNote };
        return { ...c, fileHistory: newHistory };
      }
      return c;
    })
    onUpdate({ ...page, countries: updatedCountries }, true)

    // DB 메모 업데이트 (dbId가 있을 때만)
    const targetFile = page.countries.find(c => c.code === siteCode)?.fileHistory?.[historyIdx]
    if (targetFile?.dbId) {
      try {
        await api.updateHistoryNote(targetFile.dbId, { noteAtUpload: newNote })
      } catch (e) { console.warn('히스토리 메모 DB 저장 실패', e) }
    }
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
    onUpdate({ ...page, countries: page.countries.filter(c => c.code !== code) }, true)
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
              <StatusRow
                key={site.code}
                site={site}
                entry={entry}
                handleStatusChange={handleStatusChange}
                handleFileUpload={handleFileUpload}
                handleHistoryNoteUpdate={handleHistoryNoteUpdate}
                removeCountry={removeCountry}
              />
            )
          })}
        </tbody>
        </table>
      </div>
    </div>
  )
}

export default function StatusTab() {
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [showNewPage, setShowNewPage] = useState(false)
  const [newPageName, setNewPageName] = useState('')
  const [newPageMsg, setNewPageMsg] = useState('')
  const [searchPages, setSearchPages] = useState('')

  // ── 초기 로드: DB 우선, 실패 시 localStorage fallback ──────
  useEffect(() => {
    async function loadPages() {
      try {
        const res = await api.getTrackerPages()
        if (res.ok && res.data?.length) {
          // localStorage에 저장된 기존 데이터를 먼저 읽어서 countries 보존
          const local = loadFromStorage()
          const localMap = Object.fromEntries((local.pages || []).map(p => [String(p.id), p]))

          const dbPages = res.data.map(p => {
            const localPage = localMap[String(p.id)]
            return {
              id: p.id,
              name: p.title,
              createdAt: p.created_at,
              // 로컬에 저장된 countries가 있으면 유지, 없으면 빈 배열(PageDetail 진입 시 채워짐)
              countries: localPage?.countries || [],
              _loadedFromDB: true,
            }
          })
          setPages(dbPages)
          // countries가 있는 페이지만 localStorage에 반영 (빈 countries로 덮어쓰기 방지)
          saveToStorage({ pages: dbPages })
        } else {
          // DB 연결 안됨 → localStorage fallback
          const local = loadFromStorage()
          setPages(local.pages || [])
        }
      } catch {
        const local = loadFromStorage()
        setPages(local.pages || [])
      } finally {
        setLoading(false)
      }
    }
    loadPages()
  }, [])

  const selectedPage = pages.find(p => p.id == selectedPageId)

  const createPage = async () => {
    if (!newPageName.trim()) { setNewPageMsg('❌ 이름을 입력하세요.'); return }
    const newPage = {
      id: String(Date.now()),
      name: newPageName.trim(),
      createdAt: new Date().toISOString(),
      countries: ALL_SITES
        .filter(s => DEFAULT_COUNTRIES.includes(s.code))
        .map(s => ({ code: s.code, status: '', note: '', file: null, fileHistory: [] })),
    }
    try {
      await api.createTrackerPage({ id: newPage.id, title: newPage.name })
    } catch (e) { console.error('[DB] 페이지 생성 실패:', e?.message || e) }

    setPages(prev => [...prev, newPage])
    saveToStorage({ pages: [...pages, newPage] })
    setNewPageName(''); setShowNewPage(false); setSelectedPageId(newPage.id)
  }

  const updatePage = useCallback((updated, persistToStorage = false) => {
    setPages(prev => {
      const next = prev.map(p => p.id == updated.id ? updated : p)
      if (persistToStorage) {
        // DB에서 countries가 채워진 뒤에만 localStorage 업데이트
        saveToStorage({ pages: next })
      }
      return next
    })
  }, [])

  if (loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>불러오는 중...</div>
  }

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