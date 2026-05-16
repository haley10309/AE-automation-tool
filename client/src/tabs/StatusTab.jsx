import { useState, useCallback, useEffect, useRef, memo } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import { useDB } from '../DBContext.jsx'
import { ALL_SITES, REGIONS, REGION_COLORS, REGION_BG } from '../constants.js'
import React from 'react'

// ── 상태 정의 (0=미설정, 1~15=단계) ─────────────────────────
const COPY_STATUSES = [
  { value: '',                  label: '— 미설정 —',          color: '#9ca3af', bg: '#f9fafb',  step: 0  },
  { value: 'inquiry',           label: '문의 필요',            color: '#6b7280', bg: '#f3f4f6',  step: 1  },
  { value: 'tp_req',            label: 'TP 번역 요청',         color: '#8b5cf6', bg: '#ede9fe',  step: 2  },
  { value: 'tp_done',           label: 'TP 번역 완료',         color: '#7c3aed', bg: '#ddd6fe',  step: 3  },
  { value: 'local_survey',      label: 'Local Survey 시작',    color: '#2563eb', bg: '#dbeafe',  step: 4  },
  { value: 'cmu_req_needed',    label: 'CMU 컨펌 요청 필요',   color: '#0369a1', bg: '#e0f2fe',  step: 5  },
  { value: 'cmu_req_done',      label: 'CMU 컨펌 요청 완료',   color: '#0284c7', bg: '#bae6fd',  step: 6  },
  { value: 'cmu_answered',      label: 'CMU 답변 완료',        color: '#0e7490', bg: '#a5f3fc',  step: 7  },
  { value: 'local_confirmed',   label: 'Local Confirmed',      color: '#0f766e', bg: '#ccfbf1',  step: 8  },
  { value: 'deck_merge',        label: 'Deck Merge',           color: '#b45309', bg: '#fef3c7',  step: 9  },
  { value: 'prod_needed',       label: 'Production 요청 필요', color: '#c2410c', bg: '#ffedd5',  step: 10 },
  { value: 'prod_wip',          label: 'Production 중',        color: '#ea580c', bg: '#fed7aa',  step: 11 },
  { value: 'prod_done',         label: 'Production 완료',      color: '#166534', bg: '#dcfce7',  step: 12 },
  { value: 'qa_needed',         label: 'QA 필요',              color: '#7c2d12', bg: '#fef2f2',  step: 13 },
  { value: 'qa_wip',            label: 'QA 중',                color: '#b91c1c', bg: '#fee2e2',  step: 14 },
  { value: 'qa_done',           label: 'QA 완료',              color: '#15803d', bg: '#bbf7d0',  step: 15 },
]
const TOTAL_STEPS = 15
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
            onClick={() => download(file)}>
            📎 {file.name}
          </button>
          <span className="cst-file-date">{formatDateTime(file.uploadedAt)}</span>
          {file.uploadedBy && (
            <span className="cst-file-uploader">👤 {file.uploadedBy}</span>
          )}
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

  const [downloading, setDownloading] = useState(false)

  const download = async (f) => {
    // data_url이 이미 있으면 바로 다운로드 (방금 업로드한 파일)
    if (f.dataUrl) {
      const a = document.createElement('a')
      a.href = f.dataUrl; a.download = f.name
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      return
    }
    // 없으면 서버에서 단건 조회 (저장된 파일)
    if (!f.dbId) return
    setDownloading(true)
    try {
      const res = await fetch(`http://localhost:4000/api/files/${f.dbId}/data`)
      const data = await res.json()
      if (data.ok && data.data?.data_url) {
        const a = document.createElement('a')
        a.href = data.data.data_url; a.download = f.name
        document.body.appendChild(a); a.click(); document.body.removeChild(a)
      }
    } catch (e) { console.warn('다운로드 실패', e) }
    finally { setDownloading(false) }
  }

  return (
    <div className="cst-file-area">
      {entry?.file ? (
        <div className="cst-file-info">
          <div className="cst-file-main">
            <button className="cst-file-name-btn" onClick={() => download(entry.file)} disabled={downloading}>
              {downloading ? '⏳ 불러오는 중...' : `📎 ${entry.file.name}`}
            </button>
            <span className="cst-file-date">{formatDateTime(entry.file.uploadedAt)}</span>
            {entry.file.uploadedBy && (
              <span className="cst-file-uploader">👤 {entry.file.uploadedBy}</span>
            )}
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
  const { user } = useAuth()
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [showAddCountry, setShowAddCountry] = useState(false)
  const [search, setSearch] = useState('')
  const [loadingDetail, setLoadingDetail] = useState(true)
  const dropRef = useRef(null)

  // ── 페이지 진입 시 DB에서 상태+파일 히스토리 로드 ──────────
  useEffect(() => {
    async function loadFromDB() {
      setLoadingDetail(true)
      try {
        // 1. tracker_pages upsert (기존 localStorage 페이지도 DB에 등록 보장)
        await api.createTrackerPage({ id: String(page.id), title: page.name })

        // 2. 상태/메모 + 파일 히스토리 한번에 조회
        const res = await api.getTrackerDetail(String(page.id))
        if (!res.ok) return

        // 3. DB 데이터 → countries 구조로 병합 (항상 DB가 정답)
        const baseCountries = ALL_SITES
          .filter(s => DEFAULT_COUNTRIES.includes(s.code))
          .map(s => ({ code: s.code, status: '', note: '', file: null, fileHistory: [] }))

        const statusMap = {}
        for (const s of (res.statuses || [])) statusMap[s.site_code] = s

        // 파일을 site_code별로 그룹핑
        const fileMap = {}
        for (const f of (res.files || [])) {
          if (!fileMap[f.site_code]) fileMap[f.site_code] = []
          fileMap[f.site_code].push({
            dbId:           f.id,
            name:           f.name,
            size:           f.size,
            uploadedAt:     f.uploaded_at,
            statusAtUpload: f.status,
            noteAtUpload:   f.note_at_upload,
            uploadedBy:     f.uploaded_by || null,
            dataUrl:        null,   // 다운로드 클릭 시 서버에서 단건 조회
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

        onUpdate({ ...page, countries: mergedCountries }, true)
      } catch (e) {
        console.error('[DB] 페이지 상세 로드 실패:', e?.message || e)
      } finally {
        setLoadingDetail(false)
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
        uploadedBy: user?.name || user?.email || null,   // ← 추가
      })
      if (res.ok) dbId = res.id
    } catch (e) { console.warn('파일 DB 저장 실패', e) }

    const fileInfoWithId = { ...fileInfo, dbId, uploadedBy: user?.name || user?.email || null }
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

  // ── 통계 계산 ──────────────────────────────────────────────
  const totalCountries = page.countries.length
  const statusCounts = {}
  COPY_STATUSES.forEach(s => {
    if (s.value) statusCounts[s.value] = page.countries.filter(c => c.status === s.value).length
  })
  // 진행도: 각 국가 step 합산 → (합계 / 전체국가 × TOTAL_STEPS) × 100
  const totalStepSum = page.countries.reduce((sum, c) => {
    return sum + (COPY_STATUSES.find(s => s.value === c.status)?.step || 0)
  }, 0)
  const progressPct = totalCountries > 0
    ? Math.round((totalStepSum / (totalCountries * TOTAL_STEPS)) * 100)
    : 0
  const avgStep = totalCountries > 0 ? totalStepSum / totalCountries : 0
  const avgStepRounded = Math.round(avgStep)
  const avgStatus = COPY_STATUSES.find(s => s.step === avgStepRounded) || COPY_STATUSES[0]

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
            <span>
              전체 진행도
              <span style={{ fontSize: 11, color: '#6b7280', marginLeft: 6 }}>
                ({avgStatus.label} 수준 · avg {avgStep.toFixed(1)} / {TOTAL_STEPS} 단계)
              </span>
            </span>
            <span style={{ fontWeight: 700, color: avgStatus.color }}>{progressPct}%</span>
          </div>
          {/* 단계별 컬러 스트립 */}
          <div style={{ display: 'flex', gap: 2, marginBottom: 4 }}>
            {COPY_STATUSES.filter(s => s.value).map(s => (
              <div key={s.value} title={s.label} style={{
                flex: 1, height: 6, borderRadius: 3,
                background: s.step <= avgStepRounded && avgStepRounded > 0 ? s.color : '#e5e7eb',
                transition: 'background 0.3s',
              }} />
            ))}
          </div>
          <div className="cst-progress-bar">
            <div className="cst-progress-fill"
              style={{ width: `${progressPct}%`, background: avgStatus.color, transition: 'width 0.4s' }} />
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

      {loadingDetail ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>DB에서 불러오는 중...</div>
      ) : (
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
      )}
    </div>
  )
}

export default function StatusTab() {
  const { dbReady } = useDB()
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedPageId, setSelectedPageId] = useState(null)
  const [showNewPage, setShowNewPage] = useState(false)
  const [newPageName, setNewPageName] = useState('')
  const [newPageMsg, setNewPageMsg] = useState('')
  const [searchPages, setSearchPages] = useState('')

  // ── 초기 로드: DB 우선, 실패 시 localStorage fallback ──────
  // ── 초기 로드: 목록 화면에서도 전체 상태(Status)를 한 번에 파악 ──────
  useEffect(() => {
    if (!dbReady) return
    async function loadPages() {
      try {
        const res = await api.getTrackerPages()
        if (res.ok && res.data?.length) {
          
          // 1. DB에서 넘어온 전체 상태(statuses)를 페이지 ID별로 그룹핑
          const statusByPage = {}
          if (res.statuses) {
            res.statuses.forEach(s => {
              if (!statusByPage[s.page_id]) statusByPage[s.page_id] = {}
              statusByPage[s.page_id][s.site_code] = s.status
            })
          }

          const dbPages = res.data.map(p => {
            const pageId = String(p.id)
            const pageStatuses = statusByPage[pageId] || {}
            
            // 2. 기본 국가 목록을 세팅하고, DB의 상태값을 꽂아 넣음
            const baseCountries = ALL_SITES
              .filter(s => DEFAULT_COUNTRIES.includes(s.code))
              .map(s => ({ 
                code: s.code, 
                status: pageStatuses[s.code] || '', 
                note: '', file: null, fileHistory: [] 
              }))
            
            // 3. DB에만 존재하는 추가 국가(나중에 수동으로 추가한 국가)도 병합
            for (const code of Object.keys(pageStatuses)) {
              if (!baseCountries.find(c => c.code === code)) {
                baseCountries.push({
                  code,
                  status: pageStatuses[code] || '',
                  note: '', file: null, fileHistory: []
                })
              }
            }

            return {
              id: pageId,
              name: p.title,
              createdAt: p.created_at,
              countries: baseCountries,
              _loadedFromDB: true,
            }
          })
          
          setPages(dbPages)
          saveToStorage({ pages: dbPages }) // DB 데이터를 로컬스토리지에 동기화
        } else {
          // DB 연결 실패 또는 데이터가 없을 시 localStorage fallback
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
  }, [dbReady])

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

  if (!dbReady || loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>{!dbReady ? 'DB 연결 중...' : '불러오는 중...'}</div>
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
          const stepSum = page.countries.reduce((sum, c) => {
            return sum + (COPY_STATUSES.find(s => s.value === c.status)?.step || 0)
          }, 0)
          const pct = total > 0 ? Math.round((stepSum / (total * TOTAL_STEPS)) * 100) : 0
          const avgS = total > 0 ? stepSum / total : 0
          const cardStatus = COPY_STATUSES.find(s => s.step === Math.round(avgS)) || COPY_STATUSES[0]
          // 상태별 국가 수
          const statusCounts = {}
          COPY_STATUSES.forEach(s => {
            if (s.value) statusCounts[s.value] = page.countries.filter(c => c.status === s.value).length
          })
          const unset = page.countries.filter(c => !c.status).length

          return (
            <div key={page.id} className="cst-page-card" onClick={() => setSelectedPageId(page.id)}>
              <div className="cst-page-card-header">
                <h3 className="cst-page-card-name">{page.name}</h3>
                <span className="cst-page-card-total">{total}개국</span>
              </div>

              {/* 단계별 컬러 스트립 */}
              <div style={{ display: 'flex', gap: 2, margin: '8px 0 4px' }}>
                {COPY_STATUSES.filter(s => s.value).map(s => (
                  <div key={s.value} title={`${s.label}: ${statusCounts[s.value] || 0}개국`} style={{
                    flex: 1, height: 6, borderRadius: 3,
                    background: s.step <= Math.round(avgS) && Math.round(avgS) > 0 ? s.color : '#e5e7eb',
                    transition: 'background 0.3s',
                  }} />
                ))}
              </div>

              {/* 프로그레스 바 */}
              <div className="cst-mini-progress">
                <div className="cst-mini-progress-bar">
                  <div className="cst-progress-fill" style={{ width: `${pct}%`, background: cardStatus.color }} />
                </div>
                <span className="cst-mini-pct" style={{ color: cardStatus.color }}>
                  {pct}% · {cardStatus.label}
                </span>
              </div>

              {/* 상태별 뱃지 목록 */}
              <div className="cst-page-card-badges">
                {COPY_STATUSES.filter(s => s.value && statusCounts[s.value] > 0).map(s => (
                  <span key={s.value} className="cst-mini-badge"
                    style={{ background: s.bg, color: s.color, border: `1px solid ${s.color}` }}>
                    {s.label} <strong>{statusCounts[s.value]}</strong>
                  </span>
                ))}
                {unset > 0 && (
                  <span className="cst-mini-badge"
                    style={{ background: '#f3f4f6', color: '#6b7280', border: '1px solid #d1d5db' }}>
                    미설정 <strong>{unset}</strong>
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}