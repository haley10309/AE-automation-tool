// ── Socket.io 인스턴스 공유 모듈 ─────────────────────────────
// server.js에서 setIO()로 등록, 각 라우트 파일에서 broadcastPageChange()로 사용

let io = null;

function setIO(ioInstance) {
  io = ioInstance;
}

function getIO() {
  return io;
}

/**
 * 특정 페이지(프로젝트)의 상태/메모/파일 변경을 같은 페이지를 보고 있는
 * 모든 클라이언트(해당 room에 join된 소켓)에게 실시간으로 알림
 *
 * @param {string|number} pageId
 * @param {object} payload - { type: 'status'|'file'|'branch'|'billing', siteCode, ... }
 */
function broadcastPageChange(pageId, payload) {
  if (!io || !pageId) return;
  io.to(`page-${pageId}`).emit('page:changed', { pageId, ...payload });
}

module.exports = { setIO, getIO, broadcastPageChange };