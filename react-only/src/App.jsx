import { useState, useCallback, useEffect, useMemo, memo, useRef } from 'react'
import './App.css'
import { api } from './api.js'
import CountryCheck from './CountryCheck.jsx'

// ── Electron IPC 브릿지 (웹 환경에서는 null) ──────────────────

// ── 파싱 유틸 ────────────────────────────────────────────────
function parseCol(raw) {
  if (!raw.trim()) return []
  return raw.split(/\r?\n/).map((l) => l.trim())
}
function isHeaderLike(val) {
  const l = val.toLowerCase()
  return ['as-was','as was','aswas','현재','before','to-be','to be','tobe','이후','after','기존','변경']
    .some(k => l.includes(k))
}
function normalize(s) { return s.replace(/\s+/g,' ').trim() }
function getStatus(a, b) {
  if (!a && b) return '추가'
  if (a && !b) return '삭제'
  return '변경'
}
function today() { return new Date().toISOString().slice(0,10) }

// ── 탭 상수 ──────────────────────────────────────────────────
const TABS = { EXTRACT: 'extract', COUNTRY: 'country', HISTORY: 'history', SETTINGS: 'settings' }

export default function App() {
  const [tab, setTab] = useState(TABS.EXTRACT)

  // DB 연결 상태
  const [dbConfig, setDbConfig] = useState({ host:'localhost', port:'3306', user:'root', password:'0000', database:'copy_diff_db' })
  const [dbStatus, setDbStatus] = useState('disconnected') // disconnected | connecting | connected | error
  const [dbMessage, setDbMessage] = useState('')

  // 추출기 상태
  const [asWasInput, setAsWasInput] = useState('')
  const [toBeInput, setToBeInput]   = useState('')
  const [diffData, setDiffData]     = useState(null)
  const [allData, setAllData]       = useState(null)
  const [stats, setStats]           = useState(null)
  const [extractError, setExtractError] = useState('')
  const [copied, setCopied]         = useState(false)

  // 저장 모달
  const [showSaveModal, setShowSaveModal] = useState(false)
  const [saveMeta, setSaveMeta] = useState({ product_name:'', requester:'', request_date: today(), note:'' })
  const [saving, setSaving]     = useState(false)
  const [saveMsg, setSaveMsg]   = useState('')

  // 이력 조회
  const [requests, setRequests]     = useState([])
  const [selectedReq, setSelectedReq] = useState(null)
  const [reqRows, setReqRows]       = useState([])
  const [diffOnlyView, setDiffOnlyView] = useState(true)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [rowActionMsg, setRowActionMsg] = useState('')

  // ── DB 연결 ────────────────────────────────────────────────
  const handleConnect = async () => {
    if (!api) { setDbStatus('error'); setDbMessage('Electron 환경에서만 DB 연결이 가능합니다.'); return }
    setDbStatus('connecting')
    const res = await api.dbConnect({ ...dbConfig, port: Number(dbConfig.port) })
    if (res.ok) {
      const init = await api.dbInit()
      if (init.ok) { setDbStatus('connected'); setDbMessage('연결 및 테이블 초기화 완료') }
      else          { setDbStatus('error'); setDbMessage('테이블 생성 실패: ' + init.message) }
    } else {
      setDbStatus('error'); setDbMessage(res.message)
    }
  }

  // ── 추출 ──────────────────────────────────────────────────
  const runDiff = useCallback(() => {
    setExtractError(''); setDiffData(null); setAllData(null); setSaveMsg('')
    if (!asWasInput.trim() || !toBeInput.trim()) { setExtractError('AS-WAS와 TO-BE 열을 모두 입력해주세요.'); return }

    let asLines = parseCol(asWasInput)
    let toLines = parseCol(toBeInput)
    if (asLines.length > 0 && isHeaderLike(asLines[0])) asLines = asLines.slice(1)
    if (toLines.length > 0 && isHeaderLike(toLines[0])) toLines = toLines.slice(1)

    const maxLen = Math.max(asLines.length, toLines.length)
    while (asLines.length < maxLen) asLines.push('')
    while (toLines.length < maxLen) toLines.push('')

    if (Math.abs(asLines.length - toLines.length) > 5 && maxLen > 10)
      setExtractError(`행 수 차이가 큽니다 (AS-WAS: ${asLines.length}행, TO-BE: ${toLines.length}행)`)

    const diff=[], all=[]
    let changed=0, added=0, removed=0

    for (let i=0; i<maxLen; i++) {
      const a = normalize(asLines[i]||'')
      const b = normalize(toLines[i]||'')
      if (a === b) { all.push({ row:i+1, asWas:a, toBe:b, status:'동일' }); continue }
      const status = getStatus(a,b)
      if (status==='변경') changed++
      else if (status==='추가') added++
      else removed++
      const row = { row:i+1, asWas:a, toBe:b, status }
      diff.push(row); all.push(row)
    }

    setStats({ total:maxLen, changed, added, removed, diffCount:diff.length })
    setDiffData(diff); setAllData(all)
  }, [asWasInput, toBeInput])

  const clearAll = () => { setAsWasInput(''); setToBeInput(''); setDiffData(null); setAllData(null); setStats(null); setExtractError(''); setSaveMsg('') }

  // ── 저장 ──────────────────────────────────────────────────
  const handleSave = async () => {
    if (!api) { setSaveMsg('❌ Electron 환경에서만 저장 가능합니다.'); return }
    if (dbStatus !== 'connected') { setSaveMsg('❌ DB에 먼저 연결해주세요.'); return }
    if (!saveMeta.product_name.trim()) { setSaveMsg('❌ 제품/페이지명을 입력해주세요.'); return }

    setSaving(true); setSaveMsg('')
    const res = await api.dbSave({ meta: saveMeta, allRows: allData })
    setSaving(false)
    if (res.ok) {
      setSaveMsg(`✅ 저장 완료 (요청 ID: ${res.requestId})`)
      setTimeout(() => setShowSaveModal(false), 1500)
    } else {
      setSaveMsg('❌ 저장 실패: ' + res.message)
    }
  }

  // ── 이력 조회 ─────────────────────────────────────────────
  const loadHistory = async () => {
    if (!api || dbStatus !== 'connected') return
    setHistoryLoading(true)
    const res = await api.dbListRequests()
    if (res.ok) setRequests(res.data)
    setHistoryLoading(false)
  }

  const loadRows = async (req) => {
    setSelectedReq(req)
    setRowActionMsg('')
    const res = await api.dbGetRows({ requestId: req.id, diffOnly: false })
    if (res.ok) setReqRows(res.data)
  }

  // useCallback으로 고정 → HistoryTable이 불필요하게 재렌더되지 않음
  const handleUpdateRow = useCallback(async (rowId, draft) => {
    const res = await api.updateRow(rowId, draft)
    if (res.ok) {
      setReqRows(prev => prev.map(r =>
        r.id === rowId ? { ...r, as_was: draft.as_was, to_be: draft.to_be, status: res.status } : r
      ))
      setRowActionMsg('✅ 수정 완료')
      setTimeout(() => setRowActionMsg(''), 2000)
    } else {
      setRowActionMsg('❌ 수정 실패: ' + res.message)
    }
    return res.ok
  }, [])

  const handleDeleteRow = useCallback(async (rowId) => {
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

  useEffect(() => { if (tab === TABS.HISTORY) loadHistory() }, [tab, dbStatus])

  // ── 색상 헬퍼 ─────────────────────────────────────────────
  const statusColor = { 변경:{ bg:'#dbeafe', fg:'#1e40af' }, 추가:{ bg:'#dcfce7', fg:'#166534' }, 삭제:{ bg:'#fee2e2', fg:'#991b1b' }, 동일:{ bg:'#f3f4f6', fg:'#6b7280' } }

  const copyTSV = () => {
    if (!diffData?.length) return
    const h = '행번호\tAS-WAS\tTO-BE\t상태'
    const rows = diffData.map(d => `${d.row}\t${d.asWas}\t${d.toBe}\t${d.status}`)
    navigator.clipboard.writeText([h,...rows].join('\n')).then(() => { setCopied(true); setTimeout(()=>setCopied(false),1800) })
  }

  // ── DB 상태 뱃지 ──────────────────────────────────────────
  const dbBadge = { disconnected:{ label:'미연결', cls:'badge-gray' }, connecting:{ label:'연결 중...', cls:'badge-yellow' }, connected:{ label:'DB 연결됨', cls:'badge-green' }, error:{ label:'연결 오류', cls:'badge-red' } }

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark">CD</div>
          <div>
            <h1>카피덱 변경점 추출기</h1>
            <p>AS-WAS / TO-BE 비교 &amp; MySQL 저장</p>
          </div>
        </div>
        <div className="header-right">
          <span className={`db-badge ${dbBadge[dbStatus].cls}`}>{dbBadge[dbStatus].label}</span>
        </div>
      </header>

      {/* ── TABS ── */}
      <nav className="tab-nav">
        {[{ key:TABS.EXTRACT, label:'업데이트 영역 추출' }, { key:TABS.COUNTRY, label:'국가별 카피 제품 출시 반영 검수' }, { key:TABS.HISTORY, label:'업데이트 영역 조회' }, { key:TABS.SETTINGS, label:'DB 설정' }].map(t => (
          <button key={t.key} className={`tab-btn ${tab===t.key?'active':''}`} onClick={()=>setTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      <main className="main-content">

        {/* ══════════════ TAB: 업데이트 영역 추출 ══════════════ */}
        {tab === TABS.EXTRACT && (
          <>
            <div className="input-grid">
              <div className="input-card as-card">
                <div className="input-label"><span className="col-badge as-badge">3열</span>AS-WAS — 현재 카피</div>
                <textarea className="paste-area" value={asWasInput} onChange={e=>setAsWasInput(e.target.value)}
                  placeholder={"엑셀에서 AS-WAS 열 전체 복사 후 붙여넣기\n\n헤더 포함/미포함 모두 자동 감지합니다."} />
                <div className="input-hint">{asWasInput ? `${parseCol(asWasInput).length}행 입력됨` : '헤더 포함/미포함 모두 가능'}</div>
              </div>
              <div className="divider-arrow">→</div>
              <div className="input-card to-card">
                <div className="input-label"><span className="col-badge to-badge">4열</span>TO-BE — 변경할 카피</div>
                <textarea className="paste-area" value={toBeInput} onChange={e=>setToBeInput(e.target.value)}
                  placeholder={"엑셀에서 TO-BE 열 전체 복사 후 붙여넣기\n\n행 수가 AS-WAS와 동일해야 합니다."} />
                <div className="input-hint">{toBeInput ? `${parseCol(toBeInput).length}행 입력됨` : '행 수가 AS-WAS와 동일해야 함'}</div>
              </div>
            </div>

            <div className="action-row">
              <button className="btn-primary" onClick={runDiff}>변경된 행 추출하기</button>
              <button className="btn-ghost" onClick={clearAll}>초기화</button>
              {diffData && diffData.length > 0 && (
                <button className="btn-save" onClick={()=>{ setSaveMsg(''); setShowSaveModal(true) }} disabled={dbStatus!=='connected'} title={dbStatus!=='connected'?'DB 설정 탭에서 먼저 연결해주세요':''}>
                  DB에 저장하기 {dbStatus!=='connected' && '(DB 연결 필요)'}
                </button>
              )}
            </div>

            {extractError && <div className="error-banner">{extractError}</div>}
            {saveMsg && <div className={saveMsg.startsWith('✅') ? 'success-banner' : 'error-banner'}>{saveMsg}</div>}

            {diffData !== null && (
              <div className="result-section">
                {stats && (
                  <div className="stats-row">
                    {[['전체 행', stats.total, false],['변경된 행', stats.diffCount, true],['수정', stats.changed, false],['추가', stats.added, false],['삭제', stats.removed, false]].map(([lbl,num,hi]) => (
                      <div key={lbl} className={`stat-pill ${hi?'highlight':''}`}><span className="stat-num">{num}</span><span className="stat-lbl">{lbl}</span></div>
                    ))}
                  </div>
                )}
                {diffData.length === 0 ? (
                  <div className="empty-state"><div className="empty-icon">✓</div><p>변경된 행이 없습니다.</p><small>AS-WAS와 TO-BE가 모두 동일합니다.</small></div>
                ) : (
                  <>
                    <div className="result-toolbar">
                      <span className="result-title">변경 항목 {diffData.length}건</span>
                      <button className="btn-copy" onClick={copyTSV}>{copied ? '복사됨 ✓' : 'TSV 복사 (엑셀 붙여넣기용)'}</button>
                    </div>
                    <DiffTable rows={diffData} statusColor={statusColor} />
                  </>
                )}
              </div>
            )}
          </>
        )}

        {tab === TABS.COUNTRY && <CountryCheck />}

        {/* ══════════════ TAB: 업데이트 영역 조회 ══════════════ */}
        {tab === TABS.HISTORY && (
          <div className="history-layout">
            {dbStatus !== 'connected' ? (
              <div className="info-box">DB 설정 탭에서 먼저 연결해주세요.</div>
            ) : (
              <>
                <div className="history-sidebar">
                  <div className="sidebar-header">
                    <span className="sidebar-title">저장된 요청</span>
                    <button className="btn-sm" onClick={loadHistory}>새로고침</button>
                  </div>
                  {historyLoading && <div className="loading">불러오는 중...</div>}
                  {!historyLoading && requests.length === 0 && <div className="empty-hint">저장된 요청이 없습니다.</div>}
                  {requests.map(r => (
                    <div key={r.id} className={`req-item ${selectedReq?.id===r.id?'active':''}`} onClick={()=>loadRows(r)}>
                      <div className="req-name">{r.product_name}</div>
                      <div className="req-meta">{r.request_date} · {r.requester||'요청자 없음'}</div>
                      <div className="req-count">전체 {r.total_rows}행 / 변경 {r.diff_rows}행</div>
                    </div>
                  ))}
                </div>

                <div className="history-main">
                  {!selectedReq && <div className="empty-hint center">왼쪽에서 요청을 선택하세요.</div>}
                  {selectedReq && (
                    <>
                      <div className="req-detail-header">
                        <div>
                          <h2 className="req-detail-title">{selectedReq.product_name}</h2>
                          <div className="req-detail-meta">
                            {selectedReq.request_date} · {selectedReq.requester||'요청자 없음'}
                            {selectedReq.note && <span> · {selectedReq.note}</span>}
                          </div>
                        </div>
                        <label className="toggle-label">
                          <input type="checkbox" checked={diffOnlyView} onChange={e=>setDiffOnlyView(e.target.checked)} />
                          변경행만 보기
                        </label>
                      </div>

                      {rowActionMsg && (
                        <div className={rowActionMsg.startsWith('✅')||rowActionMsg.startsWith('🗑') ? 'success-banner' : 'error-banner'}>
                          {rowActionMsg}
                        </div>
                      )}

                      {/* 편집 가능한 이력 테이블 */}
                      <HistoryTable
                        rows={diffOnlyView ? reqRows.filter(r=>r.status!=='동일') : reqRows}
                        statusColor={statusColor}
                        onUpdate={handleUpdateRow}
                        onDelete={handleDeleteRow}
                      />
                    </>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ══════════════ TAB: DB 설정 ══════════════ */}
        {tab === TABS.SETTINGS && (
          <div className="settings-layout">
            <div className="settings-card">
              <h2 className="settings-title">MySQL 연결 설정</h2>

              <div className="form-grid">
                {[['host','호스트','localhost'],['port','포트','3306'],['user','사용자명','root'],['password','비밀번호',''],['database','데이터베이스명','copy_diff_db']].map(([key,label,ph]) => (
                  <div key={key} className="form-row">
                    <label className="form-label">{label}</label>
                    <input
                      className="form-input"
                      type={key==='password'?'password':'text'}
                      placeholder={ph}
                      value={dbConfig[key]}
                      onChange={e=>setDbConfig(p=>({...p,[key]:e.target.value}))}
                    />
                  </div>
                ))}
              </div>

              <div className="settings-actions">
                <button className="btn-primary" onClick={handleConnect} disabled={dbStatus==='connecting'}>
                  {dbStatus==='connecting' ? '연결 중...' : '연결 테스트 & 초기화'}
                </button>
                {dbMessage && (
                  <span className={dbStatus==='connected' ? 'form-ok' : 'form-err'}>{dbMessage}</span>
                )}
              </div>

              <div className="guide-box">
                <h3>MySQL 설치 가이드</h3>
                <ol>
                  <li><strong>MySQL Community Server 다운로드</strong><br/>
                    <a href="https://dev.mysql.com/downloads/mysql/" target="_blank" rel="noreferrer">https://dev.mysql.com/downloads/mysql/</a><br/>
                    → Windows (x86, 64-bit), MSI Installer 선택
                  </li>
                  <li><strong>설치 중 설정</strong>
                    <ul>
                      <li>Setup Type: Developer Default 또는 Server only</li>
                      <li>root 비밀번호 설정 (위 "비밀번호" 칸에 동일하게 입력)</li>
                      <li>포트: 기본값 3306 유지 권장</li>
                    </ul>
                  </li>
                  <li><strong>데이터베이스 생성</strong><br/>
                    MySQL Workbench 또는 CLI에서 실행:<br/>
                    <code>CREATE DATABASE copy_diff_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;</code>
                  </li>
                  <li><strong>이 앱에서 "연결 테스트 & 초기화" 클릭</strong><br/>
                    → 테이블이 자동으로 생성됩니다.
                  </li>
                </ol>
              </div>

              <div className="schema-box">
                <h3>생성되는 테이블 구조</h3>
                <pre>{`copy_requests (요청 묶음)
├── id              INT AUTO_INCREMENT PK
├── product_name    VARCHAR(255)  제품/페이지명
├── requester       VARCHAR(100)  요청자
├── request_date    DATE          요청 날짜
├── note            TEXT          메모
└── created_at      DATETIME

copy_rows (행별 카피)
├── id              INT AUTO_INCREMENT PK
├── request_id      INT → copy_requests.id (FK)
├── row_index       INT           원본 엑셀 행 번호
├── as_was          TEXT          현재 카피
├── to_be           TEXT          변경 카피
├── status          ENUM(변경/추가/삭제/동일)
└── created_at      DATETIME`}</pre>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ══════════════ SAVE MODAL ══════════════ */}
      {showSaveModal && (
        <div className="modal-overlay" onClick={()=>setShowSaveModal(false)}>
          <div className="modal" onClick={e=>e.stopPropagation()}>
            <h2 className="modal-title">DB에 저장하기</h2>
            <p className="modal-sub">전체 {allData?.length}행 저장 (변경 {stats?.diffCount}행 포함)</p>

            <div className="form-grid">
              {[['product_name','제품/페이지명 *','예: 메인 홈, 상품상세 PDP'],['requester','요청자','예: 홍길동'],['request_date','요청 날짜',''],['note','메모 (선택)','예: 신제품 출시 대응']].map(([key,label,ph]) => (
                <div key={key} className="form-row">
                  <label className="form-label">{label}</label>
                  <input
                    className="form-input"
                    type={key==='request_date'?'date':'text'}
                    placeholder={ph}
                    value={saveMeta[key]}
                    onChange={e=>setSaveMeta(p=>({...p,[key]:e.target.value}))}
                  />
                </div>
              ))}
            </div>

            {saveMsg && <div className={saveMsg.startsWith('✅')?'success-banner':'error-banner'}>{saveMsg}</div>}

            <div className="modal-actions">
              <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving?'저장 중...':'저장하기'}</button>
              <button className="btn-ghost" onClick={()=>setShowSaveModal(false)}>취소</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── 글자 단위 diff ────────────────────────────────────────────
// 최대 200자 초과 시 단어 단위로 자동 전환 (성능 보호)
const CHAR_DIFF_LIMIT = 200

function computeCharDiff(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m+1 }, () => new Array(n+1).fill(0))
  for (let i = m-1; i >= 0; i--)
    for (let j = n-1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1])

  const aParts = [], bParts = []
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      aParts.push({ type:'equal', ch: a[i] }); bParts.push({ type:'equal', ch: b[j] })
      i++; j++
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      bParts.push({ type:'insert', ch: b[j] }); j++
    } else {
      aParts.push({ type:'delete', ch: a[i] }); i++
    }
  }
  return { aParts, bParts }
}

// 단어 단위 diff (긴 문자열 폴백)
function computeWordDiff(a, b) {
  const aw = a.split(/(\s+)/), bw = b.split(/(\s+)/)
  const m = aw.length, n = bw.length
  const dp = Array.from({ length: m+1 }, () => new Array(n+1).fill(0))
  for (let i = m-1; i >= 0; i--)
    for (let j = n-1; j >= 0; j--)
      dp[i][j] = aw[i] === bw[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1])

  const aParts = [], bParts = []
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && aw[i] === bw[j]) {
      aParts.push({ type:'equal', ch: aw[i] }); bParts.push({ type:'equal', ch: bw[j] })
      i++; j++
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      bParts.push({ type:'insert', ch: bw[j] }); j++
    } else {
      aParts.push({ type:'delete', ch: aw[i] }); i++
    }
  }
  return { aParts, bParts }
}

// ── 하이라이트 렌더러 (memo로 불필요한 재렌더 차단) ──────────
const DiffHighlight = memo(function DiffHighlight({ asWas, toBe, side }) {
  const a = asWas || '', b = toBe || ''
  if (!a && !b) return <em className="empty-val">빈 값</em>
  if (a === b)  return <span>{a}</span>

  // 길이 기반 자동 모드 전환
  const useLong = a.length > CHAR_DIFF_LIMIT || b.length > CHAR_DIFF_LIMIT
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { aParts, bParts } = useMemo(
    () => useLong ? computeWordDiff(a, b) : computeCharDiff(a, b),
    [a, b, useLong]
  )
  const parts = side === 'as' ? aParts : bParts

  return (
    <span className="diff-text">
      {parts.map((p, idx) => {
        if (p.type === 'equal')  return <span key={idx}>{p.ch}</span>
        if (p.type === 'delete') return <mark key={idx} className="diff-del">{p.ch}</mark>
        if (p.type === 'insert') return <mark key={idx} className="diff-ins">{p.ch}</mark>
        return null
      })}
    </span>
  )
})

// ── 이력 조회 테이블 ──────────────────────────────────────────
// editingRowId: 컴포넌트 내부 state (App 재렌더 없음)
// textarea: useRef 비제어 입력 (타이핑 중 렌더링 0번)
const HistoryTable = memo(function HistoryTable({ rows, statusColor, onUpdate, onDelete }) {
  const [editingRowId, setEditingRowId] = useState(null)
  const [saving, setSaving] = useState(false)
  const asRef  = useRef(null)
  const toRef  = useRef(null)

  if (!rows || rows.length === 0)
    return <div className="empty-hint center">표시할 항목이 없습니다.</div>

  const startEdit = (row) => {
    setEditingRowId(row.id)
    // ref값은 다음 렌더 후 textarea가 마운트된 뒤 설정
    setTimeout(() => {
      if (asRef.current) asRef.current.value = row.as_was || ''
      if (toRef.current) toRef.current.value  = row.to_be  || ''
    }, 0)
  }

  const cancelEdit = () => setEditingRowId(null)

  const saveEdit = async (rowId) => {
    setSaving(true)
    const ok = await onUpdate(rowId, {
      as_was: asRef.current?.value ?? '',
      to_be:  toRef.current?.value  ?? '',
    })
    setSaving(false)
    if (ok) setEditingRowId(null)
  }

  return (
    <div className="table-wrap">
      <table className="result-table history-table">
        <thead>
          <tr>
            <th className="th-row">#</th>
            <th className="th-as">AS-WAS</th>
            <th className="th-to">TO-BE</th>
            <th className="th-status">상태</th>
            <th className="th-actions">편집</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isEditing = editingRowId === r.id
            return (
              <tr key={r.id} className={isEditing ? 'row-editing' : ''}>
                <td className="td-row">{r.row_index}</td>

                {isEditing ? (
                  <>
                    <td className="td-as td-edit">
                      <textarea ref={asRef} className="edit-textarea as-textarea" defaultValue={r.as_was || ''} />
                    </td>
                    <td className="td-to td-edit">
                      <textarea ref={toRef} className="edit-textarea to-textarea" defaultValue={r.to_be || ''} />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="td-as">
                      <DiffHighlight asWas={r.as_was} toBe={r.to_be} side="as" />
                    </td>
                    <td className="td-to">
                      <DiffHighlight asWas={r.as_was} toBe={r.to_be} side="to" />
                    </td>
                  </>
                )}

                <td className="td-status">
                  <span className="status-badge"
                    style={{ background: statusColor[r.status]?.bg, color: statusColor[r.status]?.fg }}>
                    {r.status}
                  </span>
                </td>
                <td className="td-actions">
                  {isEditing ? (
                    <div className="action-btns">
                      <button className="act-btn act-save" onClick={() => saveEdit(r.id)} disabled={saving}>
                        {saving ? '…' : '저장'}
                      </button>
                      <button className="act-btn act-cancel" onClick={cancelEdit} disabled={saving}>취소</button>
                    </div>
                  ) : (
                    <div className="action-btns">
                      <button className="act-btn act-edit" onClick={() => startEdit(r)} title="수정">✏</button>
                      <button className="act-btn act-delete" onClick={() => onDelete(r.id)} title="삭제">🗑</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})

// ── 추출 탭 전용 테이블 (읽기 전용, memo) ─────────────────────
const DiffTable = memo(function DiffTable({ rows, statusColor }) {
  if (!rows || rows.length === 0) return <div className="empty-hint center">표시할 항목이 없습니다.</div>
  return (
    <div className="table-wrap">
      <table className="result-table">
        <thead>
          <tr>
            <th className="th-row">#</th>
            <th className="th-as">AS-WAS</th>
            <th className="th-to">TO-BE</th>
            <th className="th-status">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((d) => (
            <tr key={d.row}>
              <td className="td-row">{d.row}</td>
              <td className="td-as">
                <DiffHighlight asWas={d.asWas} toBe={d.toBe} side="as" />
              </td>
              <td className="td-to">
                <DiffHighlight asWas={d.asWas} toBe={d.toBe} side="to" />
              </td>
              <td className="td-status">
                <span className="status-badge" style={{ background: statusColor[d.status]?.bg, color: statusColor[d.status]?.fg }}>
                  {d.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})