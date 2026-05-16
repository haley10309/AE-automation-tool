import { memo } from 'react'
import DiffHighlight from './DiffHighlight.jsx'
import { STATUS_COLOR } from '../constants.js'
import React from 'react'

const DiffTable = memo(function DiffTable({ rows }) {
  if (!rows || rows.length === 0)
    return <div className="empty-hint center">표시할 항목이 없습니다.</div>

  return (
    <div className="table-wrap">
      <table className="result-table">
        <thead>
          <tr>
            <th className="th-row">#</th>
            <th className="th-as">AS-WAS</th>
            <th className="th-to">TO-BE</th>
            <th className="th-status">상태</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(d => (
            <tr key={d.row}>
              <td className="td-row">{d.row}</td>
              <td className="td-as"><DiffHighlight asWas={d.asWas} toBe={d.toBe} side="as" /></td>
              <td className="td-to"><DiffHighlight asWas={d.asWas} toBe={d.toBe} side="to" /></td>
              <td className="td-status">
                <span className="status-badge"
                  style={{ background: STATUS_COLOR[d.status]?.bg, color: STATUS_COLOR[d.status]?.fg }}>
                  {d.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
})

export default DiffTable