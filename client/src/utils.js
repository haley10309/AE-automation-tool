// ── 문자열 파싱 ───────────────────────────────────────────────
export function parseCol(raw) {
  if (!raw.trim()) return []
  return raw.split(/\r?\n/).map(l => l.trim())
}

export function normalize(s) {
  return s.replace(/\s+/g, ' ').trim()
}

export function isHeaderLike(val) {
  const l = val.toLowerCase()
  return ['as-was','as was','aswas','현재','before','to-be','to be','tobe','이후','after','기존','변경']
    .some(k => l.includes(k))
}

export function getStatus(a, b) {
  if (!a && b) return '추가'
  if (a && !b) return '삭제'
  return '변경'
}

// ── 줄 단위 diff (VSCode의 "Compare Selected"와 동일한 방식) ──────
// 이전 방식은 "같은 줄 번호끼리" 무조건 비교했기 때문에, 중간에 한 줄만
// 추가/삭제돼도 그 아래 모든 줄이 밀려서 전부 "변경"으로 잘못 표시됐다.
// 이제는 실제 diff 알고리즘(LCS)으로 두 배열 사이에서 실제로 같은 줄을
// 찾아 정렬하고, 진짜로 달라진 부분만 추가/삭제/변경으로 표시한다.
const DIFF_SIZE_LIMIT = 4_000_000 // 이 이상이면 정밀 비교 대신 단순 비교로 대체(먹통 방지)

function diffPositionalFallback(a, b) {
  const maxLen = Math.max(a.length, b.length)
  const ops = []
  for (let i = 0; i < maxLen; i++) {
    const hasA = i < a.length, hasB = i < b.length
    if (hasA && hasB) {
      if (a[i] === b[i]) ops.push({ type: 'equal', aIndex: i, bIndex: i })
      else { ops.push({ type: 'delete', aIndex: i, bIndex: -1 }); ops.push({ type: 'insert', aIndex: -1, bIndex: i }) }
    } else if (hasA) { ops.push({ type: 'delete', aIndex: i, bIndex: -1 }) }
    else { ops.push({ type: 'insert', aIndex: -1, bIndex: i }) }
  }
  return ops
}

function diffMiddleBounded(a, b) {
  const N = a.length, M = b.length
  if (N === 0 && M === 0) return []
  if (N === 0) return b.map((_, i) => ({ type: 'insert', aIndex: -1, bIndex: i }))
  if (M === 0) return a.map((_, i) => ({ type: 'delete', aIndex: i, bIndex: -1 }))

  // 너무 크면(둘 다 완전히 다른 대용량 파일 등) O(N*M) LCS는 화면/PC를 멈추게
  // 할 수 있어 단순 비교로 대체한다.
  if (N * M > DIFF_SIZE_LIMIT) return diffPositionalFallback(a, b)

  const row = M + 1
  const dp = new Int32Array((N + 1) * row)
  for (let i = N - 1; i >= 0; i--) {
    for (let j = M - 1; j >= 0; j--) {
      if (a[i] === b[j]) {
        dp[i * row + j] = dp[(i + 1) * row + (j + 1)] + 1
      } else {
        const down = dp[(i + 1) * row + j]
        const right = dp[i * row + (j + 1)]
        dp[i * row + j] = down >= right ? down : right
      }
    }
  }

  const ops = []
  let i = 0, j = 0
  while (i < N && j < M) {
    if (a[i] === b[j]) { ops.push({ type: 'equal', aIndex: i, bIndex: j }); i++; j++ }
    else if (dp[(i + 1) * row + j] >= dp[i * row + (j + 1)]) { ops.push({ type: 'delete', aIndex: i, bIndex: -1 }); i++ }
    else { ops.push({ type: 'insert', aIndex: -1, bIndex: j }); j++ }
  }
  while (i < N) { ops.push({ type: 'delete', aIndex: i, bIndex: -1 }); i++ }
  while (j < M) { ops.push({ type: 'insert', aIndex: -1, bIndex: j }); j++ }
  return ops
}

/** 두 줄 배열을 비교해 {type:'equal'|'delete'|'insert', aIndex, bIndex} 편집 스크립트를 반환 */
export function diffLines(a, b) {
  const N = a.length, M = b.length

  // 앞/뒤 공통 부분을 먼저 잘라내는 건 실제 diff 도구들의 표준 최적화 —
  // 파일이 아무리 커도 실제로 바뀐 구간만 LCS 계산 대상이 되어 훨씬 빠르다.
  let start = 0
  while (start < N && start < M && a[start] === b[start]) start++
  let endA = N, endB = M
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) { endA--; endB-- }

  const ops = []
  for (let i = 0; i < start; i++) ops.push({ type: 'equal', aIndex: i, bIndex: i })

  const midOps = diffMiddleBounded(a.slice(start, endA), b.slice(start, endB))
  for (const op of midOps) {
    if (op.type === 'equal') ops.push({ type: 'equal', aIndex: op.aIndex + start, bIndex: op.bIndex + start })
    else if (op.type === 'delete') ops.push({ type: 'delete', aIndex: op.aIndex + start, bIndex: -1 })
    else ops.push({ type: 'insert', aIndex: -1, bIndex: op.bIndex + start })
  }

  const tailLen = N - endA
  for (let t = 0; t < tailLen; t++) ops.push({ type: 'equal', aIndex: endA + t, bIndex: endB + t })
  return ops
}

/** diffLines()의 편집 스크립트를 화면에 뿌릴 행 목록으로 변환 (인접한 삭제+추가는 "변경"으로 묶음) */
export function buildDiffRows(ops, aLines, bLines) {
  const rows = []
  let i = 0
  while (i < ops.length) {
    const op = ops[i]
    if (op.type === 'equal') {
      rows.push({
        asRow: op.aIndex + 1, toRow: op.bIndex + 1,
        asWas: aLines[op.aIndex], toBe: bLines[op.bIndex], status: '동일',
      })
      i++
      continue
    }
    let delStart = i
    while (i < ops.length && ops[i].type === 'delete') i++
    const delOps = ops.slice(delStart, i)
    let insStart = i
    while (i < ops.length && ops[i].type === 'insert') i++
    const insOps = ops.slice(insStart, i)

    const pairLen = Math.min(delOps.length, insOps.length)
    for (let p = 0; p < pairLen; p++) {
      rows.push({
        asRow: delOps[p].aIndex + 1, toRow: insOps[p].bIndex + 1,
        asWas: aLines[delOps[p].aIndex], toBe: bLines[insOps[p].bIndex], status: '변경',
      })
    }
    for (let p = pairLen; p < delOps.length; p++) {
      rows.push({ asRow: delOps[p].aIndex + 1, toRow: null, asWas: aLines[delOps[p].aIndex], toBe: '', status: '삭제' })
    }
    for (let p = pairLen; p < insOps.length; p++) {
      rows.push({ asRow: null, toRow: insOps[p].bIndex + 1, asWas: '', toBe: bLines[insOps[p].bIndex], status: '추가' })
    }
  }
  return rows
}


export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function formatDateTime(isoStr) {
  const d = new Date(isoStr)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${yy}.${mm}.${dd} ${hh}:${mi}`
}

// ── 단어 단위 diff (음절 단위 제거 — 성능 최적화) ────────────
// 한국어/영어/숫자/공백을 토큰으로 분리
function tokenize(str) {
  // 공백도 토큰으로 유지해야 원문 복원 가능
  return str.match(/[\uAC00-\uD7A3]+|[A-Za-z0-9]+|[^\uAC00-\uD7A3A-Za-z0-9\s]+|\s+/g) || []
}

function lcs(a, b) {
  const m = a.length, n = b.length
  // 길이가 너무 길면 diff 생략 (안전장치)
  if (m * n > 40000) return null
  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1])
  return dp
}

export function computeWordDiff(a, b) {
  if (a === b) return { aParts: [{ type: 'equal', ch: a }], bParts: [{ type: 'equal', ch: b }] }

  const aTok = tokenize(a)
  const bTok = tokenize(b)
  const dp   = lcs(aTok, bTok)

  // 토큰이 너무 많거나 길이 초과 시 전체를 변경으로 처리
  if (!dp) {
    return {
      aParts: [{ type: 'delete', ch: a }],
      bParts: [{ type: 'insert', ch: b }],
    }
  }

  const aParts = [], bParts = []
  let i = 0, j = 0
  while (i < aTok.length || j < bTok.length) {
    if (i < aTok.length && j < bTok.length && aTok[i] === bTok[j]) {
      aParts.push({ type: 'equal', ch: aTok[i] })
      bParts.push({ type: 'equal', ch: bTok[j] })
      i++; j++
    } else if (j < bTok.length && (i >= aTok.length || dp[i][j+1] >= dp[i+1][j])) {
      bParts.push({ type: 'insert', ch: bTok[j] }); j++
    } else {
      aParts.push({ type: 'delete', ch: aTok[i] }); i++
    }
  }
  return { aParts, bParts }
}

// 구버전 호환 alias (computeWordDiff로 통일)
export const computeCharDiff = computeWordDiff
export const CHAR_DIFF_LIMIT = Infinity  // 더 이상 분기 없음

// ── CSV 내보내기 ──────────────────────────────────────────────
export function exportToCSV(filename, headers, rows) {
  const esc = v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [...headers, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
}

// ── 미출시 배지 감지 ──────────────────────────────────────────
// "감지 키워드"를 안 채우고 "제품명"만 등록한 경우에도 최소한 제품명 자체는
// 항상 검사 대상에 포함시킨다 (그렇지 않으면 aliases가 빈 배열이 되어
// 미출시 국가를 지정해도 절대 감지되지 않는 버그가 있었음).
function effectiveAliases(p) {
  const list = [p.name, ...(p.aliases || [])].filter(Boolean)
  return [...new Set(list)]
}

export function detectBadges(text, siteCode, products) {
  if (!text || !products.length) return []
  const lower = text.toLowerCase()
  const sorted = [...products].sort((a, b) =>
    Math.max(...effectiveAliases(b).map(x => x.length)) - Math.max(...effectiveAliases(a).map(x => x.length))
  )
  const used = new Set()
  const found = []
  for (const p of sorted) {
    const aliases = effectiveAliases(p)
    const hit = aliases.find(alias => {
      const a = alias.toLowerCase()
      return lower.includes(a) && ![...used].some(u => u.includes(a) || a.includes(u))
    })
    if (hit) { found.push(p); aliases.forEach(a => used.add(a.toLowerCase())) }
  }
  return found.filter(p => (p.excluded_countries || []).includes(siteCode)).map(p => p.name)
}