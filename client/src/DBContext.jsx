import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from './api.js'

const DBContext = createContext({
  dbStatus:   'disconnected',
  dbMessage:  '',
  dbReady:    false,
  dbConfig:   {},
  setDbConfig: () => {},
  connect:    async () => {},
})

export function useDB() {
  return useContext(DBContext)
}

export function DBProvider({ children }) {
  const [dbStatus,  setDbStatus]  = useState('disconnected')
  const [dbMessage, setDbMessage] = useState('')

  // ✅ dbConfig 상태를 Context로 끌어올림 (host/password 기본값 비워서 강제 입력 유도)
  const [dbConfig, setDbConfig] = useState(() => {
    const saved = localStorage.getItem('db_config')
    return saved ? JSON.parse(saved) : {
      host: '', port: '3306', user: 'root', password: '', database: 'copy_diff_db',
    }
  })

  const connect = useCallback(async (config) => {
    setDbStatus('connecting')
    try {
      const res = await api.dbConnect({ ...config, port: Number(config.port) })
      if (res.ok) {
        const init = await api.dbInit()
        if (init.ok) {
          setDbStatus('connected')
          setDbMessage('연결 및 테이블 초기화 완료')
          localStorage.setItem('db_config', JSON.stringify(config))
        } else {
          setDbStatus('error')
          setDbMessage('테이블 생성 실패: ' + init.message)
        }
      } else {
        setDbStatus('error')
        setDbMessage(res.message)
      }
    } catch (e) {
      setDbStatus('error')
      setDbMessage(e.message)
    }
  }, [])

  // ✅ 저장된 설정이 있을 때만 자동 연결 (없으면 AuthPage에서 수동 입력)
  useEffect(() => {
    const saved = localStorage.getItem('db_config')
    if (saved) {
      const config = JSON.parse(saved)
      setDbConfig(config)     // ← 상태도 같이 동기화
      connect(config)
    }
  }, []) // eslint-disable-line

  return (
    <DBContext.Provider value={{
      dbStatus,
      dbMessage,
      dbReady: dbStatus === 'connected',
      dbConfig,       // ✅ 추가
      setDbConfig,    // ✅ 추가
      connect,
    }}>
      {children}
    </DBContext.Provider>
  )
}