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

// ── 글자 단위 LCS diff ────────────────────────────────────────
export const CHAR_DIFF_LIMIT = 200

export function computeCharDiff(a, b) {
  const m = a.length, n = b.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1])
  const aParts = [], bParts = []
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      aParts.push({ type: 'equal', ch: a[i] }); bParts.push({ type: 'equal', ch: b[j] }); i++; j++
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      bParts.push({ type: 'insert', ch: b[j] }); j++
    } else {
      aParts.push({ type: 'delete', ch: a[i] }); i++
    }
  }
  return { aParts, bParts }
}

export function computeWordDiff(a, b) {
  const aw = a.split(/(\s+)/), bw = b.split(/(\s+)/)
  const m = aw.length, n = bw.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = aw[i] === bw[j] ? dp[i+1][j+1]+1 : Math.max(dp[i+1][j], dp[i][j+1])
  const aParts = [], bParts = []
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && aw[i] === bw[j]) {
      aParts.push({ type: 'equal', ch: aw[i] }); bParts.push({ type: 'equal', ch: bw[j] }); i++; j++
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      bParts.push({ type: 'insert', ch: bw[j] }); j++
    } else {
      aParts.push({ type: 'delete', ch: aw[i] }); i++
    }
  }
  return { aParts, bParts }
}

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