import { useState, useCallback, useEffect } from 'react'
import { api } from '../api.js'
import React from 'react'
import { useDB } from '../DBContext.jsx'
import DiffTable from '../components/DiffTable.jsx'
import HistoryTable from '../components/HistoryTable.jsx'
import { parseCol, normalize, isHeaderLike, getStatus, today } from '../utils.js'

export default function ExtractTab() {
  const { dbStatus } = useDB()
  // 모드: 새 추출 vs 이력 조회
  const [mode, setMode] = useState(() => localStorage.getItem('extract_mode') || 'new')

  // 입력
  const [asWasInput, setAsWasInput] = useState('')
  const [toBeInput,  setToBeInput]  = useState('')
  const [diffData,   setDiffData]   = useState(null)
  const [allData,    setAllData]    = useState(null)
  const [stats,      setStats]      = useState(null)
  const [extractError, setExtractError] = useState('')
  const [copied,     setCopied]     = useState(false)

  // 저장 메타
  const [saveMeta, setSaveMeta] = useState({ product_name:'', requester:'', request_date:today(), note:'' })
  const [saving,   setSaving]   = useState(false)
  const [saveMsg,  setSaveMsg]  = useState('')

  // 이력 목록
  const [requests,      setRequests]      = useState([])
  const [selectedReq,   setSelectedReq]   = useState(null)
  const [reqRows,       setReqRows]       = useState([])
  const [diffOnlyView,  setDiffOnlyView]  = useState(true)
  const [histLoading,   setHistLoading]   = useState(false)
  const [rowActionMsg,  setRowActionMsg]  = useState('')
  const [searchQuery,   setSearchQuery]   = useState('')

  // ── 이력 로드 ──────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    if (dbStatus !== 'connected') return
    setHistLoading(true)
    const res = await api.dbListRequests()
    if (res.ok) {
      setRequests(res.data)
      // refresh 후 마지막으로 보던 요청 복원
      const savedId = localStorage.getItem('extract_selected_req_id')
      if (savedId) {
        const found = res.data.find(r => String(r.id) === String(savedId))
        if (found) {
          setSelectedReq(found); setMode('view'); setRowActionMsg('')
          api.dbGetRows({ requestId: found.id, diffOnly: false }).then(r => { if (r.ok) setReqRows(r.data) })
        }
        else localStorage.removeItem('extract_selected_req_id')
      }
    }
    setHistLoading(false)
  }, [dbStatus])

  useEffect(() => { if (dbStatus === 'connected') loadHistory() }, [dbStatus, loadHistory])

  const loadRows = async req => {
    setSelectedReq(req); setMode('view'); setRowActionMsg('')
    localStorage.setItem('extract_selected_req_id', req.id)
    localStorage.setItem('extract_mode', 'view')
    const res = await api.dbGetRows({ requestId: req.id, diffOnly: false })
    if (res.ok) setReqRows(res.data)
  }

  // ── 추출 ───────────────────────────────────────────────────
  const runDiff = useCallback(() => {
    setExtractError(''); setDiffData(null); setAllData(null); setSaveMsg('')
    if (!asWasInput.trim() || !toBeInput.trim()) {
      setExtractError('AS-WAS와 TO-BE 열을 모두 입력해주세요.'); return
    }
    let asLines = parseCol(asWasInput)
    let toLines  = parseCol(toBeInput)
    if (asLines.length > 0 && isHeaderLike(asLines[0])) asLines = asLines.slice(1)
    if (toLines.length  > 0 && isHeaderLike(toLines[0])) toLines = toLines.slice(1)

    const maxLen = Math.max(asLines.length, toLines.length)
    while (asLines.length < maxLen) asLines.push('')
    while (toLines.length  < maxLen) toLines.push('')

    if (Math.abs(asLines.length - toLines.length) > 5 && maxLen > 10)
      setExtractError(`행 수 차이가 큽니다 (AS-WAS: ${asLines.length}행, TO-BE: ${toLines.length}행)`)

    const diff = [], all = []
    let changed = 0, added = 0, removed = 0

    for (let i = 0; i < maxLen; i++) {
      const a = normalize(asLines[i] || '')
      const b = normalize(toLines[i]  || '')
      if (a === b) { all.push({ row:i+1, asWas:a, toBe:b, status:'동일' }); continue }
      const status = getStatus(a, b)
      if (status === '변경') changed++
      else if (status === '추가') added++
      else removed++
      const row = { row:i+1, asWas:a, toBe:b, status }
      diff.push(row); all.push(row)
    }
    setStats({ total:maxLen, changed, added, removed, diffCount:diff.length })
    setDiffData(diff); setAllData(all)
  }, [asWasInput, toBeInput])

  const clearAll = () => {
    setAsWasInput(''); setToBeInput(''); setDiffData(null); setAllData(null)
    setStats(null); setExtractError(''); setSaveMsg('')
    setSaveMeta({ product_name:'', requester:'', request_date:today(), note:'' })
  }

  const startNew = () => { setMode('new'); setSelectedReq(null); clearAll(); localStorage.removeItem('extract_selected_req_id'); localStorage.setItem('extract_mode', 'new') }

  // ── 저장 ───────────────────────────────────────────────────
  const handleSave = async () => {
    if (dbStatus !== 'connected') { setSaveMsg('❌ DB에 먼저 연결해주세요.'); return }
    if (!saveMeta.product_name.trim()) { setSaveMsg('❌ 제품/페이지명을 입력해주세요.'); return }
    setSaving(true); setSaveMsg('')
    const res = await api.dbSave({ meta: saveMeta, allRows: allData })
    setSaving(false)
    if (res.ok) {
      setSaveMsg(`✅ 저장 완료 (ID: ${res.requestId})`)
      await loadHistory()
      setTimeout(() => setSaveMsg(''), 2000)
    } else {
      setSaveMsg('❌ 저장 실패: ' + res.message)
    }
  }

  // ── 요청 삭제 ──────────────────────────────────────────────
  const handleDeleteRequest = async (req, e) => {
    e.stopPropagation()
    if (!window.confirm(`"${req.product_name}" 요청을 삭제하시겠습니까?`)) return
    if (api.deleteRequest) await api.deleteRequest(req.id)
    if (selectedReq?.id === req.id) { setSelectedReq(null); setMode('new'); localStorage.removeItem('extract_selected_req_id'); localStorage.setItem('extract_mode', 'new') }
    await loadHistory()
  }

  // ── 행 수정/삭제 ───────────────────────────────────────────
  const handleUpdateRow = useCallback(async (rowId, draft) => {
    const res = await api.updateRow(rowId, draft)
    if (res.ok) {
      setReqRows(prev => prev.map(r =>
        r.id === rowId ? { ...r, as_was:draft.as_was, to_be:draft.to_be, status:res.status } : r
      ))
      setRowActionMsg('✅ 수정 완료')
      setTimeout(() => setRowActionMsg(''), 2000)
    } else {
      setRowActionMsg('❌ 수정 실패: ' + res.message)
    }
    return res.ok
  }, [])

  const handleDeleteRow = useCallback(async rowId => {
    if (!window.confirm('이 행을 삭제하시겠습니까?')) return
    const res = await api.deleteRow(rowId)
    if (res.ok) {
      setReqRows(prev => prev.filter(r => r.id !== rowId))
      setRowActionMsg('🗑 삭제 완료')
      setTimeout(() => setRowActionMsg(''), 2000)
    } else {
      setRowActionMsg('❌ 삭제 실패: ' + res.message)
    }
  }, [])

  const copyTSV = () => {
    if (!diffData?.length) return
    const h = '행번호\tAS-WAS\tTO-BE\t상태'
    const rows = diffData.map(d => `${d.row}\t${d.asWas}\t${d.toBe}\t${d.status}`)
    navigator.clipboard.writeText([h, ...rows].join('\n'))
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 1800) })
  }

  // 이력 조회 CSV 추출
  const exportHistoryToCSV = (rows, req, diffOnly) => {
    if (!rows?.length) return
    const esc = v => {
      const s = String(v ?? '')
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s
    }
    const header = ['행번호', 'AS-WAS', 'TO-BE', '상태']
    const dataRows = rows.map(r => [r.row_index, r.as_was ?? '', r.to_be ?? '', r.status])
    const csv = [header, ...dataRows].map(r => r.map(esc).join(',')).join('\r\n')
    const now = new Date()
    const ds = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`
    const label = diffOnly ? '변경행' : '전체'
    const filename = `${req.product_name}_${label}_${ds}.csv`
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  const filteredRequests = requests.filter(r =>
    !searchQuery ||
    r.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (r.requester || '').includes(searchQuery)
  )

  return (
    <div className="extract-layout">
      {/* ── 사이드바: 이력 목록 ── */}
      <aside className="history-sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">저장된 요청</span>
          <button className="btn-sm" onClick={loadHistory} title="새로고침">↺</button>
        </div>
        <button className="btn-new-extract" onClick={startNew}>＋ 새 추출</button>
        <input className="form-input sidebar-search" placeholder="제품명 / 요청자 검색"
          value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        {dbStatus !== 'connected' && (
          <div className="sidebar-hint">DB 설정 탭에서 먼저 연결해주세요.</div>
        )}
        {histLoading && <div className="loading" style={{ padding: '12px 0' }}>불러오는 중...</div>}
        {!histLoading && dbStatus === 'connected' && filteredRequests.length === 0 && (
          <div className="empty-hint">저장된 요청이 없습니다.</div>
        )}
        <div className="req-list">
          {filteredRequests.map(r => (
            <div key={r.id}
              className={`req-item ${selectedReq?.id === r.id ? 'active' : ''}`}
              onClick={() => loadRows(r)}>
              <div className="req-item-top">
                <span className="req-name">{r.product_name}</span>
                <button className="act-btn act-delete req-del-btn"
                  onClick={e => handleDeleteRequest(r, e)} title="삭제">🗑</button>
              </div>
              <div className="req-meta">{r.request_date} · {r.requester || '요청자 없음'}</div>
              <div className="req-count">전체 {r.total_rows}행 / 변경 {r.diff_rows}행</div>
            </div>
          ))}
        </div>
      </aside>

      {/* ── 메인 영역 ── */}
      <div className="extract-main">

        {/* ═══ 새 추출 모드 ═══ */}
        {mode === 'new' && (
          <>
            <div className="input-grid">
              <div className="input-card as-card">
                <div className="input-label">
                  <span className="col-badge as-badge">3열</span>AS-WAS — 현재 카피
                </div>
                <textarea className="paste-area" value={asWasInput}
                  onChange={e => setAsWasInput(e.target.value)}
                  placeholder={"엑셀에서 AS-WAS 열 전체 복사 후 붙여넣기\n\n헤더 포함/미포함 모두 자동 감지합니다."} />
                <div className="input-hint">
                  {asWasInput ? `${parseCol(asWasInput).length}행 입력됨` : '헤더 포함/미포함 모두 가능'}
                </div>
              </div>
              <div className="divider-arrow">→</div>
              <div className="input-card to-card">
                <div className="input-label">
                  <span className="col-badge to-badge">4열</span>TO-BE — 변경할 카피
                </div>
                <textarea className="paste-area" value={toBeInput}
                  onChange={e => setToBeInput(e.target.value)}
                  placeholder={"엑셀에서 TO-BE 열 전체 복사 후 붙여넣기\n\n행 수가 AS-WAS와 동일해야 합니다."} />
                <div className="input-hint">
                  {toBeInput ? `${parseCol(toBeInput).length}행 입력됨` : '행 수가 AS-WAS와 동일해야 함'}
                </div>
              </div>
            </div>

            <div className="action-row">
              <button className="btn-primary" onClick={runDiff}>변경된 행 추출하기</button>
              <button className="btn-ghost" onClick={clearAll}>초기화</button>
            </div>

            {extractError && <div className="error-banner">{extractError}</div>}

            {diffData !== null && (
              <div className="result-section">
                {stats && (
                  <div className="stats-row">
                    {[['전체 행', stats.total, false], ['변경된 행', stats.diffCount, true],
                      ['수정', stats.changed, false], ['추가', stats.added, false], ['삭제', stats.removed, false]
                    ].map(([lbl, num, hi]) => (
                      <div key={lbl} className={`stat-pill ${hi ? 'highlight' : ''}`}>
                        <span className="stat-num">{num}</span>
                        <span className="stat-lbl">{lbl}</span>
                      </div>
                    ))}
                  </div>
                )}

                {diffData.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">✓</div>
                    <p>변경된 행이 없습니다.</p>
                    <small>AS-WAS와 TO-BE가 모두 동일합니다.</small>
                  </div>
                ) : (
                  <>
                    <div className="result-toolbar">
                      <span className="result-title">변경 항목 {diffData.length}건</span>
                      <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                        <button className="btn-copy" onClick={copyTSV}>
                          {copied ? '복사됨 ✓' : 'TSV 복사 (엑셀 붙여넣기용)'}
                        </button>
                        <button className="btn-merge-send" onClick={() => {
                          // TO-BE 카피를 MergeTab으로 전달 (localStorage 경유)
                          const toBeLines = diffData.map(d => d.toBe).filter(Boolean)
                          localStorage.setItem('merge_en_copy', toBeLines.join('\n'))
                          alert(`✅ ${toBeLines.length}개 카피를 "카피덱 Merge" 탭으로 보냈습니다.\n탭을 전환하면 자동 로드됩니다.`)
                        }}>
                          🔀 Merge 탭으로 보내기
                        </button>
                      </div>
                    </div>
                    <DiffTable rows={diffData} />
                  </>
                )}

                {/* 인라인 저장 폼 */}
                {diffData.length > 0 && dbStatus === 'connected' && (
                  <div className="inline-save-form">
                    <div className="inline-save-title">💾 DB에 저장하기</div>
                    <div className="form-grid">
                      {[
                        ['product_name', '제품/페이지명 *', '예: 메인 홈, 상품상세 PDP'],
                        ['requester',    '요청자',          '예: 홍길동'],
                        ['request_date', '요청 날짜',       ''],
                        ['note',         '메모 (선택)',      '예: 신제품 출시 대응'],
                      ].map(([key, label, ph]) => (
                        <div key={key} className="form-row">
                          <label className="form-label">{label}</label>
                          <input className="form-input" type={key === 'request_date' ? 'date' : 'text'}
                            placeholder={ph} value={saveMeta[key]}
                            onChange={e => setSaveMeta(p => ({ ...p, [key]: e.target.value }))} />
                        </div>
                      ))}
                    </div>
                    {saveMsg && (
                      <div className={saveMsg.startsWith('✅') ? 'success-banner' : 'error-banner'}>
                        {saveMsg}
                      </div>
                    )}
                    <div className="inline-save-actions">
                      <button className="btn-primary" onClick={handleSave} disabled={saving}>
                        {saving ? '저장 중...' : `전체 ${allData?.length}행 저장 (변경 ${stats?.diffCount}행 포함)`}
                      </button>
                    </div>
                  </div>
                )}
                {diffData.length > 0 && dbStatus !== 'connected' && (
                  <div className="info-box" style={{ marginTop: 16 }}>
                    DB 설정 탭에서 연결하면 저장할 수 있습니다.
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ═══ 이력 조회 모드 ═══ */}
        {mode === 'view' && selectedReq && (
          <div className="history-main-inner">
            <div className="req-detail-header">
              <div>
                <h2 className="req-detail-title">{selectedReq.product_name}</h2>
                <div className="req-detail-meta">
                  {selectedReq.request_date} · {selectedReq.requester || '요청자 없음'}
                  {selectedReq.note && <span> · {selectedReq.note}</span>}
                  <span> · 전체 {selectedReq.total_rows}행 / 변경 {selectedReq.diff_rows}행</span>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label className="toggle-label">
                  <input type="checkbox" checked={diffOnlyView}
                    onChange={e => setDiffOnlyView(e.target.checked)} />
                  변경행만 보기
                </label>
                <button className="btn-export"
                  onClick={() => exportHistoryToCSV(
                    diffOnlyView ? reqRows.filter(r => r.status !== '동일') : reqRows,
                    selectedReq,
                    diffOnlyView
                  )}>
                  ⬇ CSV 추출
                </button>
                <button className="btn-merge-send" onClick={() => {
                          // TO-BE 카피를 MergeTab으로 전달 (localStorage 경유)
                          const toBeLines = diffData.map(d => d.toBe).filter(Boolean)
                          localStorage.setItem('merge_en_copy', toBeLines.join('\n'))
                          alert(`✅ ${toBeLines.length}개 카피를 "카피덱 Merge" 탭으로 보냈습니다.\n탭을 전환하면 자동 로드됩니다.`)
                        }}>
                          🔀 Merge 탭으로 보내기
                        </button>
              </div>
            </div>
            {rowActionMsg && (
              <div className={rowActionMsg.startsWith('✅') || rowActionMsg.startsWith('🗑')
                ? 'success-banner' : 'error-banner'}>
                {rowActionMsg}
              </div>
            )}
            <HistoryTable
              rows={diffOnlyView ? reqRows.filter(r => r.status !== '동일') : reqRows}
              onUpdate={handleUpdateRow}
              onDelete={handleDeleteRow}
            />
          </div>
        )}
      </div>
    </div>
  )
}