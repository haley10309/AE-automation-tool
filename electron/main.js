const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// 단일 인스턴스 보장
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

const logFile = path.join(app.getPath('userData'), 'app.log');
const log = (msg) => fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);

let serverProcess;
let mainWindow;

function startServer() {
  const serverPath = path.join(process.resourcesPath, 'server/server.js');
  log(`서버 경로: ${serverPath}`);
  log(`파일 존재: ${fs.existsSync(serverPath)}`);

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: path.join(process.resourcesPath, 'server'),
    env: { ...process.env, NODE_ENV: 'production' }
  });

  serverProcess.stdout.on('data', (d) => log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => log(`[server ERR] ${d.toString().trim()}`));
  serverProcess.on('error', (e) => log(`[spawn error] ${e.message}`));
  serverProcess.on('exit', (code) => log(`[server exit] code: ${code}`));
}

function createWindow() {
  if (mainWindow) return;  // 이미 창이 있으면 새로 만들지 않음

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { contextIsolation: true }
  });

  const indexPath = path.join(process.resourcesPath, 'client/dist/index.html');
  log(`index.html 경로: ${indexPath}`);
  log(`파일 존재: ${fs.existsSync(indexPath)}`);
  mainWindow.loadFile(indexPath);

  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  log('=== 앱 시작 ===');
  startServer();
  setTimeout(createWindow, 2000);
});

// 두 번째 인스턴스 실행 시 기존 창 포커스
app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});