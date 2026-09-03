import { useState, useCallback, useEffect } from 'react'
import { api } from '../api.js'
import { useDB } from '../DBContext.jsx'
import DiffTable from '../components/DiffTable.jsx'
import HistoryTable from '../components/HistoryTable.jsx'
import ExtractExcelImportModal from '../components/ExtractExcelImportModal.jsx'
import { parseCol, normalize, isHeaderLike, today, diffLines, buildDiffRows } from '../utils.js'

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

  // 입력 방식: 'text'(직접 입력) | 'excel'(엑셀 파일) | 'html'(HTML 파일)
  const [inputMode, setInputMode] = useState(() => localStorage.getItem('extract_input_mode') || 'text')
  useEffect(() => { localStorage.setItem('extract_input_mode', inputMode) }, [inputMode])
  const [showExcelImport, setShowExcelImport] = useState(false)
  const [asWasFileName, setAsWasFileName] = useState('') // 엑셀/HTML 모드에서 불러온 출처 표시용
  const [toBeFileName,  setToBeFileName]  = useState('')
  const [asHtmlLines, setAsHtmlLines] = useState(null) // HTML 모드: 두 파일이 모두 로드되면 자동 비교
  const [toHtmlLines, setToHtmlLines] = useState(null)
  const [htmlLoadError, setHtmlLoadError] = useState('')

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

  // ── 추출 (핵심 로직 — 명시적으로 넘긴 raw 텍스트를 기준으로 비교) ──
  // 엑셀/HTML 모드에서 값을 세팅한 직후 바로 비교를 실행할 때, state가 아직
  // 반영되기 전이라 asWasInput/toBeInput을 그대로 읽으면 예전 값이 잡히는
  // 문제가 있어 raw 값을 인자로 직접 받도록 분리했다.
  //
  // VSCode의 "Compare Selected"와 동일한 방식: 같은 줄 번호끼리 억지로 맞추는
  // 대신, 실제 diff 알고리즘(LCS)으로 두 텍스트 사이의 진짜 대응 관계를 찾는다.
  // 그래서 중간에 한 줄이 추가/삭제돼도 그 아래 줄들이 전부 "변경"으로
  // 잘못 표시되지 않는다.
  const runDiffFrom = useCallback((asRaw, toRaw) => {
    setExtractError(''); setDiffData(null); setAllData(null); setSaveMsg('')
    if (!asRaw.trim() || !toRaw.trim()) {
      setExtractError('AS-WAS와 TO-BE 열을 모두 입력해주세요.'); return
    }
    let asLines = parseCol(asRaw).map(normalize)
    let toLines = parseCol(toRaw).map(normalize)
    if (asLines.length > 0 && isHeaderLike(asLines[0])) asLines = asLines.slice(1)
    if (toLines.length > 0 && isHeaderLike(toLines[0])) toLines = toLines.slice(1)

    const ops = diffLines(asLines, toLines)
    const rawRows = buildDiffRows(ops, asLines, toLines)

    // 화면에 보여줄 행 번호 라벨: 두 쪽 번호가 같으면 하나만, 다르면 "AS→TO"로 표시.
    // row 자체는 DB의 row_index(정수) 컬럼과 호환되도록 출력 순서 그대로 1,2,3...을 사용.
    const withLabel = (r, i) => ({
      ...r,
      row: i + 1,
      rowLabel: r.asRow != null && r.toRow != null
        ? (r.asRow === r.toRow ? `${r.asRow}` : `${r.asRow}→${r.toRow}`)
        : r.asRow != null ? `${r.asRow}` : `${r.toRow}`,
    })

    const all = rawRows.map(withLabel)
    const diff = all.filter(r => r.status !== '동일')

    let changed = 0, added = 0, removed = 0
    diff.forEach(r => {
      if (r.status === '변경') changed++
      else if (r.status === '추가') added++
      else if (r.status === '삭제') removed++
    })

    setStats({ total: Math.max(asLines.length, toLines.length), changed, added, removed, diffCount: diff.length })
    setDiffData(diff); setAllData(all)
  }, [])

  const runDiff = useCallback(() => runDiffFrom(asWasInput, toBeInput), [asWasInput, toBeInput, runDiffFrom])

  // 엑셀/HTML 모드 공통: 추출된 줄 배열을 텍스트박스에 채우고 바로 비교 실행
  const applyExtractedLines = useCallback((asLines, toLines, meta = {}) => {
    const asRaw = asLines.join('\n')
    const toRaw = toLines.join('\n')
    setAsWasInput(asRaw)
    setToBeInput(toRaw)
    setAsWasFileName(meta.asLabel || '')
    setToBeFileName(meta.toLabel || '')
    runDiffFrom(asRaw, toRaw)
  }, [runDiffFrom])

  // ── 엑셀 모드 ──────────────────────────────────────────────
  const handleExcelApply = (asLines, toLines, meta) => {
    setShowExcelImport(false)
    applyExtractedLines(asLines, toLines, meta)
  }

  // ── HTML 모드 (AS-WAS / TO-BE 파일 각각 업로드) ─────────────
  // vscode의 "Compare Selected"와 똑같이, 태그를 해석하거나 속성을 따로
  // 뽑아내지 않고 파일의 실제 텍스트(원본 그대로)를 줄 단위로만 비교한다.
  // (이전에 태그마다 속성을 전부 별도 줄로 뽑아내던 방식은 줄 수가 폭발적으로
  // 늘어나 화면과 PC가 멈추는 원인이었다.)
  const readHtmlFile = (file) => new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result || ''))
    r.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
    r.readAsText(file, 'utf-8')
  })

  const handleAsHtmlFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setHtmlLoadError('')
    try {
      const text = await readHtmlFile(file)
      const lines = text.split(/\r?\n/)
      if (lines.length === 0) { setHtmlLoadError('AS-WAS 파일이 비어 있습니다.'); return }
      setAsHtmlLines(lines)
      setAsWasFileName(`📄 ${file.name} · ${lines.length}줄`)
    } catch (err) {
      setHtmlLoadError(err.message || 'AS-WAS 파일 처리 중 오류가 발생했습니다.')
    }
  }

  const handleToBeHtmlFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setHtmlLoadError('')
    try {
      const text = await readHtmlFile(file)
      const lines = text.split(/\r?\n/)
      if (lines.length === 0) { setHtmlLoadError('TO-BE 파일이 비어 있습니다.'); return }
      setToHtmlLines(lines)
      setToBeFileName(`📄 ${file.name} · ${lines.length}줄`)
    } catch (err) {
      setHtmlLoadError(err.message || 'TO-BE 파일 처리 중 오류가 발생했습니다.')
    }
  }

  // 두 HTML 파일이 모두 로드되면 자동으로 비교 실행
  useEffect(() => {
    if (inputMode === 'html' && asHtmlLines && toHtmlLines) {
      applyExtractedLines(asHtmlLines, toHtmlLines, { asLabel: asWasFileName, toLabel: toBeFileName })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asHtmlLines, toHtmlLines])

  const switchInputMode = (nextMode) => {
    setInputMode(nextMode)
    setHtmlLoadError('')
  }

  const clearAll = () => {
    setAsWasInput(''); setToBeInput(''); setDiffData(null); setAllData(null)
    setStats(null); setExtractError(''); setSaveMsg('')
    setSaveMeta({ product_name:'', requester:'', request_date:today(), note:'' })
    setAsWasFileName(''); setToBeFileName('')
    setAsHtmlLines(null); setToHtmlLines(null); setHtmlLoadError('')
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
    const rows = diffData.map(d => `${d.rowLabel ?? d.row}\t${d.asWas}\t${d.toBe}\t${d.status}`)
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
            <div className="input-mode-tabs">
              {[
                ['text',  '✍️ 텍스트 입력'],
                ['excel', '📊 엑셀 파일'],
                ['html',  '🌐 HTML 파일'],
              ].map(([key, label]) => (
                <button key={key}
                  className={`input-mode-tab${inputMode === key ? ' active' : ''}`}
                  onClick={() => switchInputMode(key)}>
                  {label}
                </button>
              ))}
            </div>

            {showExcelImport && (
              <ExtractExcelImportModal
                onClose={() => setShowExcelImport(false)}
                onApply={handleExcelApply}
              />
            )}

            {inputMode === 'excel' && (
              <div className="file-load-bar">
                <button className="file-load-btn" onClick={() => setShowExcelImport(true)}>
                  📊 엑셀 업로드
                </button>
                <span className="file-load-name">
                  같은 시트의 두 열을 골라 AS-WAS/TO-BE로 비교합니다. 셀 안 줄바꿈도 한 행으로 정확히 인식됩니다.
                </span>
              </div>
            )}

            {inputMode === 'html' && (
              <div className="file-load-bar" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 8 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="file-load-btn" style={{ display: 'inline-block' }}>
                    AS-WAS HTML 선택
                    <input type="file" accept=".html,.htm" onChange={handleAsHtmlFile} style={{ display: 'none' }} />
                  </label>
                  <span className={`file-load-name${asHtmlLines ? ' loaded' : ''}`}>
                    {asWasFileName || '파일을 선택해주세요'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <label className="file-load-btn" style={{ display: 'inline-block' }}>
                    TO-BE HTML 선택
                    <input type="file" accept=".html,.htm" onChange={handleToBeHtmlFile} style={{ display: 'none' }} />
                  </label>
                  <span className={`file-load-name${toHtmlLines ? ' loaded' : ''}`}>
                    {toBeFileName || '파일을 선택해주세요'}
                  </span>
                </div>
                {htmlLoadError && <div style={{ fontSize: 11, color: '#dc2626' }}>⚠ {htmlLoadError}</div>}
                <span className="input-hint" style={{ margin: 0 }}>
                  두 파일이 모두 선택되면 자동으로 비교가 실행됩니다. HTML 태그는 제거되고, 문단/줄바꿈 태그(&lt;br&gt;, &lt;p&gt; 등) 기준으로 줄이 나뉩니다.
                </span>
              </div>
            )}

            <div className="input-grid">
              <div className="input-card as-card">
                <div className="input-label">
                  <span className="col-badge as-badge">3열</span>AS-WAS — 현재 카피
                </div>
                <textarea className="paste-area" value={asWasInput}
                  onChange={e => setAsWasInput(e.target.value)}
                  placeholder={"엑셀에서 AS-WAS 열 전체 복사 후 붙여넣기\n\n헤더 포함/미포함 모두 자동 감지합니다."} />
                <div className="input-hint">
                  {asWasFileName || (asWasInput ? `${parseCol(asWasInput).length}행 입력됨` : '헤더 포함/미포함 모두 가능')}
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
                  {toBeFileName || (toBeInput ? `${parseCol(toBeInput).length}행 입력됨` : '행 수가 AS-WAS와 동일해야 함')}
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
                        {/* <button className="btn-merge-send" onClick={() => {
                          // TO-BE 카피를 MergeTab으로 전달 (localStorage 경유)
                          const toBeLines = diffData.map(d => d.toBe).filter(Boolean)
                          localStorage.setItem('merge_en_copy', toBeLines.join('\n'))
                          alert(`✅ ${toBeLines.length}개 카피를 "카피덱 Merge" 탭으로 보냈습니다.\n탭을 전환하면 자동 로드됩니다.`)
                        }}>
                          🔀 Merge 탭으로 보내기
                        </button> */}
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
                {/* <button className="btn-merge-send" onClick={() => {
                          // TO-BE 카피를 MergeTab으로 전달 (localStorage 경유)
                          const toBeLines = diffData.map(d => d.toBe).filter(Boolean)
                          localStorage.setItem('merge_en_copy', toBeLines.join('\n'))
                          alert(`✅ ${toBeLines.length}개 카피를 "카피덱 Merge" 탭으로 보냈습니다.\n탭을 전환하면 자동 로드됩니다.`)
                        }}>
                          🔀 Merge 탭으로 보내기
                        </button> */}
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