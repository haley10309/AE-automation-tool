import { io } from 'socket.io-client'

const SERVER = 'http://localhost:4000'

// 앱 전체에서 하나의 소켓 연결만 유지 (재연결 자동 처리)
export const socket = io(SERVER, {
  autoConnect: true,
  reconnection: true,
  reconnectionDelay: 1000,
})