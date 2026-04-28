# 카피덱 변경점 추출기

## 실행 방법

```bash
npm install
npm run dev
```

## 빌드

```bash
npm run build
# dist/ 폴더 생성됨
```

## Electron 연동 시

`window.electronAPI` 를 preload.js에서 노출하면 DB 기능이 자동으로 활성화됩니다.

필요한 IPC 핸들러:
- `db:connect`  — DB 연결 테스트
- `db:init`     — 테이블 생성
- `db:save`     — 요청 저장 (copy_requests + copy_rows)
- `db:listRequests` — 요청 목록 조회
- `db:getRows`  — 특정 요청의 행 상세 조회

electron/main.cjs, electron/preload.cjs 파일은 별도 제공됩니다.
