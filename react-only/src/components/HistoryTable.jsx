import { memo, useState, useRef } from 'react'
import DiffHighlight from './DiffHighlight.jsx'
import { STATUS_COLOR } from '../constants.js'

const HistoryTable = memo(function HistoryTable({ rows, onUpdate, onDelete }) {
  const [editingRowId, setEditingRowId] = useState(null)
  const [saving, setSaving] = useState(false)
  const asRef = useRef(null)
  const toRef = useRef(null)

  if (!rows || rows.length === 0)
    return <div className="empty-hint center">표시할 항목이 없습니다.</div>

  const startEdit = row => {
    setEditingRowId(row.id)
    setTimeout(() => {
      if (asRef.current) asRef.current.value = row.as_was || ''
      if (toRef.current) toRef.current.value  = row.to_be  || ''
    }, 0)
  }
  const cancelEdit = () => setEditingRowId(null)
  const saveEdit = async rowId => {
    setSaving(true)
    const ok = await onUpdate(rowId, {
      as_was: asRef.current?.value ?? '',
      to_be:  toRef.current?.value  ?? '',
    })
    setSaving(false)
    if (ok) setEditingRowId(null)
  }

  return (
    <div className="table-wrap">
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
          {rows.map(r => {
            const isEditing = editingRowId === r.id
            return (
              <tr key={r.id} className={isEditing ? 'row-editing' : ''}>
                <td className="td-row">{r.row_index}</td>
                {isEditing ? (
                  <>
                    <td className="td-as td-edit">
                      <textarea ref={asRef} className="edit-textarea as-textarea" defaultValue={r.as_was || ''} />
                    </td>
                    <td className="td-to td-edit">
                      <textarea ref={toRef} className="edit-textarea to-textarea" defaultValue={r.to_be || ''} />
                    </td>
                  </>
                ) : (
                  <>
                    <td className="td-as"><DiffHighlight asWas={r.as_was} toBe={r.to_be} side="as" /></td>
                    <td className="td-to"><DiffHighlight asWas={r.as_was} toBe={r.to_be} side="to" /></td>
                  </>
                )}
                <td className="td-status">
                  <span className="status-badge"
                    style={{ background: STATUS_COLOR[r.status]?.bg, color: STATUS_COLOR[r.status]?.fg }}>
                    {r.status}
                  </span>
                </td>
                <td className="td-actions">
                  {isEditing ? (
                    <div className="action-btns">
                      <button className="act-btn act-save" onClick={() => saveEdit(r.id)} disabled={saving}>
                        {saving ? '…' : '저장'}
                      </button>
                      <button className="act-btn act-cancel" onClick={cancelEdit} disabled={saving}>취소</button>
                    </div>
                  ) : (
                    <div className="action-btns">
                      <button className="act-btn act-edit" onClick={() => startEdit(r)} title="수정">✏</button>
                      <button className="act-btn act-delete" onClick={() => onDelete(r.id)} title="삭제">🗑</button>
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
})

export default HistoryTable