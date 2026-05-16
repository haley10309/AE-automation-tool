import { useState } from 'react'
import { useAuth } from '../auth.jsx'
import React from 'react'
// ── 로그인 폼 ─────────────────────────────────────────────────
function LoginForm({ onSwitch }) {
  const { login } = useAuth()
  const [form, setForm]     = useState({ email:'', password:'' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    if (!form.email || !form.password) { setError('이메일과 비밀번호를 입력해주세요.'); return }
    setLoading(true); setError('')
    const res = await login(form.email, form.password)
    setLoading(false)
    if (!res.ok) setError(res.message)
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-form-header">
        <h2 className="auth-title">로그인</h2>
        <p className="auth-sub">AE Automation Tool에 오신 것을 환영합니다.</p>
      </div>

      <div className="auth-fields">
        <div className="auth-field">
          <label className="auth-label">회사 이메일</label>
          <input className="auth-input" type="email" placeholder="name@samsung.com"
            value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
            autoComplete="email" />
        </div>
        <div className="auth-field">
          <label className="auth-label">비밀번호</label>
          <input className="auth-input" type="password" placeholder="비밀번호 입력"
            value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
            autoComplete="current-password" />
        </div>
      </div>

      {error && <div className="auth-error">{error}</div>}

      <button className="auth-submit" type="submit" disabled={loading}>
        {loading ? '로그인 중...' : '로그인'}
      </button>

      <div className="auth-switch">
        계정이 없으신가요?
        <button type="button" className="auth-switch-btn" onClick={onSwitch}>
          회원가입
        </button>
      </div>
    </form>
  )
}

// ── 회원가입 폼 ───────────────────────────────────────────────
function SignupForm({ onSwitch }) {
  const { register } = useAuth()
  const [form, setForm]     = useState({ email:'', name:'', password:'', passwordConfirm:'', position:'' })
  const [error, setError]   = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async e => {
    e.preventDefault()
    setError(''); setSuccess('')
    if (!form.email.trim())    { setError('이메일을 입력해주세요.'); return }
    if (!form.name.trim())     { setError('이름을 입력해주세요.'); return }
    if (!form.position)        { setError('직책을 선택해주세요.'); return }
    if (form.password.length < 8) { setError('비밀번호는 8자 이상이어야 합니다.'); return }
    if (form.password !== form.passwordConfirm) { setError('비밀번호가 일치하지 않습니다.'); return }

    setLoading(true)
    const res = await register({ email: form.email, name: form.name, password: form.password, position: form.position })
    setLoading(false)
    if (res.ok) {
      setSuccess(res.message)
      setForm({ email:'', name:'', password:'', passwordConfirm:'', position:'' })
    } else {
      setError(res.message)
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="auth-form-header">
        <h2 className="auth-title">회원가입</h2>
        <p className="auth-sub">계정을 만들어 팀과 함께 사용하세요.</p>
      </div>

      <div className="auth-fields">
        <div className="auth-field">
          <label className="auth-label">회사 이메일 *</label>
          <input className="auth-input" type="email" placeholder="name@samsung.com"
            value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </div>
        <div className="auth-field">
          <label className="auth-label">이름 *</label>
          <input className="auth-input" type="text" placeholder="홍길동"
            value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
        </div>
        <div className="auth-field">
          <label className="auth-label">직책 *</label>
          <div className="auth-position-group">
            {[{ value:'regular', label:'정규직', icon:'💼' }, { value:'intern', label:'인턴', icon:'🎓' }].map(opt => (
              <label key={opt.value}
                className={`auth-position-btn ${form.position === opt.value ? 'selected' : ''}`}>
                <input type="radio" name="position" value={opt.value}
                  checked={form.position === opt.value}
                  onChange={() => setForm(p => ({ ...p, position: opt.value }))}
                  style={{ display: 'none' }} />
                <span className="auth-pos-icon">{opt.icon}</span>
                <span>{opt.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="auth-field">
          <label className="auth-label">비밀번호 * <span className="auth-hint-inline">(8자 이상)</span></label>
          <input className="auth-input" type="password" placeholder="8자 이상 입력"
            value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
        </div>
        <div className="auth-field">
          <label className="auth-label">비밀번호 확인 *</label>
          <input className="auth-input" type="password" placeholder="비밀번호 재입력"
            value={form.passwordConfirm} onChange={e => setForm(p => ({ ...p, passwordConfirm: e.target.value }))} />
        </div>
      </div>

      {error   && <div className="auth-error">{error}</div>}
      {success && (
        <div className="auth-success">
          {success}
          <button type="button" className="auth-switch-btn" onClick={onSwitch} style={{ marginLeft:8 }}>
            로그인하기 →
          </button>
        </div>
      )}

      <button className="auth-submit" type="submit" disabled={loading}>
        {loading ? '가입 중...' : '회원가입'}
      </button>

      <div className="auth-switch">
        이미 계정이 있으신가요?
        <button type="button" className="auth-switch-btn" onClick={onSwitch}>
          로그인
        </button>
      </div>
    </form>
  )
}

// ── 메인 AuthPage ─────────────────────────────────────────────
export default function AuthPage() {
  const [mode, setMode] = useState('login')   // 'login' | 'signup'

  return (
    <div className="auth-page">
      <div className="auth-left">
        <div className="auth-brand">
          <div className="auth-logo">CD</div>
          <div className="auth-brand-text">
            <span className="auth-brand-name">AE Automation Tool</span>
            <span className="auth-brand-sub">AS-WAS / TO-BE 비교 &amp; 히스토리 관리</span>
          </div>
        </div>
        <div className="auth-features">
          <div className="auth-feature">
            <span className="auth-feature-icon">📋</span>
            <div>
              <div className="auth-feature-title">업데이트 영역 추출·조회</div>
              <div className="auth-feature-desc">카피 변경점을 자동으로 추려 히스토리로 관리합니다.</div>
            </div>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon">🌍</span>
            <div>
              <div className="auth-feature-title">국가별 카피 제품 출시 검수</div>
              <div className="auth-feature-desc">미출시 국가에 제품이 언급되면 자동으로 배지를 표시합니다.</div>
            </div>
          </div>
          <div className="auth-feature">
            <span className="auth-feature-icon">📊</span>
            <div>
              <div className="auth-feature-title">국가별 카피 작업 현황</div>
              <div className="auth-feature-desc">번역·컨펌·프로덕션까지 단계별 진행 상황을 추적합니다.</div>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-right">
        {mode === 'login'
          ? <LoginForm  onSwitch={() => setMode('signup')} />
          : <SignupForm onSwitch={() => setMode('login')}  />
        }
      </div>
    </div>
  )
}