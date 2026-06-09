const express = require('express');
const { getPool } = require('../db');
const { checkDbConnection, authMiddleware } = require('../middleware');

const router = express.Router();
router.use(checkDbConnection);



// ── 폴더 CRUD ──────────────────────────────────────────────────
router.get('/tracker/folders', async (req, res) => {
  try {
    const [folders] = await getPool().execute(
      `SELECT id, name, created_at FROM tracker_folders WHERE deleted = 0 ORDER BY created_at ASC`
    );
    res.json({ ok: true, data: folders });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.post('/tracker/folders', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name?.trim()) return res.json({ ok: false, message: '폴더 이름을 입력하세요.' });
    const [result] = await getPool().execute(
      `INSERT INTO tracker_folders (name) VALUES (?)`, [name.trim()]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.put('/tracker/folders/:id', async (req, res) => {
  try {
    const { name } = req.body;
    await getPool().execute(
      `UPDATE tracker_folders SET name = ? WHERE id = ?`, [name, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.delete('/tracker/folders/:id', async (req, res) => {
  try {
    // 폴더 삭제 시 소속 페이지를 최상위(folder_id=NULL)로 올림
    await getPool().execute(
      `UPDATE tracker_pages SET folder_id = NULL WHERE folder_id = ?`, [req.params.id]
    );
    await getPool().execute(`UPDATE tracker_folders SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// 페이지를 폴더에 이동/최상위로 이동
router.put('/tracker/pages/:id/folder', async (req, res) => {
  try {
    const { folderId } = req.body; // null이면 최상위
    await getPool().execute(
      `UPDATE tracker_pages SET folder_id = ? WHERE id = ?`,
      [folderId ?? null, req.params.id]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.post('/tracker/pages', async (req, res) => {
  try {
    const { id, title } = req.body;
    if (!id || !title) return res.json({ ok: false, message: 'id와 title이 필요합니다.' });
    await getPool().execute(
      `INSERT INTO tracker_pages (id, title) VALUES (?, ?) ON DUPLICATE KEY UPDATE title = VALUES(title)`,
      [String(id), title]
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.get('/tracker/pages', async (req, res) => {
  if (!getPool()) return res.json({ ok: false });
  try {
    const [pages] = await getPool().execute(`SELECT id, title, folder_id, created_at FROM tracker_pages WHERE deleted = 0 ORDER BY created_at DESC`);
    const [statuses] = await getPool().execute(`SELECT page_id, site_code, status FROM tracker_site_status WHERE deleted = 0`);
    const [folders] = await getPool().execute(
      `SELECT id, name, created_at FROM tracker_folders WHERE deleted = 0 ORDER BY created_at ASC`
    );
    res.json({ ok: true, data: pages, statuses, folders });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.get('/tracker/pages/:id', async (req, res) => {
  try {
    const pageId = req.params.id;
    const [statuses] = await getPool().execute(
      `SELECT site_code, status, note FROM tracker_site_status WHERE page_id = ? AND deleted = 0`, [pageId]
    );
    const [files] = await getPool().execute(
      `SELECT id, site_code, name, size, status, note_at_upload, uploaded_by, uploaded_at
       FROM page_files WHERE page_id = ? ORDER BY uploaded_at ASC`, [pageId]
    );
    // [신규] 분기(Branch) 데이터 조회 (최신순)
    const [branches] = await getPool().execute(
      `SELECT id, site_code, branch_name, status, note, file_name, data_url, created_by, created_at 
       FROM tracker_branches WHERE page_id = ? AND deleted = 0 ORDER BY created_at DESC`, [pageId]
    );
    const [branchStatuses] = await getPool().execute(
      `SELECT site_code, branch_name, is_closed, closed_by, closed_at FROM tracker_branch_status WHERE page_id = ?`, [pageId]
    );
    res.json({ ok: true, statuses, files, branches, branchStatuses });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.put('/tracker/pages/:id', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title?.trim()) return res.json({ ok: false, message: '제목을 입력하세요.' });
    await getPool().execute(`UPDATE tracker_pages SET title = ? WHERE id = ?`, [title.trim(), req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.delete('/tracker/pages/:id', async (req, res) => {
  try {
    await getPool().execute(`UPDATE tracker_pages SET deleted = 1 WHERE id = ?`, [req.params.id]);
    await getPool().execute(`UPDATE tracker_site_status SET deleted = 1 WHERE page_id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});
router.delete('/tracker/status', async (req, res) => {
  try {
    const { pageId, siteCode } = req.query
    await getPool().execute(
      'UPDATE tracker_site_status SET deleted = 1 WHERE page_id = ? AND site_code = ?',
      [pageId, siteCode]
    )
    res.json({ ok: true })
  } catch (err) { res.json({ ok: false, message: err.message }) }
})
router.post('/tracker/status', async (req, res) => {
  try {
    const { pageId, siteCode, status, note } = req.body;
    await getPool().execute(
      `INSERT INTO tracker_site_status (page_id, site_code, status, note, deleted) VALUES (?, ?, ?, ?, 0)
       ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), deleted = 0`,
      [pageId, siteCode, status || '', note || '']
    );
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// status 텝에 분기 생성 api 추가 
router.post('/tracker/branches', authMiddleware, async (req, res) => {
  try {
    const { pageId, siteCode, branchName, status, note, fileName, dataUrl } = req.body;
    const createdBy = req.user?.name || '알 수 없음'; // 토큰에서 자동 추출

    const [result] = await getPool().execute(
      `INSERT INTO tracker_branches (page_id, site_code, branch_name, status, note, file_name, data_url, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [pageId, siteCode, branchName, status || '', note || '', fileName || null, dataUrl || null, createdBy]
    );
    
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});
// 분기 close / reopen
router.put('/tracker/branches/close', authMiddleware, async (req, res) => {
  const { pageId, siteCode, branchName, isClosed } = req.body;
  const closedBy = isClosed ? (req.user?.name || '알 수 없음') : null;
  const closedAt = isClosed ? new Date().toISOString().slice(0, 19).replace('T', ' ') : null;
  try {
    await getPool().execute(
      `INSERT INTO tracker_branch_status (page_id, site_code, branch_name, is_closed, closed_by, closed_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_closed = VALUES(is_closed), closed_by = VALUES(closed_by), closed_at = VALUES(closed_at)`,
      [pageId, siteCode, branchName, isClosed ? 1 : 0, closedBy, closedAt]
    );
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, message: e.message }); }
});

// 분기 soft delete (branch_name 단위로 해당 분기의 모든 레코드 삭제)
router.delete('/tracker/branches', authMiddleware, async (req, res) => {
  const { pageId, siteCode, branchName } = req.body;
  if (!pageId || !siteCode || !branchName) return res.json({ ok: false, message: '필수 파라미터 누락' });
  try {
    await getPool().execute(
      `UPDATE tracker_branches SET deleted = 1 WHERE page_id = ? AND site_code = ? AND branch_name = ?`,
      [pageId, siteCode, branchName]
    );
    // tracker_branch_status에서도 해당 분기 상태 제거
    await getPool().execute(
      `DELETE FROM tracker_branch_status WHERE page_id = ? AND site_code = ? AND branch_name = ?`,
      [pageId, siteCode, branchName]
    );
    res.json({ ok: true });
  } catch (e) { res.json({ ok: false, message: e.message }); }
});

router.put('/tracker/branches/:id/note', authMiddleware, async (req, res) => {
  const { note } = req.body;
  try {
    // created_by 검증: 본인 레코드만 수정 가능
    const [[row]] = await getPool().execute(
      `SELECT created_by FROM tracker_branches WHERE id = ? AND deleted = 0`,
      [req.params.id]
    );
    if (!row) return res.json({ ok: false, message: '레코드를 찾을 수 없습니다.' });
    if (row.created_by !== req.user.name) {
      return res.status(403).json({ ok: false, message: '본인이 작성한 메모만 수정할 수 있습니다.' });
    }
    await getPool().execute(
      `UPDATE tracker_branches SET note = ? WHERE id = ?`,
      [note, req.params.id]
    );
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false, message: e.message });
  }
});
router.post('/files', async (req, res) => {
  try {
    const { pageId, siteCode, name, size, status, noteAtUpload, uploadedAt, dataUrl, uploadedBy } = req.body;
    const mysqlDatetime = new Date(uploadedAt).toISOString().slice(0, 19).replace('T', ' ');
    const [result] = await getPool().execute(
      `INSERT INTO page_files (page_id, site_code, name, size, status, note_at_upload, uploaded_by, uploaded_at, data_url) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [pageId, siteCode, name, size, status, noteAtUpload, uploadedBy || null, mysqlDatetime, dataUrl]
    );
    res.json({ ok: true, id: result.insertId });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.put('/files/:id/note', async (req, res) => {
  try {
    const { noteAtUpload } = req.body;
    await getPool().execute(`UPDATE page_files SET note_at_upload = ? WHERE id = ?`, [noteAtUpload, req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.get('/files', async (req, res) => {
  try {
    const { pageId, siteCode } = req.query;
    if (!pageId) return res.json({ ok: false, message: 'pageId가 필요합니다.' });
    let sql = `SELECT id, page_id, site_code, name, size, type, status, uploaded_by, uploaded_at, created_at FROM page_files WHERE page_id = ? AND deleted = 0`;
    const params = [String(pageId)];
    if (siteCode) { 
      sql += ` AND site_code = ?`; 
      params.push(siteCode); 
    }
    sql += ` ORDER BY created_at ASC`;
    const [rows] = await getPool().execute(sql, params);
    res.json({ ok: true, data: rows });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// 다운로드: data_url은 클릭 시에만 단건 조회
router.get('/files/:id/data', async (req, res) => {
  try {
    const [[row]] = await getPool().execute(
      `SELECT id, name, data_url FROM page_files WHERE id = ?`, [req.params.id]
    );
    if (!row) return res.json({ ok: false, message: '파일을 찾을 수 없습니다.' });
    res.json({ ok: true, data: row });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

router.delete('/files/:id', async (req, res) => {
  try {
    await getPool().execute(`UPDATE page_files SET deleted = 1 WHERE id = ?`, [req.params.id]);
    res.json({ ok: true });
  } catch (err) { res.json({ ok: false, message: err.message }); }
});

// ══════════════════════════════════════════════════════════════
// merge Deck api 
// ══════════════════════════════════════════════════════════════

module.exports = router;