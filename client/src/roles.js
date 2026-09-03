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

// 5단계 역할 라벨 — 서버 adminConfig.js의 POSITIONS와 동일한 값/순서로 유지할 것.
// AdminTab(권한 관리)과 AuthPage(회원가입)이 공통으로 참조한다.
export const POSITION_LABELS = {
  publisher:        '퍼블리셔',
  ae:                'AE',
  intern_publisher: '인턴(퍼블리셔)',
  intern_ae:        '인턴(AE)',
  admin:             '관리자',
}

// 회원가입 화면에서 고를 수 있는 직책 — 'admin'은 지정된 관리자 이메일에만
// 서버에서 자동 부여되므로 가입 시 선택 항목에서 제외한다.
export const SIGNUP_POSITIONS = [
  { value: 'publisher',        label: POSITION_LABELS.publisher,        icon: '💼' },
  { value: 'ae',                label: POSITION_LABELS.ae,                icon: '💼' },
  { value: 'intern_publisher', label: POSITION_LABELS.intern_publisher, icon: '🎓' },
  { value: 'intern_ae',        label: POSITION_LABELS.intern_ae,        icon: '🎓' },
]