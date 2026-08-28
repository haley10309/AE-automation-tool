import { useState } from 'react'
import { api } from '../api.js'

function colLetter(i) {
  let s = '', n = i
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return s
}

// 셀 안에 Alt+Enter 줄바꿈(\n, \r\n)이 있으면 공백으로 치환한다.
// 이후 행들을 '\n'으로 join해 텍스트로 만들기 때문에, 셀 내부 줄바꿈을 남겨두면
// 원래 한 행(한 셀)이 여러 행으로 쪼개져 AS-WAS/TO-BE 정렬이 어긋나 버린다.
const norm = v => (v ?? '').toString().replace(/\r\n|\r|\n/g, ' ').trim()

/**
 * 엑셀 업로드 → 그리드로 파싱 → 사용자가 AS-WAS 열 / TO-BE 열을 직접 선택.
 * 같은 행(같은 시트의 같은 row index)끼리 짝지어지므로, 복사/붙여넣기 방식과 달리
 * 행 정렬이 어긋날 걱정이 없다.
 */
export default function ExtractExcelImportModal({ onClose, onApply }) {
  const [fileName, setFileName] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [grid, setGrid]         = useState(null)
  const [headerRowIndex, setHeaderRowIndex] = useState(0)
  const [asWasCol, setAsWasCol] = useState(null)
  const [toBeCol, setToBeCol]   = useState(null)

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setLoading(true)
    setError('')
    setGrid(null)
    setAsWasCol(null)
    setToBeCol(null)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
        r.readAsDataURL(file)
      })
      const res = await api.mergeParseExcel({ fileName: file.name, dataUrl })
      if (!res.ok) { setError(res.message || '파싱 실패'); return }
      setGrid(res.grid || [])
      setHeaderRowIndex(0)
    } catch (err) {
      setError(err.message || '파일 처리 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const headerRow = grid?.[headerRowIndex] || []
  const dataStartRow = headerRowIndex + 1
  const previewRows = grid ? grid.slice(dataStartRow, dataStartRow + 6) : []
  const colCount = grid ? Math.max(...grid.map(r => r.length), 0) : 0

  const canApply = grid && asWasCol != null && toBeCol != null && asWasCol !== toBeCol

  const handleApply = () => {
    if (!canApply) return
    const dataRows = grid.slice(dataStartRow)
    const asLines = [], toLines = []
    dataRows.forEach(row => {
      const a = norm(row[asWasCol])
      const b = norm(row[toBeCol])
      if (a === '' && b === '') return // 완전히 빈 행(꼬리 빈 줄)만 같이 걸러냄 — 정렬 유지
      asLines.push(a); toLines.push(b)
    })
    onApply(asLines, toLines, {
      asLabel: `📊 ${fileName} · ${headerRow[asWasCol] || colLetter(asWasCol) + '열'}`,
      toLabel: `📊 ${fileName} · ${headerRow[toBeCol] || colLetter(toBeCol) + '열'}`,
    })
  }

  return (
    <>
      <style>{`
        .ex-excel-modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,.55);
          display: flex; align-items: center; justify-content: center; z-index: 9999;
        }
        .ex-excel-modal {
          background: #fff; border-radius: 12px; width: 880px; max-width: 94vw;
          max-height: 88vh; display: flex; flex-direction: column;
          box-shadow: 0 24px 64px rgba(0,0,0,.3); overflow: hidden;
        }
        .ex-excel-modal-header {
          padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
          display: flex; align-items: center; justify-content: space-between;
        }
        .ex-excel-modal-title { font-size: 15px; font-weight: 700; color: #111827; }
        .ex-excel-modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: #6b7280; }
        .ex-excel-modal-body { padding: 18px 20px; overflow-y: auto; flex: 1; }
        .ex-excel-step-label { font-size: 12px; font-weight: 700; color: #4f46e5; margin-bottom: 6px; }
        .ex-excel-hint { font-size: 11px; color: #9ca3af; margin-top: 4px; }
        .ex-excel-row-picker { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
        .ex-excel-row-btn {
          font-size: 11px; padding: 3px 9px; border-radius: 5px; border: 1px solid #d1d5db;
          background: #f9fafb; cursor: pointer; color: #374151;
        }
        .ex-excel-row-btn.active { background: #4f46e5; border-color: #4f46e5; color: #fff; }
        .ex-excel-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 14px; }
        .ex-excel-table { border-collapse: collapse; font-size: 11px; width: max-content; min-width: 100%; }
        .ex-excel-table th, .ex-excel-table td {
          border: 1px solid #f0f1f3; padding: 5px 8px; white-space: nowrap;
          max-width: 220px; overflow: hidden; text-overflow: ellipsis;
        }
        .ex-excel-col-header { background: #f9fafb; vertical-align: top; }
        .ex-excel-col-header.is-as { background: #eff6ff; }
        .ex-excel-col-header.is-to { background: #f0fdf4; }
        .ex-excel-pick-btn {
          font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px;
          border: 1px solid #d1d5db; background: #fff; cursor: pointer; color: #374151;
        }
        .ex-excel-pick-btn.as:hover { border-color: #3b82f6; color: #1e40af; }
        .ex-excel-pick-btn.to:hover { border-color: #22c55e; color: #166534; }
        .ex-excel-badge {
          display: inline-block; font-size: 9px; padding: 1px 6px; border-radius: 8px;
          margin-top: 4px; font-weight: 700;
        }
        .ex-excel-badge.as { background: #3b82f6; color: #fff; }
        .ex-excel-badge.to { background: #22c55e; color: #fff; }
        .ex-excel-modal-footer {
          padding: 14px 20px; border-top: 1px solid #e5e7eb;
          display: flex; align-items: center; justify-content: flex-end; gap: 8px;
        }
      `}</style>
      <div className="ex-excel-modal-backdrop" onClick={onClose}>
        <div className="ex-excel-modal" onClick={e => e.stopPropagation()}>
          <div className="ex-excel-modal-header">
            <span className="ex-excel-modal-title">📊 엑셀에서 AS-WAS / TO-BE 열 가져오기</span>
            <button className="ex-excel-modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="ex-excel-modal-body">
            {!grid && (
              <>
                <div className="ex-excel-step-label">1. 엑셀 파일 선택</div>
                <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={loading} />
                {loading && <div className="ex-excel-hint">파일을 불러오는 중... (수 초~수십 초 소요될 수 있습니다)</div>}
                {error && <div className="ex-excel-hint" style={{ color: '#dc2626' }}>⚠ {error}</div>}
                <div className="ex-excel-hint">
                  셀 안에 줄바꿈이 있어도 하나의 행(카피)으로 정확히 인식하고, 같은 시트의 같은 행끼리 자동으로 정렬됩니다.
                </div>
              </>
            )}

            {grid && (
              <>
                <div className="ex-excel-step-label">
                  2. 헤더 행 선택 <span className="ex-excel-hint" style={{ marginLeft: 6 }}>({fileName})</span>
                </div>
                <div className="ex-excel-row-picker">
                  {Array.from({ length: Math.min(6, grid.length) }, (_, i) => (
                    <button key={i}
                      className={`ex-excel-row-btn${headerRowIndex === i ? ' active' : ''}`}
                      onClick={() => { setHeaderRowIndex(i); setAsWasCol(null); setToBeCol(null) }}>
                      {i + 1}행: {(grid[i] || []).slice(0, 4).filter(Boolean).join(' / ') || '(빈 행)'}
                    </button>
                  ))}
                </div>

                <div className="ex-excel-step-label">
                  3. 비교할 두 열 선택 — 각 열 아래 버튼을 눌러 AS-WAS / TO-BE를 지정하세요
                </div>
                <div className="ex-excel-table-wrap">
                  <table className="ex-excel-table">
                    <thead>
                      <tr>
                        {Array.from({ length: colCount }, (_, c) => {
                          const isAs = c === asWasCol, isTo = c === toBeCol
                          return (
                            <th key={c} className={`ex-excel-col-header ${isAs ? 'is-as' : ''} ${isTo ? 'is-to' : ''}`}>
                              <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 400 }}>{colLetter(c)}</div>
                              <div style={{ fontSize: 11, fontWeight: 600, margin: '2px 0 4px' }}>{headerRow[c] || '(빈 헤더)'}</div>
                              <div style={{ display: 'flex', gap: 3 }}>
                                <button className="ex-excel-pick-btn as" onClick={() => setAsWasCol(c)}>AS-WAS</button>
                                <button className="ex-excel-pick-btn to" onClick={() => setToBeCol(c)}>TO-BE</button>
                              </div>
                              {isAs && <span className="ex-excel-badge as">AS-WAS</span>}
                              {isTo && <span className="ex-excel-badge to">TO-BE</span>}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((row, ri) => (
                        <tr key={ri}>
                          {Array.from({ length: colCount }, (_, c) => <td key={c}>{row[c] || ''}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {asWasCol != null && toBeCol != null && asWasCol === toBeCol && (
                  <div className="ex-excel-hint" style={{ color: '#dc2626' }}>
                    ⚠ AS-WAS와 TO-BE는 서로 다른 열이어야 합니다.
                  </div>
                )}

                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setGrid(null); setFileName('') }}>
                  ↩ 다른 파일 선택
                </button>
              </>
            )}
          </div>

          <div className="ex-excel-modal-footer">
            <button className="btn-ghost" onClick={onClose}>취소</button>
            <button className="btn-primary" disabled={!canApply} onClick={handleApply}>적용</button>
          </div>
        </div>
      </div>
    </>
  )
}
