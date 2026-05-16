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
export function detectBadges(text, siteCode, products) {
  if (!text || !products.length) return []
  const lower = text.toLowerCase()
  const sorted = [...products].sort((a, b) =>
    Math.max(...b.aliases.map(x => x.length)) - Math.max(...a.aliases.map(x => x.length))
  )
  const used = new Set()
  const found = []
  for (const p of sorted) {
    const hit = p.aliases.find(alias => {
      const a = alias.toLowerCase()
      return lower.includes(a) && ![...used].some(u => u.includes(a) || a.includes(u))
    })
    if (hit) { found.push(p); p.aliases.forEach(a => used.add(a.toLowerCase())) }
  }
  return found.filter(p => (p.excluded_countries || []).includes(siteCode)).map(p => p.name)
}