import { useState, useCallback } from 'react'
import './App.css'
import { api } from './api.js'
import ExtractTab from './tabs/ExtractTab.jsx'
import CountryTab from './tabs/CountryTab.jsx'
import StatusTab  from './tabs/StatusTab.jsx'

const TABS = {
  EXTRACT:  'extract',
  COUNTRY:  'country',
  STATUS:   'status',
  SETTINGS: 'settings',
}

const DB_BADGE = {
  disconnected: { label: '미연결',     cls: 'badge-gray'   },
  connecting:   { label: '연결 중...', cls: 'badge-yellow' },
  connected:    { label: 'DB 연결됨',  cls: 'badge-green'  },
  error:        { label: '연결 오류',  cls: 'badge-red'    },
}

export default function App() {
  const [tab, setTab] = useState(TABS.EXTRACT)

  // ── DB 연결 상태 (Settings 탭 + ExtractTab 공유) ──────────
  const [dbConfig, setDbConfig] = useState({
    host: 'localhost', port: '3306', user: 'root', password: '0000', database: 'copy_diff_db',
  })
  const [dbStatus,  setDbStatus]  = useState('disconnected')
  const [dbMessage, setDbMessage] = useState('')

  const handleConnect = useCallback(async () => {
    setDbStatus('connecting')
    try {
      const res = await api.dbConnect({ ...dbConfig, port: Number(dbConfig.port) })
      if (res.ok) {
        const init = await api.dbInit()
        if (init.ok) { setDbStatus('connected'); setDbMessage('연결 및 테이블 초기화 완료') }
        else          { setDbStatus('error');     setDbMessage('테이블 생성 실패: ' + init.message) }
      } else {
        setDbStatus('error'); setDbMessage(res.message)
      }
    } catch (e) {
      setDbStatus('error'); setDbMessage(e.message)
    }
  }, [dbConfig])

  return (
    <div className="app">

      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo-mark">CD</div>
          <div>
            <h1>AE automation Tool</h1>
            <p>AS-WAS / TO-BE 비교 &amp; 히스토리 관리</p>
          </div>
        </div>
        <div className="header-right">
          <span className={`db-badge ${DB_BADGE[dbStatus].cls}`}>{DB_BADGE[dbStatus].label}</span>
        </div>
      </header>

      {/* ── TABS ── */}
      <nav className="tab-nav">
        {[
          { key: TABS.EXTRACT,  label: '업데이트 영역 추출 · 조회' },
          { key: TABS.COUNTRY,  label: '국가별 카피 제품 출시 반영 검수' },
          { key: TABS.STATUS,   label: '국가별 카피 작업 현황' },
          { key: TABS.SETTINGS, label: 'DB 설정' },
        ].map(t => (
          <button key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </nav>

      <main className="main-content">

        {/* ExtractTab: dbStatus를 prop으로 전달 */}
        {tab === TABS.EXTRACT  && <ExtractTab dbStatus={dbStatus} />}
        {tab === TABS.COUNTRY  && <CountryTab />}
        {tab === TABS.STATUS   && <StatusTab />}

        {/* ══════════ TAB: DB 설정 ══════════ */}
        {tab === TABS.SETTINGS && (
          <div className="settings-layout">
            <div className="settings-card">
              <h2 className="settings-title">MySQL 연결 설정</h2>

              <div className="form-grid">
                {[
                  ['host',     '호스트',        'localhost'],
                  ['port',     '포트',          '3306'],
                  ['user',     '사용자명',       'root'],
                  ['password', '비밀번호',       ''],
                  ['database', '데이터베이스명', 'copy_diff_db'],
                ].map(([key, label, ph]) => (
                  <div key={key} className="form-row">
                    <label className="form-label">{label}</label>
                    <input className="form-input"
                      type={key === 'password' ? 'password' : 'text'}
                      placeholder={ph}
                      value={dbConfig[key]}
                      onChange={e => setDbConfig(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>

              <div className="settings-actions">
                <button className="btn-primary" onClick={handleConnect}
                  disabled={dbStatus === 'connecting'}>
                  {dbStatus === 'connecting' ? '연결 중...' : '연결 테스트 & 초기화'}
                </button>
                {dbMessage && (
                  <span className={dbStatus === 'connected' ? 'form-ok' : 'form-err'}>
                    {dbMessage}
                  </span>
                )}
              </div>

              <div className="guide-box">
                <h3>MySQL 설치 가이드</h3>
                <ol>
                  <li>
                    <strong>MySQL Community Server 다운로드</strong><br />
                    <a href="https://dev.mysql.com/downloads/mysql/" target="_blank" rel="noreferrer">
                      https://dev.mysql.com/downloads/mysql/
                    </a><br />
                    → Windows (x86, 64-bit), MSI Installer 선택
                  </li>
                  <li>
                    <strong>설치 중 설정</strong>
                    <ul>
                      <li>Setup Type: Developer Default 또는 Server only</li>
                      <li>root 비밀번호 설정 (위 "비밀번호" 칸에 동일하게 입력)</li>
                      <li>포트: 기본값 3306 유지 권장</li>
                    </ul>
                  </li>
                  <li>
                    <strong>데이터베이스 생성</strong><br />
                    MySQL Workbench 또는 CLI에서 실행:<br />
                    <code>CREATE DATABASE copy_diff_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;</code>
                  </li>
                  <li>
                    <strong>이 앱에서 "연결 테스트 &amp; 초기화" 클릭</strong><br />
                    → 테이블이 자동으로 생성됩니다.
                  </li>
                </ol>
              </div>

              <div className="schema-box">
                <h3>생성되는 테이블 구조</h3>
                <pre>{`copy_requests (요청 묶음)
├── id              INT AUTO_INCREMENT PK
├── product_name    VARCHAR(255)
├── requester       VARCHAR(100)
├── request_date    DATE
├── note            TEXT
└── created_at      DATETIME

copy_rows (행별 카피)
├── id              INT AUTO_INCREMENT PK
├── request_id      INT → copy_requests.id (FK)
├── row_index       INT
├── as_was          TEXT
├── to_be           TEXT
├── status          ENUM(변경/추가/삭제/동일)
└── created_at      DATETIME`}</pre>
              </div>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}