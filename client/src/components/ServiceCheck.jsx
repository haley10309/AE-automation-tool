// ════════════════════════════════════════════════════════════════
// ── 서비스 운영 데이터 — DB 기반 (하드코딩은 서버 시드에만 사용)
// ════════════════════════════════════════════════════════════════

export const SERVICE_KEYS = [
  { key: 'samsungHealth', label: 'Samsung Health' },
  { key: 'appsServices',  label: 'Apps & Services' },
  { key: 'carePlus',      label: 'Samsung Care+' },
  { key: 'tradeIn',       label: 'Samsung Trade-in' },
]

// ── 런타임 SERVICE_DATA (DB 로드 후 갱신) ────────────────────────
// detectServiceIssues는 이 객체를 참조하므로, DB 로드 완료 후 자동 반영됨
export let SERVICE_DATA = {}

// 룩업 집합 — buildLookup() 호출 시 재빌드
export const _SVC_ALL_TEXTS = {}
export const _SVC_ALL_URLS  = {}

export function buildLookup(data) {
  for (const { key } of SERVICE_KEYS) {
    const textSet = new Set()
    const urlSet  = new Set()
    for (const siteData of Object.values(data)) {
      const entry = siteData[key]
      if (entry) { textSet.add(entry.text); urlSet.add(entry.url) }
    }
    _SVC_ALL_TEXTS[key] = textSet
    _SVC_ALL_URLS[key]  = [...urlSet].sort((a, b) => b.length - a.length)
  }
}

export function setServiceData(data) {
  Object.assign(SERVICE_DATA, data)
  // 기존 키 중 data에 없는 건 제거
  for (const k of Object.keys(SERVICE_DATA)) {
    if (!(k in data)) delete SERVICE_DATA[k]
  }
  buildLookup(SERVICE_DATA)
}

// ════════════════════════════════════════════════════════════════
// ── detectServiceIssues
// ════════════════════════════════════════════════════════════════
export function detectServiceIssues(text, siteCode) {
  if (!text?.trim() || !siteCode) return []
  const siteData = SERVICE_DATA[siteCode] ?? SERVICE_DATA[siteCode?.toUpperCase()]
  if (!siteData) return []

  const issues = []
  const lower  = text.toLowerCase()

  for (const { key, label } of SERVICE_KEYS) {
    const expected = siteData[key]
    const texts = _SVC_ALL_TEXTS[key]
    const urls  = _SVC_ALL_URLS[key]
    if (!texts || !urls) continue

    const foundTexts = [...texts].filter(t => lower.includes(t.toLowerCase()))
    const foundUrls  = urls.filter(u => text.includes(u))
    const isMentioned = foundTexts.length > 0 || foundUrls.length > 0
    if (!isMentioned) continue

    if (!expected) {
      issues.push({ service: label, type: 'not_operated', note: '미운영 국가' })
      continue
    }

    const correctTextFound = lower.includes(expected.text.toLowerCase())
    if (foundTexts.length > 0 && !correctTextFound) {
      issues.push({ service: label, type: 'wrong_text', found: foundTexts[0], expected: expected.text })
    }

    const correctUrlFound = text.includes(expected.url)
    if (foundUrls.length > 0 && !correctUrlFound) {
      issues.push({ service: label, type: 'wrong_url', found: foundUrls[0], expected: expected.url })
    }
  }

  return issues
}