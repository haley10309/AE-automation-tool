import { memo, useState, useEffect, useRef } from 'react'
import { computeWordDiff } from '../utils.js'

// requestIdleCallback 폴리필 (Safari 등 미지원 브라우저 대비)
const rIC = typeof requestIdleCallback !== 'undefined'
  ? requestIdleCallback
  : (cb) => setTimeout(cb, 8)
const cIC = typeof cancelIdleCallback !== 'undefined'
  ? cancelIdleCallback
  : clearTimeout

function renderParts(parts) {
  return parts.map((p, idx) => {
    if (p.type === 'equal')  return <span key={idx}>{p.ch}</span>
    if (p.type === 'delete') return <mark key={idx} className="diff-del">{p.ch}</mark>
    if (p.type === 'insert') return <mark key={idx} className="diff-ins">{p.ch}</mark>
    return null
  })
}

// ──────────────────────────────────────────────────────────────
// DiffHighlight
//
// 렌더 순서:
//   1. 즉시: plain text (블록 컬러만) → 화면 빠르게 그림
//   2. 브라우저 유휴 시간: 단어 단위 diff 계산 → 하이라이트 교체
//
// memo: props 불변이면 재렌더 없음
// ──────────────────────────────────────────────────────────────
const DiffHighlight = memo(function DiffHighlight({ asWas, toBe, side }) {
  const a = (asWas || '').trim()
  const b = (toBe  || '').trim()

  // null = 아직 계산 안 됨, object = 계산 완료
  const [diff, setDiff] = useState(null)
  const idRef = useRef(null)

  useEffect(() => {
    setDiff(null) // 값이 바뀌면 초기화

    if (!a && !b) return
    if (a === b)  return

    // 브라우저가 한가할 때 계산
    idRef.current = rIC(() => {
      setDiff(computeWordDiff(a, b))
    })
    return () => { if (idRef.current) cIC(idRef.current) }
  }, [a, b])

  // ── 빈 값 ──
  if (!a && !b) return <em className="empty-val">빈 값</em>

  // ── 동일 ──
  if (a === b) return <span className="diff-text">{a}</span>

  // ── diff 계산 전: 블록 컬러로 빠르게 표시 ──
  if (!diff) {
    return (
      <span className="diff-text">
        {side === 'as'
          ? <mark className="diff-del">{a}</mark>
          : <mark className="diff-ins">{b}</mark>}
      </span>
    )
  }

  // ── diff 계산 완료: 단어 단위 하이라이트 ──
  const parts = side === 'as' ? diff.aParts : diff.bParts
  return <span className="diff-text">{renderParts(parts)}</span>
})

export default DiffHighlight