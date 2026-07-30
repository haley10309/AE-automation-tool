# AE Automation Tool

삼성닷컴 AE 팀의 카피 관리 워크플로우를 자동화하는 내부 웹 애플리케이션입니다.  
기존 RPA 기반 작업(컴포넌트 현황 요청 → 셀렉터 주소 파악 → 카피 입력 → Merge 요청 이메일)을 웹 UI로 대체합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| Frontend | React 18 (Vite), JSX |
| Backend | Node.js, Express 4 |
| Database | MySQL 8 (`ae-auto-db`) |
| 인증 | JWT (`jsonwebtoken`), bcrypt (`bcryptjs`) |
| 스타일 | 순수 CSS (App.css, 커스텀 CSS 변수) |

---

## 디렉터리 구조

```
project-root/
├── server/                  # Node.js 백엔드
│   ├── server.js            # 진입점 — 미들웨어 설정, 라우터 마운트, listen
│   ├── db.js                # MySQL pool 싱글톤 (getPool / initPool / reconnect)
│   ├── middleware.js        # checkDbConnection, authMiddleware (JWT 검증)
│   ├── constants.js         # SEED_PRODUCTS, SEED_SERVICE_DATA, ALL_SITE_CODES, JWT_SECRET
│   └── routes/
│       ├── init.js          # POST /api/connect  POST /api/init
│       ├── auth.js          # /api/auth/*
│       ├── products.js      # /api/products/*
│       ├── extract.js       # /api/save  /api/requests  /api/rows
│       ├── country.js       # /api/cc/*
│       ├── status.js        # /api/tracker/*  /api/files
│       ├── merge.js         # /api/merge/*
│       └── service.js       # /api/services/*
│
└── src/                     # React 프론트엔드
    ├── App.jsx              # 탭 라우팅, 헤더, DB 연결 상태
    ├── App.css              # 전역 스타일
    ├── api.js               # 백엔드 API 호출 (JWT 자동 포함, 56개 메서드)
    ├── auth.jsx             # AuthContext — login / register / logout / token 관리
    ├── DBContext.jsx        # DBContext — dbStatus / dbReady / connect
    ├── constants.js         # ALL_SITES (78개국), REGIONS, REGION_COLORS
    ├── utils.js             # parseCol, computeWordDiff, detectBadges, exportToCSV
    ├── pages/
    │   └── AuthPage.jsx     # 로그인 / 회원가입 화면
    ├── components/
    │   ├── DiffHighlight.jsx  # 단어 단위 diff 하이라이트 (memo + requestIdleCallback)
    │   ├── DiffTable.jsx      # AS-WAS / TO-BE 읽기 전용 비교 테이블
    │   ├── HistoryTable.jsx   # 편집 가능 이력 테이블 (페이지네이션 30행, startTransition)
    │   ├── ServiceCheck.jsx   # 서비스 운영 현황 검수 컴포넌트
    │   └── SiteDropdown.jsx   # 국가 선택 드롭다운 (리전 필터 + 검색)
    └── tabs/
        ├── ExtractTab.jsx     # 탭 1: Updated copy
        ├── MergeTab.jsx       # 탭 2: Copy Merge
        ├── CountryTab.jsx     # 탭 3: Product reflection
        └── StatusTab.jsx      # 탭 4: Status
```

---

## 설치 및 실행

### 사전 요구사항

- Node.js 18 이상
- MySQL 8.x
- 동일 LAN 환경 (Host PC 1대 + DB 공유)

### 1. MySQL DB 생성

MySQL CLI 또는 Workbench에서 실행합니다.

```sql
CREATE DATABASE `ae-auto-db`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;
```

LAN 공유 계정을 생성합니다.

```sql
CREATE USER 'ae_user'@'192.168.%.%' IDENTIFIED BY 'AeAuto2025!';
GRANT ALL PRIVILEGES ON `ae-auto-db`.* TO 'ae_user'@'192.168.%.%';

CREATE USER 'ae_user'@'localhost' IDENTIFIED BY 'AeAuto2025!';
GRANT ALL PRIVILEGES ON `ae-auto-db`.* TO 'ae_user'@'localhost';

FLUSH PRIVILEGES;
```

### 2. 환경변수 설정

`server/` 폴더에 `.env` 파일을 생성합니다.

```env
담당자에 문의 필요
```

> **LAN 클라이언트 PC** 에서는 `DB_HOST`를 Host PC의 IP 주소(예: `192.168.1.100`)로 변경합니다.

### 3. 의존성 설치

```bash
# 백엔드
cd server
npm install

# 프론트엔드
cd ../  # 프로젝트 루트로 이동
npm install
```

### 4. 서버 실행

```bash
# 백엔드 (포트 4000)
cd server
node server.js

# 프론트엔드 개발 서버 (포트 5173)
npm run dev
```

앱 접속 후 **DB 설정 탭 → 연결 테스트 & 초기화** 를 클릭하면 테이블 21개가 자동 생성됩니다.

---

## 인증

### 회원가입 필드

| 필드 | 설명 |
|------|------|
| 회사 이메일 | 로그인 ID로 사용 |
| 이름 | 변경 이력에 기록되는 표시 이름 |
| 비밀번호 | 8자 이상 |
| 직책 | `정규직 (regular)` / `인턴 (intern)` |

### 승인 정책

- **첫 번째 가입자**: 자동 승인 (관리자 역할)
- **이후 가입자**: 정규직 계정이 DB 설정 탭 → 사용자 관리에서 개별 승인
- 미승인 계정은 로그인 불가

### 권한 차이

| 기능 | 정규직 | 인턴 |
|------|--------|------|
| 모든 탭 사용 | ✓ | ✓ |
| 사용자 관리 패널 | ✓ | ✗ |
| 사용자 승인/해제 | ✓ | ✗ |

### JWT

- 만료: 24시간
- 저장: `localStorage` (`ae_tool_token`)
- 앱 재시작 시 저장된 토큰 자동 검증 후 재로그인 없이 진입

---

## 탭별 기능

### 탭 1 — Updated copy (업데이트 영역 추출·조회)

엑셀의 AS-WAS / TO-BE 두 열을 붙여넣고 변경된 행만 추출합니다.

**입력**
- AS-WAS: 엑셀 3열 전체 복사 → 붙여넣기
- TO-BE: 엑셀 4열 전체 복사 → 붙여넣기
- 헤더 행 포함/미포함 모두 자동 감지

**결과**
- 변경 / 추가 / 삭제 / 동일 4가지 상태로 분류
- 단어 단위 diff 하이라이트 (AS-WAS: 빨강 취소선, TO-BE: 초록)
- diff는 `requestIdleCallback`으로 비동기 계산 → 수백 행에서도 화면 미끄러짐 없음
- TSV 복사 버튼으로 엑셀에 바로 붙여넣기 가능
- **"Merge로 보내기"** 버튼: TO-BE 카피를 `localStorage`를 통해 Copy Merge 탭으로 전달

**저장 및 조회**
- 제품/페이지명, 요청자, 날짜, 메모 입력 후 MySQL 저장
- 좌측 사이드바에서 저장된 요청 목록 클릭 → 30행 페이지네이션으로 조회
- 각 행 수정·삭제 가능 (수정 중 다른 행 재렌더 없음 — uncontrolled textarea + useRef)

---

### 탭 2 — Copy Merge (카피덱 자동 Merge)

로컬 법인 컨펌된 카피를 영문 기준으로 매핑해 전체 덱을 자동 합본합니다.

**프로젝트 목록**
- 진입 시 프로젝트 카드 그리드 표시 (생성일, 국가 수, 행 수)
- 생성 → 프로젝트 상세로 즉시 진입

**프로젝트 상세**

1. **기준 영문 카피 입력**
   - 직접 붙여넣기 또는 Updated copy 탭의 "Merge로 보내기"로 자동 로드
   - 한 줄 = 카피 1개

2. **국가별 컨펌 카피 입력**
   - 엑셀에서 EN열 + 로컬어열 두 열 선택 → Ctrl+C → 텍스트박스에 Ctrl+V
   - 형식: `영문[탭]로컬어` (엑셀 복사 그대로)

3. **Merge 실행**
   - 영문을 key로 로컬어 자동 매핑
   - 동일 영문이 여러 행에 있으면 컨펌 파일 순서대로 배분 (FIFO 큐)
   - 결과 가로 스크롤 테이블: `#행 / EN(기준) / 국가1 / 국가2 / ...`
   - CSV 추출 가능

4. **자동 검증**
   - **DNT 개수 검증**: 제품명이 EN에는 N개, 로컬어에는 다른 수 → Alert + 상세 행 표시
   - **URL 사이트코드 검증** (`checkUrlSiteCode`): 카피 내 URL/경로에서 잘못된 사이트코드 감지
     - `https://www.samsung.com/jp/...` 형태 (절대 URL)
     - `/jp/smartphones/...` 형태 (상대 경로)
     - `/{site_code}/...` `/{site-code}/` `[site_code]` `[site-code]` 형태 (플레이스홀더 미치환)

5. **변경 이력 자동 저장**
   - Merge 실행 시 이전 버전과 비교해 변경된 행만 `diff_json`으로 DB 저장
   - 변경이 없으면 이력 저장 생략
   - 히스토리 드로어: 버전별 AS-WAS(빨강) / TO-BE(초록) 대조, 저장자 이름·저장 시각 표시

---

### 탭 3 — Product reflection (국가별 카피 제품 출시 반영 검수)

카피 내에 미출시 제품이 언급됐는지 국가별로 자동 감지합니다.

#### 서브탭: 즉석 검수

- 국가 추가 → 카피 열 전체 붙여넣기 → 검수하기
- 미출시 제품 언급 시 해당 셀에 `⚠ 미출시: 제품명` 배지 자동 표시
- 여러 국가 동시 검수 가능, CSV 추출 지원

#### 서브탭: 프로젝트 관리

**프로젝트 (페이지 단위)**
- 생성 / 이름 수정 / 삭제
- 국가 추가 (78개국, 리전 필터 + 검색)
- 셀 직접 입력 또는 열 전체 붙여넣기 → 행 자동 분배
- 저장 버튼 클릭 시 변경된 국가만 `cc_locals_history`에 이력 기록

**컬럼 헤더 히스토리 버튼 (📋)**
- 국가별 카피 변경 이력 드로어 열람
- 최초 저장: 전체 행 표시
- 이후 저장: 변경된 행만 표시 (이전값 취소선 / 새 값 초록)
- 저장자 이름, 이메일, 저장 시각 기록

**DNT 검증 패널** (프로젝트 상세 하단)
- 영문 원본 카피 입력 → 등록된 제품 데이터 기준으로 국가별 DNT 발생 행 분석
- DNT 발생 행만 필터링해 테이블 표시, 나머지 행은 자동 생략
- 번역 완료 후 로컬어 붙여넣기 → EN DNT 개수 vs 로컬어 DNT 개수 비교
  - 전체 일치: `✅ 모든 국가 DNT 일치`
  - 불일치: 국가별 + 행별 상세 대조 테이블
- 검증 결과 스냅샷 저장 (저장자, 저장 시각 포함)
- 저장된 스냅샷 열람: 펼치면 영문 DNT 분석 + 번역 비교 동시 표시

**제품 데이터 관리**
- 우측 상단 ⚙ 버튼으로 패널 열기
- 제품 추가 / 수정 / 삭제
- 제품당 설정: 제품명, 감지 키워드(aliases, 줄바꿈 구분), 미출시 국가 선택

---

### 탭 4 — Status (국가별 카피 작업 현황)

페이지별로 국가마다 카피 작업 단계를 추적합니다.

#### 진행 단계 (16단계)

| step | 값 | 표시명 |
|------|----|--------|
| 0 | (없음) | — 미설정 — |
| 1 | `inquiry` | 문의 필요 |
| 2 | `tp_req` | TP 번역 요청 |
| 3 | `tp_done` | TP 번역 완료 |
| 4 | `local_survey` | Local Survey 시작 |
| 5 | `cmu_req_needed` | CMU 컨펌 요청 필요 |
| 6 | `cmu_req_done` | CMU 컨펌 요청 완료 |
| 7 | `cmu_answered` | CMU 답변 완료 |
| 8 | `local_confirmed` | Local Confirmed |
| 9 | `deck_merge` | Deck Merge |
| 10 | `prod_needed` | Production 요청 필요 |
| 11 | `prod_wip` | Production 중 |
| 12 | `prod_done` | Production 완료 |
| 13 | `qa_needed` | QA 필요 |
| 14 | `qa_wip` | QA 중 |
| 15 | `qa_done` | QA 완료 |

진행률 바는 전체 국가 step 합계 ÷ (국가 수 × 15) × 100%로 계산합니다.

#### 폴더 / 페이지

- 폴더 생성으로 페이지 그룹화 가능
- 폴더 열기/닫기, 페이지를 다른 폴더로 이동
- 페이지 카드: 개국 수, 평균 진행 단계, 상태별 배지 집계 표시

#### 페이지 상세

- 국가 추가 / 제거
- 셀 클릭 → 상태 선택 드롭다운
- 메모 입력 (셀별 독립)
- 상태 변경 즉시 DB 저장 (debounce 없이 실시간)

#### 첨부파일

- 국가별로 파일 첨부 (base64로 DB 저장)
- 목록 로드 시 `data_url` 제외 (성능) → 다운로드 클릭 시 단건 조회
- 업로더 이름, 업로드 당시 상태·메모 함께 기록
- 파일 교체 가능

---

## 지원 국가

78개 site code, 5개 리전으로 구성됩니다.

| 리전 | 국가 수 | 주요 국가 |
|------|---------|-----------|
| NALA | 12 | CA, CA_FR, MX, BR, LATIN, CO, AR, CL, PE … |
| APAC | 10 | SG, AU, NZ, ID, TH, VN, MY, PH, MM, JP |
| EU | 34 | UK, DE, FR, IT, ES, NL, SE, PL, RO … |
| SWA | 2 | IN, BD |
| MENA | 20 | AE, AE_AR, SA, SA_EN, TR, LEVANT, EG, ZA … |

---

## DB 테이블 구조

| 테이블 | 설명 |
|--------|------|
| `users` | 사용자 계정 (이메일, 이름, bcrypt 비밀번호, 직책, 승인 여부) |
| `copy_requests` | 카피 추출 요청 묶음 (제품명, 요청자, 날짜) |
| `copy_rows` | 요청별 행 데이터 (AS-WAS, TO-BE, 상태) |
| `samsung_products` | 제품 출시 데이터 (aliases JSON, excluded_countries JSON) |
| `cc_projects` | 국가별 카피 프로젝트 |
| `cc_project_copies` | 프로젝트 셀 데이터 (site_code × row_index × copy_text) |
| `cc_project_dnt` | DNT 검증 스냅샷 (en_raw, result_json, locals_json, 저장자) |
| `cc_locals_history` | 국가별 로컬어 변경 이력 (저장자 이름+이메일, 시각) |
| `quick_check_sites` | 즉석 검수 국가 목록 (영구 보존) |
| `tracker_folders` | 작업 현황 폴더 |
| `tracker_pages` | 작업 현황 페이지 |
| `tracker_site_status` | 페이지별 국가 상태·메모 |
| `tracker_branches` | 작업 분기 |
| `tracker_branch_status` | 분기별 상태 |
| `page_files` | 첨부파일 (base64 data_url, 업로더, 업로드 시 상태·메모) |
| `merge_projects` | Merge 프로젝트 (기준 영문 카피 저장) |
| `merge_countries` | 프로젝트별 국가 카피 (raw_paste, mapped_json) |
| `merge_country_history` | Merge 변경 이력 (diff_json: 변경된 행만, 저장자) |
| `service_status` | 서비스 운영 현황 (Samsung Health, Care+, Trade-in 등) |
| `service_history` | 서비스 현황 변경 이력 |
| `product_launch_history` | 제품 출시 이력 |

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | `/api/connect` | DB 연결 (config body) |
| POST | `/api/init` | 테이블 초기화 + 시드 데이터 삽입 |
| POST | `/api/auth/register` | 회원가입 |
| POST | `/api/auth/login` | 로그인 → JWT 반환 |
| GET | `/api/auth/me` | 현재 사용자 정보 |
| GET | `/api/auth/users` | 사용자 목록 (정규직 전용) |
| PUT | `/api/auth/users/:id/approve` | 사용자 승인/해제 |
| GET/POST/PUT/DELETE | `/api/products` | 제품 CRUD |
| POST | `/api/save` | 카피 추출 결과 저장 |
| GET | `/api/requests` | 요청 목록 |
| GET | `/api/rows` | 요청별 행 조회 |
| PUT | `/api/rows/:id` | 행 수정 |
| DELETE | `/api/rows/:id` | 행 삭제 |
| GET/POST/PUT/DELETE | `/api/cc/projects` | 국가 카피 프로젝트 CRUD |
| GET/POST | `/api/cc/projects/:id/copies` | 프로젝트 셀 조회/저장 |
| POST/GET/DELETE | `/api/cc/projects/:id/dnt` | DNT 스냅샷 CRUD |
| POST/GET | `/api/cc/projects/:id/locals-history/:siteCode` | 로컬어 변경 이력 |
| GET/POST/PUT/DELETE | `/api/merge/projects` | Merge 프로젝트 CRUD |
| POST/DELETE | `/api/merge/projects/:id/countries` | 국가 카피 저장/삭제 |
| GET | `/api/merge/projects/:id/countries/:cId/history` | Merge 이력 |
| GET/POST | `/api/tracker/pages` | 작업 현황 페이지 |
| GET | `/api/tracker/pages/:id` | 페이지 상세 + 상태 + 파일 |
| POST | `/api/tracker/status` | 상태/메모 업데이트 |
| POST | `/api/files` | 파일 업로드 |
| GET | `/api/files/:id/data` | 파일 data_url 단건 조회 |
| DELETE | `/api/files/:id` | 파일 삭제 |
| GET/PUT/POST | `/api/services` | 서비스 운영 현황 |

모든 `/api/merge/*` 엔드포인트는 JWT 인증 필수입니다.

---

## 환경변수 전체 목록

| 변수 | 기본값 | 설명 |
|------|--------|------|
| `PORT` | `4000` | 백엔드 포트 |
| `DB_HOST` | — | MySQL 호스트 IP |
| `DB_PORT` | `3306` | MySQL 포트 |
| `DB_USER` | — | MySQL 사용자 |
| `DB_PASSWORD` | — | MySQL 비밀번호 |
| `DB_NAME` | — | DB 이름 (`ae-auto-db`) |
| `JWT_SECRET` | `super_secret_key_for_copy_diff` | JWT 서명 키 (운영 시 반드시 변경) |
| `CLIENT_DIST_PATH` | `../client/dist` | 빌드된 프론트엔드 경로 |

---

## 주요 성능 최적화

- **diff 계산**: 음절 단위 LCS → 단어/토큰 단위 LCS로 교체 (한국어·영어·숫자 토큰 분리)
- **비동기 렌더링**: `DiffHighlight`는 `requestIdleCallback`으로 diff를 브라우저 여유 시간에 계산 → 초기 렌더는 plain text로 즉시 표시
- **페이지네이션**: `HistoryTable` 30행씩, 페이지 전환에 `startTransition` 적용
- **첨부파일 지연 로드**: 목록 조회 시 `data_url` 제외, 다운로드 클릭 시 단건 요청
- **uncontrolled textarea**: 이력 테이블 편집 중 다른 행 재렌더 없음 (`defaultValue` + `useRef`)
- **LCS 상한**: 토큰 쌍이 40,000 초과 시 diff 생략, 통째로 변경 처리

---

## 오류 로그

서버 실행 디렉터리에 `server-error.log` 파일로 누적됩니다.  
`uncaughtException` / `unhandledRejection` 발생 시 스택 트레이스를 기록하고 프로세스를 재시작합니다.