/**
 * MergeTab — 카피덱 자동 Merge
 *
 * 진입 시: 프로젝트 목록 (카드 그리드)
 * 카드 클릭: 해당 프로젝트 상세 (EN 기준 + 국가별 로컬어 Merge 결과 바로 표시)
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { api } from '../api.js'
import { useDB } from '../DBContext.jsx'
import SiteDropdown from '../components/SiteDropdown.jsx'
import { detectBadges } from '../utils.js'
import { detectServiceIssues } from '../components/ServiceCheck.jsx'

const LS_EN_KEY = 'merge_en_copy'

// Ab50B7b0 C0acC6a9C790 position D655C778
function getCurrentUserPosition() {
  try {
    const token = localStorage.getItem('ae_tool_token')
    if (!token) return null
    const payload = JSON.parse(atob(token.split('.')[1]))
    return payload?.position ?? null
  } catch { return null }
}
const isRegular = () => getCurrentUserPosition() === 'regular'

// ── 유틸 ─────────────────────────────────────────────────────
function parseEnLines(raw) {
  return raw.split(/\r?\n/).map(l => l.trimEnd()).filter(l => l !== '')
}
function parseConfirmedPaste(raw) {
  return raw.split(/\r?\n/)
    .map(l => {
      const tab = l.indexOf('\t')
      if (tab === -1) return null
      return { en: l.slice(0, tab).trim(), local: l.slice(tab + 1).trim() }
    })
    .filter(Boolean)
}
function mapLocals(baseEnLines, confirmedPairs) {
  const queue = {}
  confirmedPairs.forEach(({ en, local }) => {
    const key = en.trim()
    if (!queue[key]) queue[key] = []
    queue[key].push(local)
  })
  const cursor = {}
  return baseEnLines.map(en => {
    const key = en.trim()
    if (!queue[key] || queue[key].length === 0) return { en, local: '', missing: true }
    const idx = cursor[key] ?? 0
    const local = queue[key][idx] ?? queue[key][queue[key].length - 1]
    cursor[key] = idx + 1
    return { en, local, missing: false }
  })
}
/**
 * 모달이 필요한 두 가지 케이스를 감지
 *
 * ── 케이스 A : EN이 baseEnLines에 N행(N>1) 존재 + paste local이 그보다 적게 들어온 경우
 *   예) baseEnLines에 Performance가 3행·9행 두 번 있는데
 *       paste에는 "Performance → apple" 하나만 → 어느 행에 적용할지 사용자 선택 필요
 *   → caseType: 'A'
 *
 * ── 케이스 B : 동일 EN에 서로 다른 local이 paste에 여러 개 들어왔는데
 *              그 개수가 baseEnLines 등장 횟수와 맞지 않는 경우
 *   예) baseEnLines에 Performance가 1행 뿐인데
 *       paste에 "Performance → apple", "Performance → 바나나" 두 가지 → 뭘 쓸지 선택 필요
 *   → caseType: 'B'
 *
 * ── 자동 처리 (모달 불필요) :
 *   paste 개수 === baseEnLines 등장 횟수이고 순서대로 1:1 대응이 명확한 경우
 *   예) baseEnLines에 Performance 2번, paste에도 Performance 2번(순서대로) → 그냥 순서 매핑
 *
 * 반환: [{ enKey, positions, candidates, uniqueCandidates, caseType }]
 */
function detectDuplicates(baseEnLines, confirmedPairs) {
  // EN별 local 후보 목록 (paste 순서 그대로)
  const pasteQueue = {}
  confirmedPairs.forEach(({ en, local }) => {
    const key = en.trim()
    if (!pasteQueue[key]) pasteQueue[key] = []
    pasteQueue[key].push(local)
  })

  // baseEnLines에서 동일 EN이 등장하는 행 인덱스 목록
  const linesByKey = {}
  baseEnLines.forEach((en, i) => {
    const key = en.trim()
    if (!linesByKey[key]) linesByKey[key] = []
    linesByKey[key].push(i)
  })

  const duplicates = []

  for (const key of Object.keys(pasteQueue)) {
    const candidates = pasteQueue[key]            // paste에서 이 EN에 대응하는 local 목록
    const positions  = linesByKey[key] || []      // baseEnLines에서 이 EN의 행 인덱스 목록
    const unique     = [...new Set(candidates)]

    // paste에도 1개, base에도 1개 → 완전 1:1, 모달 불필요
    if (candidates.length === 1 && positions.length === 1) continue

    // paste 개수 === base 개수이고, 모든 candidates가 동일값 → 자동 처리 가능
    // (예: base 2번, paste 2번인데 둘 다 같은 값 → 순서대로)
    if (candidates.length === positions.length && unique.length === 1) continue

    // paste 개수 === base 개수이고, 순서대로 1:1 매핑이 자명한 경우 → 자동 처리
    // (예: base에 Performance 2번, paste에도 Performance 2번 각각 다른 값 → 순서 매핑)
    if (candidates.length === positions.length && candidates.length > 1) continue

    // ── 케이스 A: base에 여러 행 있는데 paste는 더 적게 들어온 경우
    //   "이 local을 어느 행(들)에 적용할 건지?" 선택
    if (positions.length > 1 && candidates.length < positions.length) {
      duplicates.push({ enKey: key, positions, candidates, uniqueCandidates: unique, caseType: 'A' })
      continue
    }

    // ── 케이스 B: paste에 서로 다른 local이 여러 개인데 base 개수와 불일치
    //   "이 중에 어떤 걸 쓸 건지?" 선택
    if (unique.length > 1) {
      duplicates.push({ enKey: key, positions, candidates, uniqueCandidates: unique, caseType: 'B' })
    }
  }

  return duplicates
}

function checkDNT(en, local, products) {
  const issues = []
  for (const p of products) {
    for (const alias of (p.aliases || [])) {
      const a = alias.toLowerCase()
      const re = new RegExp(a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')
      const enCount    = (en.toLowerCase().match(re) || []).length
      const localCount = (local.toLowerCase().match(re) || []).length
      if (enCount > 0 && enCount !== localCount) issues.push({ alias, enCount, localCount })
    }
  }
  return issues
}

/**
 * 미출시 제품 감지 (CountryTab의 detectBadges와 동일 로직)
 * products의 excluded_countries에 siteCode가 포함된 제품이 local에 언급되면 반환
 */
function checkUnreleased(local, siteCode, products) {
  if (!local || !siteCode) return []
  return detectBadges(local, siteCode, products)
}

/**
 * EN DNT 개수 vs 로컬 DNT 개수 불일치 감지 (CountryTab DntPanel getLocalComparisons 동일)
 * EN 에 DNT가 있는데 로컬에서 개수가 다르면 이슈로 반환
 */
function checkDNTCountMismatch(en, local, siteCode, products) {
  const enDNT = detectBadges(en,    siteCode, products)
  const lcDNT = detectBadges(local, siteCode, products)
  if (enDNT.length === 0 && lcDNT.length === 0) return null
  if (enDNT.length === lcDNT.length) return null
  return { enCount: enDNT.length, lcCount: lcDNT.length, enItems: enDNT, lcItems: lcDNT }
}
/**
 * URL 내 사이트코드 불일치 감지
 * 로컬 카피 안에 URL(/xx/ 패턴)이 있는데,
 * 그 xx가 countryLabel(소문자)과 다르면 이슈로 반환
 */
function checkUrlSiteCode(local, countryLabel) {
  if (!local || !countryLabel) return []
  const siteCode = countryLabel.trim().toLowerCase()
  // /xx/ 또는 /xx. 패턴의 URL 세그먼트를 모두 추출
  const urlRe = /https?:\/\/[^\s"'<>]+/gi
  const segRe = /\/([a-z]{2,5})\//gi
  const urls = local.match(urlRe) || []
  const issues = []
  for (const url of urls) {
    let m
    segRe.lastIndex = 0
    while ((m = segRe.exec(url)) !== null) {
      const seg = m[1].toLowerCase()
      // 흔한 비-사이트코드 세그먼트 제외
      if (['www', 'http', 'api', 'cdn', 'img', 'images', 'assets', 'static', 'en'].includes(seg)) continue
      if (seg !== siteCode) {
        issues.push({ url: url.slice(0, 60), found: seg, expected: siteCode })
      }
    }
  }
  return issues
}

/** 'TBD' 또는 'N/A' 값 포함 여부 */
function hasTBDorNA(local) {
  if (!local) return false
  return /\bTBD\b/i.test(local) || /\bN\/A\b/i.test(local)
}

// ── 엑셀 추출 시 고정 국가 순서 ──────────────────────────────
const SITE_CODE_ORDER = [
  'CA_FR','CA',
  'MX','BR',
  'LATIN','LATIN_EN',
  'CO','AR','PY','UY','CL','PE',
  'SG','AU','NZ','ID','TH','MM','VN','MY','PH','JP','IN','BD',
  'AE','AE_AR','IL','PS','SA','SA_EN','TR','IRAN',
  'LEVANT','LEVANT_AR','IQ_AR','IQ_KU','LB',
  'PK','EG','N_AFRICA',
  'AFRICA_EN','AFRICA_FR','AFRICA_PT','ZA',
  'UK','IE','DE','AT','CH','CH_FR','FR','IT','GR','ES','PT',
  'BE','BE_FR','NL',
  'SE','DK','FI','NO',
  'PL','RO','BG','HU','CZ','SK',
  'EE','LV','LT',
  'HR','RS','SI','AL','MK','BA','UA',
]

const SITE_CODE_LANGUAGE = {
  CA_FR: 'French',     CA: 'English',
  MX: 'Spanish',       BR: 'Portuguese',
  LATIN: 'Spanish',    LATIN_EN: 'English',
  CO: 'Spanish',       AR: 'Spanish',      PY: 'Spanish',   UY: 'Spanish',
  CL: 'Spanish',       PE: 'Spanish',
  SG: 'English',       AU: 'English',      NZ: 'English',
  ID: 'Indonesian',    TH: 'Thai',         MM: 'English',
  VN: 'Vietnamese',    MY: 'English',      PH: 'English',
  JP: 'Japanese',      IN: 'English',      BD: 'English',
  AE: 'English',       AE_AR: 'Arabic',    IL: 'Hebrew',    PS: 'Arabic',
  SA: 'Arabic',        SA_EN: 'English',   TR: 'Turkish',   IRAN: 'Persian',
  LEVANT: 'English',   LEVANT_AR: 'Arabic', IQ_AR: 'Arabic', IQ_KU: 'Kurdish',
  LB: 'English',       PK: 'English',      EG: 'Arabic',    N_AFRICA: 'French',
  AFRICA_EN: 'English', AFRICA_FR: 'French', AFRICA_PT: 'Portuguese',
  ZA: 'English',       UK: 'English',      IE: 'English',
  DE: 'German',        AT: 'German',       CH: 'German',    CH_FR: 'French',
  FR: 'French',        IT: 'Italian',      GR: 'Greek',
  ES: 'Spanish',       PT: 'Portuguese',
  BE: 'Dutch',         BE_FR: 'French',    NL: 'Dutch',
  SE: 'Swedish',       DK: 'Danish',       FI: 'Finnish',   NO: 'Norwegian',
  PL: 'Polish',        RO: 'Romanian',     BG: 'Bulgarian', HU: 'Hungarian',
  CZ: 'Czech',         SK: 'Slovakian',
  EE: 'Estonian',      LV: 'Latvian',      LT: 'Lithuanian',
  HR: 'Croatian',      RS: 'Serbian',      SI: 'Slovenijan',
  AL: 'Albanian',      MK: 'Macedonian',   BA: 'Bosnian',   UA: 'Ukrainian',
}

function exportCSV(baseEnLines, countries, projectTitle) {
  const esc = v => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"` : s
  }
  const sorted = [...countries].sort((a, b) => {
    const aLang = SITE_CODE_LANGUAGE[a.label] ?? ''
    const bLang = SITE_CODE_LANGUAGE[b.label] ?? ''
    const aEn = aLang === 'English' ? 0 : 1
    const bEn = bLang === 'English' ? 0 : 1

    // 영어 우선
    if (aEn !== bEn) return aEn - bEn

    // 같은 그룹(영어끼리 or 비영어끼리) 안에서는 기존 SITE_CODE_ORDER 순서 유지
    const ai = SITE_CODE_ORDER.indexOf(a.label)
    const bi = SITE_CODE_ORDER.indexOf(b.label)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  // 1행: # / EN (기준) / 사이트코드...
  const row1 = ['#', 'EN (기준)', ...sorted.map(c => c.label)]
  // 2행: (빈칸) / (빈칸) / 언어...
  const row2 = ['', '', ...sorted.map(c => SITE_CODE_LANGUAGE[c.label] ?? '')]
  // 3행~: 카피
  const rows = baseEnLines.map((en, i) => [
    i + 1, en,
    ...sorted.map(c => {
      const mapped = c.mappedJson ? JSON.parse(c.mappedJson) : []
      return mapped[i]?.local ?? ''
    }),
  ])

  const csv = [row1, row2, ...rows].map(r => r.map(esc).join(',')).join('\r\n')
  const ds = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  const safeName = (projectTitle || 'merge').replace(/[\\/:*?"<>|]/g, '_')  // 파일명 특수문자 제거
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = `merge_${safeName}_${ds}.csv`; a.click()
  URL.revokeObjectURL(url)
}

// ════════════════════════════════════════════════════════════════
// 중복 카피 선택 모달
// ════════════════════════════════════════════════════════════════
/**
 * duplicates: detectDuplicates()의 반환값
 *   caseType 'A' — base에 N행 있는데 paste local이 부족 → 어느 행에 적용할지
 *   caseType 'B' — paste에 서로 다른 local 여러 개 → 어떤 값을 쓸지
 *
 * onResolve(resolvedMap) — { [enKey]: string[] }  각 position에 대응하는 최종 local 배열
 * onCancel()
 */
function DuplicateResolveModal({ duplicates, countryLabel, onResolve, onCancel }) {
  /**
   * selections 구조
   * 케이스 A: { [`${enKey}__${lineIdx}`]: boolean }  — 이 행에 적용할지 여부
   * 케이스 B: { [`${enKey}__${lineIdx}`]: string }   — 이 행에 쓸 local 값
   */
  const initSelections = () => {
    const sel = {}
    duplicates.forEach(d => {
      if (d.caseType === 'A') {
        // 기본값: 모든 행에 적용(true)
        d.positions.forEach(lineIdx => {
          sel[`${d.enKey}__${lineIdx}`] = true
        })
      } else {
        // 케이스 B: 각 행에 첫 번째 후보 선택
        d.positions.forEach((lineIdx, pi) => {
          sel[`${d.enKey}__${lineIdx}`] = d.candidates[pi] ?? d.candidates[0]
        })
      }
    })
    return sel
  }
  const [selections, setSelections] = useState(initSelections)

  const toggle = (enKey, lineIdx, value) =>
    setSelections(prev => ({ ...prev, [`${enKey}__${lineIdx}`]: value }))

  const handleConfirm = () => {
    const resolvedMap = {}
    duplicates.forEach(d => {
      if (d.caseType === 'A') {
        // 선택된 행에만 candidates[0] 적용, 미선택 행은 빈 값(missing)
        resolvedMap[d.enKey] = d.positions.map(lineIdx =>
          selections[`${d.enKey}__${lineIdx}`] ? (d.candidates[0] ?? '') : '__SKIP__'
        )
      } else {
        // 각 행에 선택된 local 값
        resolvedMap[d.enKey] = d.positions.map(lineIdx =>
          selections[`${d.enKey}__${lineIdx}`] ?? d.candidates[0]
        )
      }
    })
    onResolve(resolvedMap)
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14,
        width: '100%', maxWidth: 780,
        maxHeight: '88vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
        overflow: 'hidden',
      }}>
        {/* 헤더 */}
        <div style={{
          padding: '18px 24px 14px', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'flex-start', gap: 12,
        }}>
          <span style={{ fontSize: 24 }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 16, color: '#111827' }}>
              [{countryLabel}] 중복 카피 확인 필요
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              동일한 EN 텍스트에 대해 적용 방식을 선택해주세요.
            </div>
          </div>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: '#9ca3af', lineHeight: 1, padding: 0,
          }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {duplicates.map((d, di) => (
            <div key={di} style={{
              borderRadius: 10, border: '1.5px solid #e5e7eb', overflow: 'hidden',
            }}>
              {/* EN 헤더 + 케이스 배지 */}
              <div style={{
                background: d.caseType === 'A' ? '#fffbeb' : '#f0f9ff',
                padding: '10px 14px', borderBottom: '1px solid #e5e7eb',
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span style={{
                  background: d.caseType === 'A' ? '#f59e0b' : '#6366f1',
                  color: '#fff', borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '2px 7px',
                }}>EN</span>
                <span style={{ fontSize: 13, color: '#111827', fontWeight: 600, wordBreak: 'break-all', flex: 1 }}>
                  {d.enKey}
                </span>
                {d.caseType === 'A' ? (
                  <span style={{
                    fontSize: 11, color: '#92400e', background: '#fef3c7',
                    border: '1px solid #fcd34d', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
                  }}>
                    📌 EN {d.positions.length}개 행 · 로컬 1개 → 적용할 행 선택
                  </span>
                ) : (
                  <span style={{
                    fontSize: 11, color: '#3730a3', background: '#e0e7ff',
                    border: '1px solid #c7d2fe', borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
                  }}>
                    🔀 후보 {d.uniqueCandidates.length}가지 → 각 행에 적용할 값 선택
                  </span>
                )}
              </div>

              {/* 케이스 A: 체크박스로 행 선택 */}
              {d.caseType === 'A' && (
                <div>
                  <div style={{ padding: '8px 14px 4px', fontSize: 12, color: '#6b7280', background: '#fafafa', borderBottom: '1px solid #f3f4f6' }}>
                    적용할 로컬 카피: <strong style={{ color: '#111827' }}>{d.candidates[0]}</strong>
                  </div>
                  {d.positions.map((lineIdx, pi) => {
                    const checked = selections[`${d.enKey}__${lineIdx}`] ?? true
                    return (
                      <div key={pi} style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '9px 14px',
                        borderBottom: pi < d.positions.length - 1 ? '1px solid #f3f4f6' : 'none',
                        background: checked ? '#f0fdf4' : '#fafafa',
                        cursor: 'pointer',
                      }} onClick={() => toggle(d.enKey, lineIdx, !checked)}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(d.enKey, lineIdx, !checked)}
                          style={{ width: 16, height: 16, cursor: 'pointer', accentColor: '#10b981' }}
                        />
                        <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 700, minWidth: 36 }}>
                          {lineIdx + 1}행
                        </span>
                        <span style={{ fontSize: 13, color: '#374151', wordBreak: 'break-all' }}>
                          {d.enKey}
                        </span>
                        <span style={{
                          marginLeft: 'auto', fontSize: 11, whiteSpace: 'nowrap',
                          color: checked ? '#059669' : '#9ca3af', fontWeight: 600,
                        }}>
                          {checked ? '✓ 적용' : '건너뜀'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* 케이스 B: 행별로 후보 버튼 선택 */}
              {d.caseType === 'B' && (
                <div>
                  {d.positions.map((lineIdx, pi) => {
                    const currentVal = selections[`${d.enKey}__${lineIdx}`]
                    return (
                      <div key={pi} style={{
                        padding: '10px 14px',
                        borderBottom: pi < d.positions.length - 1 ? '1px solid #f3f4f6' : 'none',
                        background: pi % 2 === 0 ? '#fff' : '#fafafa',
                        display: 'flex', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap',
                      }}>
                        <span style={{
                          minWidth: 36, textAlign: 'center', fontSize: 11,
                          color: '#9ca3af', fontWeight: 700, paddingTop: 6,
                        }}>
                          {lineIdx + 1}행
                        </span>
                        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {d.uniqueCandidates.map((cand, ci) => {
                            const selected = currentVal === cand
                            return (
                              <button key={ci} onClick={() => toggle(d.enKey, lineIdx, cand)} style={{
                                padding: '5px 14px', borderRadius: 6, cursor: 'pointer',
                                border: selected ? '2px solid #6366f1' : '1.5px solid #d1d5db',
                                background: selected ? '#eef2ff' : '#fff',
                                color: selected ? '#4338ca' : '#374151',
                                fontSize: 13, fontWeight: selected ? 700 : 400,
                                wordBreak: 'break-all', textAlign: 'left',
                                transition: 'all 0.12s',
                              }}>
                                {cand || <em style={{ color: '#d1d5db' }}>빈 값</em>}
                              </button>
                            )
                          })}
                        </div>
                        {/* 직접 입력 */}
                        <input
                          value={currentVal ?? ''}
                          onChange={e => toggle(d.enKey, lineIdx, e.target.value)}
                          placeholder="직접 입력"
                          style={{
                            border: '1px solid #d1d5db', borderRadius: 6,
                            padding: '5px 9px', fontSize: 12, width: 160, color: '#111827',
                          }}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* 푸터 */}
        <div style={{
          padding: '14px 24px', borderTop: '1px solid #e5e7eb',
          display: 'flex', justifyContent: 'flex-end', gap: 10, background: '#f9fafb',
        }}>
          <button onClick={onCancel} style={{
            padding: '8px 20px', borderRadius: 8, border: '1.5px solid #d1d5db',
            background: '#fff', color: '#374151', fontSize: 14, cursor: 'pointer', fontWeight: 500,
          }}>취소</button>
          <button onClick={handleConfirm} style={{
            padding: '8px 24px', borderRadius: 8, border: 'none',
            background: '#6366f1', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 700,
          }}>✅ 선택 완료 — Merge 진행</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 프로젝트 목록 뷰
// ════════════════════════════════════════════════════════════════
function ProjectListView({ projects, loading, onCreate, onOpen, onDelete }) {
  const [newTitle, setNewTitle] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch]     = useState('')

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    await onCreate(newTitle.trim())
    setNewTitle(''); setShowForm(false); setCreating(false)
  }

  const filtered = projects.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="mg-list-view">
      <div className="mg-list-header">
        <div className="mg-list-title-row">
          <span className="mg-list-title">Merge 프로젝트</span>
          <span className="cc-status-text">{projects.length}개</span>
        </div>
        <div className="mg-list-actions">
          <input className="form-input" placeholder="프로젝트 검색" value={search}
            onChange={e => setSearch(e.target.value)} style={{ width: 200, fontSize: 13 }} />
          <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? '취소' : '+ 새 프로젝트'}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="pj-create-form">
          <input className="form-input" placeholder="프로젝트 이름 *" value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus style={{ flex: 1 }} />
          <button className="btn-primary" onClick={handleCreate} disabled={creating}>
            {creating ? '생성 중...' : '생성'}
          </button>
        </div>
      )}

      {loading && <div className="loading" style={{ padding: 40 }}>불러오는 중...</div>}
      {!loading && filtered.length === 0 && (
        <div className="empty-state" style={{ marginTop: 24 }}>
          <div className="empty-icon">🔀</div>
          <p>{projects.length === 0 ? '아직 Merge 프로젝트가 없습니다.' : '검색 결과 없음'}</p>
          {projects.length === 0 && <small>"+ 새 프로젝트" 버튼으로 시작해보세요.</small>}
        </div>
      )}

      <div className="mg-proj-grid">
        {filtered.map(p => (
          <div key={p.id} className="mg-proj-card" onClick={() => onOpen(p)}>
            <div className="mg-proj-card-header">
              <span className="mg-proj-card-name">{p.title}</span>
              {isRegular() && (
                <button className="act-btn act-delete" style={{ padding: '2px 7px' }}
                  onClick={e => { e.stopPropagation(); onDelete(p.id, p.title) }}>🗑</button>
              )}
            </div>
            <div className="mg-proj-card-meta">
              {(p.country_count ?? 0) > 0 && <span className="mg-proj-badge">{p.country_count}개국</span>}
              {(p.row_count ?? 0) > 0    && <span className="mg-proj-badge">{p.row_count}행</span>}
            </div>
            <div className="mg-proj-card-date">
              {(p.updated_at || p.created_at || '').slice(0, 10)}
            </div>
            <div className="mg-proj-card-arrow">열기 →</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 국가 히스토리 드로어 (변경된 내용만 추려서 표시)
// ════════════════════════════════════════════════════════════════
function CountryHistoryDrawer({ projectId, country, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    if (!country.dbId) { setLoading(false); return }
    api.mergeGetCountryHistory(projectId, country.dbId)
      .then(res => { if (res.ok) setHistory(res.data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId, country.dbId])

  const fmt = iso => {
    if (!iso) return ''
    const d = new Date(iso)
    const pad = n => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
  }

  const parseSafe = (json) => {
    if (!json) return []
    if (typeof json !== 'string') return json
    try { return JSON.parse(json) } catch { return [] }
  }

  return (
    <div className="mg-drawer-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="mg-drawer">
        <div className="mg-drawer-header">
          <span className="mg-drawer-title">📋 {country.label} — 수정 히스토리</span>
          <button className="cc-remove-btn" onClick={onClose} style={{ fontSize: 18 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>불러오는 중...</div>
        ) : history.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-icon">📭</div>
            <p>아직 수정 이력이 없습니다.</p>
            <small>Merge를 재실행하면 이전 버전이 여기에 기록됩니다.</small>
          </div>
        ) : (
          <div className="mg-history-list">
            {history.map((h, i) => {
              const currentMapped = parseSafe(h.mapped_json)
              const prevMapped = i < history.length - 1 ? parseSafe(history[i+1].mapped_json) : []

              const changedRows = currentMapped.map((row, ri) => {
                const prevRow = prevMapped[ri] || {}
                const isChanged = prevRow.local !== undefined && prevRow.local !== row.local
                return {
                  ...row,
                  originalIndex: ri + 1,
                  prevLocal: prevRow.local,
                  isChanged
                }
              }).filter(row => row.isChanged || row.missing)

              return (
                <div key={h.id} className="mg-history-item">
                  <div className="mg-history-meta" onClick={() => setExpanded(expanded === i ? null : i)}>
                    <span className="mg-history-ver">v{history.length - i}</span>
                    <span
                      className="mg-history-author"
                      title={h.saved_by_email ? `이메일: ${h.saved_by_email}` : ''}
                      style={{ color: '#3b82f6', fontWeight: 600, fontSize: 13, marginRight: 8, cursor: h.saved_by_email ? 'help' : 'default' }}
                    >
                      👤 {h.saved_by || '알 수 없음'}
                    </span>
                    <span className="mg-history-date">{fmt(h.saved_at)}</span>
                    <span className="mg-history-rows">
                      {changedRows.length > 0 ? `변경 ${changedRows.length}건` : '변경 없음'}
                    </span>
                    <span className="mg-history-toggle">{expanded === i ? '▲ 접기' : '▼ 펼치기'}</span>
                  </div>

                  {expanded === i && (
                    <div className="mg-history-body">
                      <div className="mg-history-table-wrap">
                        {changedRows.length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px', background: '#f9fafb', borderRadius: '6px' }}>
                            이전 버전과 비교하여 변경된 카피가 없습니다.
                          </div>
                        ) : (
                          <table className="mg-history-table">
                            <thead>
                              <tr>
                                <th style={{ width: 36 }}>#</th>
                                <th style={{ width: '30%' }}>EN</th>
                                <th>{h.label || country.label} (수정된 내역만)</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changedRows.map((row, idx) => (
                                <tr key={idx} className={row.missing ? 'mg-cell-missing' : 'mg-cell-changed'}>
                                  <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, fontWeight: 'bold' }}>
                                    {row.originalIndex}
                                  </td>
                                  <td className="mg-history-en">{row.en}</td>
                                  <td className="mg-history-local">
                                    {row.missing ? (
                                      <span className="mg-missing-badge">⚠ 매핑 없음</span>
                                    ) : (
                                      <div className="mg-diff-view">
                                        <div className="mg-diff-old">
                                          <span className="mg-diff-label">AS-WAS:</span>
                                          <del>{row.prevLocal || <em className="empty-val">빈 값</em>}</del>
                                        </div>
                                        <div className="mg-diff-new">
                                          <span className="mg-diff-label">TO-BE:</span>
                                          <ins>{row.local || <em className="empty-val">빈 값</em>}</ins>
                                        </div>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>

                      {h.raw_paste && (
                        <details style={{ marginTop: 10 }}>
                          <summary style={{ fontSize: 11, color: '#6b7280', cursor: 'pointer' }}>원본 컨펌 카피 보기 (Raw Paste)</summary>
                          <pre className="mg-history-raw">{h.raw_paste}</pre>
                        </details>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 붙여넣기 미리보기 테이블 (아코디언)
// ════════════════════════════════════════════════════════════════
function PastePreviewTable({ rawText, label, accentColor = '#6366f1' }) {
  const pairs = parseConfirmedPaste(rawText || '')
  if (pairs.length === 0) return null

  return (
    <>
      <style>{`
        .mg-paste-preview-details {
          margin-top: 8px;
          border-radius: 8px;
          overflow: hidden;
          border: 1px solid #e5e7eb;
        }
        .mg-paste-preview-summary {
          list-style: none;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          color: var(--accent, #6366f1);
          background: #f9fafb;
          cursor: pointer;
          user-select: none;
          border-bottom: 1px solid transparent;
          transition: background 0.15s;
        }
        .mg-paste-preview-summary::-webkit-details-marker { display: none; }
        .mg-paste-preview-summary:hover { background: #f3f4f6; }
        .mg-paste-preview-details[open] .mg-paste-preview-summary {
          border-bottom-color: #e5e7eb;
        }
        .mg-paste-preview-icon {
          display: inline-block;
          font-size: 9px;
          transition: transform 0.2s;
          color: var(--accent, #6366f1);
        }
        .mg-paste-preview-details[open] .mg-paste-preview-icon {
          transform: rotate(90deg);
        }
        .mg-paste-preview-count {
          display: inline-block;
          margin-left: 4px;
          padding: 1px 6px;
          border-radius: 10px;
          background: var(--accent, #6366f1);
          color: #fff;
          font-size: 10px;
          font-weight: 700;
        }
        .mg-paste-preview-body {
          max-height: 240px;
          overflow-y: auto;
          background: #fff;
        }
        .mg-paste-preview-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 12px;
        }
        .mg-paste-preview-table thead th {
          position: sticky;
          top: 0;
          background: #f3f4f6;
          padding: 5px 10px;
          text-align: left;
          font-weight: 600;
          color: #374151;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }
        .mg-paste-preview-table tbody tr:nth-child(even) { background: #fafafa; }
        .mg-paste-preview-table tbody tr:hover { background: #eff6ff; }
        .mg-paste-preview-table td { padding: 4px 10px; vertical-align: top; }
        .mg-paste-preview-idx {
          color: #9ca3af;
          font-size: 11px;
          text-align: center;
          width: 32px;
          white-space: nowrap;
        }
        .mg-paste-preview-en {
          color: #1d4ed8;
          word-break: break-word;
          max-width: 180px;
        }
        .mg-paste-preview-local {
          color: #111827;
          word-break: break-word;
        }
        .mg-paste-preview-empty { color: #d1d5db; font-style: italic; }

        /* ── 신규: TBD / URL / dim ────────────────────── */
        .mg-cell-tbd {
          background: #fff7ed !important;
          border-left: 3px solid #f59e0b;
        }
        .mg-tbd-badge {
          display: inline-block;
          margin-top: 3px;
          padding: 1px 6px;
          border-radius: 4px;
          background: #fef3c7;
          color: #92400e;
          font-size: 10px;
          font-weight: 700;
          border: 1px solid #fcd34d;
        }
        .mg-url-badge {
          display: block;
          margin-top: 3px;
          padding: 2px 6px;
          border-radius: 4px;
          background: #fee2e2;
          color: #b91c1c;
          font-size: 10px;
          font-weight: 600;
          border: 1px solid #fca5a5;
        }
        .mg-url-badge code {
          font-family: monospace;
          background: #fecaca;
          border-radius: 3px;
          padding: 0 3px;
        }
        .mg-cell-dim td,
        td.mg-cell-dim {
          opacity: 0.35;
        }
      `}</style>
      <details className="mg-paste-preview-details">
        <summary
          className="mg-paste-preview-summary"
          style={{ '--accent': accentColor }}
        >
          <span className="mg-paste-preview-icon">▶</span>
          <span>
            미리보기
            <span className="mg-paste-preview-count">{pairs.length}행</span>
          </span>
        </summary>
        <div className="mg-paste-preview-body">
          <table className="mg-paste-preview-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th style={{ width: '50%' }}>EN</th>
                <th style={{ width: '50%' }}>{label || '로컬어'}</th>
              </tr>
            </thead>
            <tbody>
              {pairs.map((p, i) => (
                <tr key={i}>
                  <td className="mg-paste-preview-idx">{i + 1}</td>
                  <td className="mg-paste-preview-en">{p.en || <em className="empty-val">빈 값</em>}</td>
                  <td className={`mg-paste-preview-local ${!p.local ? 'mg-paste-preview-empty' : ''}`}>
                    {p.local || <em className="empty-val">빈 값</em>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// 국가 입력 카드 (기존 컨펌 카피용)
// ════════════════════════════════════════════════════════════════
function CountryCard({ country, onRemove, onLabelChange, pasteRef, projectId }) {
  const [showHistory, setShowHistory] = useState(false)
  const [pasteText, setPasteText]     = useState(country.rawPaste || '')

  // rawPaste가 외부에서 바뀌면 (추가 카피 덮어쓰기 후) 동기화
  useEffect(() => { setPasteText(country.rawPaste || '') }, [country.rawPaste])

  return (
    <>
    {showHistory && (
      <CountryHistoryDrawer
        projectId={projectId}
        country={country}
        onClose={() => setShowHistory(false)}
      />
    )}
    <div className={`mg-country-card ${country.isSaved ? 'mg-country-saved' : ''}`}
      style={{ position: 'relative' }}>
      {isRegular() && (
        <button className="cc-remove-btn mg-country-delete-btn"
          onClick={() => onRemove(country.id)}
          title="국가 삭제"
          style={{ position: 'absolute', top: 8, right: 8 }}>✕</button>
      )}

      <div className="mg-country-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {country.isSaved ? (
            /* 이미 저장된 국가 — 변경 불가, label만 표시 */
            <span className="mg-country-label-input"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                background: '#f3f4f6', color: '#374151', borderRadius: 6,
                padding: '4px 10px', fontSize: 13, fontWeight: 600, border: '1px solid #e5e7eb' }}>
              {country.label}
            </span>
          ) : (
            /* 미저장 국가 — SiteDropdown으로 선택 */
            <SiteDropdown
              label={country.label ? `🌐 ${country.label}` : '국가 선택 ▾'}
              excludeCodes={[]}
              onAdd={site => onLabelChange(country.id, site.code)}
            />
          )}
          {country.isSaved && <span style={{ fontSize: 10, color: '#10b981', whiteSpace: 'nowrap' }}>✓ 저장됨</span>}
        </div>
        {country.dbId && (
          <button className="btn-ghost" style={{ fontSize: 11, padding: '2px 8px' }}
            onClick={() => setShowHistory(true)}>
            🕐 히스토리
          </button>
        )}
      </div>

      {country.isSaved ? (
        /* ── 저장된 국가: 읽기 전용 잠금 ── */
        <div style={{
          position: 'relative', marginTop: 8,
          borderRadius: 8, overflow: 'hidden',
          border: '1.5px solid #e5e7eb',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 10px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontSize: 11, color: '#6b7280', fontWeight: 600,
          }}>
            <span>🔒</span>
            <span>저장된 카피 — 수정하려면 <strong style={{ color: '#f59e0b' }}>국가별 추가 카피</strong>를 사용하세요</span>
          </div>
          <textarea
            ref={el => { if (el) pasteRef.current[country.id] = el }}
            className="paste-area mg-paste"
            value={pasteText}
            readOnly
            style={{
              cursor: 'not-allowed',
              background: '#f3f4f6',
              color: '#9ca3af',
              border: 'none',
              borderRadius: 0,
              resize: 'none',
              marginTop: 0,
            }}
          />
        </div>
      ) : (
        /* ── 신규 국가: 편집 가능 ── */
        <>
          <textarea
            ref={el => { if (el) pasteRef.current[country.id] = el }}
            className="paste-area mg-paste"
            value={pasteText}
            onChange={e => setPasteText(e.target.value)}
            placeholder={"컨펌된 카피 붙여넣기 (탭 구분)\n\n예:\nFind Your Galaxy\tFind Your Galaxy\nPerformance\tパフォーマンス性能"}
          />
          <div className="input-hint">EN[탭]로컬어 — 엑셀에서 두 열 선택 후 Ctrl+C → Ctrl+V</div>
        </>
      )}

      {/* 미리보기 테이블 (아코디언) */}
      <PastePreviewTable
        rawText={pasteText}
        label={country.label}
        accentColor="#6366f1"
      />
    </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// 국가별 추가 카피 카드 (덮어쓰기용)
// ════════════════════════════════════════════════════════════════
function PatchCountryCard({ country, onRemove, onLabelChange, patchPasteRef, existingLabels }) {
  const [pasteText, setPasteText] = useState('')

  return (
    <div
      className="mg-country-card"
      style={{ position: 'relative', border: '1.5px dashed #f59e0b', background: '#fffbeb' }}
    >
      <button
        className="cc-remove-btn mg-country-delete-btn"
        onClick={() => onRemove(country.id)}
        title="삭제"
        style={{ position: 'absolute', top: 8, right: 8 }}
      >✕</button>

      <div className="mg-country-header">
        <select
          value={country.label}
          onChange={e => onLabelChange(country.id, e.target.value)}
          style={{
            padding: '4px 10px', borderRadius: 6, border: '1px solid #fcd34d',
            fontSize: 13, fontWeight: 600, background: '#fff', color: '#92400e',
            cursor: 'pointer',
          }}
        >
          <option value="">국가 선택 ▾</option>
          {existingLabels.map(label => (
            <option key={label} value={label}>{label}</option>
          ))}
        </select>
        {country.label && (
          <span style={{ fontSize: 11, color: '#b45309', marginLeft: 6 }}>
            ⚡ 기존 카피에 덮어쓰기됩니다
          </span>
        )}
      </div>

      <textarea
        ref={el => { if (el) patchPasteRef.current[country.id] = el }}
        className="paste-area mg-paste"
        value={pasteText}
        onChange={e => setPasteText(e.target.value)}
        placeholder={"수정 또는 누락된 카피만 붙여넣기 (탭 구분)\n\n예:\nFind Your Galaxy\tFind Your Galaxy\nPerformance\t수정된 로컬어\n\n※ 덮어쓸 행만 입력하면 됩니다"}
        style={{ borderColor: '#fcd34d' }}
      />
      <div className="input-hint" style={{ color: '#92400e' }}>
        EN[탭]로컬어 — 수정이 필요한 행만 입력하세요
      </div>

      {/* 미리보기 테이블 (아코디언) */}
      <PastePreviewTable
        rawText={pasteText}
        label={country.label || '로컬어'}
        accentColor="#f59e0b"
      />
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 프로젝트 상세 뷰
// ════════════════════════════════════════════════════════════════
function ProjectDetailView({ project, products, onBack, onUpdated }) {
  const [enInput, setEnInput]         = useState('')
  const [countries, setCountries]     = useState([])
  const [mergeResult, setMergeResult] = useState(null)
  const [error, setError]             = useState('')
  const [saving, setSaving]           = useState(false)
  const [loading, setLoading]         = useState(true)
  const [idSeq, setIdSeq]             = useState(1)
  const [editTitle, setEditTitle]     = useState(false)
  const [titleVal, setTitleVal]       = useState(project.title)
  const pasteRef = useRef({})

  // ── 검색 상태 ─────────────────────────────────────────────
  const [globalSearch, setGlobalSearch]     = useState('')
  const [perCountrySearch, setPerCountrySearch] = useState({}) // { [countryId]: string }

  // ── 추가 카피 (덮어쓰기) 상태 ──────────────────────────────
  const [patchCountries, setPatchCountries] = useState([])
  const [patchIdSeq, setPatchIdSeq]         = useState(1)
  const [patchError, setPatchError]         = useState('')
  const [patchSaving, setPatchSaving]       = useState(false)
  const patchPasteRef = useRef({})

  // ── 중복 카피 해결 모달 상태 ────────────────────────────────
  const [dupModal, setDupModal] = useState(null)
  // dupModal = { duplicates, pendingActiveCountries, pendingMatrix, pendingDntIssues }
  // 모달에서 선택 완료 시 pendingMatrix를 확정하고 저장 진행

  // ── 추가 카피 중복 모달 상태 ─────────────────────────────────
  const [patchDupModal, setPatchDupModal] = useState(null)
  // patchDupModal = { queue, queueIdx, pendingMatrix, pendingPatched }

  // 상세 로드 — 저장된 결과가 있으면 바로 테이블 표시
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.mergeGetProject(project.id)
      if (!res.ok) return
      const en = res.project.en_lines || ''
      setEnInput(en)
      const loaded = (res.countries || []).map(c => ({
        id: `db_${c.id}`, dbId: c.id, label: c.label,
        rawPaste: c.raw_paste || '', mappedJson: c.mapped_json || null, isSaved: true,
      }))
      setCountries(loaded)
      pasteRef.current = {}

      if (en && loaded.some(c => c.mappedJson)) {
        const baseEnLines = parseEnLines(en)
        const matrix = {}
        loaded.forEach(c => {
          try {
            const mj = c.mappedJson
            matrix[c.id] = Array.isArray(mj) ? mj : typeof mj === 'string' ? JSON.parse(mj) : (mj || [])
          } catch { matrix[c.id] = [] }
        })
        setMergeResult({ matrix, dntIssues: [], missingWarns: [], baseEnLines, activeCountries: loaded })
      }
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [project.id])

  useEffect(() => { load() }, [load])

  // mergeResult가 바뀌면 검색 초기화
  useEffect(() => {
    setGlobalSearch('')
    setPerCountrySearch({})
  }, [mergeResult?.baseEnLines?.length, mergeResult?.activeCountries?.length])

  useEffect(() => {
    const saved = localStorage.getItem(LS_EN_KEY)
    if (saved) { setEnInput(saved); localStorage.removeItem(LS_EN_KEY) }
  }, [])

  const addCountry = (site) => {
    const id = `new_${idSeq}`; setIdSeq(n => n + 1)
    // SiteDropdown이 { code, name, flag, region } 형태의 site 객체를 넘겨줌
    const label = site?.code ?? `국가${idSeq}`
    setCountries(prev => [...prev, { id, dbId: null, label, rawPaste: '', mappedJson: null, isSaved: false }])
  }
  const removeCountry = async (id) => {
    if (!isRegular()) { alert('정규직만 국가를 삭제할 수 있습니다.'); return }
    const c = countries.find(x => x.id === id)
    if (c?.dbId) {
      if (!window.confirm(`${c.label} 국가를 삭제하시겠습니까?`)) return
      await api.mergeDeleteCountry(project.id, c.dbId)
    }
    setCountries(prev => prev.filter(x => x.id !== id))
    delete pasteRef.current[id]
    setMergeResult(null)
  }
  const updateLabel = (id, label) =>
    setCountries(prev => prev.map(c => c.id === id ? { ...c, label, isSaved: false } : c))

  // ── 추가 카피 핸들러 ───────────────────────────────────────
  const addPatchCountry = () => {
    const id = `patch_${patchIdSeq}`; setPatchIdSeq(n => n + 1)
    setPatchCountries(prev => [...prev, { id, label: '', rawPaste: '' }])
  }
  const removePatchCountry = (id) => {
    setPatchCountries(prev => prev.filter(x => x.id !== id))
    delete patchPasteRef.current[id]
  }
  const updatePatchLabel = (id, label) =>
    setPatchCountries(prev => prev.map(c => c.id === id ? { ...c, label } : c))

  const handleRename = async () => {
    if (!titleVal.trim()) return
    await api.mergeUpdateProject(project.id, { title: titleVal.trim(), enLines: enInput })
    setEditTitle(false); onUpdated()
  }

  // ── Merge 저장 (중복 해결 후 실제 저장) ───────────────────
  const commitMerge = useCallback(async (matrix, dntIssues, activeCountries) => {
    setMergeResult({ matrix, dntIssues, missingWarns: [], baseEnLines: parseEnLines(enInput), activeCountries })

    if (dntIssues.length) {
      const msgs = dntIssues.slice(0, 5).map(d =>
        `[${d.countryLabel}] ${d.row}행 — ${d.issues.map(i => `"${i.alias}": EN ${i.enCount}개 Local ${i.localCount}개`).join(', ')}`
      )
      alert(`⚠ DNT 불일치 (${dntIssues.length}건)\n\n` + msgs.join('\n'))
    }

    setSaving(true)
    try {
      await api.mergeUpdateProject(project.id, { enLines: enInput })
      for (const c of activeCountries) {
        const mappedJson = JSON.stringify(matrix[c.id] || [])
        const res = await api.mergeUpsertCountry(project.id, {
          countryId: c.dbId || null, label: c.label, rawPaste: c.rawPaste, mappedJson,
        })
        if (res.ok) {
          setCountries(prev => prev.map(x =>
            x.id === c.id
              ? { ...x, dbId: res.id ?? x.dbId, isSaved: true, mappedJson, rawPaste: c.rawPaste }
              : x
          ))
        }
      }
      onUpdated()
      await load()
    } finally { setSaving(false) }
  }, [enInput, project.id, onUpdated, load])

  // ── Merge 실행 ──────────────────────────────────────────────
  const runMerge = useCallback(async () => {
    setError(''); setMergeResult(null)
    const baseEnLines = parseEnLines(enInput)
    if (baseEnLines.length === 0) { setError('기준 영문 카피를 입력해주세요.'); return }
    if (countries.length === 0)   { setError('국가를 하나 이상 추가해주세요.'); return }

    const activeCountries = countries.map(c => ({
      ...c,
      rawPaste: c.isSaved
        ? c.rawPaste
        : (pasteRef.current[c.id]?.value ?? c.rawPaste),
    }))

    const matrix = {}, dntIssues = []
    // 중복이 발견된 국가 목록 수집
    const dupEntries = [] // [{ country, duplicates }]

    for (const c of activeCountries) {
      const pairs = parseConfirmedPaste(c.rawPaste)
      if (pairs.length === 0) {
        matrix[c.id] = baseEnLines.map(en => ({ en, local: '', missing: true }))
        continue
      }

      // 중복 감지
      const dups = detectDuplicates(baseEnLines, pairs)
      if (dups.length > 0) {
        dupEntries.push({ country: c, duplicates: dups, pairs })
      } else {
        const mapped = mapLocals(baseEnLines, pairs)
        matrix[c.id] = mapped
        mapped.forEach((m, i) => {
          if (!m.local || m.missing) return
          const issues = checkDNT(m.en, m.local, products)
          if (issues.length) dntIssues.push({ countryLabel: c.label, row: i + 1, enText: m.en, issues })
        })
      }
    }

    if (dupEntries.length > 0) {
      // 중복이 있는 국가가 하나 이상 — 첫 번째 국가부터 순서대로 모달 표시
      // 모달 상태에 전체 대기 목록 보관
      setDupModal({
        queue: dupEntries,          // 아직 처리 안 된 중복 국가 목록
        queueIdx: 0,                // 현재 처리 중인 인덱스
        resolvedMap: {},            // { countryId: resolvedLocalsMap }
        pendingMatrix: matrix,      // 중복 없는 국가는 이미 계산된 상태
        pendingDntIssues: dntIssues,
        activeCountries,
        baseEnLines,
      })
      return  // 저장은 모달 완료 후 commitMerge()로
    }

    // 중복 없음 — 바로 저장
    await commitMerge(matrix, dntIssues, activeCountries)
  }, [enInput, countries, products, commitMerge])

  // ── 중복 모달 — 선택 완료 핸들러 ────────────────────────────
  const handleDupResolve = useCallback(async (resolvedLocalsMap) => {
    if (!dupModal) return
    const { queue, queueIdx, pendingMatrix, pendingDntIssues, activeCountries, baseEnLines } = dupModal

    // resolvedLocalsMap: { [enKey]: [local_for_pos0, local_for_pos1, ...] }
    // 현재 처리 중인 국가의 matrix를 resolvedLocalsMap으로 확정
    const entry = queue[queueIdx]
    const c = entry.country

    // mapLocals를 resolvedLocalsMap 기반으로 재구성
    const resolvedCursor = {}
    const mapped = baseEnLines.map(en => {
      const key = en.trim()
      if (!resolvedLocalsMap[key]) {
        // 중복 없는 키 → 원래 pairs 기반 처리
        const origPairs = entry.pairs
        const origQueue = {}
        origPairs.forEach(({ en: e, local }) => {
          const k = e.trim()
          if (!origQueue[k]) origQueue[k] = []
          origQueue[k].push(local)
        })
        if (!origQueue[key] || origQueue[key].length === 0) return { en, local: '', missing: true }
        const idx = resolvedCursor[key] ?? 0
        const local = origQueue[key][idx] ?? origQueue[key][origQueue[key].length - 1]
        resolvedCursor[key] = idx + 1
        return { en, local, missing: !local }
      }
      // 중복 해결된 키 → resolvedLocalsMap에서 순서대로
      const idx = resolvedCursor[key] ?? 0
      const local = resolvedLocalsMap[key][idx] ?? resolvedLocalsMap[key][resolvedLocalsMap[key].length - 1]
      resolvedCursor[key] = idx + 1
      // 케이스 A에서 체크 해제된 행(__SKIP__)은 missing 처리
      if (local === '__SKIP__') return { en, local: '', missing: true }
      return { en, local, missing: !local }
    })

    const newMatrix = { ...pendingMatrix, [c.id]: mapped }
    const newDntIssues = [...pendingDntIssues]
    mapped.forEach((m, i) => {
      if (!m.local || m.missing) return
      const issues = checkDNT(m.en, m.local, products)
      if (issues.length) newDntIssues.push({ countryLabel: c.label, row: i + 1, enText: m.en, issues })
    })

    const nextIdx = queueIdx + 1
    if (nextIdx < queue.length) {
      // 다음 중복 국가 처리
      setDupModal(prev => ({
        ...prev,
        queueIdx: nextIdx,
        pendingMatrix: newMatrix,
        pendingDntIssues: newDntIssues,
      }))
    } else {
      // 모든 중복 처리 완료 → 저장
      setDupModal(null)
      await commitMerge(newMatrix, newDntIssues, activeCountries)
    }
  }, [dupModal, products, commitMerge])

  const handleDupCancel = useCallback(() => {
    setDupModal(null)
    setError('중복 카피 선택이 취소되었습니다. Merge가 실행되지 않았습니다.')
  }, [])

  // ── 추가 카피 실제 저장 (중복 해결 후 호출) ──────────────
  const commitPatch = useCallback(async (newMatrix, patchedCountries) => {
    setPatchSaving(true)
    try {
      for (const { matched, updated } of patchedCountries) {
        const newRawPaste = updated.map(row => `${row.en}\t${row.local}`).join('\n')
        const mappedJson  = JSON.stringify(updated)

        const res = await api.mergeUpsertCountry(project.id, {
          countryId: matched.dbId || null,
          label: matched.label,
          rawPaste: newRawPaste,
          mappedJson,
        })

        if (res.ok) {
          setCountries(prev => prev.map(c =>
            c.id === matched.id
              ? { ...c, rawPaste: newRawPaste, mappedJson, isSaved: true }
              : c
          ))
          if (pasteRef.current[matched.id]) {
            pasteRef.current[matched.id].value = newRawPaste
          }
        }
      }

      setMergeResult(prev => ({ ...prev, matrix: newMatrix }))
      setPatchCountries([])
      patchPasteRef.current = {}
      onUpdated()
    } catch (e) {
      console.error(e)
      setPatchError('저장 중 오류가 발생했습니다.')
    } finally {
      setPatchSaving(false)
    }
  }, [project.id, onUpdated])

  // ── 추가 카피 중복 모달 핸들러 ───────────────────────────────
  const handlePatchDupResolve = useCallback(async (resolvedLocalsMap) => {
    if (!patchDupModal) return
    const { queue, queueIdx, pendingMatrix, pendingPatched } = patchDupModal
    const entry = queue[queueIdx]
    const { matched, existing, baseEnLines, patchPairs } = entry

    // resolvedLocalsMap 기반으로 기존 mapped 배열 덮어쓰기
    const resolvedCursor = {}
    // 중복 없는 키는 원래 patchPairs 큐로 처리
    const origQueue = {}
    patchPairs.forEach(({ en, local }) => {
      const key = en.trim()
      if (!origQueue[key]) origQueue[key] = []
      origQueue[key].push(local)
    })
    const origCursor = {}

    const updated = existing.map(row => {
      const key = row.en.trim()
      if (resolvedLocalsMap[key] !== undefined) {
        // 중복 해결된 키
        const idx = resolvedCursor[key] ?? 0
        const local = resolvedLocalsMap[key][idx] ?? resolvedLocalsMap[key][resolvedLocalsMap[key].length - 1]
        resolvedCursor[key] = idx + 1
        if (local === '__SKIP__') return row  // 케이스 A 건너뜀 → 기존 값 유지
        return { ...row, local, missing: !local }
      }
      if (origQueue[key]) {
        // 중복 없는 키 → 원래 순서 매핑
        const idx = origCursor[key] ?? 0
        const local = origQueue[key][idx] ?? origQueue[key][origQueue[key].length - 1]
        origCursor[key] = idx + 1
        return { ...row, local, missing: !local }
      }
      return row  // paste에 없는 키 → 기존 값 유지
    })

    const newMatrix = { ...pendingMatrix, [matched.id]: updated }
    const newPatched = [...pendingPatched, { matched, updated }]

    const nextIdx = queueIdx + 1
    if (nextIdx < queue.length) {
      // 다음 중복 국가 처리
      setPatchDupModal(prev => ({
        ...prev,
        queueIdx: nextIdx,
        pendingMatrix: newMatrix,
        pendingPatched: newPatched,
      }))
    } else {
      // 모두 완료 → 저장
      setPatchDupModal(null)
      await commitPatch(newMatrix, newPatched)
    }
  }, [patchDupModal, commitPatch])

  const handlePatchDupCancel = useCallback(() => {
    setPatchDupModal(null)
    setPatchError('중복 카피 선택이 취소되었습니다. 추가 카피가 적용되지 않았습니다.')
  }, [])

  // ── 추가 카피 덮어쓰기 저장 ────────────────────────────────
  const runPatch = useCallback(async () => {
    if (!mergeResult) { setPatchError('먼저 Merge를 실행해주세요.'); return }
    setPatchError('')

    const activePatch = patchCountries
      .map(c => ({ ...c, rawPaste: patchPasteRef.current[c.id]?.value ?? c.rawPaste }))
      .filter(c => c.label && c.rawPaste.trim())

    if (activePatch.length === 0) {
      setPatchError('국가를 선택하고 수정 카피를 입력해주세요.')
      return
    }

    const newMatrix = { ...mergeResult.matrix }
    const patchedCountries = []   // 중복 없이 바로 처리 완료된 국가들
    const dupPatchEntries  = []   // 중복 감지돼서 모달 필요한 국가들

    for (const patch of activePatch) {
      const matched = countries.find(c =>
        c.label.trim().toLowerCase() === patch.label.trim().toLowerCase()
      )
      if (!matched) {
        alert(`"${patch.label}" 국가를 찾을 수 없습니다.\n국가별 컨펌 카피에 등록된 국가명과 동일하게 선택해주세요.`)
        continue
      }

      const patchPairs = parseConfirmedPaste(patch.rawPaste)
      if (patchPairs.length === 0) continue

      // 기존 merge된 EN 행 목록을 base로 사용
      const existing = [...(newMatrix[matched.id] || [])]
      const baseEnLines = existing.map(row => row.en)

      // 중복 감지
      const dups = detectDuplicates(baseEnLines, patchPairs)

      if (dups.length > 0) {
        // 모달 필요 — 대기 목록에 추가
        dupPatchEntries.push({ patch, matched, patchPairs, existing, baseEnLines, duplicates: dups })
      } else {
        // 중복 없음 — 바로 덮어쓰기
        const patchQueue = {}
        patchPairs.forEach(({ en, local }) => {
          const key = en.trim()
          if (!patchQueue[key]) patchQueue[key] = []
          patchQueue[key].push(local)
        })
        const cursor = {}
        const updated = existing.map(row => {
          const key = row.en.trim()
          if (!patchQueue[key]) return row
          const idx = cursor[key] ?? 0
          const local = patchQueue[key][idx] ?? patchQueue[key][patchQueue[key].length - 1]
          cursor[key] = idx + 1
          return { ...row, local, missing: !local }
        })
        newMatrix[matched.id] = updated
        patchedCountries.push({ matched, updated })
      }
    }

    if (dupPatchEntries.length > 0) {
      // 중복 있는 국가가 하나 이상 → 모달 진입
      setPatchDupModal({
        queue: dupPatchEntries,
        queueIdx: 0,
        pendingMatrix: newMatrix,
        pendingPatched: patchedCountries,  // 중복 없이 처리된 국가들
      })
      return
    }

    // 중복 없음 → 바로 저장
    await commitPatch(newMatrix, patchedCountries)
  }, [mergeResult, patchCountries, countries, commitPatch])

  const handleExport = () => {
    if (!mergeResult) return
    exportCSV(
      mergeResult.baseEnLines,
      (mergeResult.activeCountries || []).map(c => ({ ...c, mappedJson: JSON.stringify(mergeResult.matrix[c.id] || []) })),
      project.title
    )
  }

  if (loading) return <div className="loading" style={{ padding: 60, textAlign: 'center' }}>불러오는 중...</div>

  return (
    <div className="mg-detail-view">
      {/* ── 중복 카피 선택 모달 ── */}
      {dupModal && (() => {
        const entry = dupModal.queue[dupModal.queueIdx]
        return (
          <DuplicateResolveModal
            key={`dup_${entry.country.id}_${dupModal.queueIdx}`}
            duplicates={entry.duplicates}
            countryLabel={entry.country.label}
            onResolve={handleDupResolve}
            onCancel={handleDupCancel}
          />
        )
      })()}

      {/* ── 추가 카피 중복 선택 모달 ── */}
      {patchDupModal && (() => {
        const entry = patchDupModal.queue[patchDupModal.queueIdx]
        return (
          <DuplicateResolveModal
            key={`patchdup_${entry.matched.id}_${patchDupModal.queueIdx}`}
            duplicates={entry.duplicates}
            countryLabel={entry.matched.label}
            onResolve={handlePatchDupResolve}
            onCancel={handlePatchDupCancel}
          />
        )
      })()}

      {/* 헤더 */}
      <div className="mg-detail-header">
        <button className="pj-back-btn" onClick={onBack}>← 프로젝트 목록</button>
        <div className="mg-detail-title-row">
          {editTitle ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="form-input" value={titleVal}
                onChange={e => setTitleVal(e.target.value)}
                style={{ fontSize: 15, fontWeight: 700, width: 280 }} />
              <button className="act-btn act-save" onClick={handleRename}>저장</button>
              <button className="act-btn act-cancel" onClick={() => setEditTitle(false)}>취소</button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="mg-detail-title">{titleVal}</span>
              <button className="act-btn act-edit" onClick={() => setEditTitle(true)}>✏ 이름 수정</button>
            </div>
          )}
        </div>
      </div>

      {/* ── Merge 결과: 진입 즉시 표시 (저장된 경우) ── */}
      {mergeResult && (() => {
        // ── 검색 필터링 ──────────────────────────────────────
        const activeCountries = mergeResult.activeCountries || []

        // 전체 검색 적용: EN 또는 임의 국가 로컬에 keyword 포함된 행만
        const gq = globalSearch.trim().toLowerCase()
        const filteredIndices = mergeResult.baseEnLines.reduce((acc, en, i) => {
          if (!gq) { acc.push(i); return acc }
          if (en.toLowerCase().includes(gq)) { acc.push(i); return acc }
          const anyMatch = activeCountries.some(c => {
            const local = (mergeResult.matrix[c.id]?.[i]?.local ?? '').toLowerCase()
            return local.includes(gq)
          })
          if (anyMatch) acc.push(i)
          return acc
        }, [])

        return (
          <section className="mg-result-section">
            <details className="mg-edit-details" open style={{ marginBottom: 0 }}>
              <summary className="mg-edit-summary">
                <span className="mg-accordion-chevron" aria-hidden="true" />
                <span className="mg-accordion-icon">📊</span>
                <span className="result-title">
                  Merge 결과 — {mergeResult.baseEnLines.length}행 · {activeCountries.length}개국
                  {gq && (
                    <span style={{ marginLeft: 8, fontSize: 12, color: '#6366f1', fontWeight: 400 }}>
                      ({filteredIndices.length}건 매칭)
                    </span>
                  )}
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}
                  onClick={e => e.stopPropagation()}>
                  <span className="cc-scroll-hint">← 가로 스크롤 →</span>
                  <button className="btn-export" onClick={handleExport}>⬇ Excel 추출</button>
                </div>
              </summary>

              <div>
                {/* ── 검색 바 ── */}
                <div style={{ display: 'flex', gap: 8, margin: '10px 0', flexWrap: 'wrap', alignItems: 'center' }}>
                  <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 340 }}>
                    <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 13 }}>🔍</span>
                    <input
                      className="form-input"
                      style={{ paddingLeft: 28, fontSize: 13, width: '100%', boxSizing: 'border-box' }}
                      placeholder="전체 검색 (EN + 모든 국가)"
                      value={globalSearch}
                      onChange={e => { setGlobalSearch(e.target.value); setPerCountrySearch({}) }}
                    />
                  </div>
                  {activeCountries.map(c => (
                    <div key={c.id} style={{ position: 'relative', flex: '0 1 180px' }}>
                      <span style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', fontSize: 11 }}>🔍</span>
                      <input
                        className="form-input"
                        style={{ paddingLeft: 24, fontSize: 12, width: '100%', boxSizing: 'border-box' }}
                        placeholder={`${c.label} 검색`}
                        value={perCountrySearch[c.id] ?? ''}
                        onChange={e => {
                          setGlobalSearch('')
                          setPerCountrySearch(prev => ({ ...prev, [c.id]: e.target.value }))
                        }}
                      />
                    </div>
                  ))}
                  {(globalSearch || Object.values(perCountrySearch).some(v => v)) && (
                    <button className="act-btn act-cancel" style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                      onClick={() => { setGlobalSearch(''); setPerCountrySearch({}) }}>
                      ✕ 검색 초기화
                    </button>
                  )}
                  {gq && (
                    <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {filteredIndices.length}/{mergeResult.baseEnLines.length}건
                    </span>
                  )}
                </div>

                <div className="cc-table-wrap">
                  <table className="cc-table mg-table">
                    <thead>
                      <tr>
                        <th className="cc-th cc-th-idx">#</th>
                        <th className="cc-th mg-th-en">EN (기준)</th>
                        {activeCountries.map(c => (
                          <th key={c.id} className="cc-th mg-th-local">{c.label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filteredIndices.map(i => {
                        const en = mergeResult.baseEnLines[i]

                    // 국가별 검색 필터: 이 행에서 해당 국가가 keyword 포함하는지
                        const perCountryVisible = (c) => {
                          const pq = (perCountrySearch[c.id] ?? '').trim().toLowerCase()
                          if (!pq) return true
                          const local = (mergeResult.matrix[c.id]?.[i]?.local ?? '').toLowerCase()
                          return local.includes(pq) || en.toLowerCase().includes(pq)
                        }
                    // 국가별 검색 모드일 때: 아무 국가도 매치 안 하면 행 자체 숨기기
                        const hasAnyPerSearch = Object.values(perCountrySearch).some(v => v.trim())
                        if (hasAnyPerSearch && !activeCountries.some(c => perCountryVisible(c))) return null

                        const rowHasIssue = activeCountries.some(c => {
                          const m = mergeResult.matrix[c.id]?.[i]
                          if (m?.missing) return true
                          const local = m?.local ?? ''
                          return (
                            checkDNT(en, local, products).length > 0 ||
                            checkUnreleased(local, c.label, products).length > 0 ||
                            checkDNTCountMismatch(en, local, c.label, products) !== null ||
                            detectServiceIssues(local, c.label).length > 0          // ✅ 추가
                          )
                        })
                        return (
                          <tr key={i} className={rowHasIssue ? 'cc-row-issue' : ''}>
                            <td className="cc-td cc-td-idx">{i + 1}</td>
                            <td className="cc-td mg-td-en">
                              <span className="mg-en-text">{en || <em className="empty-val">빈 값</em>}</span>
                            </td>
                            {activeCountries.map(c => {
                          const m = mergeResult.matrix[c.id]?.[i]
                          const dntIss        = m?.local ? checkDNT(en, m.local, products) : []
                          const urlIss        = m?.local ? checkUrlSiteCode(m.local, c.label) : []
                          const isTBD         = hasTBDorNA(m?.local)
                          const isMissing     = m?.missing || !m
                          const unreleased    = (!isMissing && m?.local) ? checkUnreleased(m.local, c.label, products) : []
                          const dntMismatch   = (!isMissing && m?.local) ? checkDNTCountMismatch(en, m.local, c.label, products) : null
                          const svcIssues     = (!isMissing && m?.local) ? detectServiceIssues(m.local, c.label) : []   // ✅ 추가

                          const hasAnyIssue = dntIss.length || urlIss.length || unreleased.length || dntMismatch || svcIssues.length  // ✅ 추가
                          const pq = (perCountrySearch[c.id] ?? '').trim().toLowerCase()
                          const isPerMatch = pq
                            ? ((m?.local ?? '').toLowerCase().includes(pq) || en.toLowerCase().includes(pq))
                            : true
                              let cellClass = 'cc-td mg-td-local'
                          if (isMissing)          cellClass += ' mg-cell-missing'
                          else if (isTBD)         cellClass += ' mg-cell-tbd'
                          else if (hasAnyIssue)   cellClass += ' cc-cell-issue'
                          if (!isPerMatch && pq)  cellClass += ' mg-cell-dim'

                              return (
                                <td key={c.id} className={cellClass}>
                                  {isMissing
                                    ? <span className="mg-missing-badge">⚠ 매핑 없음</span>
                                    : <span className="mg-local-text" style={isTBD ? { fontWeight: 700, color: '#b45309' } : {}}>
                                        {m.local || <em className="empty-val">빈 값</em>}
                                      </span>
                                  }
                                  {isTBD && (
                                    <div className="mg-tbd-badge">⚠ TBD/N·A 미확정</div>
                                  )}
                                  {urlIss.map((u, ui) => (
                                    <div key={ui} className="mg-url-badge">
                                      🔗 URL 사이트코드 불일치: <code>/{u.found}/</code> → <code>/{u.expected}/</code> 필요
                                    </div>
                                  ))}
                                  {dntIss.map((iss, di) => (
                                    <div key={di} className="cc-launch-badge" style={{ fontSize: 10 }}>
                                      ⚠ DNT: "{iss.alias}" {iss.enCount}→{iss.localCount}
                                    </div>
                                  ))}
                              {unreleased.map((name, ui) => (
                                <div key={`unrel-${ui}`} className="cc-launch-badge" style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
                                  🚫 미출시: {name}
                                </div>
                              ))}
                              {dntMismatch && (
                                <div className="cc-launch-badge" style={{ fontSize: 10, background: '#ede9fe', color: '#5b21b6', borderColor: '#c4b5fd' }}>
                                  ⚠ DNT 개수 불일치 EN:{dntMismatch.enCount} / Local:{dntMismatch.lcCount}
                                </div>
                              )}
                              {svcIssues.map((issue, si) => {
                                if (issue.type === 'not_operated') return (
                                  <div key={`svc-${si}`} className="cc-launch-badge" style={{ fontSize: 10, background: '#fee2e2', color: '#b91c1c', borderColor: '#fca5a5' }}>
                                    ⛔ 미운영: {issue.service}
                                  </div>
                                )
                                if (issue.type === 'wrong_text') return (
                                  <div key={`svc-${si}`} className="cc-launch-badge" style={{ fontSize: 10, background: '#fef3c7', color: '#92400e', borderColor: '#fcd34d' }}>
                                    ⚠ {issue.service}
                                    <div style={{ marginTop: 2, fontSize: '0.85em', opacity: 0.75 }}>→ <strong>{issue.expected}</strong></div>
                                  </div>
                                )
                                if (issue.type === 'wrong_url') return (
                                  <div key={`svc-${si}`} className="cc-launch-badge" style={{ fontSize: 10, background: '#eff6ff', color: '#1e40af', borderColor: '#93c5fd', wordBreak: 'break-all' }}>
                                    🔗 {issue.service}
                                    <div style={{ marginTop: 2, fontSize: '0.85em', opacity: 0.75 }}>→ <strong>{issue.expected}</strong></div>
                                  </div>
                                )
                                return null
                              })}
                                </td>
                              )
                            })}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </details>
          </section>
        )
      })()}

      {/* ── 편집 영역 ── */}
      <details className="mg-edit-details" open>
        <summary className="mg-edit-summary">
          <span className="mg-accordion-chevron" aria-hidden="true" />
          <span className="mg-accordion-icon">{mergeResult ? '✏' : '📋'}</span>
          <span>{mergeResult ? '카피 수정 / 국가 추가' : '카피 입력'}</span>
        </summary>
        <div className="mg-edit-body">

          {/* ① 기준 영문 카피 */}
          <section className="mg-section">
            <div className="mg-section-header">
              <div className="mg-section-title"><span className="mg-step">1</span>기준 영문 카피</div>
            </div>
            <textarea className="paste-area mg-en-area" value={enInput}
              onChange={e => setEnInput(e.target.value)}
              placeholder={"기준이 될 영문 카피를 한 줄씩 입력\n예:\nFind Your Galaxy\nPerformance\nCamera"} />
            <div className="input-hint">{enInput ? `${parseEnLines(enInput).length}줄 입력됨` : '한 줄 = 카피 1개'}</div>
          </section>

          {/* ② 국가별 컨펌 카피 */}
          <section className="mg-section">
            <div className="mg-section-header">
              <div className="mg-section-title">
                <span className="mg-step">2</span>국가별 컨펌 카피
                {countries.some(c => c.isSaved) && (
                  <span style={{ fontSize: 11, color: '#10b981', marginLeft: 8 }}>
                    {countries.filter(c => c.isSaved).length}개국 저장됨
                  </span>
                )}
              </div>
              <SiteDropdown
                label="+ 국가 추가"
                excludeCodes={countries.map(c => c.label)}
                onAdd={addCountry}
              />
            </div>
            {countries.length === 0 ? (
              <div className="empty-state" style={{ marginTop: 8 }}>
                <div className="empty-icon">🌍</div>
                <p>국가를 추가해주세요</p>
              </div>
            ) : (
              <div className="mg-countries-grid">
                {countries.map(c => (
                  <CountryCard key={c.id} country={c} onRemove={removeCountry}
                    onLabelChange={updateLabel} pasteRef={pasteRef} projectId={project.id} />
                ))}
              </div>
            )}
          </section>

          {/* Merge 실행 */}
          <section className="mg-run-row">
            <button className="btn-primary mg-run-btn" onClick={runMerge} disabled={saving}>
              {saving ? '⏳ 저장 중...' : '🔀 Merge 실행 & 저장'}
            </button>
            <span style={{ fontSize: 12, color: '#6b7280' }}>Merge 실행 시 자동 저장됩니다.</span>
            {error && <div className="error-banner" style={{ margin: 0 }}>{error}</div>}
          </section>

          {/* DNT 이슈 */}
          {mergeResult?.dntIssues?.length > 0 && (
            <section className="mg-dnt-section">
              <div className="mg-dnt-title">⚠ DNT 불일치 {mergeResult.dntIssues.length}건</div>
              <div className="mg-dnt-list">
                {(mergeResult.dntIssues || []).map((d, i) => (
                  <div key={i} className="mg-dnt-item">
                    <span className="mg-dnt-country">[{d.countryLabel}]</span>
                    <span className="mg-dnt-row">{d.row}행</span>
                    <span className="mg-dnt-en">{d.enText.slice(0, 40)}{d.enText.length > 40 ? '…' : ''}</span>
                    <span className="mg-dnt-issues">
                      {d.issues.map(iss => `"${iss.alias}" EN:${iss.enCount} Local:${iss.localCount}`).join(' / ')}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ③ 국가별 추가 카피 (덮어쓰기) — Merge 결과가 있을 때만 표시 */}
          {mergeResult && (
            <section className="mg-section mg-patch-section" style={{ marginTop: 28 }}>
              {/* 구분선 */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 10,
                marginBottom: 16, color: '#f59e0b',
              }}>
                <div style={{ flex: 1, height: 1, background: '#fde68a' }} />
                <span style={{ fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap' }}>
                  추가 / 수정 카피
                </span>
                <div style={{ flex: 1, height: 1, background: '#fde68a' }} />
              </div>

              <div className="mg-section-header">
                <div className="mg-section-title">
                  <span
                    className="mg-step"
                    style={{ background: '#f59e0b', color: '#fff' }}
                  >+</span>
                  국가별 추가 카피
                  <span style={{ fontSize: 11, color: '#b45309', marginLeft: 8, fontWeight: 400 }}>
                    누락 · 수정된 카피를 기존 Merge 결과에 덮어씁니다
                  </span>
                </div>
                <button
                  className="btn-primary"
                  style={{
                    fontSize: 13, padding: '7px 16px',
                    background: '#f59e0b', borderColor: '#f59e0b',
                  }}
                  onClick={addPatchCountry}
                >
                  + 국가 추가
                </button>
              </div>

              {patchCountries.length === 0 ? (
                <div style={{
                  marginTop: 8, padding: '20px 24px',
                  background: '#fffbeb', borderRadius: 10,
                  border: '1.5px dashed #fcd34d',
                  textAlign: 'center',
                }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>✏️</div>
                  <p style={{ fontSize: 13, color: '#92400e', margin: '0 0 4px' }}>
                    뒤늦게 수정된 카피가 있을 때 사용하세요
                  </p>
                  <small style={{ color: '#b45309' }}>
                    입력한 행만 Merge 결과에 덮어쓰이고,
                    국가별 컨펌 카피도 함께 업데이트됩니다.
                    저장 후 이 영역은 자동으로 초기화됩니다.
                  </small>
                </div>
              ) : (
                <>
                  <div className="mg-countries-grid">
                    {patchCountries.map(c => (
                      <PatchCountryCard
                        key={c.id}
                        country={c}
                        onRemove={removePatchCountry}
                        onLabelChange={updatePatchLabel}
                        patchPasteRef={patchPasteRef}
                        existingLabels={countries.map(x => x.label)}
                      />
                    ))}
                  </div>

                  <div className="mg-run-row" style={{ marginTop: 14 }}>
                    <button
                      className="btn-primary mg-run-btn"
                      style={{ background: '#f59e0b', borderColor: '#f59e0b' }}
                      onClick={runPatch}
                      disabled={patchSaving}
                    >
                      {patchSaving ? '⏳ 저장 중...' : '✅ 추가 카피 덮어쓰기 저장'}
                    </button>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>
                      저장 후 추가 카피 영역은 자동으로 초기화됩니다.
                    </span>
                    {patchError && (
                      <div className="error-banner" style={{ margin: 0 }}>{patchError}</div>
                    )}
                  </div>
                </>
              )}
            </section>
          )}

        </div>
      </details>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 메인
// ════════════════════════════════════════════════════════════════
export default function MergeTab() {
  const { dbReady }                   = useDB()
  const [projects, setProjects]       = useState([])
  const [projLoading, setProjLoading] = useState(false)
  const [openProject, setOpenProject] = useState(null)
  const [products, setProducts]       = useState([])

  const loadProjects = useCallback(async () => {
    if (!dbReady) return
    setProjLoading(true)
    try {
      const res = await api.mergeListProjects()
      if (res.ok) setProjects(res.data)
    } catch (e) { console.error(e) }
    finally { setProjLoading(false) }
  }, [dbReady])

  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => {
    api.getProducts().then(res => { if (res.ok) setProducts(res.data) }).catch(() => {})
  }, [])

  const handleCreate = async (title) => {
    const res = await api.mergeCreateProject({ title, enLines: '' })
    if (res.ok) { await loadProjects(); setOpenProject({ id: res.id, title }) }
  }
  const handleDelete = async (id, title) => {
    if (!isRegular()) { alert('정규직만 프로젝트를 삭제할 수 있습니다.'); return }
    if (!window.confirm(`"${title}" 프로젝트를 삭제하시겠습니까?`)) return
    await api.mergeDeleteProject(id)
    if (openProject?.id === id) setOpenProject(null)
    loadProjects()
  }
  const handleBack = () => { setOpenProject(null); loadProjects() }

  if (openProject) {
    return (
      <ProjectDetailView
        project={openProject}
        products={products}
        onBack={handleBack}
        onUpdated={loadProjects}
      />
    )
  }

  return (
    <ProjectListView
      projects={projects}
      loading={projLoading}
      onCreate={handleCreate}
      onOpen={p => setOpenProject(p)}
      onDelete={handleDelete}
    />
  )
}