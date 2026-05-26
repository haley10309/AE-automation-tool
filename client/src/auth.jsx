import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const AuthContext = createContext(null)

const TOKEN_KEY = 'ae_tool_token'
const SERVER    = 'http://localhost:4000'

async function authCall(method, path, body, token) {
  const res = await fetch(`${SERVER}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null)    // 로그인된 사용자 정보
  const [token,   setToken]   = useState(null)    // JWT 토큰
  const [loading, setLoading] = useState(true)    // 초기 토큰 검증 중

  // ── 앱 시작 시 저장된 토큰 검증 ──────────────────────────
  useEffect(() => {
    const saved = localStorage.getItem(TOKEN_KEY)
    if (!saved) { setLoading(false); return }
    authCall('GET', '/api/auth/me', null, saved)
      .then(res => {
        if (res.ok) { setToken(saved); setUser(res.user) }
        else localStorage.removeItem(TOKEN_KEY)
      })
      .catch(() => localStorage.removeItem(TOKEN_KEY))
      .finally(() => setLoading(false))
  }, [])

  // ── 로그인 ────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authCall('POST', '/api/auth/login', { email, password })
    if (res.ok) {
      localStorage.setItem(TOKEN_KEY, res.token)
      setToken(res.token)
      setUser(res.user)
    }
    return res
  }, [])

  // ── 회원가입 ──────────────────────────────────────────────
  const register = useCallback(async (data) => {
    return authCall('POST', '/api/auth/register', data)
  }, [])

  // ── 로그아웃 ──────────────────────────────────────────────
  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY)
    setToken(null)
    setUser(null)
  }, [])

  // ── 인증된 API 호출용 헬퍼 ───────────────────────────────
  const authFetch = useCallback((method, path, body) => {
    return authCall(method, path, body, token)
  }, [token])

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout, authFetch }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}