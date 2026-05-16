import { memo, useState, useRef, useCallback, useTransition } from 'react'
import DiffHighlight from './DiffHighlight.jsx'
import { STATUS_COLOR } from '../constants.js'
import React from 'react'

const PAGE_SIZE = 30  // 한 번에 렌더할 최대 행 수

// ── 편집 중인 행 (uncontrolled textarea → 타이핑 중 재렌더 0회) ──
const EditRow = memo(function EditRow({ row, onSave, onCancel }) {
  const asRef  = useRef(null)
  const toRef  = useRef(null)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    setSaving(true)
    await onSave(row.id, {
      as_was: asRef.current?.value ?? '',
      to_be:  toRef.current?.value  ?? '',
    })
    setSaving(false)
  }, [row.id, onSave])

  return (
    <tr className="row-editing">
      <td className="td-row">{row.row_index}</td>
      <td className="td-as td-edit">
        <textarea ref={asRef} className="edit-textarea as-textarea"
          defaultValue={row.as_was || ''} />
      </td>
      <td className="td-to td-edit">
        <textarea ref={toRef} className="edit-textarea to-textarea"
          defaultValue={row.to_be || ''} />
      </td>
      <td className="td-status">
        <span className="status-badge"
          style={{ background: STATUS_COLOR[row.status]?.bg, color: STATUS_COLOR[row.status]?.fg }}>
          {row.status}
        </span>
      </td>
      <td className="td-actions">
        <div className="action-btns">
          <button className="act-btn act-save" onClick={handleSave} disabled={saving}>
            {saving ? '…' : '저장'}
          </button>
          <button className="act-btn act-cancel" onClick={onCancel} disabled={saving}>취소</button>
        </div>
      </td>
    </tr>
  )
})

// ── 읽기 행 (memo → props 불변이면 재렌더 없음) ──────────────
const ReadRow = memo(function ReadRow({ row, onEditStart, onDelete }) {
  return (
    <tr>
      <td className="td-row">{row.row_index}</td>
      <td className="td-as">
        <DiffHighlight asWas={row.as_was} toBe={row.to_be} side="as" />
      </td>
      <td className="td-to">
        <DiffHighlight asWas={row.as_was} toBe={row.to_be} side="to" />
      </td>
      <td className="td-status">
        <span className="status-badge"
          style={{ background: STATUS_COLOR[row.status]?.bg, color: STATUS_COLOR[row.status]?.fg }}>
          {row.status}
        </span>
      </td>
      <td className="td-actions">
        <div className="action-btns">
          <button className="act-btn act-edit" onClick={() => onEditStart(row)}>✏</button>
          <button className="act-btn act-delete" onClick={() => onDelete(row.id)}>🗑</button>
        </div>
      </td>
    </tr>
  )
})

// ── HistoryTable 본체 ─────────────────────────────────────────
const HistoryTable = memo(function HistoryTable({ rows, onUpdate, onDelete }) {
  const [editingRowId, setEditingRowId] = useState(null)
  const [page, setPage]                 = useState(0)
  const [isPending, startTransition]    = useTransition()

  // rows가 바뀌면 페이지 리셋
  const prevRowsRef = useRef(rows)
  if (prevRowsRef.current !== rows) {
    prevRowsRef.current = rows
    if (page !== 0) setPage(0)
  }

  const handleSave = useCallback(async (rowId, draft) => {
    const ok = await onUpdate(rowId, draft)
    if (ok) setEditingRowId(null)
  }, [onUpdate])

  const handleCancel    = useCallback(() => setEditingRowId(null), [])
  const handleEditStart = useCallback(row => setEditingRowId(row.id), [])

  const goPage = useCallback((next) => {
    // startTransition: 페이지 전환을 낮은 우선순위로 처리 → UI 블로킹 방지
    startTransition(() => setPage(next))
    setEditingRowId(null)
  }, [])

  if (!rows || rows.length === 0)
    return <div className="empty-hint center">표시할 항목이 없습니다.</div>

  const totalPages  = Math.ceil(rows.length / PAGE_SIZE)
  const pageRows    = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const showPaging  = totalPages > 1

  return (
    <div>
      {/* 페이지네이션 (상단) */}
      {showPaging && (
        <div className="ht-paging">
          <span className="ht-paging-info">
            {rows.length}행 중 {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)}행
            {isPending && <span className="ht-pending"> 로딩 중...</span>}
          </span>
          <div className="ht-paging-btns">
            <button className="btn-sm" onClick={() => goPage(0)} disabled={page === 0}>«</button>
            <button className="btn-sm" onClick={() => goPage(page - 1)} disabled={page === 0}>‹</button>
            {Array.from({ length: totalPages }, (_, i) => (
              <button key={i}
                className={`btn-sm ${i === page ? 'ht-page-active' : ''}`}
                onClick={() => goPage(i)}>
                {i + 1}
              </button>
            ))}
            <button className="btn-sm" onClick={() => goPage(page + 1)} disabled={page === totalPages - 1}>›</button>
            <button className="btn-sm" onClick={() => goPage(totalPages - 1)} disabled={page === totalPages - 1}>»</button>
          </div>
        </div>
      )}

      <div className="table-wrap" style={{ opacity: isPending ? 0.6 : 1, transition: 'opacity .15s' }}>
        <table className="result-table history-table">
          <thead>
            <tr>
              <th className="th-row">#</th>
              <th className="th-as">AS-WAS</th>
              <th className="th-to">TO-BE</th>
              <th className="th-status">상태</th>
              <th className="th-actions">편집</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map(r =>
              editingRowId === r.id ? (
                <EditRow key={r.id} row={r} onSave={handleSave} onCancel={handleCancel} />
              ) : (
                <ReadRow key={r.id} row={r} onEditStart={handleEditStart} onDelete={onDelete} />
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
})

export default HistoryTable