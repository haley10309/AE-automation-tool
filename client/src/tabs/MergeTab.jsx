/**
 * MergeTab — 카피덱 자동 Merge
 *
 * 진입 시: 프로젝트 목록 (카드 그리드)
 * 카드 클릭: 해당 프로젝트 상세 (EN 기준 + 국가별 로컬어 Merge 결과 바로 표시)
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { useDB } from '../DBContext.jsx'

const LS_EN_KEY = 'merge_en_copy'

// ── 유틸 ─────────────────────────────────────────────────────
function parseEnLines(raw) {
  return raw.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l !== '')
}
function parseConfirmedPaste(raw) {
  return raw.split(/\r?\n/)
    .map(l => {
      const tab = l.indexOf('\t')
      if (tab === -1) return null
      return { en: l.slice(0, tab).trim(), local: l.slice(tab + 1).trim() }
    })
    .filter(Boolean)
}
function mapLocals(baseEnLines, confirmedPairs) {
  const queue = {}
  confirmedPairs.forEach(({ en, local }) => {
    const key = en.trim()
    if (!queue[key]) queue[key] = []
    queue[key].push(local)
  })
  const cursor = {}
  return baseEnLines.map(en => {
    const key = en.trim()
    if (!queue[key] || queue[key].length === 0) return { en, local: '', missing: true }
    const idx = cursor[key] ?? 0
    const local = queue[key][idx] ?? queue[key][queue[key].length - 1]
    cursor[key] = idx + 1
    return { en, local, missing: false }
  })
}
function checkDNT(en, local, products) {
  const issues = []
  for (const p of products) {
    for (const alias of (p.aliases || [])) {
      const a = alias.toLowerCase()
      const re = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      const enCount    = (en.toLowerCase().match(re) || []).length
      const localCount = (local.toLowerCase().match(re) || []).length
      if (enCount > 0 && enCount !== localCount) issues.push({ alias, enCount, localCount })
    }
  }
  return issues
}
function exportCSV(baseEnLines, countries, matrix) {
  const esc = v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['#', 'EN (기준)', ...(countries || []).map(c => c.label)]
  const rows = baseEnLines.map((en, i) => [
    i + 1, en,
    ...countries.map(c => {
      const mapped = c.mappedJson ? JSON.parse(c.mappedJson) : []
      return mapped[i]?.local ?? ''
    }),
  ])
  const csv = [header, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
  const ds = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = `merge_${ds}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ════════════════════════════════════════════════════════════════
// 프로젝트 목록 뷰
// ════════════════════════════════════════════════════════════════
function ProjectListView({ projects, loading, onCreate, onOpen, onDelete }) {
  const [newTitle, setNewTitle] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch]     = useState('')

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    await onCreate(newTitle.trim())
    setNewTitle(''); setShowForm(false); setCreating(false)
  }

  const filtered = projects.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="mg-list-view">
      <div className="mg-list-header">
        <div className="mg-list-title-row">
          <span className="mg-list-title">Merge 프로젝트</span>
          <span className="cc-status-text">{projects.length}개</span>
        </div>
        <div className="mg-list-actions">
          <input className="form-input" placeholder="프로젝트 검색" value={search}
            onChange={e => setSearch(e.target.value)} style={{ width: 200, fontSize: 13 }} />
          <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? '취소' : '+ 새 프로젝트'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="pj-create-form">
          <input className="form-input" placeholder="프로젝트 이름 *" value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus style={{ flex: 1 }} />
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? '생성 중...' : '생성'}
          </button>
        </div>
      )}

      {loading && <div className="loading" style={{ padding: 40 }}>불러오는 중...</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-icon">🔀</div>
          <p>{projects.length === 0 ? '아직 Merge 프로젝트가 없습니다.' : '검색 결과 없음'}</p>
          {projects.length === 0 && <small>"+ 새 프로젝트" 버튼으로 시작해보세요.</small>}
        </div>
      )}

      <div className="mg-proj-grid">
        {filtered.map(p => (
          <div key={p.id} className="mg-proj-card" onClick={() => onOpen(p)}>
            <div className="mg-proj-card-header">
              <span className="mg-proj-card-name">{p.title}</span>
              <button className="act-btn act-delete" style={{ padding: '2px 7px' }}
                onClick={e => { e.stopPropagation(); onDelete(p.id, p.title) }}>🗑</button>
            </div>
            <div className="mg-proj-card-meta">
              {(p.country_count ?? 0) > 0 && <span className="mg-proj-badge">{p.country_count}개국</span>}
              {(p.row_count ?? 0) > 0    && <span className="mg-proj-badge">{p.row_count}행</span>}
            </div>
            <div className="mg-proj-card-date">
              {(p.updated_at || p.created_at || '').slice(0, 10)}
            </div>
            <div className="mg-proj-card-arrow">열기 →</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 국가 히스토리 드로어
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

  const parseSafe = (json, fallback = []) => {
    try { return typeof json === 'string' ? JSON.parse(json) : (json || fallback) }
    catch { return fallback }
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
            <small>Merge를 재실행하면 변경된 행이 여기에 기록됩니다.</small>
          </div>
        ) : (
          <div className="mg-history-list">
            {history.map((h, i) => {
              const diffRows = parseSafe(h.diff_json, [])
              const isFirst  = i === history.length - 1  // 가장 오래된 = 최초 저장
              const changedCount = isFirst
                ? parseSafe(h.mapped_json, []).length  // 최초: 전체 행 수
                : diffRows.length

              return (
                <div key={h.id} className="mg-history-item">
                  <div className="mg-history-meta"
                    onClick={() => setExpanded(expanded === i ? null : i)}>
                    <span className="mg-history-ver">v{history.length - i}</span>
                    <span className="mg-history-date">{fmt(h.saved_at)}</span>
                    <span className="mg-history-rows">
                      {isFirst
                        ? `최초 저장 · ${changedCount}행`
                        : changedCount > 0
                          ? `변경 ${changedCount}행`
                          : '변경 없음'}
                    </span>
                    <span className="mg-history-toggle">{expanded === i ? '▲ 접기' : '▼ 펼치기'}</span>
                  </div>

                  {expanded === i && (
                    <div className="mg-history-body">
                      {/* 최초 저장: 전체 표시 / 이후: 변경된 행만 표시 */}
                      {isFirst ? (
                        // 전체 행
                        <div className="mg-history-table-wrap">
                          <table className="mg-history-table">
                            <thead>
                              <tr>
                                <th style={{ width: 36 }}>#</th>
                                <th>EN</th>
                                <th>{h.label || country.label}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {parseSafe(h.mapped_json, []).map((row, ri) => (
                                <tr key={ri} className={row.missing ? 'mg-cell-missing' : ''}>
                                  <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>{ri + 1}</td>
                                  <td className="mg-history-en">{row.en}</td>
                                  <td className="mg-history-local">
                                    {row.missing
                                      ? <span className="mg-missing-badge">⚠ 매핑 없음</span>
                                      : row.local || <em className="empty-val">빈 값</em>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : diffRows.length === 0 ? (
                        <div style={{ padding: '12px 16px', fontSize: 13, color: '#9ca3af' }}>변경된 행이 없습니다.</div>
                      ) : (
                        // 변경된 행만
                        <div className="mg-history-table-wrap">
                          <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8, padding: '0 2px' }}>
                            이전 버전 대비 변경된 {diffRows.length}개 행
                          </div>
                          <table className="mg-history-table">
                            <thead>
                              <tr>
                                <th style={{ width: 36 }}>#행</th>
                                <th>EN</th>
                                <th style={{ color: '#dc2626' }}>이전</th>
                                <th style={{ color: '#059669' }}>변경 후</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diffRows.map((d, di) => (
                                <tr key={di} className={d.missing ? 'mg-cell-missing' : ''}>
                                  <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11 }}>{d.row}</td>
                                  <td className="mg-history-en">{d.en}</td>
                                  <td className="mg-history-prev">
                                    {d.prev_local
                                      ? <span style={{ color: '#dc2626' }}>{d.prev_local}</span>
                                      : <em className="empty-val">없음</em>}
                                  </td>
                                  <td className="mg-history-local">
                                    {d.missing
                                      ? <span className="mg-missing-badge">⚠ 매핑 없음</span>
                                      : d.new_local
                                        ? <span style={{ color: '#059669', fontWeight: 500 }}>{d.new_local}</span>
                                        : <em className="empty-val">빈 값</em>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* 원본 붙여넣기 */}
                      {h.raw_paste && (
                        <details style={{ marginTop: 10 }}>
                          <summary style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>원본 컨펌 카피 보기</summary>
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
// 국가 입력 카드
// ════════════════════════════════════════════════════════════════
function CountryCard({ country, onRemove, onLabelChange, pasteRef, projectId }) {
  const [showHistory, setShowHistory] = useState(false)
  return (
    <>
    {showHistory && (
      <CountryHistoryDrawer
        projectId={projectId}
        country={country}
        onClose={() => setShowHistory(false)}
      />
    )}
    <div className={`mg-country-card ${country.isSaved ? 'mg-country-saved' : ''}`}
      style={{ position: 'relative' }}>
      {/* 국가 삭제 — 카드 우측 상단 고정 */}
      <button className="cc-remove-btn mg-country-delete-btn"
        onClick={() => onRemove(country.id)}
        title="국가 삭제"
        style={{ position: 'absolute', top: 8, right: 8 }}>✕</button>
      <div className="mg-country-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <input className="mg-country-label-input" value={country.label}
            onChange={e => onLabelChange(country.id, e.target.value)}
            placeholder="국가명 (예: JP)" />
          {country.isSaved && <span style={{ fontSize: 10, color: '#10b981', whiteSpace: 'nowrap' }}>✓ 저장됨</span>}
        </div>
        {country.dbId && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setShowHistory(true)}>
            🕐 히스토리
          </button>
        )}
      </div>
      <textarea
        ref={el => { if (el) pasteRef.current[country.id] = el }}
        className="paste-area mg-paste"
        defaultValue={country.rawPaste || ''}
        placeholder={"컨펌된 카피 붙여넣기 (탭 구분)\n\n예:\nFind Your Galaxy\tFind Your Galaxy\nPerformance\tパフォーマンス性能"}
      />
      <div className="input-hint">EN[탭]로컬어 — 엑셀에서 두 열 선택 후 Ctrl+C → Ctrl+V</div>
    </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// 프로젝트 상세 뷰
// ════════════════════════════════════════════════════════════════
function ProjectDetailView({ project, products, onBack, onUpdated }) {
  const [enInput, setEnInput]         = useState('')
  const [countries, setCountries]     = useState([])
  const [mergeResult, setMergeResult] = useState(null)
  const [error, setError]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [loading, setLoading]         = useState(true)
  const [idSeq, setIdSeq]             = useState(1)
  const [editTitle, setEditTitle]     = useState(false)
  const [titleVal, setTitleVal]       = useState(project.title)
  const pasteRef = useRef({})

  // 상세 로드 — 저장된 결과가 있으면 바로 테이블 표시
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.mergeGetProject(project.id)
      if (!res.ok) return
      const en = res.project.en_lines || ''
      setEnInput(en)
      const loaded = (res.countries || []).map(c => ({
        id: `db_${c.id}`, dbId: c.id, label: c.label,
        rawPaste: c.raw_paste || '', mappedJson: c.mapped_json || null, isSaved: true,
      }))
      setCountries(loaded)
      pasteRef.current = {}

      // 저장된 결과 복원 → 진입 즉시 테이블 표시
      if (en && loaded.some(c => c.mappedJson)) {
        const baseEnLines = parseEnLines(en)
        const matrix = {}
        loaded.forEach(c => {
          try { matrix[c.id] = JSON.parse(c.mappedJson) } catch { matrix[c.id] = [] }
        })
        setMergeResult({ matrix, dntIssues: [], missingWarns: [], baseEnLines, activeCountries: loaded })
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [project.id])

  useEffect(() => { load() }, [load])

  // ExtractTab에서 보낸 카피 자동 로드
  useEffect(() => {
    const saved = localStorage.getItem(LS_EN_KEY)
    if (saved) { setEnInput(saved); localStorage.removeItem(LS_EN_KEY) }
  }, [])

  const addCountry = () => {
    const id = `new_${idSeq}`; setIdSeq(n => n + 1)
    setCountries(prev => [...prev, { id, dbId: null, label: `국가${idSeq}`, rawPaste: '', mappedJson: null, isSaved: false }])
  }
  const removeCountry = async (id) => {
    const c = countries.find(x => x.id === id)
    if (c?.dbId) {
      if (!window.confirm(`${c.label} 국가를 삭제하시겠습니까?`)) return
      await api.mergeDeleteCountry(project.id, c.dbId)
    }
    setCountries(prev => prev.filter(x => x.id !== id))
    delete pasteRef.current[id]
    setMergeResult(null)
  }
  const updateLabel = (id, label) =>
    setCountries(prev => prev.map(c => c.id === id ? { ...c, label, isSaved: false } : c))

  const handleRename = async () => {
    if (!titleVal.trim()) return
    await api.mergeUpdateProject(project.id, { title: titleVal.trim(), enLines: enInput })
    setEditTitle(false); onUpdated()
  }

  // ── Merge 실행 ──────────────────────────────────────────────
  const runMerge = useCallback(async () => {
    setError(''); setMergeResult(null)
    const baseEnLines = parseEnLines(enInput)
    if (baseEnLines.length === 0) { setError('기준 영문 카피를 입력해주세요.'); return }
    if (countries.length === 0)   { setError('국가를 하나 이상 추가해주세요.'); return }

    const activeCountries = countries.map(c => ({
      ...c, rawPaste: pasteRef.current[c.id]?.value ?? c.rawPaste,
    }))

    const matrix = {}, dntIssues = []

    for (const c of activeCountries) {
      const pairs = parseConfirmedPaste(c.rawPaste)
      if (pairs.length === 0) {
        matrix[c.id] = baseEnLines.map(en => ({ en, local: '', missing: true }))
        continue
      }
      const mapped = mapLocals(baseEnLines, pairs)
      matrix[c.id] = mapped
      mapped.forEach((m, i) => {
        if (!m.local || m.missing) return
        const issues = checkDNT(m.en, m.local, products)
        if (issues.length) dntIssues.push({ countryLabel: c.label, row: i + 1, enText: m.en, issues })
      })
    }

    setMergeResult({ matrix, dntIssues, missingWarns: [], baseEnLines, activeCountries })

    if (dntIssues.length) {
      const msgs = dntIssues.slice(0, 5).map(d =>
        `[${d.countryLabel}] ${d.row}행 — ${d.issues.map(i => `"${i.alias}": EN ${i.enCount}개 Local ${i.localCount}개`).join(', ')}`
      )
      alert(`⚠ DNT 불일치 (${dntIssues.length}건)\n\n` + msgs.join('\n'))
    }

    setSaving(true)
    try {
      await api.mergeUpdateProject(project.id, { enLines: enInput })
      for (const c of activeCountries) {
        const mappedJson = JSON.stringify(matrix[c.id] || [])
        const res = await api.mergeUpsertCountry(project.id, {
          countryId: c.dbId || null, label: c.label, rawPaste: c.rawPaste, mappedJson,
        })
        if (res.ok) {
          setCountries(prev => prev.map(x =>
            x.id === c.id
              ? { ...x, dbId: res.id ?? x.dbId, id: x.dbId ? x.id : `db_${res.id}`, isSaved: true, mappedJson }
              : x
          ))
        }
      }
      onUpdated()
    } finally { setSaving(false) }
  }, [enInput, countries, products, project.id, onUpdated])

  const handleExport = () => {
    if (!mergeResult) return
    exportCSV(
      mergeResult.baseEnLines,
      (mergeResult.activeCountries || []).map(c => ({ ...c, mappedJson: JSON.stringify(mergeResult.matrix[c.id] || []) })),
      mergeResult.matrix
    )
  }

  if (loading) return <div className="loading" style={{ padding: 60, textAlign: 'center' }}>불러오는 중...</div>

  return (
    <div className="mg-detail-view">
      {/* 헤더 */}
      <div className="mg-detail-header">
        <button className="pj-back-btn" onClick={onBack}>← 프로젝트 목록</button>
        <div className="mg-detail-title-row">
          {editTitle ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="form-input" value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                style={{ fontSize: 15, fontWeight: 700, width: 280 }} />
              <button className="act-btn act-save" onClick={handleRename}>저장</button>
              <button className="act-btn act-cancel" onClick={() => setEditTitle(false)}>취소</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mg-detail-title">{titleVal}</span>
              <button className="act-btn act-edit" onClick={() => setEditTitle(true)}>✏ 이름 수정</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Merge 결과: 진입 즉시 표시 (저장된 경우) ── */}
      {mergeResult && (
        <section className="mg-result-section">
          <div className="result-toolbar" style={{ marginBottom: 12 }}>
            <span className="result-title">
              Merge 결과 — {mergeResult.baseEnLines.length}행 · {mergeResult.activeCountries.length}개국
            </span>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cc-scroll-hint">← 가로 스크롤 →</span>
              <button className="btn-export" onClick={handleExport}>⬇ Excel 추출</button>
            </div>
          </div>
          <div className="cc-table-wrap">
            <table className="cc-table mg-table">
              <thead>
                <tr>
                  <th className="cc-th cc-th-idx">#</th>
                  <th className="cc-th mg-th-en">EN (기준)</th>
                  {(mergeResult.activeCountries || []).map(c => (
                    <th key={c.id} className="cc-th mg-th-local">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(mergeResult.baseEnLines || []).map((en, i) => {
                  const rowHasIssue = mergeResult.activeCountries.some(c => {
                    const m = mergeResult.matrix[c.id]?.[i]
                    return m?.missing || checkDNT(en, m?.local ?? '', products).length > 0
                  })
                  return (
                    <tr key={i} className={rowHasIssue ? 'cc-row-issue' : ''}>
                      <td className="cc-td cc-td-idx">{i + 1}</td>
                      <td className="cc-td mg-td-en">
                        <span className="mg-en-text">{en || <em className="empty-val">빈 값</em>}</span>
                      </td>
                      {(mergeResult.activeCountries || []).map(c => {
                        const m = mergeResult.matrix[c.id]?.[i]
                        const dntIss = m?.local ? checkDNT(en, m.local, products) : []
                        const isMissing = m?.missing || !m
                        return (
                          <td key={c.id}
                            className={`cc-td mg-td-local ${isMissing ? 'mg-cell-missing' : ''} ${dntIss.length ? 'cc-cell-issue' : ''}`}>
                            {isMissing
                              ? <span className="mg-missing-badge">⚠ 매핑 없음</span>
                              : <span className="mg-local-text">{m.local || <em className="empty-val">빈 값</em>}</span>
                            }
                            {dntIss.map((iss, di) => (
                              <div key={di} className="cc-launch-badge" style={{ fontSize: 10 }}>
                                ⚠ DNT: "{iss.alias}" {iss.enCount}→{iss.localCount}
                              </div>
                            ))}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ── 편집 영역 (접을 수 있게 구분선) ── */}
      <details className="mg-edit-details" open={!mergeResult}>
        <summary className="mg-edit-summary">
          {mergeResult ? '✏ 카피 수정 / 국가 추가' : '카피 입력'}
        </summary>
        <div className="mg-edit-body">
          {/* 기준 영문 카피 */}
          <section className="mg-section">
            <div className="mg-section-header">
              <div className="mg-section-title"><span className="mg-step">1</span>기준 영문 카피</div>
              <span className="input-hint" style={{ fontSize: 12 }}>ExtractTab "Merge로 보내기" 클릭 시 자동 로드</span>
            </div>
            <textarea className="paste-area mg-en-area" value={enInput}
              onChange={e => setEnInput(e.target.value)}
              placeholder={"기준이 될 영문 카피를 한 줄씩 입력\n예:\nFind Your Galaxy\nPerformance\nCamera"} />
            <div className="input-hint">{enInput ? `${parseEnLines(enInput).length}줄 입력됨` : '한 줄 = 카피 1개'}</div>
          </section>

          {/* 국가별 컨펌 카피 */}
          <section className="mg-section">
            <div className="mg-section-header">
              <div className="mg-section-title">
                <span className="mg-step">2</span>국가별 컨펌 카피
                {countries.some(c => c.isSaved) && (
                  <span style={{ fontSize: 11, color: '#10b981', marginLeft: 8 }}>
                    {countries.filter(c => c.isSaved).length}개국 저장됨
                  </span>
                )}
              </div>
              <button className="btn-primary" style={{ fontSize: 13, padding: '7px 16px' }} onClick={addCountry}>
                + 국가 추가
              </button>
            </div>
            {countries.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 8 }}>
                <div className="empty-icon">🌍</div>
                <p>국가를 추가해주세요</p>
              </div>
            ) : (
              <div className="mg-countries-grid">
                {countries.map(c => (
                  <CountryCard key={c.id} country={c} onRemove={removeCountry}
                    onLabelChange={updateLabel} pasteRef={pasteRef} projectId={project.id} />
                ))}
              </div>
            )}
          </section>

          {/* 실행 */}
          <section className="mg-run-row">
            <button className="btn-primary mg-run-btn" onClick={runMerge} disabled={saving}>
              {saving ? '⏳ 저장 중...' : '🔀 Merge 실행 & 저장'}
            </button>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Merge 실행 시 자동 저장됩니다.</span>
            {error && <div className="error-banner" style={{ margin: 0 }}>{error}</div>}
          </section>

          {/* DNT 이슈 */}
          {mergeResult?.dntIssues?.length > 0 && (
            <section className="mg-dnt-section">
              <div className="mg-dnt-title">⚠ DNT 불일치 {mergeResult.dntIssues.length}건</div>
              <div className="mg-dnt-list">
                {(mergeResult.dntIssues || []).map((d, i) => (
                  <div key={i} className="mg-dnt-item">
                    <span className="mg-dnt-country">[{d.countryLabel}]</span>
                    <span className="mg-dnt-row">{d.row}행</span>
                    <span className="mg-dnt-en">{d.enText.slice(0, 40)}{d.enText.length > 40 ? '…' : ''}</span>
                    <span className="mg-dnt-issues">
                      {d.issues.map(iss => `"${iss.alias}" EN:${iss.enCount} Local:${iss.localCount}`).join(' / ')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      </details>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 메인
// ════════════════════════════════════════════════════════════════
export default function MergeTab() {
  const { dbReady }                   = useDB()
  const [projects, setProjects]       = useState([])
  const [projLoading, setProjLoading] = useState(false)
  const [openProject, setOpenProject] = useState(null)
  const [products, setProducts]       = useState([])

  const loadProjects = useCallback(async () => {
    if (!dbReady) return
    setProjLoading(true)
    try {
      const res = await api.mergeListProjects()
      if (res.ok) setProjects(res.data)
    } catch (e) { console.error(e) }
    finally { setProjLoading(false) }
  }, [dbReady])

  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => {
    api.getProducts().then(res => { if (res.ok) setProducts(res.data) }).catch(() => {})
  }, [])

  const handleCreate = async (title) => {
    const res = await api.mergeCreateProject({ title, enLines: '' })
    if (res.ok) { await loadProjects(); setOpenProject({ id: res.id, title }) }
  }
  const handleDelete = async (id, title) => {
    if (!window.confirm(`"${title}" 프로젝트를 삭제하시겠습니까?`)) return
    await api.mergeDeleteProject(id)
    if (openProject?.id === id) setOpenProject(null)
    loadProjects()
  }
  const handleBack = () => { setOpenProject(null); loadProjects() }

  if (openProject) {
    return (
      <ProjectDetailView
        project={openProject}
        products={products}
        onBack={handleBack}
        onUpdated={loadProjects}
      />
    )
  }

  return (
    <ProjectListView
      projects={projects}
      loading={projLoading}
      onCreate={handleCreate}
      onOpen={p => setOpenProject(p)}
      onDelete={handleDelete}
    />
  )
}