// ── 관리자 계정 설정 ───────────────────────────────────────────
// 'admin' 역할(position)은 이 이메일 계정에만 부여될 수 있다.
// (가입 시 자동 부여, 그 외 계정은 서버에서 admin 역할 선택/변경을 거부한다)
const ADMIN_EMAIL = 'haley.yoo@cheilpengtai.com';

// 5단계 역할 정의 — 화면 표시용 라벨 포함
const POSITIONS = {
  publisher:        '퍼블리셔',
  ae:                'AE',
  intern_publisher: '인턴(퍼블리셔)',
  intern_ae:        '인턴(AE)',
  admin:             '관리자',
};

const POSITION_KEYS = Object.keys(POSITIONS); // ['publisher','ae','intern_publisher','intern_ae','admin']

// "정규직" 급으로 취급할 역할 — 기존 코드에서 position==='regular' 로 게이트하던
// 자리(예: 승인 권한 등)를 대체할 때 사용. 인턴 계열/관리자는 제외.
const STAFF_POSITIONS = ['publisher', 'ae'];

module.exports = { ADMIN_EMAIL, POSITIONS, POSITION_KEYS, STAFF_POSITIONS };