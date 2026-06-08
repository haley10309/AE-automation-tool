'use strict';

// initDB: /api/init 호출 시 실행되는 테이블 생성 + 시드 삽입 로직
// pool, SEED_PRODUCTS, SEED_SERVICE_DATA 를 인자로 받아 독립적으로 동작

async function initDB(pool, SEED_PRODUCTS, SEED_SERVICE_DATA) {
    // status 텝이 있는 국가별 관리 브랜치 분리를 위한 테이블 
    await pool.execute(`CREATE TABLE IF NOT EXISTS tracker_branches (
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
    await pool.execute(`CREATE TABLE IF NOT EXISTS tracker_branch_status (
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
    await pool.execute(`CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      email VARCHAR(255) NOT NULL UNIQUE,
      name VARCHAR(100) NOT NULL,
      password VARCHAR(255) NOT NULL,
      position ENUM('intern', 'regular') NOT NULL,
      approved TINYINT(1) DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    //머지 db 
      await pool.execute(`
    CREATE TABLE IF NOT EXISTS merge_projects (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      title       VARCHAR(300) NOT NULL,
      en_lines    LONGTEXT,
      created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `)
   // (server.js의 /api/init 내부)
    await pool.execute(`CREATE TABLE IF NOT EXISTS merge_countries (
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
      await pool.execute(`ALTER TABLE merge_countries ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP AFTER created_at`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    // ── merge_country_history 테이블 (변경 이력) ──────────────
    await pool.execute(`CREATE TABLE IF NOT EXISTS merge_country_history (
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
      await pool.execute(`ALTER TABLE merge_country_history ADD COLUMN diff_json JSON COMMENT '변경된 행만' AFTER mapped_json`);
    } catch (_) { /* 이미 존재하면 무시 */ }
    try {
      await pool.execute(`ALTER TABLE merge_country_history ADD COLUMN saved_by VARCHAR(100) AFTER diff_json`);
    } catch (_) {}
    try {
      await pool.execute(`ALTER TABLE merge_country_history ADD COLUMN saved_by_email VARCHAR(255) AFTER saved_by`);
    } catch (_) {}

    await pool.execute(`CREATE TABLE IF NOT EXISTS copy_requests (
      id INT AUTO_INCREMENT PRIMARY KEY, product_name VARCHAR(255) NOT NULL,
      requester VARCHAR(100), request_date DATE NOT NULL,
      note TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS copy_rows (
      id INT AUTO_INCREMENT PRIMARY KEY, request_id INT NOT NULL,
      row_index INT NOT NULL, as_was TEXT, to_be TEXT,
      status ENUM('변경','추가','삭제','동일') NOT NULL DEFAULT '동일',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES copy_requests(id) ON DELETE CASCADE)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS product_launch_history (
      id          INT AUTO_INCREMENT PRIMARY KEY,
      product_id  INT NOT NULL,
      changed_by  VARCHAR(100),
      changed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      field       VARCHAR(50) NOT NULL COMMENT 'excluded_countries|name|aliases',
      as_was      TEXT,
      to_be       TEXT,
      INDEX idx_product (product_id)
    ) COMMENT='제품 출시여부 수정 이력'`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS samsung_products (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL,
      aliases JSON NOT NULL DEFAULT ('[]'), excluded_countries JSON NOT NULL DEFAULT ('[]'),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS tracker_folders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) COMMENT='StatusTab 폴더 (depth 1)'`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS tracker_pages (
      id VARCHAR(100) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      folder_id INT DEFAULT NULL COMMENT '소속 폴더 (NULL이면 최상위)',
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`);

    // 기존 테이블에 folder_id 컬럼이 없으면 추가
    try {
      await pool.execute(`ALTER TABLE tracker_pages ADD COLUMN folder_id INT DEFAULT NULL COMMENT '소속 폴더' AFTER title`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    await pool.execute(`CREATE TABLE IF NOT EXISTS tracker_site_status (
      page_id VARCHAR(100) NOT NULL,
      site_code VARCHAR(50) NOT NULL,
      status VARCHAR(100),
      note TEXT,
      deleted TINYINT(1) NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (page_id, site_code),
      FOREIGN KEY (page_id) REFERENCES tracker_pages(id) ON DELETE CASCADE)`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS page_files (
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
      await pool.execute(`ALTER TABLE page_files ADD COLUMN uploaded_by VARCHAR(100) DEFAULT NULL COMMENT '업로더 이름' AFTER note_at_upload`);
    } catch (_) { /* 이미 존재하면 무시 */ }

    const [[{ cnt }]] = await pool.execute(`SELECT COUNT(*) AS cnt FROM samsung_products`);
    if (cnt === 0) {
      for (const p of SEED_PRODUCTS) {
        await pool.execute(
          `INSERT INTO samsung_products (name, aliases, excluded_countries) VALUES (?,?,?)`,
          [p.name, JSON.stringify(p.aliases), JSON.stringify(p.excluded)]
        );
      }
    }

    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_projects (
      id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(255) NOT NULL COMMENT '페이지/프로젝트명',
      note TEXT COMMENT '메모', site_codes TEXT COMMENT '사용 국가 코드 JSON 배열',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) COMMENT='국가별 카피 프로젝트'`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_project_copies (
      id INT AUTO_INCREMENT PRIMARY KEY, project_id INT NOT NULL,
      site_code VARCHAR(50) NOT NULL, row_index INT NOT NULL, copy_text TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uq_cell (project_id, site_code, row_index),
      FOREIGN KEY (project_id) REFERENCES cc_projects(id) ON DELETE CASCADE
    ) COMMENT='국가별 카피 셀 데이터'`);

    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_project_dnt (
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
    await pool.execute(`CREATE TABLE IF NOT EXISTS quick_check_sites (
      id         INT AUTO_INCREMENT PRIMARY KEY,
      site_code  VARCHAR(20) NOT NULL UNIQUE COMMENT '국가 코드',
      sort_order INT NOT NULL DEFAULT 0      COMMENT '표시 순서',
      added_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    ) COMMENT='즉석 검수 선택 국가 영구 목록'`);

    // 국가별 로컬어 변경 이력
    await pool.execute(`CREATE TABLE IF NOT EXISTS cc_locals_history (
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
    await pool.execute(`CREATE TABLE IF NOT EXISTS service_status (
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

    await pool.execute(`CREATE TABLE IF NOT EXISTS service_history (
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
    const [[{ svcCnt }]] = await pool.execute(`SELECT COUNT(*) AS svcCnt FROM service_status`);
    if (svcCnt === 0) {
      for (const [code, d] of Object.entries(SEED_SERVICE_DATA)) {
        await pool.execute(
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
      try { await pool.execute(ddl) } catch (_) { /* 이미 존재하면 무시 */ }
    }

  console.log('✅ DB 초기화 완료');
}

module.exports = { initDB };