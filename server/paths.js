// ── pkg 패키징 안전 경로 모듈 ─────────────────────────────────
// @yao-pkg/pkg로 빌드하면, require된 모듈 안에서의 __dirname은 읽기 전용
// 가상 스냅샷 경로를 가리켜서 그 안에 파일을 쓰면 실패한다.
// 오직 "진입점 스크립트"(server.js)의 __dirname만 실제 exe가 위치한
// 폴더를 가리키므로, server.js가 시작 시 setDataDir(__dirname)을 딱 한 번
// 호출해서 실제 경로를 주입하고, 다른 라우트 파일들은 getDataDir()로
// 그 값을 공유해서 db-environments.json 등 로컬 파일을 안전하게 읽고 쓴다.

let dataDir = __dirname; // 개발 모드(dev server) 기본값 — 이 파일 자체 위치

function setDataDir(dir) {
  dataDir = dir;
}

function getDataDir() {
  return dataDir;
}

module.exports = { setDataDir, getDataDir };