const { app, BrowserWindow } = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const http = require('http')

let serverProcess = null
let mainWindow = null

// ── 패키징 여부에 따라 server.js 경로 분기 ───────────────────
function getServerPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'server', 'server.js')
    : path.join(__dirname, 'server', 'server.js')
}

// ── .env 경로 분기 (server.js에서 dotenv가 쓸 수 있도록 env 전달) ──
function getEnvPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'server', '.env')
    : path.join(__dirname, 'server', '.env')
}

// ── 서버가 실제로 응답할 때까지 폴링 (최대 30초) ─────────────
function waitForServer(retries = 60, interval = 500) {
  return new Promise((resolve, reject) => {
    let attempts = 0
    const check = () => {
      http.get('http://localhost:4000', () => {
        resolve()
      }).on('error', () => {
        attempts++
        if (attempts >= retries) {
          reject(new Error('서버가 응답하지 않습니다. (30초 초과)'))
        } else {
          setTimeout(check, interval)
        }
      })
    }
    check()
  })
}

function startServer() {
  const serverPath = getServerPath()
  const envPath = getEnvPath()
  console.log('서버 경로:', serverPath)

  serverProcess = spawn('node', [serverPath], {
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DOTENV_CONFIG_PATH: envPath,
    },
    cwd: path.dirname(serverPath),  // server/ 디렉토리를 cwd로 설정 (dotenv 상대경로 해결)
  })

  serverProcess.stdout.on('data', (data) => console.log(`[Server] ${data}`))
  serverProcess.stderr.on('data', (data) => console.error(`[Server ERR] ${data}`))
  serverProcess.on('error', (err) => console.error('서버 프로세스 실행 실패:', err))
  serverProcess.on('exit', (code) => console.log(`서버 종료 코드: ${code}`))
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  mainWindow.loadURL('http://localhost:4000')
  mainWindow.on('closed', () => { mainWindow = null })
}

app.whenReady().then(async () => {
  startServer()

  try {
    await waitForServer()
    createWindow()
  } catch (err) {
    console.error(err.message)
    createWindow()  // 실패해도 창은 열어서 에러 확인 가능
  }
})

app.on('window-all-closed', () => {
  if (serverProcess) {
    serverProcess.kill()
    serverProcess = null
  }
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})
