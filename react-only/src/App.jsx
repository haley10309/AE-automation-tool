import { useState, useCallback, useEffect } from 'react'
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
    const res = await api.dbGetRows({ requestId: req.id, diffOnly: false })
    if (res.ok) setReqRows(res.data)
  }

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
        {[{ key:TABS.EXTRACT, label:'추출' }, { key:TABS.COUNTRY, label:'국가별 카피 검수' }, { key:TABS.HISTORY, label:'이력 조회' }, { key:TABS.SETTINGS, label:'DB 설정' }].map(t => (
          <button key={t.key} className={`tab-btn ${tab===t.key?'active':''}`} onClick={()=>setTab(t.key)}>{t.label}</button>
        ))}
      </nav>

      <main className="main-content">

        {/* ══════════════ TAB: 추출 ══════════════ */}
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

        {/* ══════════════ TAB: 이력 조회 ══════════════ */}
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
                      <DiffTable
                        rows={(diffOnlyView ? reqRows.filter(r=>r.status!=='동일') : reqRows).map(r=>({ row:r.row_index, asWas:r.as_was, toBe:r.to_be, status:r.status }))}
                        statusColor={statusColor}
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

// ── 공용 테이블 컴포넌트 ─────────────────────────────────────
function DiffTable({ rows, statusColor }) {
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
              <td className="td-as">{d.asWas || <em className="empty-val">빈 값</em>}</td>
              <td className="td-to">{d.toBe || <em className="empty-val">빈 값</em>}</td>
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
}
