import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../auth.jsx'
import { POSITION_LABELS } from '../roles.js'

export default function AdminTab() {
  const { authFetch, user } = useAuth()
  const [users, setUsers]               = useState([])
  const [environments, setEnvironments] = useState([])
  const [loading, setLoading]           = useState(true)
  const [msg, setMsg]                   = useState('')

  const [showAddEnv, setShowAddEnv]     = useState(false)
  const [envForm, setEnvForm]           = useState({ label: '', host: '', port: '3306', user: '', password: '', database: '', createNew: false })
  const [addingEnv, setAddingEnv]       = useState(false)

  const [grantModalUser, setGrantModalUser] = useState(null) // 접근 권한 부여 대상 계정 (단건)
  const [granting, setGranting]             = useState(false)

  const [resetResult, setResetResult]   = useState(null) // { name, tempPassword }

  // ── 대용량 계정 일괄 처리 ────────────────────────────────────
  const [userSearch, setUserSearch]         = useState('')
  const [positionFilter, setPositionFilter] = useState('all')
  const [envFilter, setEnvFilter]           = useState('all') // 'all' | 'none' | envId
  const [selectedIds, setSelectedIds]       = useState(new Set())
  const [showBulkGrant, setShowBulkGrant]   = useState(false)
  const [bulkGranting, setBulkGranting]     = useState(false)
  const [bulkResult, setBulkResult]         = useState(null) // { message, results }
  const [revealedEnvId, setRevealedEnvId]   = useState(null) // 비밀번호를 펼쳐서 보고 있는 DB 환경 id

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [uRes, eRes] = await Promise.all([
        authFetch('GET', '/api/admin/users'),
        authFetch('GET', '/api/admin/environments'),
      ])
      if (uRes.ok) setUsers(uRes.data)
      if (eRes.ok) setEnvironments(eRes.data)
    } finally {
      setLoading(false)
    }
  }, [authFetch])

  useEffect(() => { load() }, [load])

  const flashMsg = (text) => { setMsg(text); setTimeout(() => setMsg(''), 4000) }

  const changeRole = async (userId, position) => {
    const res = await authFetch('PUT', `/api/admin/users/${userId}/role`, { position })
    if (res.ok) { flashMsg('역할이 변경되었습니다.'); load() }
    else alert(res.message || '역할 변경 실패')
  }

  const toggleApprove = async (userId, current) => {
    const res = await authFetch('PUT', `/api/admin/users/${userId}/approve`, { approved: !current })
    if (res.ok) load()
    else alert(res.message || '처리 실패')
  }

  const resetPassword = async (u) => {
    if (!window.confirm(`${u.name}(${u.email}) 계정의 비밀번호를 초기화할까요?\n임시 비밀번호가 새로 발급됩니다.`)) return
    const res = await authFetch('PUT', `/api/admin/users/${u.id}/reset-password`, {})
    if (res.ok) setResetResult({ name: u.name, email: u.email, tempPassword: res.tempPassword })
    else alert(res.message || '비밀번호 초기화 실패')
  }

  const addEnvironment = async () => {
    if (!envForm.label.trim() || !envForm.host.trim() || !envForm.user.trim() || !envForm.database.trim()) {
      alert('이름/호스트/사용자명/DB명을 모두 입력해주세요.')
      return
    }
    if (envForm.createNew && !/^[a-zA-Z0-9_]+$/.test(envForm.database.trim())) {
      alert('새로 만드는 데이터베이스명은 영문/숫자/밑줄(_)만 사용할 수 있습니다.')
      return
    }
    setAddingEnv(true)
    try {
      const res = await authFetch('POST', '/api/admin/environments', envForm)
      if (res.ok) {
        flashMsg(envForm.createNew ? 'DB가 새로 생성되고 연결되었습니다.' : 'DB 환경이 등록되었습니다.')
        setShowAddEnv(false)
        setEnvForm({ label: '', host: '', port: '3306', user: '', password: '', database: '', createNew: false })
        load()
      } else {
        alert(res.message || 'DB 환경 등록 실패')
      }
    } finally {
      setAddingEnv(false)
    }
  }

  const removeEnvironment = async (id, label) => {
    if (!window.confirm(`"${label}" 환경을 삭제할까요? (등록된 계정은 그대로 남아있습니다)`)) return
    const res = await authFetch('DELETE', `/api/admin/environments/${id}`)
    if (res.ok) load()
    else alert(res.message || '삭제 실패')
  }

  const grantAccess = async (envId) => {
    if (!grantModalUser) return
    setGranting(true)
    try {
      const res = await authFetch('POST', `/api/admin/environments/${envId}/grant`, { userId: grantModalUser.id })
      if (res.ok) {
        flashMsg(res.message || '연동 완료')
        setGrantModalUser(null)
        load()
      } else {
        alert(res.message || '연동 실패')
      }
    } finally {
      setGranting(false)
    }
  }

  const revokeAccess = async (envId, email) => {
    if (!window.confirm(`${email} 계정의 이 환경 접근 권한을 회수할까요?`)) return
    const res = await authFetch('POST', `/api/admin/environments/${envId}/revoke`, { email })
    if (res.ok) load()
    else alert(res.message || '회수 실패')
  }

  // ── 검색 / 필터링 ────────────────────────────────────────────
  const filteredUsers = users.filter(u => {
    const q = userSearch.trim().toLowerCase()
    if (q && !(u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q))) return false
    if (positionFilter !== 'all' && u.position !== positionFilter) return false
    if (envFilter === 'none' && (u.accessibleEnvironments?.length ?? 0) > 0) return false
    if (envFilter !== 'all' && envFilter !== 'none' && !u.accessibleEnvironments?.some(e => e.id === envFilter)) return false
    return true
  })

  const allFilteredSelected = filteredUsers.length > 0 && filteredUsers.every(u => selectedIds.has(u.id))

  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      if (allFilteredSelected) {
        const next = new Set(prev)
        filteredUsers.forEach(u => next.delete(u.id))
        return next
      }
      const next = new Set(prev)
      filteredUsers.forEach(u => next.add(u.id))
      return next
    })
  }

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const clearSelection = () => setSelectedIds(new Set())

  // ── 일괄 DB 연동 ─────────────────────────────────────────────
  const runBulkGrant = async (envId) => {
    setBulkGranting(true)
    try {
      const res = await authFetch('POST', `/api/admin/environments/${envId}/grant-bulk`, {
        userIds: Array.from(selectedIds),
      })
      if (res.ok) {
        setBulkResult({ message: res.message, results: res.results })
        setShowBulkGrant(false)
        clearSelection()
        load()
      } else {
        alert(res.message || '일괄 연동 실패')
      }
    } finally {
      setBulkGranting(false)
    }
  }

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>불러오는 중...</div>

  return (
    <div style={{ padding: '20px 4px', display: 'flex', flexDirection: 'column', gap: 28 }}>
      {msg && (
        <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 14px', borderRadius: 8, fontSize: 13 }}>
          ✅ {msg}
        </div>
      )}

      {/* ══════════ 계정 관리 ══════════ */}
      <section>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>👤 계정 관리</h2>

        {/* ── 검색 / 필터 ── */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <input
            placeholder="이름 또는 이메일 검색"
            value={userSearch}
            onChange={e => setUserSearch(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', flex: '1 1 200px', minWidth: 160 }}
          />
          <select
            value={positionFilter}
            onChange={e => setPositionFilter(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}
          >
            <option value="all">전체 권한</option>
            {Object.entries(POSITION_LABELS).map(([val, label]) => (
              <option key={val} value={val}>{label}</option>
            ))}
          </select>
          <select
            value={envFilter}
            onChange={e => setEnvFilter(e.target.value)}
            style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }}
          >
            <option value="all">전체 DB 환경</option>
            <option value="none">연동된 환경 없음</option>
            {environments.map(e => <option key={e.id} value={e.id}>{e.label}</option>)}
          </select>
          {(userSearch || positionFilter !== 'all' || envFilter !== 'all') && (
            <button
              onClick={() => { setUserSearch(''); setPositionFilter('all'); setEnvFilter('all') }}
              style={{ fontSize: 12, padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer' }}
            >필터 초기화</button>
          )}
          <span style={{ fontSize: 12, color: '#9ca3af', alignSelf: 'center', marginLeft: 'auto' }}>
            {filteredUsers.length}/{users.length}명
          </span>
        </div>

        {/* ── 일괄 작업 바 ── */}
        {selectedIds.size > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10,
            padding: '8px 14px', borderRadius: 8, background: '#eef2ff', border: '1px solid #c7d2fe',
          }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4338ca' }}>{selectedIds.size}명 선택됨</span>
            <button
              onClick={() => setShowBulkGrant(true)}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer' }}
            >🔗 선택한 계정 일괄 DB 연동</button>
            <button
              onClick={clearSelection}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 6, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer' }}
            >선택 해제</button>
          </div>
        )}

        {/* ── 전체 선택 ── */}
        {filteredUsers.length > 0 && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280', marginBottom: 6, cursor: 'pointer' }}>
            <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} />
            전체 선택 (검색/필터 결과 기준)
          </label>
        )}

        {/* 계정 수가 많아져도 이 목록만 스크롤되고, 아래 "DB 환경 관리" 섹션은
            매번 스크롤해서 내려가지 않아도 바로 보이도록 높이를 제한한다. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 480, overflowY: 'auto', paddingRight: 4 }}>
          {filteredUsers.length === 0 && (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: '16px 0', textAlign: 'center' }}>조건에 맞는 계정이 없습니다.</div>
          )}
          {filteredUsers.map(u => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px',
              border: selectedIds.has(u.id) ? '1px solid #a5b4fc' : '1px solid #e5e7eb',
              borderRadius: 10, background: selectedIds.has(u.id) ? '#eef2ff' : '#fff', flexWrap: 'wrap',
            }}>
              <input type="checkbox" checked={selectedIds.has(u.id)} onChange={() => toggleSelectOne(u.id)} />

              <div style={{ minWidth: 140 }}>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{u.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{u.email}</div>
              </div>

              <select
                value={u.position}
                onChange={e => changeRole(u.id, e.target.value)}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 6, border: '1px solid #d1d5db' }}
              >
                {Object.entries(POSITION_LABELS).map(([val, label]) => (
                  <option key={val} value={val} disabled={val === 'admin' && u.position !== 'admin'}>
                    {label}
                  </option>
                ))}
              </select>

              <button
                onClick={() => toggleApprove(u.id, u.approved)}
                style={{
                  fontSize: 11, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  background: u.approved ? '#dcfce7' : '#fef3c7',
                  color: u.approved ? '#166534' : '#92400e',
                }}
              >{u.approved ? '✓ 승인됨' : '대기 중 — 클릭 승인'}</button>

              <button
                onClick={() => resetPassword(u)}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#6b7280' }}
              >🔑 비밀번호 초기화</button>

              <button
                onClick={() => setGrantModalUser(u)}
                style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', color: '#4f46e5' }}
              >🔗 DB 환경 연동</button>

              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {u.accessibleEnvironments?.length > 0 ? (
                  u.accessibleEnvironments.map(e => (
                    <span key={e.id} style={{ fontSize: 10, background: '#eef2ff', color: '#4338ca', borderRadius: 10, padding: '2px 8px' }}>
                      {e.label}
                    </span>
                  ))
                ) : (
                  <span style={{ fontSize: 10, color: '#9ca3af' }}>연동된 환경 없음</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ DB 환경 관리 ══════════ */}
      <section>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700 }}>🗄 DB 환경 관리</h2>
          <button
            onClick={() => {
              setShowAddEnv(v => !v)
              setEnvForm({ label: '', host: '', port: '3306', user: '', password: '', database: '', createNew: false })
            }}
            style={{ fontSize: 12, padding: '6px 12px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer' }}
          >{showAddEnv ? '취소' : '+ 새 DB 환경 등록'}</button>
        </div>

        {showAddEnv && (
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
              <button
                onClick={() => setEnvForm(f => ({ ...f, createNew: false }))}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${!envForm.createNew ? '#4f46e5' : '#d1d5db'}`,
                  background: !envForm.createNew ? '#eef2ff' : '#fff',
                  color: !envForm.createNew ? '#4338ca' : '#6b7280', fontWeight: !envForm.createNew ? 600 : 400,
                }}
              >기존 DB에 연결</button>
              <button
                onClick={() => setEnvForm(f => ({ ...f, createNew: true }))}
                style={{
                  fontSize: 12, padding: '6px 14px', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${envForm.createNew ? '#4f46e5' : '#d1d5db'}`,
                  background: envForm.createNew ? '#eef2ff' : '#fff',
                  color: envForm.createNew ? '#4338ca' : '#6b7280', fontWeight: envForm.createNew ? 600 : 400,
                }}
              >✨ 새 DB 만들기</button>
            </div>
            {envForm.createNew && (
              <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 10 }}>
                입력한 호스트/사용자 계정으로 새 데이터베이스를 만들고 바로 연동합니다.
                사용자 계정에 <code>CREATE DATABASE</code> 권한이 필요합니다.
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <input placeholder="환경 이름 (예: Galaxy 프로젝트)" value={envForm.label}
                onChange={e => setEnvForm(f => ({ ...f, label: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} />
              <input placeholder="호스트 (예: localhost)" value={envForm.host}
                onChange={e => setEnvForm(f => ({ ...f, host: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} />
              <input placeholder="포트 (기본 3306)" value={envForm.port}
                onChange={e => setEnvForm(f => ({ ...f, port: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} />
              <input placeholder="사용자명" value={envForm.user}
                onChange={e => setEnvForm(f => ({ ...f, user: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} />
              <input placeholder="비밀번호" type="password" value={envForm.password}
                onChange={e => setEnvForm(f => ({ ...f, password: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} />
              <input placeholder={envForm.createNew ? '새로 만들 데이터베이스명 (영문/숫자/_)' : '데이터베이스명'} value={envForm.database}
                onChange={e => setEnvForm(f => ({ ...f, database: e.target.value }))}
                style={{ fontSize: 12, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db' }} />
            </div>
            <button
              onClick={addEnvironment} disabled={addingEnv}
              style={{ fontSize: 12, padding: '6px 16px', borderRadius: 8, border: 'none', background: addingEnv ? '#a5b4fc' : '#4f46e5', color: '#fff', cursor: addingEnv ? 'default' : 'pointer' }}
            >{addingEnv ? (envForm.createNew ? '생성 중...' : '연결 테스트 중...') : (envForm.createNew ? '생성 및 연결' : '등록')}</button>
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {environments.length === 0 && (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: '12px 0' }}>등록된 DB 환경이 없습니다.</div>
          )}
          {environments.map(e => (
            <div key={e.id} style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '12px 14px', background: '#fff' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{e.label}</div>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{e.host}:{e.port} / {e.database}</div>
                </div>
                <button
                  onClick={() => removeEnvironment(e.id, e.label)}
                  style={{ fontSize: 11, padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fff', color: '#ef4444', cursor: 'pointer' }}
                >삭제</button>
              </div>

              {/* 접속 계정 정보 — 비밀번호는 기본적으로 가려두고, 클릭했을 때만 보여준다 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, padding: '6px 10px',
                background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: 11, flexWrap: 'wrap',
              }}>
                <span style={{ color: '#6b7280' }}>접속 계정: <strong style={{ color: '#111827' }}>{e.user}</strong></span>
                <span style={{ color: '#6b7280' }}>
                  비밀번호: <strong style={{ color: '#111827', fontFamily: 'monospace' }}>
                    {revealedEnvId === e.id ? (e.password || '(없음)') : '••••••••'}
                  </strong>
                </span>
                <button
                  onClick={() => setRevealedEnvId(id => id === e.id ? null : e.id)}
                  style={{ fontSize: 10, padding: '2px 8px', borderRadius: 5, border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', cursor: 'pointer' }}
                >{revealedEnvId === e.id ? '🙈 숨기기' : '👁 보기'}</button>
              </div>

              {e.grantedEmails.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {e.grantedEmails.map(email => (
                    <span key={email} style={{ fontSize: 10, background: '#f1f5f9', borderRadius: 10, padding: '2px 8px', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      {email}
                      <button onClick={() => revokeAccess(e.id, email)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 11, padding: 0, lineHeight: 1 }}>✕</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ══════════ 접근 권한 부여 모달 ══════════ */}
      {grantModalUser && (
        <div onClick={() => setGrantModalUser(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 380 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>DB 환경 연동</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>{grantModalUser.name} ({grantModalUser.email})</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {environments.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>등록된 DB 환경이 없습니다.</div>}
              {environments.map(e => {
                const already = e.grantedEmails.includes(grantModalUser.email.toLowerCase())
                return (
                  <button
                    key={e.id}
                    disabled={granting || already}
                    onClick={() => grantAccess(e.id)}
                    style={{
                      textAlign: 'left', padding: '8px 12px', borderRadius: 8,
                      border: '1px solid #e5e7eb', background: already ? '#f9fafb' : '#fff',
                      cursor: already ? 'default' : 'pointer', fontSize: 12,
                    }}
                  >
                    <div style={{ fontWeight: 600 }}>{e.label}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af' }}>{e.host} / {e.database}</div>
                    {already && <div style={{ fontSize: 10, color: '#16a34a', marginTop: 2 }}>✓ 이미 연동됨</div>}
                  </button>
                )
              })}
            </div>
            <button onClick={() => setGrantModalUser(null)} style={{ marginTop: 16, fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer' }}>닫기</button>
          </div>
        </div>
      )}

      {/* ══════════ 일괄 DB 연동 모달 ══════════ */}
      {showBulkGrant && (
        <div onClick={() => !bulkGranting && setShowBulkGrant(false)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 400 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 4 }}>선택한 {selectedIds.size}개 계정 일괄 DB 연동</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>연동할 DB 환경을 선택하세요.</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {environments.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>등록된 DB 환경이 없습니다.</div>}
              {environments.map(e => (
                <button
                  key={e.id}
                  disabled={bulkGranting}
                  onClick={() => runBulkGrant(e.id)}
                  style={{
                    textAlign: 'left', padding: '8px 12px', borderRadius: 8,
                    border: '1px solid #e5e7eb', background: bulkGranting ? '#f9fafb' : '#fff',
                    cursor: bulkGranting ? 'default' : 'pointer', fontSize: 12,
                  }}
                >
                  <div style={{ fontWeight: 600 }}>{e.label}</div>
                  <div style={{ fontSize: 10, color: '#9ca3af' }}>{e.host} / {e.database}</div>
                </button>
              ))}
            </div>
            {bulkGranting && <div style={{ fontSize: 12, color: '#4f46e5', marginTop: 12 }}>연동 처리 중... 잠시만 기다려주세요.</div>}
            <button
              onClick={() => setShowBulkGrant(false)} disabled={bulkGranting}
              style={{ marginTop: 16, fontSize: 12, padding: '6px 14px', borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: bulkGranting ? 'default' : 'pointer' }}
            >취소</button>
          </div>
        </div>
      )}

      {/* ══════════ 일괄 연동 결과 모달 ══════════ */}
      {bulkResult && (
        <div onClick={() => setBulkResult(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 420 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>✅ 일괄 연동 완료</div>
            <div style={{ fontSize: 12, color: '#374151', marginBottom: 12 }}>{bulkResult.message}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto' }}>
              {(bulkResult.results || []).map((r, i) => (
                <div key={i} style={{
                  display: 'flex', justifyContent: 'space-between', fontSize: 11,
                  padding: '4px 8px', borderRadius: 6, background: r.ok ? '#f0fdf4' : '#fef2f2',
                }}>
                  <span style={{ color: r.ok ? '#166534' : '#991b1b' }}>{r.email || `#${r.userId}`}</span>
                  <span style={{ color: r.ok ? '#16a34a' : '#dc2626' }}>{r.ok ? '✓ 성공' : `실패: ${r.message}`}</span>
                </div>
              ))}
            </div>
            <button onClick={() => setBulkResult(null)} style={{ marginTop: 16, fontSize: 12, padding: '6px 14px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>확인</button>
          </div>
        </div>
      )}

      {/* ══════════ 비밀번호 초기화 결과 모달 ══════════ */}
      {resetResult && (
        <div onClick={() => setResetResult(null)} style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 999,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{ background: '#fff', borderRadius: 14, padding: 24, width: 360 }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10 }}>🔑 임시 비밀번호 발급됨</div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 6 }}>{resetResult.name} ({resetResult.email})</div>
            <div style={{
              background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 14px',
              fontFamily: 'monospace', fontSize: 15, fontWeight: 700, letterSpacing: 1, marginBottom: 10,
            }}>{resetResult.tempPassword}</div>
            <div style={{ fontSize: 11, color: '#dc2626', marginBottom: 16 }}>
              이 비밀번호는 다시 확인할 수 없습니다. 지금 바로 사용자에게 전달해주세요.
            </div>
            <button onClick={() => setResetResult(null)} style={{ fontSize: 12, padding: '6px 14px', borderRadius: 8, border: 'none', background: '#4f46e5', color: '#fff', cursor: 'pointer' }}>확인</button>
          </div>
        </div>
      )}
    </div>
  )
}