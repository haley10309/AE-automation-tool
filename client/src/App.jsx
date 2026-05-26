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

const TABS = {
  EXTRACT:  'extract',
  MERGE:    'merge',
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

// ── 실제 앱 (로그인 후) ───────────────────────────────────────
function AppContent() {
  const { dbStatus, dbMessage, connect, dbConfig, setDbConfig } = useDB()  // ← Context에서 가져오기
  const { user, logout } = useAuth()

  const [tab, setTab] = useState(
    () => localStorage.getItem('ae_tool_tab') || TABS.EXTRACT
  )

  // 탭 변경 시 localStorage에 저장
  const handleTabChange = (key) => {
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
            {/* <span className={`user-position ${user.position}`}>
              {user.position === 'regular' ? '정규직' : '인턴'}
            </span> */}
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
        <button
          className={`tab-btn ${tab === TABS.SETTINGS ? 'active' : ''}`}
          style={{ marginLeft: 'auto' }}
          onClick={() => handleTabChange(TABS.SETTINGS)}>
          DB 설정
        </button>
      </nav>

      <main className="main-content">
        {tab === TABS.EXTRACT  && <ExtractTab />}
        {tab === TABS.MERGE    && <MergeTab />}
        {tab === TABS.COUNTRY  && <CountryTab />}
        {tab === TABS.STATUS   && <StatusTab />}

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

              {/* 사용자 관리 — 정규직만 표시 */}
              {user.position === 'regular' && (
                <UserManagement />
              )}

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

// ── 사용자 관리 (정규직 전용) ─────────────────────────────────
function UserManagement() {
  const [users, setUsers]   = useState([])
  const [loading, setLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    const token = localStorage.getItem('ae_tool_token')
    const res = await fetch('http://localhost:4000/api/auth/users', {
      headers: { Authorization: `Bearer ${token}` }
    }).then(r => r.json())
    if (res.ok) setUsers(res.data)
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const toggleApprove = async (id, current) => {
    const token = localStorage.getItem('ae_tool_token')
    await fetch(`http://localhost:4000/api/auth/users/${id}/approve`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ approved: !current }),
    })
    load()
  }

  return (
    <div className="user-mgmt">
      <h3 className="user-mgmt-title">사용자 관리 <span className="user-mgmt-badge">관리자</span></h3>
      {loading && <div className="loading">불러오는 중...</div>}
      <div className="user-mgmt-list">
        {users.map(u => (
          <div key={u.id} className="user-mgmt-item">
            <div className="user-mgmt-info">
              <span className="user-mgmt-name">{u.name}</span>
              <span className="user-mgmt-email">{u.email}</span>
              <span className={`user-position ${u.position}`}>
                {u.position === 'regular' ? '정규직' : '인턴'}
              </span>
            </div>
            <button
              className={`user-mgmt-btn ${u.approved ? 'approved' : 'pending'}`}
              onClick={() => toggleApprove(u.id, u.approved)}>
              {u.approved ? '✓ 승인됨' : '대기 중 — 클릭하여 승인'}
            </button>
          </div>
        ))}
      </div>
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