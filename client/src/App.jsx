import { useState, useEffect } from 'react'
import './App.css'
import { api } from './api.js'
import { AuthProvider, useAuth } from './auth.jsx'
import { DBProvider, useDB } from './DBContext.jsx'
import AuthPage from './pages/AuthPage.jsx'
import ExtractTab from './tabs/ExtractTab.jsx'
import CountryTab from './tabs/CountryTab.jsx'
import StatusTab  from './tabs/StatusTab.jsx'
import MergeTab   from './tabs/MergeTab.jsx'
import AdminTab   from './tabs/AdminTab.jsx'

const TABS = {
  EXTRACT:  'extract',
  MERGE:    'merge',
  COUNTRY:  'country',
  STATUS:   'status',
  ADMIN:    'admin',
  SETTINGS: 'settings',
}

const DB_BADGE = {
  disconnected: { label: '미연결',     cls: 'badge-gray'   },
  connecting:   { label: '연결 중...', cls: 'badge-yellow' },
  connected:    { label: 'DB 연결됨',  cls: 'badge-green'  },
  error:        { label: '연결 오류',  cls: 'badge-red'    },
}

const POSITION_LABELS = {
  publisher:        '퍼블리셔',
  ae:                'AE',
  intern_publisher: '인턴(퍼블리셔)',
  intern_ae:        '인턴(AE)',
  admin:             '관리자',
}

// ── 실제 앱 (로그인 후) ───────────────────────────────────────
function AppContent() {
  const { dbStatus, dbMessage, connect, dbConfig, setDbConfig } = useDB()  // ← Context에서 가져오기
  const { user, logout } = useAuth()

  const [tab, setTab] = useState(
    () => localStorage.getItem('ae_tool_tab') || TABS.EXTRACT
  )
  // 이미 활성 상태인 탭을 다시 클릭하면 증가 — 각 탭이 이 값을 보고
  // 프로젝트 상세 화면에 있어도 목록으로 돌아가도록 리셋 신호로 사용
  const [statusResetKey, setStatusResetKey] = useState(0)
  const [mergeResetKey, setMergeResetKey] = useState(0)
  const [countryResetKey, setCountryResetKey] = useState(0)

  // 탭 변경 시 localStorage에 저장
  const handleTabChange = (key) => {
    if (key === tab) {
      if (key === TABS.STATUS)  setStatusResetKey(k => k + 1)
      if (key === TABS.MERGE)   setMergeResetKey(k => k + 1)
      if (key === TABS.COUNTRY) setCountryResetKey(k => k + 1)
    }
    localStorage.setItem('ae_tool_tab', key)
    setTab(key)
  }

 

  return (
    <div className="app">
      {/* ── HEADER ── */}
      <header className="app-header">
        <div className="header-left">
          <img src="./app-icon.png" alt="logo" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover" }} />
          <div>
            <h1>AE Plus</h1>
            <p>AS-WAS / TO-BE 비교 &amp; 히스토리 관리</p>
          </div>
        </div>
        <div className="header-right">
          <span className={`db-badge ${DB_BADGE[dbStatus].cls}`}>{DB_BADGE[dbStatus].label}</span>
          {/* 사용자 정보 + 로그아웃 */}
          <div className="user-info">
            <span className="user-name">{user.name}</span>
            <span className={`user-position ${user.position}`}>
              {POSITION_LABELS[user.position] || user.position}
            </span>
            <button className="btn-logout" onClick={logout}>로그아웃</button>
          </div>
        </div>
      </header>

      {/* ── TABS ── */}
      <nav className="tab-nav">
        {[
          { key: TABS.EXTRACT,  label: 'Updated copy' },
          { key: TABS.MERGE,    label: 'Copy Merge' },
          { key: TABS.COUNTRY,  label: 'Product reflection' },
          { key: TABS.STATUS,   label: 'Status' },
        ].map(t => (
          <button key={t.key}
            className={`tab-btn ${tab === t.key ? 'active' : ''}`}
            onClick={() => handleTabChange(t.key)}>
            {t.label}
          </button>
        ))}
        {user.position === 'admin' && (
          <button
            className={`tab-btn ${tab === TABS.ADMIN ? 'active' : ''}`}
            onClick={() => handleTabChange(TABS.ADMIN)}>
            👑 Admin
          </button>
        )}
        <button
          className={`tab-btn ${tab === TABS.SETTINGS ? 'active' : ''}`}
          style={{ marginLeft: 'auto' }}
          onClick={() => handleTabChange(TABS.SETTINGS)}>
          DB 설정
        </button>
      </nav>

      <main className="main-content">
        {tab === TABS.EXTRACT  && <ExtractTab />}
        {tab === TABS.MERGE    && <MergeTab resetKey={mergeResetKey} />}
        {tab === TABS.COUNTRY  && <CountryTab resetKey={countryResetKey} />}
        {tab === TABS.STATUS   && <StatusTab resetKey={statusResetKey} />}
        {tab === TABS.ADMIN && user.position === 'admin' && <AdminTab />}

        {/* ═══ DB 설정 탭 ═══ */}
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
                      placeholder={ph} value={dbConfig[key]}
                      onChange={e => setDbConfig(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                ))}
              </div>
              <div className="settings-actions">
                <button className="btn-primary" onClick={() => connect(dbConfig)}
                  disabled={dbStatus === 'connecting'}>
                  {dbStatus === 'connecting' ? '연결 중...' : '연결 테스트 & 초기화'}
                </button>
                {dbMessage && (
                  <span className={dbStatus === 'connected' ? 'form-ok' : 'form-err'}>
                    {dbMessage}
                  </span>
                )}
              </div>

              {/* 사용자 관리는 이제 상단 "Admin" 탭(관리자 전용)에서 통합 관리합니다 */}

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
                      <li>root 비밀번호 설정 후 위 "비밀번호" 칸에 동일하게 입력</li>
                      <li>포트: 기본값 3306 유지 권장</li>
                    </ul>
                  </li>
                  <li>
                    <strong>데이터베이스 생성</strong><br />
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
                <pre>{`copy_requests / copy_rows — 카피 추출·이력
cc_projects / cc_project_copies — 국가별 카피 프로젝트
samsung_products — 제품 출시 데이터
tracker_pages / tracker_status / page_files — 작업 현황
users — 사용자 계정`}</pre>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

// ── 진입점: 인증 상태에 따라 AuthPage or AppContent ───────────
function AppRouter() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="auth-loading">
        <div className="auth-loading-spinner" />
        <span>로딩 중...</span>
      </div>
    )
  }

  return user ? <AppContent /> : <AuthPage />
}
export default function App() {
  return (
    <DBProvider>
      <AuthProvider>
        <AppRouter />
      </AuthProvider>
    </DBProvider>
  )
}