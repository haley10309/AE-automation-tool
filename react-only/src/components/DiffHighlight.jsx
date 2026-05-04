import { memo, useMemo } from 'react'
import { computeCharDiff, computeWordDiff, CHAR_DIFF_LIMIT } from '../utils.js'

const DiffHighlight = memo(function DiffHighlight({ asWas, toBe, side }) {
  const a = asWas || '', b = toBe || ''
  if (!a && !b) return <em className="empty-val">빈 값</em>
  if (a === b)  return <span>{a}</span>

  const useLong = a.length > CHAR_DIFF_LIMIT || b.length > CHAR_DIFF_LIMIT
  // eslint-disable-next-line react-hooks/rules-of-hooks
  const { aParts, bParts } = useMemo(
    () => useLong ? computeWordDiff(a, b) : computeCharDiff(a, b),
    [a, b, useLong]
  )
  const parts = side === 'as' ? aParts : bParts

  return (
    <span className="diff-text">
      {parts.map((p, idx) => {
        if (p.type === 'equal')  return <span key={idx}>{p.ch}</span>
        if (p.type === 'delete') return <mark key={idx} className="diff-del">{p.ch}</mark>
        if (p.type === 'insert') return <mark key={idx} className="diff-ins">{p.ch}</mark>
        return null
      })}
    </span>
  )
})

export default DiffHighlight