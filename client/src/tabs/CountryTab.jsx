import { useState, useEffect, useCallback, useRef } from 'react'
import { api } from '../api.js'
import { useAuth } from '../auth.jsx'
import SiteDropdown from '../components/SiteDropdown.jsx'
import { ALL_SITES, SITE_MAP, REGIONS, REGION_COLORS as RC, REGION_BG as RB } from '../constants.js'
import { parseCol, detectBadges, exportToCSV } from '../utils.js'
import {SERVICE_KEYS, SERVICE_DATA, setServiceData, detectServiceIssues} from '../components/ServiceCheck.jsx'

// ── CSV 내보내기 헬퍼 ─────────────────────────────────────────
function doExportCSV(sites, rowCount, cells) {
  const ds = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const headers = [
    ['#', ...sites.map(s => s.region)],
    ['',  ...sites.map(s => s.code)],
    ['',  ...sites.map(s => s.name)],
  ]
  const rows = Array.from({ length: rowCount }, (_, i) => {
    const ri = i + 1
    return [ri, ...sites.map(s => cells[`${s.code}__${ri}`] || '')]
  })
  exportToCSV(`카피프로젝트_${ds}.csv`, headers, rows)
}

// ════════════════════════════════════════════════════════════════
// ── 즉석 검수 ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
function QuickCheck({ products }) {
  const [active, setActive] = useState([{ ...ALL_SITES[0], input: '' }])
  const [result, setResult] = useState(null)

  const addSite  = s    => setActive(prev => [...prev, { ...s, input: '' }])
  const removeSite = code => setActive(prev => prev.filter(a => a.code !== code))
  const updateInput = (code, val) => setActive(prev => prev.map(a => a.code === code ? { ...a, input: val } : a))

  const runCheck = () => {
    const parsed = active.map(a => ({ ...a, rows: parseCol(a.input) }))
    const maxRows = Math.max(...parsed.map(a => a.rows.length), 0)
    const rows = []
    for (let i = 0; i < maxRows; i++) {
      const cells = {}; let hasBadge = false
      parsed.forEach(a => {
        const text = a.rows[i] || ''
        const badges = detectBadges(text, a.code, products)
const serviceIssues = detectServiceIssues(text, a.code)  // ✅ 추가
if (badges.length || serviceIssues.length) hasBadge = true  // ✅ 서비스 이슈도 hasBadge 반영
cells[a.code] = { text, badges, serviceIssues }
      })
      rows.push({ index: i + 1, cells, hasBadge })
    }
    const total = rows.reduce((acc, r) =>
      acc + Object.values(r.cells).reduce((a, c) => a + (c.badges?.length || 0) + (c.serviceIssues?.length || 0), 0), 0)
    setResult({ sites: parsed, rows, totalBadges: total })
  }

  const handleExport = () => {
    if (!result) return
    const cellsMap = {}
    result.rows.forEach(row => result.sites.forEach(s => {
      cellsMap[`${s.code}__${row.index}`] = row.cells[s.code]?.text || ''
    }))
    doExportCSV(result.sites, result.rows.length, cellsMap)
  }

  return (
    <div>
      <div className="cc-cards-grid">
        {active.map(a => (
          <div key={a.code} className="cc-card" style={{ borderTopColor: RC[a.region] }}>
            <div className="cc-card-header">
              <span className="cc-flag">{a.flag}</span>
              <div className="cc-card-title">
                <span className="cc-card-name">{a.name}</span>
                <span className="cc-card-code" style={{ background: RB[a.region], color: RC[a.region] }}>{a.code}</span>
              </div>
              <span className="cc-region-tag" style={{ background: RB[a.region], color: RC[a.region] }}>{a.region}</span>
              <button className="cc-remove-btn" onClick={() => removeSite(a.code)}>✕</button>
            </div>
            <textarea className="paste-area" style={{ height: 120 }} value={a.input}
              onChange={e => updateInput(a.code, e.target.value)}
              placeholder={`${a.flag} ${a.name}\n카피 열 전체 복사 후 Ctrl+V`} />
            <div className="input-hint">{a.input ? `${parseCol(a.input).length}행 입력됨` : '붙여넣기'}</div>
          </div>
        ))}
        <SiteDropdown excludeCodes={active.map(a => a.code)} onAdd={addSite} label="+ 국가 추가" />
      </div>

      <div className="action-row" style={{ marginTop: 16 }}>
        <button className="btn-primary" onClick={runCheck}
          disabled={active.filter(a => a.input.trim()).length === 0}>검수하기</button>
        {result && (
          <>
            <span className={`cc-badge-count ${result.totalBadges > 0 ? 'has-issue' : 'no-issue'}`}>
              {result.totalBadges > 0 ? `⚠ 미출시 감지 ${result.totalBadges}건` : '✓ 미출시 없음'}
            </span>
            <button className="btn-export" onClick={handleExport}>⬇ 엑셀 추출</button>
          </>
        )}
      </div>

      {result && (
        <div className="cc-result" style={{ marginTop: 16 }}>
          <div className="cc-table-wrap">
            <CountryTable sites={result.sites} rows={result.rows} products={products} />
          </div>
        </div>
      )}
    </div>
  )
}

// ── 공통 가로 스크롤 테이블 ───────────────────────────────────
function CountryTable({ sites, rows, products: _p }) {
  return (
    <table className="cc-table">
      <thead>
        <tr>
          <th className="cc-th cc-th-idx">#</th>
          {sites.map(s => (
            <th key={s.code} className="cc-th cc-th-country" style={{ borderTop: `3px solid ${RC[s.region]}` }}>
              <div className="cc-th-inner">
                <span className="cc-flag">{s.flag}</span>
                <span className="cc-th-name">{s.name}</span>
                <span className="cc-card-code" style={{ background: RB[s.region], color: RC[s.region] }}>{s.code}</span>
              </div>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.index} className={row.hasBadge ? 'cc-row-issue' : ''}>
            <td className="cc-td cc-td-idx">{row.index}</td>
            {sites.map(s => {
              const cell = row.cells[s.code]
              return (
                  <td key={s.code} className={`cc-td cc-td-cell ${
                    cell.badges.length > 0 || cell.serviceIssues?.length > 0 ? 'cc-cell-issue' : ''
                  }`}>
                  <div className="cc-cell-text">{cell.text || <em className="empty-val">빈 값</em>}</div>
                  {cell.badges.map(b => <div key={b} className="cc-launch-badge">⚠ 미출시: {b}</div>)}
                    <ServiceIssueBadges issues={cell.serviceIssues} />
                  </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 프로젝트 상세 ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
function ProjectDetail({ project, products, onBack, onUpdated }) {
  const [sites, setSites]       = useState([])
  const [rowCount, setRowCount] = useState(5)
  const [cells, setCells]       = useState({})         // "code__ri" → text (state 기반 → 배지 실시간)
  const [pasteInputs, setPasteInputs] = useState({})   // "code" → paste textarea 값
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [msg, setMsg]           = useState('')
  const [editName, setEditName] = useState(false)
  const [nameVal, setNameVal]   = useState(project.name)
  const [noteVal, setNoteVal]   = useState(project.note || '')

  const load = useCallback(async () => {
    setLoading(true)
    const res = await api.ccGetCopies(project.id)
    if (res.ok) {
      setSites((res.site_codes || []).map(c => SITE_MAP[c]).filter(Boolean))
      const cm = {}
      res.copies.forEach(c => { cm[`${c.site_code}__${c.row_index}`] = c.copy_text || '' })
      setCells(cm)
      const maxRow = res.copies.reduce((m, c) => Math.max(m, c.row_index), 0)
      setRowCount(Math.max(maxRow, 5))
    }
    setLoading(false)
  }, [project.id])

  useEffect(() => { load() }, [load])

  const addSite = s => setSites(prev => [...prev, s])
  const removeSite = code => {
    setSites(prev => prev.filter(s => s.code !== code))
    setPasteInputs(prev => { const n = { ...prev }; delete n[code]; return n })
    setCells(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(code + '__'))))
  }

  // 열 붙여넣기: 줄바꿈 → 각 행으로 분배
  const handlePaste = (code, raw) => {
    setPasteInputs(prev => ({ ...prev, [code]: raw }))
    const lines = raw.split(/\r?\n/)  // 빈 줄도 행으로 인식 (빈 셀 지원)
    const needed = Math.max(lines.length, rowCount)
    setRowCount(needed)
    setCells(prev => {
      const next = { ...prev }
      lines.forEach((text, i) => { next[`${code}__${i + 1}`] = text })
      return next
    })
  }

  const handleCellChange = (code, ri, text) =>
    setCells(prev => ({ ...prev, [`${code}__${ri}`]: text }))

  const handleSave = async () => {
    setSaving(true); setMsg('')
    const allCells = []
    for (let ri = 1; ri <= rowCount; ri++) {
      sites.forEach(s => {
        const text = cells[`${s.code}__${ri}`] ?? ''
        if (text.trim()) allCells.push({ site_code: s.code, row_index: ri, copy_text: text })
      })
    }
    const res = await api.ccSaveCopies(project.id, { site_codes: sites.map(s => s.code), cells: allCells })
    setSaving(false)
    if (res.ok) { setMsg('✅ 저장 완료'); onUpdated(); setTimeout(() => setMsg(''), 2000) }
    else setMsg('❌ 저장 실패: ' + res.message)
  }

  const handleRename = async () => {
    if (!nameVal.trim()) return
    await api.ccUpdateProject(project.id, { name: nameVal.trim(), note: noteVal, site_codes: sites.map(s => s.code) })
    setEditName(false); onUpdated()
  }

  const getBadges  = (code, ri) => detectBadges(cells[`${code}__${ri}`] || '', code, products)
  
  const getSvcIssues  = (code, ri) =>
    detectServiceIssues(cells[`${code}__${ri}`] || '', code)
  const getColIssues = code => {
    let n = 0
    for (let ri = 1; ri <= rowCount; ri++) {
      n += getBadges(code, ri).length
      n += getSvcIssues(code, ri).length
    }
    return n
  }
  if (loading) return <div className="loading" style={{ padding: 40 }}>불러오는 중...</div>

  const rows = Array.from({ length: rowCount }, (_, i) => i + 1)

  return (
    <div className="pj-detail">
      {/* 헤더 */}
      <div className="pj-detail-header">
        <button className="pj-back-btn" onClick={onBack}>← 프로젝트 목록</button>
        <div className="pj-detail-title-row">
          {editName ? (
            <div className="pj-rename-row">
              <input className="form-input" value={nameVal} onChange={e => setNameVal(e.target.value)}
                style={{ fontSize: 15, fontWeight: 700, width: 240 }} />
              <input className="form-input" value={noteVal} onChange={e => setNoteVal(e.target.value)}
                placeholder="메모 (선택)" style={{ fontSize: 13, width: 180 }} />
              <button className="act-btn act-save" onClick={handleRename}>저장</button>
              <button className="act-btn act-cancel" onClick={() => setEditName(false)}>취소</button>
            </div>
          ) : (
            <div className="pj-title-info">
              <span className="pj-detail-name">{project.name}</span>
              {project.note && <span className="pj-detail-note">{project.note}</span>}
              <button className="act-btn act-edit" onClick={() => setEditName(true)}>✏ 이름 수정</button>
            </div>
          )}
        </div>
      </div>

      {msg && <div className={msg.startsWith('✅') ? 'success-banner' : 'error-banner'}>{msg}</div>}

     

      {/* ── DNT 검증 패널 ── */}
      <DntPanel projectId={project.id} sites={sites} cells={cells} products={products} onAddSite={addSite} />
      {/* <SiteDropdown excludeCodes={sites.map(s => s.code)} onAdd={addSite} label="+ 국가 추가" /> */}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── DNT 검증 패널 (ProjectDetail 내부) ───────────────────────
// ════════════════════════════════════════════════════════════════
function DntPanel({ projectId, sites: propSites, cells, products, onAddSite }) {
  const { user } = useAuth()
  const [dntSites, setDntSites]   = useState([])   // DntPanel 전용 검증 국가
  const [enRaw, setEnRaw]         = useState('')
  const [locals, setLocals]       = useState({})
  const [result, setResult]       = useState(null)
  const [showLocal, setShowLocal] = useState(false)
  const [snapshots, setSnapshots] = useState([])
  const [snapLoading, setSnapLoading] = useState(false)
  const [saving, setSaving]       = useState(false)
  const [saveMsg, setSaveMsg]     = useState('')
  const [expandedSnap, setExpandedSnap] = useState(null)
  const localSaveTimer = useRef(null)
  const initialized = useRef(false)

  const enLines = enRaw.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l !== '')

  // 스냅샷 목록 로드 + 최근 스냅샷으로 전체 상태 복원
  const loadSnapshots = useCallback(async () => {
    setSnapLoading(true)
    try {
      const res = await api.ccGetDNT(projectId)
      if (res.ok) {
        setSnapshots(res.data)
        // 최초 1회만 복원 (사용자가 수정 중인 상태를 덮어쓰지 않음)
        if (res.data?.length && !initialized.current) {
          initialized.current = true
          const latest = res.data[0]
          // 영문 복원
          setEnRaw(latest.en_raw || '')
          // 검증 국가 복원
          try {
            const codes = typeof latest.site_codes === 'string'
              ? JSON.parse(latest.site_codes)
              : (latest.site_codes || [])
            const restored = codes.map(c => SITE_MAP[c]).filter(Boolean)
            if (restored.length) setDntSites(restored)
          } catch (_) {}
          // 분석 결과 복원
          try {
            const parsed = JSON.parse(latest.result_json || 'null')
            if (parsed) setResult(parsed)
          } catch (_) {}
          // 로컬어 복원
          try {
            const locs = JSON.parse(latest.locals_json || 'null')
            if (locs) setLocals(locs)
          } catch (_) {}
        }
      }
    } catch (_) {}
    setSnapLoading(false)
  }, [projectId])

  useEffect(() => { loadSnapshots() }, [loadSnapshots])

  // 프로젝트 셀에서 첫 번째 EN 컬럼 자동 추출 (EN 열이 있으면 채워줌)
  // const autoFillEN = () => {
  //   if (sites.length === 0) return
  //   const s = sites[0]
  //   const maxRow = Object.keys(cells)
  //     .filter(k => k.startsWith(s.code + '__'))
  //     .reduce((m, k) => Math.max(m, parseInt(k.split('__')[1])), 0)
  //   const lines = []
  //   for (let ri = 1; ri <= maxRow; ri++) {
  //     lines.push(cells[`${s.code}__${ri}`] || '')
  //   }
  //   setEnRaw(lines.join('\n'))
  //   setResult(null)
  // }

  // 영문 DNT 분석
const runAnalysis = async () => {
  const rows = enLines.map((en, i) => {
    const byCountry = {}
    let totalDNT = 0
    dntSites.forEach(s => {
      const badges = detectBadges(en, s.code, products)
      const serviceIssues = detectServiceIssues(en, s.code)       // ✅ 추가
      byCountry[s.code] = { badges, serviceIssues }               // ✅ 구조 변경
      totalDNT += badges.length + serviceIssues.length            // ✅ 합산
    })
    return { index: i + 1, en, byCountry, totalDNT }
  })
  const filtered = rows.filter(r => r.totalDNT > 0)
  const grandTotal = rows.reduce((a, r) => a + r.totalDNT, 0)
  const enCountByCountry = {}
  dntSites.forEach(s => {
    enCountByCountry[s.code] = rows.reduce((a, r) => {
      const cell = r.byCountry[s.code]
      return a + (cell?.badges?.length || 0) + (cell?.serviceIssues?.length || 0)
    }, 0)
  })
  const newResult = { rows, filtered, skipped: rows.length - filtered.length, grandTotal, enCountByCountry, sites: [...dntSites] }
    setResult(newResult)
    setShowLocal(false)
    setSaving(true); setSaveMsg('')
    try {
      const res = await api.ccSaveDNT(projectId, {
        enRaw,
        siteCodes: dntSites.map(s => s.code),
        resultJson: JSON.stringify(newResult),
        localsJson: Object.keys(locals).length ? JSON.stringify(locals) : null,
        savedBy: user?.name || user?.email || null,
      })
      if (res.ok) {
        setSaveMsg('✅ 저장 완료')
        await loadSnapshots()
        setTimeout(() => setSaveMsg(''), 2000)
      } else setSaveMsg('❌ ' + res.message)
    } finally { setSaving(false) }
  }

  // 로컬어 DNT 비교
  const getLocalComparisons = () => (result?.sites || []).map(s => {
    const localLines = (locals[s.code] || '').split(/\r?\n/).map(l => l.trimEnd())
    const rowComparisons = enLines.map((en, i) => {
      const local = localLines[i] || ''
      const enDNT = detectBadges(en, s.code, products)
      const lcDNT = detectBadges(local, s.code, products)
      return { index: i + 1, en, local, enDNT, lcDNT, match: enDNT.length === lcDNT.length }
    })
    const enTotal = rowComparisons.reduce((a, r) => a + r.enDNT.length, 0)
    const lcTotal = rowComparisons.reduce((a, r) => a + r.lcDNT.length, 0)
    return { site: s, rowComparisons, enTotal, lcTotal, allMatch: enTotal === lcTotal }
  })

  const localComparisons = showLocal ? getLocalComparisons() : []
  const allMatch = localComparisons.length > 0 && localComparisons.every(c => c.allMatch)

  // 스냅샷 저장
  const handleSave = async () => {
    if (!result) return
    setSaving(true); setSaveMsg('')
    try {
      const res = await api.ccSaveDNT(projectId, {
        enRaw,
        siteCodes: dntSites.map(s => s.code),
        resultJson: JSON.stringify(result),
        localsJson: Object.keys(locals).length ? JSON.stringify(locals) : null,
        savedBy: user?.name || user?.email || null,
      })
      if (res.ok) {
        setSaveMsg('✅ 저장 완료')
        await loadSnapshots()
        setTimeout(() => setSaveMsg(''), 2000)
      } else setSaveMsg('❌ ' + res.message)
    } finally { setSaving(false) }
  }

  const handleDeleteSnap = async (id) => {
    if (!window.confirm('이 스냅샷을 삭제하시겠습니까?')) return
    await api.ccDeleteDNT(projectId, id)
    loadSnapshots()
  }

  const fmt = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  return (
    <div className="dnt-panel-wrap">
              <div className="dnt-panel-body">

          {/* ── Step 1: 영문 ── */}
          <div className="dnt-section">
            <div className="dnt-section-title">
              <span className="mg-step">1</span>영문 원본 카피
              {/* {sites.length > 0 && (
                <button className="btn-sm" style={{ marginLeft: 10 }} onClick={autoFillEN}>
                  ↑ {sites[0]?.code} 열에서 가져오기
                </button>
              )} */}
            </div>
            <textarea className="paste-area dnt-en-area" value={enRaw}
              onChange={e => { setEnRaw(e.target.value); setResult(null) }}
              placeholder={"영문 카피를 한 줄씩 입력\n\n예:\nFind Your Galaxy\nPerformance"} />
            <div className="input-hint">{enLines.length > 0 ? `${enLines.length}행` : '한 줄 = 카피 1개'}</div>
          </div>

          {/* ── Step 2: 검증 국가 ── */}
          <div className="dnt-section">
            <div className="dnt-section-title">
              <span className="mg-step">2</span>검증 국가
            </div>
            <div className="dnt-site-chips">
              {dntSites.map(s => (
                <span key={s.code} className="dnt-chip"
                  style={{ borderColor: RC[s.region], color: RC[s.region], background: RB[s.region] }}>
                  {s.flag} {s.code}
                  <button className="dnt-chip-remove"
                    onClick={() => setDntSites(prev => prev.filter(x => x.code !== s.code))}>✕</button>
                </span>
              ))}
              <SiteDropdown
                excludeCodes={dntSites.map(s => s.code)}
                onAdd={s => setDntSites(prev => [...prev, s])}
                label="+ 국가 추가" />
            </div>
          </div>

          {/* ── 실행 ── */}
          <div className="action-row" style={{ marginBottom: 20 }}>
            <button className="btn-primary"
              disabled={!enLines.length || !dntSites.length}
              onClick={runAnalysis}>🔍 DNT 분석 실행</button>
            {result && (
              <>
                <span className={`cc-badge-count ${result.grandTotal > 0 ? 'has-issue' : 'no-issue'}`}>
                  {result.grandTotal > 0
                    ? `⚠ DNT ${result.grandTotal}건 — ${result.skipped}행 자동 생략`
                    : `✓ DNT 없음 (전체 ${enLines.length}행)`}
                </span>
                {saveMsg && <span className={saveMsg.startsWith('✅') ? 'form-ok' : 'form-err'}>{saveMsg}</span>}
              </>
            )}
          </div>

          {/* ── Step 3: 분석 결과 ── */}
          {result && (
            <div className="dnt-result-wrap">
              <div className="dnt-summary-row">
                {result.sites.map(s => (
                  <div key={s.code} className="dnt-summary-chip"
                    style={{ borderColor: RC[s.region], background: RB[s.region] }}>
                    <span>{s.flag}</span>
                    <span className="dnt-summary-code" style={{ color: RC[s.region] }}>{s.code}</span>
                    <span className={`dnt-summary-count ${result.enCountByCountry[s.code] > 0 ? 'has-issue' : 'no-issue'}`}>
                      {result.enCountByCountry[s.code] > 0 ? `⚠ ${result.enCountByCountry[s.code]}건` : '✓'}
                    </span>
                  </div>
                ))}
              </div>

              {result.filtered.length === 0 ? (
                <div className="empty-state" style={{ padding: '24px 0' }}>
                  <div className="empty-icon">✅</div>
                  <p>선택한 모든 국가에서 DNT 없음</p>
                </div>
              ) : (
                <div className="cc-table-wrap">
                  <div className="dnt-table-label">
                    DNT 발생 {result.filtered.length}행 — 나머지 {result.skipped}행 자동 생략
                  </div>
                  <table className="cc-table">
                    <thead>
                      <tr>
                        <th className="cc-th cc-th-idx">#</th>
                        <th className="cc-th" style={{ minWidth: 180 }}>영문 원본</th>
                        {result.sites.map(s => (
                          <th key={s.code} className="cc-th cc-th-country"
                            style={{ borderTop: `3px solid ${RC[s.region]}` }}>
                            <div className="cc-th-inner">
                              <span className="cc-flag">{s.flag}</span>
                              <span className="cc-card-code" style={{ background: RB[s.region], color: RC[s.region] }}>{s.code}</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.filtered.map(row => (
                        <tr key={row.index} className="cc-row-issue">
                          <td className="cc-td cc-td-idx">{row.index}</td>
                          <td className="cc-td dnt-td-en">{row.en}</td>
                          
                          {result.sites.map(s => {
                            const cell = row.byCountry[s.code]
                            const badges = cell?.badges ?? (Array.isArray(cell) ? cell : [])
                            const serviceIssues = cell?.serviceIssues ?? []
                            const hasIssue = badges.length > 0 || serviceIssues.length > 0
                            return (
                              <td key={s.code}
                                className={`cc-td cc-td-cell ${hasIssue ? 'cc-cell-issue' : ''}`}>
                                {!hasIssue
                                  ? <span style={{ color: '#10b981', fontSize: 12 }}>✓</span>
                                  : <>
                                      {badges.map(b => (
                                        <div key={b} className="cc-launch-badge">⚠ {b}</div>
                                      ))}
                                      <ServiceIssueBadges issues={serviceIssues} />   {/* ✅ 서비스 배지 추가 */}
                                    </>
                                }
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* ── Step 4: 번역 완료 후 로컬어 비교 ── */}
              <div className="dnt-local-section">
                <button className="btn-ghost dnt-local-toggle"
                  onClick={() => setShowLocal(v => !v)}>
                  {showLocal ? '▲ 번역 비교 닫기' : '▼ 번역 완료 후 로컬어 DNT 비교'}
                </button>

                {showLocal && (
                  <div style={{ marginTop: 16 }}>
                    <p className="input-hint" style={{ marginBottom: 12 }}>
                      번역된 로컬어를 국가별로 붙여넣으세요. 영문 DNT 개수와 일치해야 합니다.
                    </p>
                    <div className="cc-cards-grid" style={{ marginBottom: 16 }}>
                      {result.sites.map(s => {
                        const lc = localComparisons.find(c => c.site.code === s.code)
                        return (
                          <div key={s.code} className="cc-card" style={{ borderTopColor: RC[s.region] }}>
                            <div className="cc-card-header">
                              <span className="cc-flag">{s.flag}</span>
                              <div className="cc-card-title">
                                <span className="cc-card-name">{s.name}</span>
                                <span className="cc-card-code" style={{ background: RB[s.region], color: RC[s.region] }}>{s.code}</span>
                              </div>
                              {lc && locals[s.code] && (
                                <span className={`cc-badge-count ${lc.allMatch ? 'no-issue' : 'has-issue'}`} style={{ fontSize: 11 }}>
                                  {lc.allMatch ? '✓ 일치' : `⚠ EN:${lc.enTotal} Local:${lc.lcTotal}`}
                                </span>
                              )}
                            </div>
                            <textarea className="paste-area" style={{ height: 100 }}
                              value={locals[s.code] || ''}
                              onChange={e => {
                                const val = e.target.value
                                const newLocals = { ...locals, [s.code]: val }
                                setLocals(newLocals)
                                // debounce 자동저장 (1.2초)
                                clearTimeout(localSaveTimer.current)
                                localSaveTimer.current = setTimeout(async () => {
                                  if (!result) return
                                  try {
                                    await api.ccSaveDNT(projectId, {
                                      enRaw,
                                      siteCodes: result.sites?.map(s => s.code) || [],
                                      resultJson: JSON.stringify(result),
                                      localsJson: JSON.stringify(newLocals),
                                      savedBy: user?.name || user?.email || null,
                                    })
                                    await loadSnapshots()
                                  } catch (_) {}
                                }, 1200)
                              }}
                              placeholder={`${s.flag} ${s.name}\n로컬어 번역 붙여넣기`} />
                          </div>
                        )
                      })}
                    </div>

                    {Object.keys(locals).some(k => locals[k].trim()) && (
                      <>
                        <div className={`dnt-match-banner ${allMatch ? 'match' : 'mismatch'}`}>
                          {allMatch
                            ? '✅ 모든 국가에서 DNT 개수 일치 — 로컬어 검증 완료'
                            : '⚠ 일부 국가에서 DNT 개수 불일치 — 하단 상세 확인'}
                        </div>
                        {localComparisons.filter(c => !c.allMatch).map(cmp => (
                          <div key={cmp.site.code} className="dnt-mismatch-detail">
                            <div className="dnt-mismatch-header">
                              {cmp.site.flag} {cmp.site.name} ({cmp.site.code}) — EN: {cmp.enTotal}건 / Local: {cmp.lcTotal}건
                            </div>
                            <div className="cc-table-wrap">
                              <table className="cc-table">
                                <thead>
                                  <tr>
                                    <th className="cc-th cc-th-idx">#</th>
                                    <th className="cc-th">영문</th>
                                    <th className="cc-th">로컬어</th>
                                    <th className="cc-th" style={{ width: 90 }}>EN DNT</th>
                                    <th className="cc-th" style={{ width: 90 }}>Local DNT</th>
                                    <th className="cc-th" style={{ width: 40 }}>결과</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {cmp.rowComparisons.filter(r => !r.match || r.enDNT.length > 0).map(r => (
                                    <tr key={r.index} className={!r.match ? 'cc-row-issue' : ''}>
                                      <td className="cc-td cc-td-idx">{r.index}</td>
                                      <td className="cc-td" style={{ fontSize: 12 }}>{r.en}</td>
                                      <td className="cc-td" style={{ fontSize: 12 }}>{r.local || <em className="empty-val">없음</em>}</td>
                                      <td className="cc-td">{r.enDNT.length ? r.enDNT.map(b => <div key={b} className="cc-launch-badge" style={{ fontSize: 10 }}>⚠ {b}</div>) : <span style={{ color: '#10b981' }}>✓</span>}</td>
                                      <td className="cc-td">{r.lcDNT.length ? r.lcDNT.map(b => <div key={b} className="cc-launch-badge" style={{ fontSize: 10 }}>⚠ {b}</div>) : <span style={{ color: '#10b981' }}>✓</span>}</td>
                                      <td className="cc-td" style={{ textAlign: 'center' }}>{r.match ? <span style={{ color: '#10b981' }}>✓</span> : <span style={{ color: '#ef4444' }}>✗</span>}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 저장된 스냅샷 목록 ── */}
          

        </div>
          </div>
  )
}
// ════════════════════════════════════════════════════════════════
// 국가 히스토리 드로어 (변경된 내용만 추려서 표시)
// ════════════════════════════════════════════════════════════════
function CountryHistoryDrawer({ projectId, country, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!country.dbId) { setLoading(false); return }
    api.mergeGetCountryHistory(projectId, country.dbId)
      .then(res => { if (res.ok) setHistory(res.data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId, country.dbId])

  const fmt = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const parseSafe = (json) => {
    if (!json) return []
    if (typeof json !== 'string') return json
    try { return JSON.parse(json) } catch { return [] }
  }

  return (
    <div className="mg-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mg-drawer">
        <div className="mg-drawer-header">
          <span className="mg-drawer-title">📋 {country.label} — 수정 히스토리</span>
          <button className="cc-remove-btn" onClick={onClose} style={{ fontSize: 18 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>불러오는 중...</div>
        ) : history.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-icon">📭</div>
            <p>아직 수정 이력이 없습니다.</p>
            <small>Merge를 재실행하면 이전 버전이 여기에 기록됩니다.</small>
          </div>
        ) : (
          <div className="mg-history-list">
            {history.map((h, i) => {
              const currentMapped = parseSafe(h.mapped_json)
              const prevMapped = i < history.length - 1 ? parseSafe(history[i+1].mapped_json) : []

              // 원본 인덱스(ri + 1)를 기억해두고, 변경되거나 누락된 행만 필터링합니다.
              const changedRows = currentMapped.map((row, ri) => {
                const prevRow = prevMapped[ri] || {}
                const isChanged = prevRow.local !== undefined && prevRow.local !== row.local
                return { 
                  ...row, 
                  originalIndex: ri + 1, 
                  prevLocal: prevRow.local, 
                  isChanged 
                }
              }).filter(row => row.isChanged || row.missing)

              return (
                <div key={h.id} className="mg-history-item">
                  <div className="mg-history-meta" onClick={() => setExpanded(expanded === i ? null : i)}>
                    <span className="mg-history-ver">v{history.length - i}</span>
                    
                    {/* 💡 작성자 정보 추가 영역 */}
                    <span 
                      className="mg-history-author" 
                      title={h.saved_by_email ? `이메일: ${h.saved_by_email}` : ''}
                      style={{ color: '#3b82f6', fontWeight: 600, fontSize: 13, marginRight: 8, cursor: h.saved_by_email ? 'help' : 'default' }}
                    >
                      👤 {h.saved_by || '알 수 없음'}
                    </span>
                    {/* ────────────────── */}

                    <span className="mg-history-date">{fmt(h.saved_at)}</span>
                    <span className="mg-history-rows">
                      {changedRows.length > 0 ? `변경 ${changedRows.length}건` : '변경 없음'}
                    </span>
                    <span className="mg-history-toggle">{expanded === i ? '▲ 접기' : '▼ 펼치기'}</span>
                  </div>

                  {expanded === i && (
                    <div className="mg-history-body">
                      <div className="mg-history-table-wrap">
                        {changedRows.length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px', background: '#f9fafb', borderRadius: '6px' }}>
                            이전 버전과 비교하여 변경된 카피가 없습니다.
                          </div>
                        ) : (
                          <table className="mg-history-table">
                            <thead>
                              <tr>
                                <th style={{ width: 36 }}>#</th>
                                <th style={{ width: '30%' }}>EN</th>
                                <th>{h.label || country.label} (수정된 내역만)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changedRows.map((row, idx) => (
                                <tr key={idx} className={row.missing ? 'mg-cell-missing' : 'mg-cell-changed'}>
                                  <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, fontWeight: 'bold' }}>
                                    {row.originalIndex}
                                  </td>
                                  <td className="mg-history-en">{row.en}</td>
                                  <td className="mg-history-local">
                                    {row.missing ? (
                                      <span className="mg-missing-badge">⚠ 매핑 없음</span>
                                    ) : (
                                      <div className="mg-diff-view">
                                        <div className="mg-diff-old">
                                          <span className="mg-diff-label">AS-WAS:</span> 
                                          <del>{row.prevLocal || <em className="empty-val">빈 값</em>}</del>
                                        </div>
                                        <div className="mg-diff-new">
                                          <span className="mg-diff-label">TO-BE:</span> 
                                          <ins>{row.local || <em className="empty-val">빈 값</em>}</ins>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
                      
                      {h.raw_paste && (
                        <details style={{ marginTop: 10 }}>
                          <summary style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>원본 컨펌 카피 보기 (Raw Paste)</summary>
                          <pre className="mg-history-raw">{h.raw_paste}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 프로젝트 목록 ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
function ProjectManager({ products }) {
  const { user } = useAuth()
  const [projects, setProjects]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem('country_selected_project_id'))
  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName]     = useState('')
  const [newNote, setNewNote]     = useState('')
  const [creating, setCreating]   = useState(false)
  const [msg, setMsg]             = useState('')
  const [search, setSearch]       = useState('')

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
    const res = await api.ccCreateProject({ name: newName.trim(), note: newNote, site_codes: [] })
    setCreating(false)
    if (res.ok) { setNewName(''); setNewNote(''); setShowCreate(false); setMsg(''); await load(); setSelectedId(res.id); localStorage.setItem('country_selected_project_id', res.id) }
    else setMsg('❌ ' + res.message)
  }

  const handleDelete = async (id, name, e) => {
    e.stopPropagation()
    if (user?.position !== 'regular') { alert('정규직만 프로젝트를 삭제할 수 있습니다.'); return }
    if (!window.confirm(`"${name}" 프로젝트를 삭제하시겠습니까?\n저장된 카피 데이터도 모두 삭제됩니다.`)) return
    await api.ccDeleteProject(id)
    if (selectedId === id) { setSelectedId(null); localStorage.removeItem('country_selected_project_id') }
    load()
  }

  // 복원된 id가 실제 목록에 없으면 무시
  useEffect(() => {
    if (projects.length > 0 && selectedId && !projects.find(p => String(p.id) === String(selectedId))) {
      setSelectedId(null)
      localStorage.removeItem('country_selected_project_id')
    }
  }, [projects, selectedId])

  const selected = projects.find(p => String(p.id) === String(selectedId))

  if (selected) {
    return (
      <ProjectDetail project={selected} products={products}
        onBack={() => { setSelectedId(null); localStorage.removeItem('country_selected_project_id') }} onUpdated={load} />
    )
  }

  const filtered = projects.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="pj-manager">
      <div className="pj-list-header">
        <div className="pj-list-title-row">
          <span className="pj-list-title">프로젝트 목록</span>
          <span className="cc-status-text">{projects.length}개</span>
        </div>
        <div className="pj-list-actions">
          <input className="form-input" placeholder="프로젝트 검색" value={search}
            onChange={e => setSearch(e.target.value)} style={{ fontSize: 13, width: 200 }} />
          <button className="btn-primary" onClick={() => setShowCreate(v => !v)}>
            {showCreate ? '취소' : '+ 새 프로젝트'}
          </button>
        </div>
      </div>

      {showCreate && (
        <div className="pj-create-form">
          <input className="form-input" placeholder="페이지/프로젝트명 *" value={newName}
            onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleCreate()}
            style={{ flex: 1 }} />
          <input className="form-input" placeholder="메모 (선택)" value={newNote}
            onChange={e => setNewNote(e.target.value)} style={{ width: 200 }} />
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? '생성 중...' : '생성'}
          </button>
          {msg && <span className="form-err">{msg}</span>}
        </div>
      )}

      {loading && <div className="loading" style={{ padding: 40 }}>불러오는 중...</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-icon">📁</div>
          <p>{projects.length === 0 ? '아직 프로젝트가 없습니다.' : '검색 결과 없음'}</p>
          {projects.length === 0 && <small>"+ 새 프로젝트"로 시작해보세요.</small>}
        </div>
      )}
      <div className="pj-grid">
        {filtered.map(p => (
          <div key={p.id} className="pj-card" onClick={() => { setSelectedId(p.id); localStorage.setItem('country_selected_project_id', p.id) }}>
            <div className="pj-card-header">
              <span className="pj-card-name">{p.name}</span>
              {user?.position === 'regular' && (
                <button className="act-btn act-delete" style={{ padding: '2px 7px' }}
                  onClick={e => handleDelete(p.id, p.name, e)}>🗑</button>
              )}
            </div>
            {p.note && <div className="pj-card-note">{p.note}</div>}
            <div className="pj-card-meta">
              <span>{p.country_count || 0}개국</span>
              <span>·</span>
              <span>{p.max_row || 0}행</span>
              <span>·</span>
              <span>{(p.updated_at || p.created_at || '').slice(0, 10)}</span>
            </div>
            <div className="pj-card-arrow">열기 →</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// ── 제품 관리 패널 ─────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════


// ── 제품 출시여부 수정 히스토리 드로어 ──────────────────────────
function ProductHistoryDrawer({ product, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.getProductHistory(product.id).then(res => {
      if (res.ok) setHistory(res.data)
      setLoading(false)
    })
  }, [product.id])

  const fmt = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const FIELD_LABEL = {
    excluded_countries: '미출시 국가',
    name:    '제품명',
    aliases: '감지 키워드',
  }

  const renderDiff = (field, asWas, toBe) => {
    if (field === 'excluded_countries') {
      const before = asWas ? JSON.parse(asWas) : []
      const after  = toBe  ? JSON.parse(toBe)  : []
      const added   = after.filter(c => !before.includes(c))   // 미출시 추가
      const removed = before.filter(c => !after.includes(c))   // 미출시 해제(출시로 전환)
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
          {removed.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, minWidth: 60 }}>출시 전환</span>
              {removed.map(c => <span key={c} style={{ fontSize: 11, background: '#dcfce7', color: '#166534', borderRadius: 4, padding: '1px 6px', border: '1px solid #bbf7d0' }}>{c}</span>)}
            </div>
          )}
          {added.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, minWidth: 60 }}>미출시 추가</span>
              {added.map(c => <span key={c} style={{ fontSize: 11, background: '#fee2e2', color: '#b91c1c', borderRadius: 4, padding: '1px 6px', border: '1px solid #fecaca' }}>{c}</span>)}
            </div>
          )}
        </div>
      )
    }
    // 일반 텍스트 diff
    return (
      <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600, minWidth: 40 }}>이전</span>
          <span style={{ fontSize: 12, color: '#374151', background: '#fee2e2', borderRadius: 4, padding: '2px 8px', textDecoration: 'line-through' }}>{asWas || '(없음)'}</span>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
          <span style={{ fontSize: 11, color: '#10b981', fontWeight: 600, minWidth: 40 }}>이후</span>
          <span style={{ fontSize: 12, color: '#374151', background: '#dcfce7', borderRadius: 4, padding: '2px 8px' }}>{toBe || '(없음)'}</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div style={{ width: 480, maxWidth: '95vw', background: '#fff', height: '100%', overflowY: 'auto', boxShadow: '-4px 0 24px rgba(0,0,0,0.12)', display: 'flex', flexDirection: 'column' }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', background: '#f8fafc' }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📋 수정 히스토리</div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>{product.name}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af', lineHeight: 1 }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, padding: '16px 24px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>불러오는 중...</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>
              수정 이력이 없습니다.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {history.map((h, i) => (
                <div key={h.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '12px 16px' }}>
                  {/* 메타 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, background: '#e0e7ff', color: '#4f46e5', borderRadius: 4, padding: '2px 8px', fontWeight: 600 }}>
                      {FIELD_LABEL[h.field] || h.field}
                    </span>
                    <span style={{ fontSize: 11, color: '#64748b' }}>
                      👤 {h.changed_by || '알 수 없음'}
                    </span>
                    <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
                      {fmt(h.changed_at)}
                    </span>
                  </div>
                  {/* diff */}
                  {renderDiff(h.field, h.as_was, h.to_be)}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductPanel({ onClose, onProductsChanged }) {
  const { user } = useAuth()
  const [products, setProducts]   = useState([])
  const [loading, setLoading]     = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [formData, setFormData]   = useState({ name: '', aliases: '', excluded_countries: [] })
  const [msg, setMsg]             = useState('')
  const [saving, setSaving]       = useState(false)
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [historyProduct, setHistoryProduct] = useState(null)

  const load = async () => {
    setLoading(true)
    const res = await api.getProducts()
    if (res.ok) setProducts(res.data)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const openNew  = ()  => { setFormData({ name: '', aliases: '', excluded_countries: [] }); setMsg(''); setEditingId('new') }
  const openEdit = p   => { setFormData({ name: p.name, aliases: (p.aliases || []).join('\n'), excluded_countries: p.excluded_countries || [] }); setMsg(''); setEditingId(p.id) }
  const toggleExclude = code => setFormData(prev => ({
    ...prev,
    excluded_countries: prev.excluded_countries.includes(code)
      ? prev.excluded_countries.filter(c => c !== code)
      : [...prev.excluded_countries, code],
  }))

  const handleSave = async () => {
    if (!formData.name.trim()) { setMsg('❌ 제품명을 입력해주세요.'); return }
    setSaving(true)
    const payload = {
      name: formData.name.trim(),
      aliases: formData.aliases.split('\n').map(s => s.trim()).filter(Boolean),
      excluded_countries: formData.excluded_countries,
    }
    const res = editingId === 'new' ? await api.createProduct(payload) : await api.updateProduct(editingId, payload)
    setSaving(false)
    if (res.ok) {
      setMsg(editingId === 'new' ? '✅ 생성 완료' : '✅ 수정 완료')
      await load(); onProductsChanged()
      setTimeout(() => { setMsg(''); setEditingId(null) }, 1200)
    } else setMsg('❌ 실패: ' + res.message)
  }

  const handleDelete = async (id, name) => {
    if (user?.position !== 'regular') { alert('정규직만 제품을 삭제할 수 있습니다.'); return }
    if (!window.confirm(`"${name}"을(를) 삭제하시겠습니까?`)) return
    const res = await api.deleteProduct(id)
    if (res.ok) { await load(); onProductsChanged() }
    else setMsg('❌ 삭제 실패: ' + res.message)
  }

  const sitesByRegion = Object.fromEntries(REGIONS.map(r => [r, ALL_SITES.filter(s => s.region === r)]))
  const filteredRegions = regionFilter === 'ALL' ? REGIONS : [regionFilter]

  return (
    <div className="product-panel-overlay" onClick={onClose}>
      <div className="product-panel" onClick={e => e.stopPropagation()}>
        {historyProduct && (
          <ProductHistoryDrawer product={historyProduct} onClose={() => setHistoryProduct(null)} />
        )}
        <div className="pp-header">
          <div className="pp-title-row">
            {editingId !== null
              ? <button className="pp-back-btn" onClick={() => setEditingId(null)}>← 목록</button>
              : <span className="pp-title">제품 데이터 관리</span>}
            <button className="pp-close-btn" onClick={onClose}>✕</button>
          </div>
          {editingId === null && <div className="pp-subtitle">{products.length}종 등록됨</div>}
        </div>
        {msg && <div className={`pp-msg ${msg.startsWith('✅') ? 'pp-ok' : 'pp-err'}`}>{msg}</div>}

        {editingId === null && (
          <div className="pp-body">
            <button className="btn-primary pp-new-btn" onClick={openNew}>+ 새 제품 추가</button>
            {loading && <div className="loading">불러오는 중...</div>}
            <div className="pp-list">
              {products.map(p => (
                <div key={p.id} className="pp-item">
                  <div className="pp-item-info">
                    <div className="pp-item-name">{p.name}</div>
                    <div className="pp-item-aliases">{(p.aliases || []).join(' · ')}</div>
                    <div className="pp-item-excluded">
                      {(p.excluded_countries || []).length === 0
                        ? <span className="pp-all-launch">전 국가 출시</span>
                        : <><span className="pp-excl-label">미출시 {p.excluded_countries.length}개국: </span>
                            {p.excluded_countries.map(c => <span key={c} className="pp-excl-tag">{c}</span>)}</>}
                    </div>
                  </div>
                  <div className="pp-item-actions">
                    <button className="act-btn" style={{ color: '#6366f1', borderColor: '#6366f1' }} onClick={() => setHistoryProduct(p)}>📋 이력</button>
                    <button className="act-btn act-edit" onClick={() => openEdit(p)}>✏ 수정</button>
                    {user?.position === 'regular' && (
                      <button className="act-btn act-delete" onClick={() => handleDelete(p.id, p.name)}>🗑</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {editingId !== null && (
          <div className="pp-body pp-form-body">
            <div className="pp-form-title">{editingId === 'new' ? '새 제품 추가' : '제품 수정'}</div>
            <div className="form-row" style={{ gridTemplateColumns: '100px 1fr' }}>
              <label className="form-label">제품명 *</label>
              <input className="form-input" placeholder="예: Galaxy S27 Ultra" value={formData.name}
                onChange={e => setFormData(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="form-row" style={{ gridTemplateColumns: '100px 1fr' }}>
              <label className="form-label" style={{ paddingTop: 4 }}>감지 키워드</label>
              <textarea className="form-input pp-alias-area"
                placeholder={"줄바꿈으로 구분\n예:\nGalaxy S27 Ultra\nS27 Ultra"}
                value={formData.aliases} onChange={e => setFormData(p => ({ ...p, aliases: e.target.value }))} />
            </div>
            <div className="pp-excl-section">
              <div className="pp-excl-header">
                <span className="pp-excl-title">
                  미출시 국가 지정
                  {formData.excluded_countries.length > 0 &&
                    <span className="pp-excl-count">{formData.excluded_countries.length}개국 선택됨</span>}
                </span>
                <div className="pp-excl-hint">선택하지 않은 국가는 모두 <strong>출시</strong>로 처리됩니다.</div>
              </div>
              <div className="pp-region-tabs">
                {['ALL', ...REGIONS].map(r => (
                  <button key={r} className={`cc-region-btn ${regionFilter === r ? 'active' : ''}`}
                    style={regionFilter === r && r !== 'ALL' ? { background: RC[r], color: '#fff' } : {}}
                    onClick={() => setRegionFilter(r)}>{r}</button>
                ))}
                {formData.excluded_countries.length > 0 &&
                  <button className="cc-region-btn pp-clear-btn"
                    onClick={() => setFormData(p => ({ ...p, excluded_countries: [] }))}>전체 해제</button>}
              </div>
              <div className="pp-country-grid">
                {filteredRegions.map(region => (
                  <div key={region} className="pp-region-group">
                    <div className="pp-region-label" style={{ color: RC[region] }}>{region}</div>
                    <div className="pp-country-checks">
                      {sitesByRegion[region].map(s => {
                        const isExcluded = formData.excluded_countries.includes(s.code)
                        return (
                          <label key={s.code} className={`pp-country-check ${isExcluded ? 'pp-check-on' : ''}`}
                            style={isExcluded ? { borderColor: RC[region], background: RB[region] } : {}}>
                            <input type="checkbox" checked={isExcluded} onChange={() => toggleExclude(s.code)}
                              style={{ display: 'none' }} />
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
                {saving ? '저장 중...' : (editingId === 'new' ? '추가하기' : '저장하기')}
              </button>
              <button className="btn-ghost" onClick={() => setEditingId(null)} disabled={saving}>취소</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
// ════════════════════════════════════════════════════════════════
// ── 전체 서비스 변경 이력 드로어 ─────────────────────────────────
const SVC_COLOR = {
  samsungHealth: '#10b981',
  appsServices:  '#3b82f6',
  carePlus:      '#8b5cf6',
  tradeIn:       '#f59e0b',
}
const SVC_LABEL = {
  samsungHealth: 'Samsung Health',
  appsServices:  'Apps & Services',
  carePlus:      'Samsung Care+',
  tradeIn:       'Samsung Trade-in',
}
const FIELD_LABEL = { operated: '운영 여부', text: '표시 텍스트', url: 'URL' }

function ServiceAllHistoryDrawer({ onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [svcFilter, setSvcFilter] = useState('ALL')   // 서비스 필터
  const [search, setSearch]       = useState('')       // 국가 코드/이름 검색

  useEffect(() => {
    api.getServiceAllHistory().then(res => {
      if (res.ok) setHistory(res.data)
      setLoading(false)
    })
  }, [])

  const fmt = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const filtered = history.filter(h => {
    if (svcFilter !== 'ALL' && h.service_key !== svcFilter) return false
    if (search) {
      const q = search.toLowerCase()
      const site = ALL_SITES.find(s => s.code === h.site_code)
      if (!h.site_code.toLowerCase().includes(q) && !site?.name.toLowerCase().includes(q)) return false
    }
    return true
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1100, display: 'flex', justifyContent: 'flex-end' }}
      onClick={onClose}>
      <div style={{ width: 540, maxWidth: '95vw', background: '#fff', height: '100%', display: 'flex', flexDirection: 'column', boxShadow: '-4px 0 24px rgba(0,0,0,0.13)' }}
        onClick={e => e.stopPropagation()}>

        {/* 헤더 */}
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #e5e7eb', background: '#f8fafc', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#1e293b' }}>📋 전체 변경 이력</div>
              <div style={{ fontSize: 12, color: '#6b7280', marginTop: 3 }}>모든 국가의 서비스 운영 수정 내역</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
          </div>
          {/* 필터 */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            {['ALL', ...SERVICE_KEYS.map(s => s.key)].map(k => (
              <button key={k} onClick={() => setSvcFilter(k)}
                style={{
                  fontSize: 11, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  background: svcFilter === k ? (SVC_COLOR[k] || '#334155') : '#f1f5f9',
                  color: svcFilter === k ? '#fff' : '#475569',
                  fontWeight: svcFilter === k ? 600 : 400,
                }}>
                {k === 'ALL' ? '전체' : SVC_LABEL[k]}
              </button>
            ))}
            <input className="form-input" placeholder="국가 검색" value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ fontSize: 11, padding: '3px 8px', width: 110, marginLeft: 4 }} />
          </div>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af' }}>불러오는 중...</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#9ca3af', fontSize: 13 }}>변경 이력이 없습니다.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(h => {
                const site = ALL_SITES.find(s => s.code === h.site_code)
                return (
                  <div key={h.id} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 14px' }}>
                    {/* 메타 행 */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 7 }}>
                      {/* 국가 */}
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600, color: '#1e293b' }}>
                        {site?.flag} {h.site_code}
                        {site && <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 400 }}>({site.name})</span>}
                      </span>
                      {/* 서비스 */}
                      <span style={{ fontSize: 11, background: (SVC_COLOR[h.service_key] || '#94a3b8') + '22', color: SVC_COLOR[h.service_key] || '#64748b', border: `1px solid ${(SVC_COLOR[h.service_key] || '#94a3b8')}55`, borderRadius: 4, padding: '1px 7px', fontWeight: 600 }}>
                        {SVC_LABEL[h.service_key] || h.service_key}
                      </span>
                      {/* 필드 */}
                      <span style={{ fontSize: 11, background: '#f1f5f9', color: '#475569', borderRadius: 4, padding: '1px 6px' }}>
                        {FIELD_LABEL[h.field] || h.field}
                      </span>
                      {/* 수정자 + 시각 */}
                      <span style={{ fontSize: 11, color: '#64748b', marginLeft: 2 }}>👤 {h.changed_by || '알 수 없음'}</span>
                      <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto', whiteSpace: 'nowrap' }}>{fmt(h.changed_at)}</span>
                    </div>
                    {/* diff */}
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 12, background: '#fee2e2', color: '#b91c1c', borderRadius: 4, padding: '2px 8px', textDecoration: 'line-through', wordBreak: 'break-all' }}>{h.as_was ?? '(없음)'}</span>
                      <span style={{ color: '#94a3b8', flexShrink: 0 }}>→</span>
                      <span style={{ fontSize: 12, background: '#dcfce7', color: '#166534', borderRadius: 4, padding: '2px 8px', wordBreak: 'break-all' }}>{h.to_be ?? '(없음)'}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* 푸터 */}
        {!loading && (
          <div style={{ padding: '10px 20px', borderTop: '1px solid #e5e7eb', fontSize: 11, color: '#9ca3af', flexShrink: 0 }}>
            총 {filtered.length}건 표시 중 (전체 {history.length}건)
          </div>
        )}
      </div>
    </div>
  )
}

// ── ServicePanel (서비스 운영 현황 패널) ─────────────────────
// ════════════════════════════════════════════════════════════════
//
// [삽입 위치] ProductPanel 컴포넌트 바로 아래 (CountryTab export 위)
//
// ProductPanel과 동일한 오버레이/패널 구조 사용.
// SERVICE_DATA를 읽기 전용 테이블로 표시.
// ════════════════════════════════════════════════════════════════
 
// ── 서비스 셀 인라인 편집 컴포넌트 ──────────────────────────
function ServiceCellEditor({ siteCode, serviceKey, entry, onSaved }) {
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  // form: { operated, text, url }
  const [form, setForm] = useState({
    operated: !!entry,
    text: entry?.text || '',
    url:  entry?.url  || '',
  })
  const [saving, setSaving] = useState(false)
  const [err, setErr]       = useState('')

  // entry가 바뀌면 form 초기화 (저장 후 리프레시 시)
  useEffect(() => {
    if (!editing) {
      setForm({ operated: !!entry, text: entry?.text || '', url: entry?.url || '' })
    }
  }, [entry, editing])

  const handleOpen = () => {
    setForm({ operated: !!entry, text: entry?.text || '', url: entry?.url || '' })
    setErr('')
    setEditing(true)
  }

  const handleSave = async () => {
    if (form.operated && !form.text.trim()) { setErr('텍스트를 입력해주세요.'); return }
    if (form.operated && !form.url.trim())  { setErr('URL을 입력해주세요.'); return }
    setSaving(true); setErr('')

    // 현재 국가 전체 데이터 읽어서 해당 서비스키만 교체
    const current = SERVICE_DATA[siteCode] || {}
    const payload = {
      samsungHealth: current.samsungHealth || null,
      appsServices:  current.appsServices  || null,
      carePlus:      current.carePlus      || null,
      tradeIn:       current.tradeIn       || null,
      changedBy: user?.name || user?.email || null,
    }
    payload[serviceKey] = form.operated
      ? { text: form.text.trim(), url: form.url.trim() }
      : null

    const res = await api.updateService(siteCode, payload)
    setSaving(false)
    if (res.ok) {
      setEditing(false)
      onSaved()
    } else {
      setErr(res.message || '저장 실패')
    }
  }

  const SVC_COLOR_MAP = {
    samsungHealth: '#10b981', appsServices: '#3b82f6',
    carePlus: '#8b5cf6', tradeIn: '#f59e0b',
  }
  const accentColor = SVC_COLOR_MAP[serviceKey] || '#64748b'

  if (editing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}
        onClick={e => e.stopPropagation()}>
        {/* 운영 여부 토글 */}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', userSelect: 'none' }}>
          <input type="checkbox" checked={form.operated}
            onChange={e => setForm(f => ({ ...f, operated: e.target.checked, text: e.target.checked ? f.text : '', url: e.target.checked ? f.url : '' }))} />
          <span style={{ fontSize: 11, fontWeight: 600, color: form.operated ? accentColor : '#9ca3af' }}>
            {form.operated ? '운영' : '미운영'}
          </span>
        </label>
        {form.operated && (
          <>
            <input
              className="form-input"
              placeholder="표시 텍스트"
              value={form.text}
              onChange={e => setForm(f => ({ ...f, text: e.target.value }))}
              style={{ fontSize: 11, padding: '3px 6px' }}
              autoFocus
            />
            <input
              className="form-input"
              placeholder="/경로/url/"
              value={form.url}
              onChange={e => setForm(f => ({ ...f, url: e.target.value }))}
              style={{ fontSize: 11, padding: '3px 6px', fontFamily: 'monospace' }}
            />
          </>
        )}
        {err && <div style={{ fontSize: 10, color: '#ef4444' }}>{err}</div>}
        <div style={{ display: 'flex', gap: 4, marginTop: 2 }}>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, fontSize: 11, padding: '3px 0', borderRadius: 4, border: 'none',
              background: accentColor, color: '#fff', cursor: 'pointer', fontWeight: 600 }}>
            {saving ? '저장 중' : '저장'}
          </button>
          <button
            onClick={() => setEditing(false)}
            style={{ flex: 1, fontSize: 11, padding: '3px 0', borderRadius: 4,
              border: '1px solid #d1d5db', background: '#fff', color: '#374151', cursor: 'pointer' }}>
            취소
          </button>
        </div>
      </div>
    )
  }

  // 읽기 모드 — 수정 버튼 클릭 시 편집
  return (
    <div style={{ borderRadius: 5, padding: '3px 5px' }}>
      {entry ? (
        <>
          <div style={{ fontWeight: 500, lineHeight: 1.3, marginBottom: 2 }}>{entry.text}</div>
          <div style={{ color: '#6b7280', fontSize: 10, wordBreak: 'break-all', fontFamily: 'monospace',
            background: 'var(--bg-hover, #f3f4f6)', padding: '1px 4px', borderRadius: 3, display: 'inline-block' }}>
            {entry.url}
          </div>
        </>
      ) : (
        <div style={{ color: '#d1d5db', fontSize: 11 }}>
          <span style={{ fontSize: 13 }}>✗</span> 미운영
        </div>
      )}
      <button
        onClick={handleOpen}
        style={{ marginTop: 4, display: 'block', fontSize: 10, padding: '2px 8px', borderRadius: 4,
          border: '1px solid #d1d5db', background: '#f8fafc', color: '#64748b', cursor: 'pointer' }}>
        ✏ 수정
      </button>
    </div>
  )
}

function ServicePanel({ onClose, onShowHistory }) {
  const { user } = useAuth()
  const [regionFilter, setRegionFilter] = useState('ALL')
  const [search, setSearch]             = useState('')
  // 로컬 서비스 데이터 (저장 후 즉시 반영용)
  const [localData, setLocalData]       = useState(() => ({ ...SERVICE_DATA }))
  const [savedMsg, setSavedMsg]         = useState('')

  // 저장 후 호출: 서버에서 최신 데이터 재로드 → setServiceData + localData 갱신
  const reload = useCallback(async () => {
    const res = await api.getServices()
    if (res.ok) {
      setServiceData(res.data)
      setLocalData({ ...res.data })
      setSavedMsg('✅ 저장됨')
      setTimeout(() => setSavedMsg(''), 1800)
    }
  }, [])

  const filteredSites = ALL_SITES.filter(s => {
    if (regionFilter !== 'ALL' && s.region !== regionFilter) return false
    if (search) {
      const q = search.toLowerCase()
      if (!s.code.toLowerCase().includes(q) && !s.name.toLowerCase().includes(q)) return false
    }
    return !!localData[s.code]
  })

  const stats = SERVICE_KEYS.reduce((acc, { key }) => {
    acc[key] = Object.values(localData).filter(d => !d[key]).length
    return acc
  }, {})

  return (
    <div className="product-panel-overlay" onClick={onClose}>
      <div className="product-panel" style={{ maxWidth: 980, width: '94vw' }}
        onClick={e => e.stopPropagation()}>

        {/* ── 헤더 ── */}
        <div className="pp-header">
          <div className="pp-title-row">
            <span className="pp-title">🛎 서비스 운영 현황</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {savedMsg && <span style={{ fontSize: 12, color: '#10b981', fontWeight: 600 }}>{savedMsg}</span>}
              <button onClick={onShowHistory}
                style={{ fontSize: 12, padding: '4px 12px', borderRadius: 6, border: '1px solid #6366f1',
                  background: '#eef2ff', color: '#4f46e5', cursor: 'pointer', fontWeight: 600 }}>
                📋 전체 변경 이력
              </button>
              <button className="pp-close-btn" onClick={onClose}>✕</button>
            </div>
          </div>
          <div className="pp-subtitle" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            {SERVICE_KEYS.map(({ key, label }) => (
              <span key={key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: SVC_COLOR[key] }} />
                {label}
                <span style={{ color: '#ef4444', fontWeight: 600 }}>({stats[key]}개국 미운영)</span>
              </span>
            ))}
          </div>
        </div>

        <div className="pp-body">
          {/* ── 필터 행 ── */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
            <div className="pp-region-tabs" style={{ margin: 0 }}>
              {['ALL', ...REGIONS].map(r => (
                <button key={r}
                  className={`cc-region-btn ${regionFilter === r ? 'active' : ''}`}
                  style={regionFilter === r && r !== 'ALL' ? { background: RC[r], color: '#fff' } : {}}
                  onClick={() => setRegionFilter(r)}>{r}</button>
              ))}
            </div>
            <input className="form-input" placeholder="국가 검색 (코드/이름)" value={search}
              onChange={e => setSearch(e.target.value)} style={{ width: 160, fontSize: 12 }} />
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 4 }}>셀을 클릭하면 수정할 수 있습니다.</span>
          </div>

          {/* ── 서비스 테이블 ── */}
          <div className="cc-table-wrap" style={{ maxHeight: '62vh', overflowY: 'auto' }}>
            <table className="cc-table" style={{ fontSize: 12, tableLayout: 'fixed', width: '100%' }}>
              <colgroup>
                <col style={{ width: 110 }} />
                <col style={{ width: '22%' }} /><col style={{ width: '25%' }} />
                <col style={{ width: '22%' }} /><col style={{ width: '25%' }} />
              </colgroup>
              <thead>
                <tr>
                  <th className="cc-th" style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-card)' }}>국가</th>
                  {SERVICE_KEYS.map(({ key, label }) => (
                    <th key={key} className="cc-th" style={{
                      position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg-card)',
                      borderTop: `3px solid ${SVC_COLOR[key]}`,
                    }}>{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSites.map(s => {
                  const d = localData[s.code]
                  if (!d) return null
                  return (
                    <tr key={s.code}>
                      <td className="cc-td" style={{ verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span className="cc-flag">{s.flag}</span>
                          <span className="cc-card-code" style={{ background: RB[s.region], color: RC[s.region] }}>{s.code}</span>
                        </div>
                        <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{s.name}</div>
                      </td>
                      {SERVICE_KEYS.map(({ key }) => (
                        <td key={key} className="cc-td" style={{ verticalAlign: 'top', padding: '6px 8px' }}>
                          <ServiceCellEditor
                            siteCode={s.code}
                            serviceKey={key}
                            entry={d[key]}
                            onSaved={reload}
                          />
                        </td>
                      ))}
                    </tr>
                  )
                })}
                {filteredSites.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>검색 결과 없음</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: 10, fontSize: 11, color: '#9ca3af' }}>
            총 {filteredSites.length}개국 표시 중 · 셀 클릭 → 텍스트/URL 수정 또는 운영 여부 전환
          </div>
        </div>
      </div>
    </div>
  )
}
 
 
// ════════════════════════════════════════════════════════════════
// ── 서비스 배지 렌더 헬퍼 ─────────────────────────────────────
// ════════════════════════════════════════════════════════════════
// CountryTable, ProjectDetail 셀에서 공통으로 사용
 
function ServiceIssueBadges({ issues }) {
  if (!issues?.length) return null
  return (
    <>
      {issues.map((issue, idx) => {
        if (issue.type === 'not_operated') {
          return (
            <div key={idx} className="cc-launch-badge" style={{ background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' }}>
              ⛔ 미운영: {issue.service}
            </div>
          )
        }
        if (issue.type === 'wrong_text') {
          return (
            <div key={idx} className="cc-launch-badge" style={{ background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
              ⚠ {issue.service}
              <div style={{ marginTop: 2, fontSize: '0.85em', opacity: 0.75 }}>
                → <strong>{issue.expected}</strong>
              </div>
            </div>
          )
        }
        if (issue.type === 'wrong_url') {
          return (
            <div key={idx} className="cc-launch-badge" style={{ background: '#eff6ff', color: '#1e40af', borderColor: '#93c5fd', fontFamily: 'monospace', wordBreak: 'break-all' }}>
              🔗 {issue.service}
              <div style={{ marginTop: 2, fontSize: '0.85em', opacity: 0.75 }}>
                → <strong>{issue.expected}</strong>
              </div>
            </div>
          )
        }
        return null
      })}
    </>
  )
}
 
// ════════════════════════════════════════════════════════════════
// ── 메인 export ───────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
export default function CountryTab() {
  const [subTab, setSubTab] = useState(() => {
    const s = localStorage.getItem('country_sub_tab')
    return s === 'project' ? 'project' : 'quick'
  })
  const [products, setProducts]           = useState([])
  const [loaded, setLoaded]               = useState(false)
  const [loadErr, setLoadErr]             = useState('')
  const [showProductPanel, setShowProductPanel] = useState(false)
  // ▼ 신규: 서비스 패널 상태
  const [showServicePanel, setShowServicePanel] = useState(false)
  const [showAllHistory, setShowAllHistory]     = useState(false)

  const loadProducts = useCallback(async () => {
    try {
      const res = await api.getProducts()
      if (res.ok) { setProducts(res.data); setLoaded(true) }
      else setLoadErr(res.message)
    } catch { setLoadErr('서버를 먼저 실행해주세요 (npm start)') }
  }, [])

  const loadServices = useCallback(async () => {
    try {
      const res = await api.getServices()
      if (res.ok) setServiceData(res.data)
    } catch {}
  }, [])

  useEffect(() => { loadProducts(); loadServices() }, [loadProducts, loadServices])
 
  return (
    <div className="country-check">
      {loadErr && <div className="error-banner">{loadErr}</div>}
 
      <div className="cc-product-status">
        <span className={`db-badge ${loaded ? 'badge-green' : 'badge-yellow'}`}>
          {loaded ? `제품 ${products.length}종 로드됨` : '로딩 중...'}
        </span>
 
        <div className="cc-subtab-nav">
          <button
            className={`cc-subtab-btn ${subTab === 'quick' ? 'active' : ''}`}
            onClick={() => { setSubTab('quick'); localStorage.setItem('country_sub_tab', 'quick') }}
          >즉석 검수</button>
          <button
            className={`cc-subtab-btn ${subTab === 'project' ? 'active' : ''}`}
            onClick={() => { setSubTab('project'); localStorage.setItem('country_sub_tab', 'project') }}
          >📁 프로젝트 관리</button>
        </div>
 
        {/* ── 관리 버튼 그룹 ── */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto' }}>
          {/* 기존 제품 데이터 관리 버튼 */}
          <button className="btn-manage-product" onClick={() => setShowProductPanel(true)}>
            ⚙ 제품 데이터 관리
          </button>
          {/* ▼ 신규: 서비스 운영 현황 버튼 */}
          <button
            className="btn-manage-product"
            style={{ background: 'var(--bg-hover, #f0f9ff)', color: '#1d4ed8', borderColor: '#93c5fd' }}
            onClick={() => setShowServicePanel(true)}
          >
            🛎 서비스 운영 현황
          </button>
        </div>
      </div>
 
      {subTab === 'quick'   && <QuickCheck products={products} />}
      {subTab === 'project' && <ProjectManager products={products} />}
 
      {showProductPanel && (
        <ProductPanel onClose={() => setShowProductPanel(false)} onProductsChanged={loadProducts} />
      )}
 
      {showServicePanel && (
        <ServicePanel onClose={() => setShowServicePanel(false)} onShowHistory={() => setShowAllHistory(true)} />
      )}

      {showAllHistory && (
        <ServiceAllHistoryDrawer onClose={() => setShowAllHistory(false)} />
      )}
    </div>
  )
}