const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); process.exit(0); }

const logFile = path.join(app.getPath('userData'), 'app.log');
const log = (msg) => fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);

let mainWindow;

function startServer() {
  const serverPath = path.join(process.resourcesPath, 'server/server.js');
  log(`서버 경로: ${serverPath}`);
  log(`파일 존재: ${fs.existsSync(serverPath)}`);

  try {
    // spawn 대신 직접 require로 같은 프로세스에서 실행
    require(serverPath);
    log('서버 require 성공');
  } catch (e) {
    log(`서버 require 실패: ${e.stack}`);
  }
}

function createWindow() {
  if (mainWindow) return;

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { contextIsolation: true }
  });

  const indexPath = path.join(process.resourcesPath, 'client/dist/index.html');
  log(`index.html 경로: ${indexPath}`);
  mainWindow.loadFile(indexPath);
  mainWindow.on('closed', () => { mainWindow = null; });
}

app.whenReady().then(() => {
  log('=== 앱 시작 ===');
  startServer();
  setTimeout(createWindow, 2000);
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});