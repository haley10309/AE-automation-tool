const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const logFile = path.join(app.getPath('userData'), 'app.log');
const log = (msg) => fs.appendFileSync(logFile, `[${new Date().toISOString()}] ${msg}\n`);

let serverProcess;

function startServer() {
  const serverPath = path.join(process.resourcesPath, 'server/server.js');
  const nodePath = process.execPath;

  log(`node 경로: ${nodePath}`);
  log(`server.js 경로: ${serverPath}`);
  log(`server.js 존재: ${fs.existsSync(serverPath)}`);

  serverProcess = spawn(nodePath, [serverPath], {
    cwd: path.join(process.resourcesPath, 'server'),
    env: { ...process.env, NODE_ENV: 'production' }
  });

  serverProcess.stdout.on('data', (d) => log(`[server] ${d.toString().trim()}`));
  serverProcess.stderr.on('data', (d) => log(`[server ERR] ${d.toString().trim()}`));
  serverProcess.on('error', (e) => log(`[spawn error] ${e.message}`));
  serverProcess.on('exit', (code) => log(`[server exit] code: ${code}`));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: { contextIsolation: true }
  });

  const indexPath = path.join(process.resourcesPath, 'client/dist/index.html');
  log(`index.html 경로: ${indexPath}`);
  win.loadFile(indexPath);
}

app.whenReady().then(() => {
  log('=== 앱 시작 ===');
  startServer();
  setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
  if (serverProcess) serverProcess.kill();
  app.quit();
});