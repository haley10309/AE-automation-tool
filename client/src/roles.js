// ── 클라이언트 공용 역할 판별 헬퍼 ──────────────────────────────
// 서버(adminConfig.js)의 STAFF_POSITIONS와 동일한 기준.
// 예전 이분법(regular/intern)을 대체 — 퍼블리셔/AE/관리자는
// "정규직"이 갖던 권한(삭제, 이동 등)을 그대로 가지고,
// 인턴(퍼블리셔)/인턴(AE)은 "인턴" 권한(제한됨)을 그대로 유지한다.
export const STAFF_POSITIONS = ['publisher', 'ae', 'admin']

/** 예전 "정규직만 가능" 체크를 대체하는 헬퍼 */
export function isStaff(position) {
  return STAFF_POSITIONS.includes(position)
}