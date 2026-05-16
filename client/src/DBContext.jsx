import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { api } from './api.js'
import React from 'react'

const DBContext = createContext({
  dbStatus: 'disconnected',
  dbReady:  false,
  connect:  async () => {},
})

export function useDB() {
  return useContext(DBContext)
}

export function DBProvider({ children }) {
  const [dbStatus, setDbStatus] = useState('disconnected')
  const [dbMessage, setDbMessage] = useState('')

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

  // 앱 시작 시 저장된 설정으로 자동 연결
  useEffect(() => {
    const saved = localStorage.getItem('db_config')
    const config = saved ? JSON.parse(saved) : {
      host: 'localhost', port: '3306', user: 'root', password: '0000', database: 'copy_diff_db',
    }
    connect(config)
  }, []) // eslint-disable-line

  return (
    <DBContext.Provider value={{
      dbStatus,
      dbMessage,
      dbReady: dbStatus === 'connected',
      connect,
    }}>
      {children}
    </DBContext.Provider>
  )
}