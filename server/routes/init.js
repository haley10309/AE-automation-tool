const express = require('express');
const { getPool } = require('../db');
const { checkDbConnection, authMiddleware } = require('../middleware');
const { SEED_PRODUCTS, SEED_SERVICE_DATA, ALL_SITE_CODES, JWT_SECRET, JWT_EXPIRES } = require('../constants');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { reconnect } = require('../db');

const router = express.Router();



router.post('/connect', async (req, res) => {
  console.log('🔥 /api/connect 호출됨');

  try {
    const { host, port, user, password, database } = req.body;

    console.log({
      host,
      port,
      user,
      database
    });

    console.log('🔑 password source:', password ? 'from UI' : 'from .env', '/ DB_PASSWORD set:', !!process.env.DB_PASSWORD)

    // db.js의 reconnect()로 pool 교체 및 연결 테스트
    await reconnect({ host, port, user, password: password || process.env.DB_PASSWORD, database });
    const conn = await getPool().getConnection();

    console.log('✅ getConnection 성공');

    await conn.ping();

    console.log('✅ ping 성공');

    conn.release();

    res.json({ ok: true });

  } catch (err) { 

    console.error('❌ connect 실패:', err);

    // pool reset은 db.js reconnect에서 관리 (여기선 생략)

    res.json({
      ok: false,
      message: err.message
    });
  }
});

router.post('/init', checkDbConnection, async (req, res) => {
  try {
    // status 텝이 있는 국가별 관리 브랜치 분리를 위한 테이블 
    await getPool().execute(`CREATE TABLE IF NOT EXISTS tracker_branches (
      id INT AUTO_INCREMENT PRIMARY KEY,
      page_id VARCHAR(100) NOT NULL,
      site_code VARCHAR(50) NOT NULL,
      branch_name VARCHAR(255) NOT NULL,
      status VARCHAR(100),
      note TEXT,
      file_name VARCHAR(500),
      data_url LONGTEXT,
      created_by VARCHAR(100) COMMENT '요청자(자동)',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      INDEX idx_branch (page_id, site_code)
    ) COMMENT='국가별 작업 분기(Branch) 타임라인 관리'`)
    // [신규] 분기 close 상태 관리 테이블
    await getPool().execute(`CREATE TABLE IF NOT EXISTS tracker_branch_status (
      id INT AUTO_INCREMENT PRIMARY KEY,
      page_id VARCHAR(100) NOT NULL,
      site_code VARCHAR(50) NOT NULL,
      branch_name VARCHAR(255) NOT NULL,
      is_closed TINYINT(1) NOT NULL DEFAULT 0,
      closed_by VARCHAR(100),
      closed_at DATETIME,
      UNIQUE KEY uq_branch (page_id, site_code, branch_name)
    ) COMMENT='분기별 Close 상태'`);
    // [신규] 인증용 users 테이블 생성
    await getPool().execute(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      password VARCHAR(255) NOT NULL,
      position ENUM('intern', 'regular') NOT NULL,
      approved TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    //머지 db 
      await getPool().execute(`
    CREATE TABLE IF NOT EXISTS merge_projects (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      title       VARCHAR(300) NOT NULL,
      en_lines    LONGTEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
   // (server.js의 /api/init 내부)
    await getPool().execute(`CREATE TABLE IF NOT EXISTS merge_countries (
  id INT AUTO_INCREMENT PRIMARY KEY,
  project_id INT NOT NULL,
  label VARCHAR(100) NOT NULL,
  raw_paste TEXT,
  mapped_json JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_proj_label (project_id, label)
)`);

    // 기존 merge_countries 테이블에 updated_at 컬럼이 없으면 추가
    try {
      await getPool().execute(`ALTER TABLE merge_countries ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    // ── merge_country_history 테이블 (변경 이력) ──────────────
    await getPool().execute(`CREATE TABLE IF NOT EXISTS merge_country_history (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      project_id  INT NOT NULL,
      country_id  INT NOT NULL,
      label       VARCHAR(100),
      raw_paste   TEXT,
      mapped_json JSON COMMENT '전체 매핑 결과',
      diff_json   JSON COMMENT '이전 버전 대비 변경된 행만',
      saved_by    VARCHAR(100) COMMENT '저장한 사용자 이름',
      saved_by_email VARCHAR(255) COMMENT '저장한 사용자 이메일',
      saved_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_country (country_id, project_id)
    ) COMMENT='국가별 Merge 변경 이력'`);

    // 기존 DB에 diff_json 컬럼이 없으면 추가
    try {
      await getPool().execute(`ALTER TABLE merge_country_history ADD COLUMN diff_json JSON COMMENT '변경된 행만' AFTER mapped_json`);
    } catch (_) { /* 이미 존재하면 무시 */ }
    try {
      await getPool().execute(`ALTER TABLE merge_country_history ADD COLUMN saved_by VARCHAR(100) AFTER diff_json`);
    } catch (_) {}
    try {
      await getPool().execute(`ALTER TABLE merge_country_history ADD COLUMN saved_by_email VARCHAR(255) AFTER saved_by`);
    } catch (_) {}

    await getPool().execute(`CREATE TABLE IF NOT EXISTS copy_requests (
      id INT AUTO_INCREMENT PRIMARY KEY, product_name VARCHAR(255) NOT NULL,
      requester VARCHAR(100), request_date DATE NOT NULL,
      note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS copy_rows (
      id INT AUTO_INCREMENT PRIMARY KEY, request_id INT NOT NULL,
      row_index INT NOT NULL, as_was TEXT, to_be TEXT,
      status ENUM('변경','추가','삭제','동일') NOT NULL DEFAULT '동일',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES copy_requests(id) ON DELETE CASCADE)`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS product_launch_history (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      product_id  INT NOT NULL,
      changed_by  VARCHAR(100),
      changed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      field       VARCHAR(50) NOT NULL COMMENT 'excluded_countries|name|aliases',
      as_was      TEXT,
      to_be       TEXT,
      INDEX idx_product (product_id)
    ) COMMENT='제품 출시여부 수정 이력'`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS samsung_products (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL,
      aliases JSON NOT NULL DEFAULT ('[]'), excluded_countries JSON NOT NULL DEFAULT ('[]'),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS tracker_folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) COMMENT='StatusTab 폴더 (depth 1)'`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS tracker_pages (
      id VARCHAR(100) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      folder_id INT DEFAULT NULL COMMENT '소속 폴더 (NULL이면 최상위)',
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // 기존 테이블에 folder_id 컬럼이 없으면 추가
    try {
      await getPool().execute(`ALTER TABLE tracker_pages ADD COLUMN folder_id INT DEFAULT NULL COMMENT '소속 폴더' AFTER title`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    await getPool().execute(`CREATE TABLE IF NOT EXISTS tracker_site_status (
      page_id VARCHAR(100) NOT NULL,
      site_code VARCHAR(50) NOT NULL,
      status VARCHAR(100),
      note TEXT,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (page_id, site_code),
      FOREIGN KEY (page_id) REFERENCES tracker_pages(id) ON DELETE CASCADE)`);

    // 기존 tracker_site_status에 updated_by 컬럼 추가 (이미 있으면 무시)
    try {
      await getPool().execute(`ALTER TABLE tracker_site_status ADD COLUMN updated_by VARCHAR(100) DEFAULT NULL COMMENT '최종 수정자' AFTER note`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    // 카피 작업 상태 변경 이력 테이블
    await getPool().execute(`CREATE TABLE IF NOT EXISTS tracker_status_history (
      id INT AUTO_INCREMENT PRIMARY KEY,
      page_id VARCHAR(100) NOT NULL,
      site_code VARCHAR(50) NOT NULL,
      from_status VARCHAR(100) COMMENT '변경 전 상태',
      to_status VARCHAR(100) COMMENT '변경 후 상태',
      changed_by VARCHAR(100) COMMENT '변경자',
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_status_hist (page_id, site_code)
    ) COMMENT='카피 작업 상태 변경 이력'`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS page_files (
      id INT AUTO_INCREMENT PRIMARY KEY, page_id VARCHAR(100) NOT NULL,
      site_code VARCHAR(50) NOT NULL, name VARCHAR(500) NOT NULL,
      size INT, type VARCHAR(100), status VARCHAR(100) COMMENT '업로드 당시 상태',
      note_at_upload TEXT COMMENT '업로드 당시 메모',
      uploaded_by VARCHAR(100) DEFAULT NULL COMMENT '업로더 이름',
      uploaded_at DATETIME NOT NULL,
      data_url LONGTEXT NOT NULL, created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_page_site (page_id, site_code))`);

    // 기존 DB에 uploaded_by 컬럼이 없으면 추가 (이미 있으면 무시)
    try {
      await getPool().execute(`ALTER TABLE page_files ADD COLUMN uploaded_by VARCHAR(100) DEFAULT NULL COMMENT '업로더 이름' AFTER note_at_upload`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    // ── Billing 테이블 ────────────────────────────────────────────
    await getPool().execute(`CREATE TABLE IF NOT EXISTS tracker_billing (
      id INT AUTO_INCREMENT PRIMARY KEY,
      page_id VARCHAR(100) NOT NULL COMMENT '소속 페이지',
      project_name VARCHAR(255) NOT NULL COMMENT '프로젝트명',
      target_page VARCHAR(255) NOT NULL COMMENT '대상 페이지 (자동 입력)',
      site_count INT NOT NULL DEFAULT 0 COMMENT '사이트 코드 개수',
      page_count INT NOT NULL DEFAULT 0 COMMENT '페이지 수 (사용자 입력)',
      quantity INT GENERATED ALWAYS AS (site_count * page_count) STORED COMMENT '수량 (자동계산)',
      note TEXT COMMENT '비고',
      created_by VARCHAR(100) COMMENT '작성자',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      INDEX idx_billing_page (page_id)
    ) COMMENT='페이지별 Billing 내역'`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS billing_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      billing_id INT NOT NULL COMMENT '소속 billing 레코드',
      name VARCHAR(500) NOT NULL,
      size INT,
      data_url LONGTEXT NOT NULL,
      uploaded_by VARCHAR(100),
      uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      INDEX idx_billing_file (billing_id)
    ) COMMENT='Billing 첨부파일'`);

    const [[{ cnt }]] = await getPool().execute(`SELECT COUNT(*) AS cnt FROM samsung_products`);
    if (cnt === 0) {
      for (const p of SEED_PRODUCTS) {
        await getPool().execute(
          `INSERT INTO samsung_products (name, aliases, excluded_countries) VALUES (?,?,?)`,
          [p.name, JSON.stringify(p.aliases), JSON.stringify(p.excluded)]
        );
      }
    }

    await getPool().execute(`CREATE TABLE IF NOT EXISTS cc_projects (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL COMMENT '페이지/프로젝트명',
      note TEXT COMMENT '메모', site_codes TEXT COMMENT '사용 국가 코드 JSON 배열',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) COMMENT='국가별 카피 프로젝트'`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS cc_project_copies (
      id INT AUTO_INCREMENT PRIMARY KEY, project_id INT NOT NULL,
      site_code VARCHAR(50) NOT NULL, row_index INT NOT NULL, copy_text TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cell (project_id, site_code, row_index),
      FOREIGN KEY (project_id) REFERENCES cc_projects(id) ON DELETE CASCADE
    ) COMMENT='국가별 카피 셀 데이터'`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS cc_project_dnt (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      project_id   INT NOT NULL,
      en_raw       TEXT          COMMENT '영문 원본',
      site_codes   TEXT          COMMENT '선택 국가 코드 JSON',
      result_json  LONGTEXT      COMMENT 'DNT 분석 결과 JSON',
      locals_json  LONGTEXT      COMMENT '로컬어 입력 JSON',
      saved_by     VARCHAR(100)  COMMENT '저장한 사용자',
      saved_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES cc_projects(id) ON DELETE CASCADE
    ) COMMENT='DNT 사전 검증 스냅샷'`);

    // 즉석 검수 국가 목록 (영구 보존)
    await getPool().execute(`CREATE TABLE IF NOT EXISTS quick_check_sites (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      site_code  VARCHAR(20) NOT NULL UNIQUE COMMENT '국가 코드',
      sort_order INT NOT NULL DEFAULT 0      COMMENT '표시 순서',
      added_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    ) COMMENT='즉석 검수 선택 국가 영구 목록'`);

    // 국가별 로컬어 변경 이력
    await getPool().execute(`CREATE TABLE IF NOT EXISTS cc_locals_history (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      project_id   INT NOT NULL,
      site_code    VARCHAR(20)   NOT NULL  COMMENT '국가 코드',
      local_text   LONGTEXT               COMMENT '변경된 로컬어 전체',
      en_raw       TEXT                   COMMENT '당시 영문 원본',
      saved_by     VARCHAR(100)           COMMENT '저장한 사용자 이름',
      saved_by_email VARCHAR(255)         COMMENT '저장한 사용자 이메일',
      saved_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES cc_projects(id) ON DELETE CASCADE
    ) COMMENT='국가별 로컬어 변경 이력'`);

    // ── 서비스 운영 현황 테이블 ──────────────────────────────────
    await getPool().execute(`CREATE TABLE IF NOT EXISTS service_status (
      id                   INT AUTO_INCREMENT PRIMARY KEY,
      site_code            VARCHAR(50) NOT NULL UNIQUE,
      samsung_health_text  VARCHAR(500),
      samsung_health_url   VARCHAR(500),
      apps_services_text   VARCHAR(500),
      apps_services_url    VARCHAR(500),
      care_plus_text       VARCHAR(500),
      care_plus_url        VARCHAR(500),
      trade_in_text        VARCHAR(500),
      trade_in_url         VARCHAR(500),
      updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_site (site_code)
    ) COMMENT='국가별 서비스 운영 여부 (DB 관리)'`);

    await getPool().execute(`CREATE TABLE IF NOT EXISTS service_history (
      id           INT AUTO_INCREMENT PRIMARY KEY,
      site_code    VARCHAR(50) NOT NULL,
      service_key  VARCHAR(50) NOT NULL COMMENT 'samsungHealth|appsServices|carePlus|tradeIn',
      field        VARCHAR(20) NOT NULL COMMENT 'text|url|operated',
      as_was       TEXT,
      to_be        TEXT,
      changed_by   VARCHAR(100),
      changed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_site (site_code)
    ) COMMENT='서비스 운영 현황 수정 이력'`);

    // 최초 1회: 하드코딩 데이터를 DB에 시드
    const [[{ svcCnt }]] = await getPool().execute(`SELECT COUNT(*) AS svcCnt FROM service_status`);
    if (svcCnt === 0) {
      for (const [code, d] of Object.entries(SEED_SERVICE_DATA)) {
        await getPool().execute(
          `INSERT INTO service_status
            (site_code, samsung_health_text, samsung_health_url, apps_services_text, apps_services_url, care_plus_text, care_plus_url, trade_in_text, trade_in_url)
           VALUES (?,?,?,?,?,?,?,?,?)`,
          [
            code,
            d.samsungHealth?.text || null, d.samsungHealth?.url || null,
            d.appsServices?.text  || null, d.appsServices?.url  || null,
            d.carePlus?.text      || null, d.carePlus?.url      || null,
            d.tradeIn?.text       || null, d.tradeIn?.url       || null,
          ]
        );
      }
    }

    // ── [신규] 제품별 국가 Preorder 상태 테이블 ──────────────────
    await getPool().execute(`CREATE TABLE IF NOT EXISTS product_preorder (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      product_id  INT NOT NULL,
      site_code   VARCHAR(20) NOT NULL,
      is_preorder TINYINT(1) NOT NULL DEFAULT 0,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      updated_by  VARCHAR(100),
      UNIQUE KEY uq_prod_site (product_id, site_code),
      INDEX idx_product (product_id)
    ) COMMENT='제품 × 국가 Preorder 진행 여부'`);

    // ── soft delete 컬럼 추가 (기존 테이블 호환) ──
    for (const ddl of [
      `ALTER TABLE page_files          ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE samsung_products    ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE copy_requests       ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE copy_rows           ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE cc_projects         ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE cc_project_dnt      ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE quick_check_sites   ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE merge_projects      ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
      `ALTER TABLE merge_countries     ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0`,
    ]) {
      try { await getPool().execute(ddl) } catch (_) { /* 이미 존재하면 무시 */ }
    }    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

module.exports = router;