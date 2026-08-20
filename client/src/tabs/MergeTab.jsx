/**
 * MergeTab — 카피덱 자동 Merge
 *
 * 진입 시: 프로젝트 목록 (카드 그리드)
 * 카드 클릭: 해당 프로젝트 상세 (EN 기준 + 국가별 로컬어 Merge 결과 바로 표시)
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api.js'
import { useDB } from '../DBContext.jsx'
import SiteDropdown from '../components/SiteDropdown.jsx'
import { ALL_SITES } from '../constants.js'
import { detectBadges } from '../utils.js'
import { detectServiceIssues } from '../components/ServiceCheck.jsx'
import { isStaff } from '../roles.js'

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
const isRegular = () => isStaff(getCurrentUserPosition())

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
/**
 * parseConfirmedPaste() 결과(pairs)를 EN 키 등장 순서대로 하나씩 꺼내주는 컨슈머.
 * 엑셀 재업로드(합집합 병합) 시, "이 EN 행에 대해 새로 업로드된 로컬 값이 있는가?"를
 * 물어볼 때 사용 — 없으면 undefined를 반환해 "새 파일에 이 행 자체가 없음"과
 * "새 파일에 값이 있지만 빈 칸"을 구분할 수 있게 한다.
 */
function makePairConsumer(pairs) {
  const queue = {}
  pairs.forEach(({ en, local }) => {
    const key = en.trim()
    if (!queue[key]) queue[key] = []
    queue[key].push(local)
  })
  const cursor = {}
  return (en) => {
    const key = en.trim()
    const list = queue[key]
    if (!list) return undefined
    const idx = cursor[key] ?? 0
    if (idx >= list.length) return undefined
    cursor[key] = idx + 1
    return list[idx]
  }
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
// 엑셀 재업로드(합집합 병합) 충돌 해결 모달
// ════════════════════════════════════════════════════════════════
/**
 * 이미 Merge 결과가 있는 프로젝트에 엑셀을 다시 업로드했을 때,
 * "기존에 값이 있고 + 새 파일 값도 있는데 + 서로 다른" 항목(진짜 충돌)만 모아
 * 사용자가 항목별로 기존 유지 / 새 카피로 교체를 선택하게 한다.
 * (완전히 새로운 국가·새로운 EN 행이나, 기존이 비어 있던 칸은 충돌이 아니라
 *  자동으로 합집합 처리되므로 이 모달에 나타나지 않는다.)
 *
 * conflicts: [{ countryId, countryLabel, rowIndex, en, existingLocal, newLocal }]
 * onConfirm(choices) — choices: { [conflictIndex]: 'keep' | 'replace' }
 * onCancel()
 */
function ImportConflictModal({ conflicts, onConfirm, onCancel }) {
  const [choices, setChoices] = useState(
    Object.fromEntries(conflicts.map((_, i) => [i, 'keep']))
  )
  const setAll = (value) => setChoices(Object.fromEntries(conflicts.map((_, i) => [i, value])))
  const setOne = (i, value) => setChoices(prev => ({ ...prev, [i]: value }))

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 14,
        width: '100%', maxWidth: 860,
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
              겹치는 카피 확인 필요 ({conflicts.length}건)
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
              기존 카피와 새로 업로드한 엑셀의 내용이 서로 다른 항목입니다. 항목별로 유지할지 교체할지 선택해주세요.
              (겹치지 않는 새 국가·새 항목은 이미 자동으로 추가됩니다)
            </div>
          </div>
          <button onClick={onCancel} style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 20, color: '#9ca3af', lineHeight: 1, padding: 0,
          }}>✕</button>
        </div>

        {/* 전체 일괄 선택 */}
        <div style={{ padding: '10px 24px', borderBottom: '1px solid #f0f1f3', display: 'flex', gap: 8 }}>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setAll('keep')}>전체 기존 카피 유지</button>
          <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setAll('replace')}>전체 새 카피로 교체</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '14px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {conflicts.map((c, i) => (
            <div key={i} style={{ borderRadius: 10, border: '1.5px solid #e5e7eb', overflow: 'hidden' }}>
              <div style={{
                background: '#f9fafb', padding: '8px 12px', borderBottom: '1px solid #e5e7eb',
                display: 'flex', gap: 8, alignItems: 'center',
              }}>
                <span style={{
                  background: '#2563eb', color: '#fff', borderRadius: 4,
                  fontSize: 10, fontWeight: 700, padding: '2px 7px', whiteSpace: 'nowrap',
                }}>{c.countryLabel}</span>
                <span style={{ fontSize: 12, color: '#111827', fontWeight: 600, flex: 1, wordBreak: 'break-word' }}>
                  {c.en.length > 90 ? c.en.slice(0, 90) + '…' : c.en}
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                <label style={{
                  padding: '10px 12px', borderRight: '1px solid #f0f1f3', cursor: 'pointer',
                  background: choices[i] === 'keep' ? '#eef2ff' : '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <input type="radio" checked={choices[i] === 'keep'} onChange={() => setOne(i, 'keep')} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#4f46e5' }}>기존 유지</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>{c.existingLocal}</div>
                </label>
                <label style={{
                  padding: '10px 12px', cursor: 'pointer',
                  background: choices[i] === 'replace' ? '#eef2ff' : '#fff',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <input type="radio" checked={choices[i] === 'replace'} onChange={() => setOne(i, 'replace')} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#16a34a' }}>새 카피로 교체</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#374151', whiteSpace: 'pre-wrap' }}>{c.newLocal}</div>
                </label>
              </div>
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
          <button onClick={() => onConfirm(choices)} style={{
            padding: '8px 24px', borderRadius: 8, border: 'none',
            background: '#6366f1', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 700,
          }}>✅ 선택 적용 후 저장</button>
        </div>
      </div>
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 프로젝트 목록 뷰
// ════════════════════════════════════════════════════════════════
// ── 옵션 메뉴 (⋯) — StatusTab의 DotsMenu와 동일한 패턴 ────────────
function DotsMenu({ items }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null) // { top, left } 화면 기준 고정 좌표
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  // 버튼 위치 기준으로 메뉴 좌표 계산 (뷰포트 밖으로 안 나가게 보정)
  const calcPos = () => {
    if (!btnRef.current) return null
    const r = btnRef.current.getBoundingClientRect()
    const MENU_W = 170
    const MENU_MAX_H = 320
    let left = r.right - MENU_W
    let top = r.bottom + 4
    if (left < 4) left = 4
    if (left + MENU_W > window.innerWidth - 4) left = window.innerWidth - MENU_W - 4
    if (top + MENU_MAX_H > window.innerHeight - 4) top = r.top - MENU_MAX_H - 4 // 아래 공간 부족하면 위로 띄움
    if (top < 4) top = 4
    return { top, left }
  }

  const openMenu = () => {
    setPos(calcPos())
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    function handle(e) {
      if (
        btnRef.current && !btnRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) setOpen(false)
    }
    // 목록이 스크롤되어도 메뉴를 닫지 않고 버튼을 따라 위치만 다시 계산한다
    // (긴 폴더 목록처럼 스크롤이 있는 화면에서 메뉴가 사라지던 문제 수정)
    function reposition() {
      const next = calcPos()
      if (next) setPos(next); else setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      document.removeEventListener('mousedown', handle)
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open])

  return (
    <div style={{ position: 'relative', display: 'inline-block' }} onClick={e => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={() => (open ? setOpen(false) : openMenu())}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: '3px 5px', borderRadius: 5, lineHeight: 1,
          color: '#9ca3af', fontSize: 16, fontWeight: 700, letterSpacing: 1,
          transition: 'background 0.15s, color 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#374151' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = '#9ca3af' }}
        title="옵션"
      >⋯</button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999,
            background: '#fff', border: '1px solid #e5e7eb', borderRadius: 10,
            boxShadow: '0 8px 24px rgba(0,0,0,0.13)', minWidth: 170, padding: '4px 0',
            maxHeight: 320, overflowY: 'auto',
          }}
        >
          {items.map((item, i) => item === 'divider' ? (
            <div key={i} style={{ height: 1, background: '#f1f5f9', margin: '3px 0' }} />
          ) : (
            <div
              key={i}
              onClick={() => { item.action(); setOpen(false) }}
              style={{
                padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                color: item.danger ? '#ef4444' : '#374151',
                display: 'flex', alignItems: 'center', gap: 8,
                transition: 'background 0.1s',
              }}
              onMouseEnter={e => e.currentTarget.style.background = item.danger ? '#fef2f2' : '#f8fafc'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
            >
              <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
              <span>{item.label}</span>
              {item.sub && <span style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>{item.sub}</span>}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── 인라인 이름 수정 Input — StatusTab과 동일한 패턴 ───────────────
function InlineRename({ value, onSave, onCancel }) {
  const [val, setVal] = useState(value)
  const inputRef = useRef(null)
  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select() }, [])
  return (
    <input
      ref={inputRef}
      value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={() => { if (val.trim() && val !== value) onSave(val.trim()); else onCancel() }}
      onKeyDown={e => {
        e.stopPropagation()
        if (e.key === 'Enter') { if (val.trim() && val !== value) onSave(val.trim()); else onCancel() }
        if (e.key === 'Escape') onCancel()
      }}
      onClick={e => e.stopPropagation()}
      style={{ fontSize: 14, fontWeight: 600, border: '1.5px solid #6366f1', borderRadius: 5, padding: '2px 7px', flex: 1, outline: 'none', minWidth: 0 }}
    />
  )
}

// ── 프로젝트 카드 ─────────────────────────────────────────────
function ProjectCard({ p, onOpen, onDelete, onRename, folders, onMoveToFolder }) {
  const [renaming, setRenaming] = useState(false)
  const currentFolder = folders.find(f => f.id === p.folder_id)

  const menuItems = isRegular() ? [
    {
      icon: '✏️', label: '이름 바꾸기',
      action: () => setRenaming(true),
    },
    'divider',
    {
      icon: '📋', label: '최상위로 이동',
      sub: p.folder_id ? '' : '✓ 현재',
      action: () => onMoveToFolder(p.id, null),
    },
    ...folders.map(f => ({
      icon: '📂', label: f.name,
      sub: p.folder_id === f.id ? '✓ 현재' : '',
      action: () => onMoveToFolder(p.id, f.id),
    })),
    'divider',
    {
      icon: '🗑️', label: '삭제', danger: true,
      action: () => onDelete(p.id, p.title),
    },
  ] : []

  return (
    <div className="mg-proj-card" onClick={() => !renaming && onOpen(p)}>
      <div className="mg-proj-card-header">
        {renaming ? (
          <InlineRename
            value={p.title}
            onSave={(newTitle) => { onRename(p.id, newTitle); setRenaming(false) }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span className="mg-proj-card-name">{p.title}</span>
        )}
        {menuItems.length > 0 && <DotsMenu items={menuItems} />}
      </div>
      {currentFolder && (
        <div style={{ fontSize: 10, color: '#6366f1', marginBottom: 2 }}>📂 {currentFolder.name}</div>
      )}
      <div className="mg-proj-card-meta">
        {(p.country_count ?? 0) > 0 && <span className="mg-proj-badge">{p.country_count}개국</span>}
        {(p.row_count ?? 0) > 0    && <span className="mg-proj-badge">{p.row_count}행</span>}
      </div>
      <div className="mg-proj-card-date">
        {(p.updated_at || p.created_at || '').slice(0, 10)}
      </div>
      <div className="mg-proj-card-arrow">열기 →</div>
    </div>
  )
}

// ── 프로젝트 폴더 블록 (StatusTab의 FolderBlock과 동일한 패턴) ── ─
function ProjectFolderBlock({ folder, projects, onOpen, onDelete, onRename, folders, onMoveToFolder, onRenameFolder, onDeleteFolder }) {
  const [isOpen, setIsOpen] = useState(true)
  const [renaming, setRenaming] = useState(false)

  const menuItems = isRegular() ? [
    {
      icon: '✏️', label: '이름 바꾸기',
      action: () => setRenaming(true),
    },
    'divider',
    {
      icon: '🗑️', label: '폴더 삭제', danger: true,
      action: () => onDeleteFolder(folder),
    },
  ] : []

  return (
    <div className="mg-folder-block">
      <div className="mg-folder-header">
        <span
          onClick={() => setIsOpen(v => !v)}
          className="mg-folder-caret"
          style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
        >▶</span>
        <span onClick={() => setIsOpen(v => !v)} style={{ fontSize: 16, cursor: 'pointer' }}>📂</span>
        {renaming ? (
          <InlineRename
            value={folder.name}
            onSave={(newName) => { onRenameFolder(folder.id, newName); setRenaming(false) }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <span onClick={() => setIsOpen(v => !v)} className="mg-folder-name">{folder.name}</span>
        )}
        <span className="mg-folder-count">{projects.length}개</span>
        {menuItems.length > 0 && (
          <div onClick={e => e.stopPropagation()}>
            <DotsMenu items={menuItems} />
          </div>
        )}
      </div>
      {isOpen && (
        <div className="mg-folder-body">
          {projects.length === 0 ? (
            <div style={{ fontSize: 12, color: '#9ca3af', padding: '8px 4px', textAlign: 'center' }}>빈 폴더입니다.</div>
          ) : (
            <div className="mg-proj-grid">
              {projects.map(p => (
                <ProjectCard key={p.id} p={p} onOpen={onOpen} onDelete={onDelete} onRename={onRename}
                  folders={folders} onMoveToFolder={onMoveToFolder} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ProjectListView({
  projects, folders, loading, onCreate, onOpen, onDelete, onRename,
  onCreateFolder, onRenameFolder, onDeleteFolder, onMoveToFolder,
}) {
  const [newTitle, setNewTitle] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [creating, setCreating] = useState(false)
  const [search, setSearch]     = useState('')
  const [viewMode, setViewMode] = useState('folder') // 'folder' | 'flat'
  const [showNewFolder, setShowNewFolder] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [newProjectFolderId, setNewProjectFolderId] = useState(null)

  const handleCreate = async () => {
    if (!newTitle.trim()) return
    setCreating(true)
    await onCreate(newTitle.trim(), viewMode === 'folder' ? newProjectFolderId : null)
    setNewTitle(''); setNewProjectFolderId(null); setShowForm(false); setCreating(false)
  }

  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return
    await onCreateFolder(newFolderName.trim())
    setNewFolderName(''); setShowNewFolder(false)
  }

  const filtered = projects.filter(p =>
    !search || p.title.toLowerCase().includes(search.toLowerCase())
  )
  const topLevel = filtered.filter(p => !p.folder_id)
  const folderProjectMap = {}
  folders.forEach(f => { folderProjectMap[f.id] = filtered.filter(p => p.folder_id === f.id) })
  const sharedCardProps = { onOpen, onDelete, onRename, folders, onMoveToFolder }

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
          <div style={{ display: 'flex', border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
            <button onClick={() => setViewMode('folder')} style={{
              padding: '6px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
              background: viewMode === 'folder' ? '#6366f1' : '#fff',
              color: viewMode === 'folder' ? '#fff' : '#6b7280',
              fontWeight: viewMode === 'folder' ? 600 : 400,
            }}>📂 폴더 뷰</button>
            <button onClick={() => setViewMode('flat')} style={{
              padding: '6px 12px', fontSize: 12, border: 'none', cursor: 'pointer',
              background: viewMode === 'flat' ? '#6366f1' : '#fff',
              color: viewMode === 'flat' ? '#fff' : '#6b7280',
              fontWeight: viewMode === 'flat' ? 600 : 400,
            }}>📋 전체 뷰</button>
          </div>
          {isRegular() && viewMode === 'folder' && (
            <button className="btn-ghost" style={{ fontSize: 12 }} onClick={() => setShowNewFolder(true)}>+ 새 폴더</button>
          )}
          <button className="btn-primary" onClick={() => setShowForm(v => !v)}>
            {showForm ? '취소' : '+ 새 프로젝트'}
          </button>
        </div>
      </div>

      {showNewFolder && (
        <div className="pj-create-form">
          <input className="form-input" placeholder="폴더 이름" value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleCreateFolder(); if (e.key === 'Escape') setShowNewFolder(false) }}
            autoFocus style={{ flex: 1 }} />
          <button className="btn-primary" onClick={handleCreateFolder}>만들기</button>
          <button className="btn-ghost" onClick={() => { setShowNewFolder(false); setNewFolderName('') }}>취소</button>
        </div>
      )}

      {showForm && (
        <div className="pj-create-form">
          <input className="form-input" placeholder="프로젝트 이름 *" value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            autoFocus style={{ flex: 1 }} />
          {viewMode === 'folder' && (
            <select className="form-input" style={{ minWidth: 160, flex: 'none' }}
              value={newProjectFolderId ?? ''}
              onChange={e => setNewProjectFolderId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">폴더 없음 (최상위)</option>
              {folders.map(f => <option key={f.id} value={f.id}>📂 {f.name}</option>)}
            </select>
          )}
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

      {!loading && filtered.length > 0 && viewMode === 'folder' && (
        <div>
          {folders.map(folder => (
            <ProjectFolderBlock
              key={folder.id}
              folder={folder}
              projects={folderProjectMap[folder.id] || []}
              onRenameFolder={onRenameFolder}
              onDeleteFolder={onDeleteFolder}
              {...sharedCardProps}
            />
          ))}

          {topLevel.length > 0 && (
            <div>
              {folders.length > 0 && (
                <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1, margin: '4px 0 8px' }}>
                  📋 폴더 미지정
                </div>
              )}
              <div className="mg-proj-grid">
                {topLevel.map(p => <ProjectCard key={p.id} p={p} {...sharedCardProps} />)}
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && filtered.length > 0 && viewMode === 'flat' && (
        <div className="mg-proj-grid">
          {filtered.map(p => <ProjectCard key={p.id} p={p} {...sharedCardProps} />)}
        </div>
      )}
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
// EN(기준) 카피 히스토리 드로어 — CountryHistoryDrawer와 동일한 UI 패턴
// ════════════════════════════════════════════════════════════════
function EnHistoryDrawer({ projectId, onClose }) {
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState(null)

  useEffect(() => {
    api.mergeGetEnHistory(projectId)
      .then(res => { if (res.ok) setHistory(res.data) })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [projectId])

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
          <span className="mg-drawer-title">📋 EN (기준) — 수정 히스토리</span>
          <button className="cc-remove-btn" onClick={onClose} style={{ fontSize: 18 }}>✕</button>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>불러오는 중...</div>
        ) : history.length === 0 ? (
          <div className="empty-state" style={{ padding: 40 }}>
            <div className="empty-icon">📭</div>
            <p>아직 수정 이력이 없습니다.</p>
            <small>EN 기준 카피를 수정하면 이전 버전이 여기에 기록됩니다.</small>
          </div>
        ) : (
          <div className="mg-history-list">
            {history.map((h, i) => {
              const diffRows = parseSafe(h.diff_json)

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
                      {diffRows.length > 0 ? `변경 ${diffRows.length}건` : '변경 없음'}
                    </span>
                    <span className="mg-history-toggle">{expanded === i ? '▲ 접기' : '▼ 펼치기'}</span>
                  </div>

                  {expanded === i && (
                    <div className="mg-history-body">
                      <div className="mg-history-table-wrap">
                        {diffRows.length === 0 ? (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280', fontSize: '13px', background: '#f9fafb', borderRadius: '6px' }}>
                            이전 버전과 비교하여 변경된 행이 없습니다.
                          </div>
                        ) : (
                          <table className="mg-history-table">
                            <thead>
                              <tr>
                                <th style={{ width: 36 }}>#</th>
                                <th>EN (기준) — 수정된 행만</th>
                              </tr>
                            </thead>
                            <tbody>
                              {diffRows.map((row, idx) => (
                                <tr key={idx} className={row.new_en === null ? 'mg-cell-missing' : 'mg-cell-changed'}>
                                  <td style={{ textAlign: 'center', color: '#9ca3af', fontSize: 11, fontWeight: 'bold' }}>
                                    {row.row}
                                  </td>
                                  <td className="mg-history-local">
                                    <div className="mg-diff-view">
                                      <div className="mg-diff-old">
                                        <span className="mg-diff-label">AS-WAS:</span>
                                        <del>{row.prev_en || <em className="empty-val">빈 값</em>}</del>
                                      </div>
                                      <div className="mg-diff-new">
                                        <span className="mg-diff-label">TO-BE:</span>
                                        <ins>{row.new_en || <em className="empty-val">빈 값</em>}</ins>
                                      </div>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </div>
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
// 엑셀 일괄 가져오기 모달
// — 드래그/복사/붙여넣기를 국가마다 반복하는 대신, 엑셀 파일을
//   통째로 업로드하고 "원문(original copy) 컬럼"만 선택하면
//   1행의 V 표시로 자동 인식된 국가 컬럼들을 한번에 매핑한다.
// ════════════════════════════════════════════════════════════════
function ExcelImportModal({ onClose, onApply }) {
  const [fileName, setFileName]   = useState('')
  const [loading, setLoading]     = useState(false)
  const [error, setError]         = useState('')
  const [grid, setGrid]           = useState(null) // 2차원 배열 (전체)

  const [headerRowIndex, setHeaderRowIndex]         = useState(0)
  const [countryStartCol, setCountryStartCol]       = useState(null) // null = 국가 컬럼 없음
  const [originalCopyColIndex, setOriginalCopyColIndex] = useState(null)
  const [codeOverrides, setCodeOverrides]           = useState({}) // { colIndex: 'CA_FR' | '__exclude__' }

  const colLetter = (i) => {
    let s = '', n = i
    do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
    return s
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    setFileName(file.name)
    setLoading(true)
    setError('')
    setGrid(null)
    try {
      const dataUrl = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.onerror = () => reject(new Error('파일을 읽을 수 없습니다.'))
        r.readAsDataURL(file)
      })
      const res = await api.mergeParseExcel({ fileName: file.name, dataUrl })
      if (!res.ok) { setError(res.message || '파싱 실패'); return }
      const g = res.grid || []
      setGrid(g)

      // ── V 마커 자동 감지 (첫 5행 스캔) ──
      let vRow = -1, vCol = -1
      outer:
      for (let r = 0; r < Math.min(5, g.length); r++) {
        for (let c = 0; c < (g[r]?.length || 0); c++) {
          if ((g[r][c] || '').trim().toLowerCase() === 'v') { vRow = r; vCol = c; break outer }
        }
      }
      if (vRow !== -1) {
        setHeaderRowIndex(vRow + 1 < g.length ? vRow + 1 : vRow)
        setCountryStartCol(vCol)
      } else {
        setHeaderRowIndex(0)
        setCountryStartCol(null)
      }
      setOriginalCopyColIndex(null)
      setCodeOverrides({})
    } catch (e) {
      setError(e.message || '파일 처리 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const headerRow = grid?.[headerRowIndex] || []
  const dataStartRow = headerRowIndex + 1
  const previewRows = grid ? grid.slice(dataStartRow, dataStartRow + 5) : []
  const colCount = grid ? Math.max(...grid.map(r => r.length), 0) : 0

  // 컬럼별 매칭된 국가 코드 (countryStartCol 이상인 컬럼만 대상)
  const resolveCountryCode = (colIdx) => {
    if (codeOverrides[colIdx] === '__exclude__') return null
    if (codeOverrides[colIdx]) return codeOverrides[colIdx]
    const headerText = (headerRow[colIdx] || '').trim()
    if (!headerText) return null
    const matched = ALL_SITES.find(s => s.code.toUpperCase() === headerText.toUpperCase())
    return matched ? matched.code : null
  }

  const countryColumns = countryStartCol == null ? [] :
    Array.from({ length: colCount - countryStartCol }, (_, i) => countryStartCol + i)
      .map(colIdx => ({ colIdx, code: resolveCountryCode(colIdx), headerText: headerRow[colIdx] || '' }))

  const canApply = grid && originalCopyColIndex != null && countryColumns.some(c => c.code)

  const handleApply = () => {
    if (!canApply) return
    // 셀 안에 Alt+Enter 줄바꿈(\n, \r\n)이 있으면 공백으로 치환한다.
    // 이 아래에서 행과 행 사이를 '\n'으로 join해 하나의 텍스트로 만들고,
    // 이후 parseEnLines/parseConfirmedPaste가 그 텍스트를 다시 '\n' 기준으로
    // 쪼개 "줄 = 행"으로 취급하기 때문에, 셀 내부 줄바꿈을 남겨두면
    // 원래 한 행(한 셀)이 여러 행으로 쪼개져 국가별 매핑이 밀려버린다.
    const norm = v => (v ?? '').toString().replace(/\r\n|\r|\n/g, ' ').trim()
    const validRows = grid.slice(dataStartRow).filter(row => norm(row[originalCopyColIndex]) !== '')
    const enLines = validRows.map(row => norm(row[originalCopyColIndex])).join('\n')

    const countryPasteMap = {}
    countryColumns.forEach(({ colIdx, code }) => {
      if (!code) return
      countryPasteMap[code] = validRows
        .map(row => `${norm(row[originalCopyColIndex])}\t${norm(row[colIdx])}`)
        .join('\n')
    })
    onApply(enLines, countryPasteMap)
  }

  return (
    <>
      <style>{`
        .mg-excel-modal-backdrop {
          position: fixed; inset: 0; background: rgba(0,0,0,.55);
          display: flex; align-items: center; justify-content: center; z-index: 9999;
        }
        .mg-excel-modal {
          background: #fff; border-radius: 12px; width: 880px; max-width: 94vw;
          max-height: 88vh; display: flex; flex-direction: column;
          box-shadow: 0 24px 64px rgba(0,0,0,.3); overflow: hidden;
        }
        .mg-excel-modal-header {
          padding: 16px 20px; border-bottom: 1px solid #e5e7eb;
          display: flex; align-items: center; justify-content: space-between;
        }
        .mg-excel-modal-title { font-size: 15px; font-weight: 700; color: #111827; }
        .mg-excel-modal-close { background: none; border: none; font-size: 16px; cursor: pointer; color: #6b7280; }
        .mg-excel-modal-body { padding: 18px 20px; overflow-y: auto; flex: 1; }
        .mg-excel-step-label { font-size: 12px; font-weight: 700; color: #4f46e5; margin-bottom: 6px; }
        .mg-excel-hint { font-size: 11px; color: #9ca3af; margin-top: 4px; }
        .mg-excel-row-picker { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
        .mg-excel-row-btn {
          font-size: 11px; padding: 3px 9px; border-radius: 5px; border: 1px solid #d1d5db;
          background: #f9fafb; cursor: pointer; color: #374151;
        }
        .mg-excel-row-btn.active { background: #4f46e5; border-color: #4f46e5; color: #fff; }
        .mg-excel-table-wrap { overflow-x: auto; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 14px; }
        .mg-excel-table { border-collapse: collapse; font-size: 11px; width: max-content; min-width: 100%; }
        .mg-excel-table th, .mg-excel-table td {
          border: 1px solid #f0f1f3; padding: 5px 8px; white-space: nowrap;
          max-width: 220px; overflow: hidden; text-overflow: ellipsis;
        }
        .mg-excel-col-btn {
          display: block; width: 100%; background: none; border: none; cursor: pointer;
          font-size: 11px; font-weight: 600; color: #374151; text-align: left; padding: 0;
        }
        .mg-excel-col-btn:hover { color: #4f46e5; }
        .mg-excel-col-header { background: #f9fafb; }
        .mg-excel-col-header.is-original { background: #dcfce7; }
        .mg-excel-col-header.is-country { background: #dbeafe; }
        .mg-excel-col-header.is-excluded { background: #f3f4f6; opacity: .5; }
        .mg-excel-badge {
          display: inline-block; font-size: 9px; padding: 1px 5px; border-radius: 8px;
          margin-left: 4px; font-weight: 600;
        }
        .mg-excel-badge.original { background: #16a34a; color: #fff; }
        .mg-excel-badge.country { background: #2563eb; color: #fff; }
        .mg-excel-badge.warn { background: #f59e0b; color: #fff; }
        .mg-excel-country-list { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
        .mg-excel-country-item {
          display: flex; align-items: center; gap: 8px; font-size: 12px;
          padding: 5px 10px; border: 1px solid #e5e7eb; border-radius: 6px; background: #fafafa;
        }
        .mg-excel-country-select { font-size: 11px; padding: 2px 6px; border-radius: 4px; border: 1px solid #d1d5db; }
        .mg-excel-modal-footer {
          padding: 14px 20px; border-top: 1px solid #e5e7eb;
          display: flex; align-items: center; justify-content: flex-end; gap: 8px;
        }
        .mg-excel-stepper { display: inline-flex; align-items: center; gap: 6px; }
        .mg-excel-stepper button {
          width: 22px; height: 22px; border-radius: 4px; border: 1px solid #d1d5db;
          background: #fff; cursor: pointer; font-size: 12px;
        }
      `}</style>
      <div className="mg-excel-modal-backdrop" onClick={onClose}>
        <div className="mg-excel-modal" onClick={e => e.stopPropagation()}>
          <div className="mg-excel-modal-header">
            <span className="mg-excel-modal-title">📊 엑셀에서 한번에 가져오기</span>
            <button className="mg-excel-modal-close" onClick={onClose}>✕</button>
          </div>

          <div className="mg-excel-modal-body">
            {!grid && (
              <>
                <div className="mg-excel-step-label">1. 엑셀 파일 선택</div>
                <input type="file" accept=".xlsx,.xls" onChange={handleFile} disabled={loading} />
                {loading && <div className="mg-excel-hint">파일을 불러오는 중... (NASCA DRM 우회 처리 포함, 수 초~수십 초 소요될 수 있습니다)</div>}
                {error && <div className="mg-excel-hint" style={{ color: '#dc2626' }}>⚠ {error}</div>}
                <div className="mg-excel-hint">
                  1행에서 시작하는 V 표시를 기준으로 그 오른쪽 컬럼들을 국가(로컬) 필드로 자동 인식합니다.
                </div>
              </>
            )}

            {grid && (
              <>
                <div className="mg-excel-step-label">
                  2. 헤더 행 선택 <span className="mg-excel-hint" style={{ marginLeft: 6 }}>({fileName})</span>
                </div>
                <div className="mg-excel-row-picker">
                  {Array.from({ length: Math.min(6, grid.length) }, (_, i) => (
                    <button key={i}
                      className={`mg-excel-row-btn${headerRowIndex === i ? ' active' : ''}`}
                      onClick={() => { setHeaderRowIndex(i); setOriginalCopyColIndex(null) }}>
                      {i + 1}행: {(grid[i] || []).slice(0, 4).filter(Boolean).join(' / ') || '(빈 행)'}
                    </button>
                  ))}
                </div>

                <div className="mg-excel-step-label">
                  3. 원문(영문) 컬럼 선택 — 아래 표에서 컬럼명을 클릭하세요
                </div>
                <div className="mg-excel-table-wrap">
                  <table className="mg-excel-table">
                    <thead>
                      <tr>
                        {Array.from({ length: colCount }, (_, c) => {
                          const isOriginal = c === originalCopyColIndex
                          const isCountry  = countryStartCol != null && c >= countryStartCol
                          const excluded   = isCountry && codeOverrides[c] === '__exclude__'
                          const code = isCountry ? resolveCountryCode(c) : null
                          return (
                            <th key={c}
                              className={`mg-excel-col-header ${isOriginal ? 'is-original' : ''} ${isCountry ? 'is-country' : ''} ${excluded ? 'is-excluded' : ''}`}>
                              <div style={{ fontSize: 9, color: '#9ca3af', fontWeight: 400 }}>{colLetter(c)}</div>
                              <button className="mg-excel-col-btn" onClick={() => setOriginalCopyColIndex(c)}>
                                {headerRow[c] || '(빈 헤더)'}
                              </button>
                              {isOriginal && <span className="mg-excel-badge original">원문</span>}
                              {isCountry && !excluded && (
                                code
                                  ? <span className="mg-excel-badge country">{code}</span>
                                  : <span className="mg-excel-badge warn">코드 불명</span>
                              )}
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

                <div className="mg-excel-step-label">
                  4. 국가 컬럼 시작 위치 {countryStartCol == null && <span style={{ color: '#f59e0b' }}>(V 표시를 찾지 못했습니다 — 직접 지정하세요)</span>}
                </div>
                <div className="mg-excel-stepper" style={{ marginBottom: 14 }}>
                  <button onClick={() => setCountryStartCol(c => Math.max(0, (c ?? colCount) - 1))}>◀</button>
                  <span style={{ fontSize: 12 }}>
                    {countryStartCol == null ? '지정 안 됨' : `${colLetter(countryStartCol)}열부터`}
                  </span>
                  <button onClick={() => setCountryStartCol(c => Math.min(colCount - 1, (c ?? -1) + 1))}>▶</button>
                  {countryStartCol == null && (
                    <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => setCountryStartCol(0)}>직접 지정</button>
                  )}
                </div>

                {countryColumns.length > 0 && (
                  <>
                    <div className="mg-excel-step-label">5. 인식된 국가 컬럼 확인 / 수정</div>
                    <div className="mg-excel-country-list">
                      {countryColumns.map(({ colIdx, code, headerText }) => (
                        <div key={colIdx} className="mg-excel-country-item">
                          <span style={{ fontWeight: 600 }}>{colLetter(colIdx)}열</span>
                          <span style={{ color: '#6b7280' }}>"{headerText || '(빈 헤더)'}"</span>
                          <span>→</span>
                          <select className="mg-excel-country-select"
                            value={codeOverrides[colIdx] ?? (code || '')}
                            onChange={e => setCodeOverrides(prev => ({ ...prev, [colIdx]: e.target.value || '__exclude__' }))}>
                            <option value="__exclude__">제외</option>
                            {ALL_SITES.map(s => (
                              <option key={s.code} value={s.code}>{s.code} — {s.name}</option>
                            ))}
                          </select>
                          {!code && <span className="mg-excel-badge warn">자동 인식 실패</span>}
                        </div>
                      ))}
                    </div>
                  </>
                )}

                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setGrid(null); setFileName('') }}>
                  ↩ 다른 파일 선택
                </button>
              </>
            )}
          </div>

          <div className="mg-excel-modal-footer">
            <button className="btn-ghost" onClick={onClose}>취소</button>
            <button className="btn-primary" disabled={!canApply} onClick={handleApply}>
              적용 ({countryColumns.filter(c => c.code).length}개국 매핑)
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

// ════════════════════════════════════════════════════════════════
// 프로젝트 상세 뷰
// ════════════════════════════════════════════════════════════════
function ProjectDetailView({ project, products, onBack, onUpdated }) {
  // mergeResult = { matrix, dntIssues, baseEnLines, activeCountries } | null(빈 프로젝트)
  const [mergeResult, setMergeResult] = useState(null)
  const [error, setError]             = useState('')
  const [loading, setLoading]         = useState(true)
  const [idSeq, setIdSeq]             = useState(1)
  const [editTitle, setEditTitle]     = useState(false)
  const [titleVal, setTitleVal]       = useState(project.title)

  // ── 검색 상태 ─────────────────────────────────────────────
  const [globalSearch, setGlobalSearch]     = useState('')
  const [perCountrySearch, setPerCountrySearch] = useState({}) // { [countryId]: string }

  // ── 엑셀 재업로드(합집합 병합) 충돌 모달 상태 ─────────────────
  const [importConflictModal, setImportConflictModal] = useState(null)
  // importConflictModal = { conflicts, unionEnLines, matrix, activeCountries }
  const [showExcelImport, setShowExcelImport] = useState(false)

  // ── 자동 저장 상태 ('idle' | 'editing' | 'saving' | 'saved' | 'error') ──
  const [saveStatus, setSaveStatus] = useState('idle')
  const mrRef = useRef(null)
  useEffect(() => { mrRef.current = mergeResult }, [mergeResult])
  const enTimer = useRef(null)
  const countryTimers = useRef({})

  // ── 국가별 히스토리 드로어 ───────────────────────────────────
  const [historyCountry, setHistoryCountry] = useState(null)
  const [showEnHistory, setShowEnHistory] = useState(false)

  // 상세 로드 — 저장된 결과가 있으면 바로 표(그리드)로 표시
  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.mergeGetProject(project.id)
      if (!res.ok) return
      const baseEnLines = parseEnLines(res.project.en_lines || '')
      const activeCountries = (res.countries || []).map(c => ({
        id: `db_${c.id}`, dbId: c.id, label: c.label, isSaved: true,
      }))
      const matrix = {}
      ;(res.countries || []).forEach(c => {
        const id = `db_${c.id}`
        let mapped = []
        try {
          const mj = c.mapped_json
          mapped = Array.isArray(mj) ? mj : typeof mj === 'string' ? JSON.parse(mj) : (mj || [])
        } catch { mapped = [] }
        matrix[id] = mapped
      })

      if (baseEnLines.length === 0 && activeCountries.length === 0) {
        // 완전히 빈 프로젝트 — Extract 탭 등에서 넘어온 프리필이 있는지 확인
        const saved = localStorage.getItem(LS_EN_KEY)
        if (saved) {
          localStorage.removeItem(LS_EN_KEY)
          const seeded = parseEnLines(saved)
          setMergeResult({ matrix: {}, dntIssues: [], baseEnLines: seeded, activeCountries: [] })
          api.mergeUpdateProject(project.id, { enLines: seeded.join('\n') }).catch(() => {})
          setLoading(false)
          return
        }
        setMergeResult(null)
        setLoading(false)
        return
      }

      setMergeResult({ matrix, dntIssues: [], baseEnLines, activeCountries })
    } catch (e) { console.error(e) }
    finally { setLoading(false) }
  }, [project.id])

  useEffect(() => { load() }, [load])

  // mergeResult의 행/국가 개수가 바뀌면 검색 초기화
  useEffect(() => {
    setGlobalSearch('')
    setPerCountrySearch({})
  }, [mergeResult?.baseEnLines?.length, mergeResult?.activeCountries?.length])

  // ── 자동 저장 ────────────────────────────────────────────────
  const scheduleSaveEnLines = () => {
    setSaveStatus('editing')
    if (enTimer.current) clearTimeout(enTimer.current)
    enTimer.current = setTimeout(async () => {
      const mr = mrRef.current
      if (!mr) return
      setSaveStatus('saving')
      try {
        await api.mergeUpdateProject(project.id, { enLines: mr.baseEnLines.join('\n') })
        setSaveStatus('saved')
        onUpdated()
      } catch (e) {
        console.error(e)
        setSaveStatus('error')
      }
    }, 500)
  }

  const scheduleSaveCountry = (countryId) => {
    setSaveStatus('editing')
    if (countryTimers.current[countryId]) clearTimeout(countryTimers.current[countryId])
    countryTimers.current[countryId] = setTimeout(async () => {
      const mr = mrRef.current
      if (!mr) return
      const c = mr.activeCountries.find(x => x.id === countryId)
      if (!c) return
      const rows = (mr.matrix[countryId] || []).map((r, i) => ({
        en: mr.baseEnLines[i] ?? r.en, local: r.local, missing: !r.local,
      }))
      const rawPaste = rows.map(r => `${r.en}\t${r.local}`).join('\n')
      const mappedJson = JSON.stringify(rows)
      setSaveStatus('saving')
      try {
        const res = await api.mergeUpsertCountry(project.id, {
          countryId: c.dbId || null, label: c.label, rawPaste, mappedJson,
        })
        if (res.ok && !c.dbId) {
          setMergeResult(prev => ({
            ...prev,
            activeCountries: prev.activeCountries.map(x =>
              x.id === countryId ? { ...x, dbId: res.id ?? x.dbId, isSaved: true } : x
            ),
          }))
        }
        setSaveStatus('saved')
        onUpdated()
      } catch (e) {
        console.error(e)
        setSaveStatus('error')
      }
    }, 500)
  }

  // ── 셀 편집 ──────────────────────────────────────────────────
  const updateEnCell = (rowIndex, value) => {
    setMergeResult(prev => {
      const baseEnLines = [...prev.baseEnLines]
      baseEnLines[rowIndex] = value
      return { ...prev, baseEnLines }
    })
    scheduleSaveEnLines()
  }

  const updateCountryCell = (countryId, rowIndex, value) => {
    setMergeResult(prev => {
      const rows = [...(prev.matrix[countryId] || [])]
      rows[rowIndex] = { en: prev.baseEnLines[rowIndex] ?? '', local: value, missing: !value }
      return { ...prev, matrix: { ...prev.matrix, [countryId]: rows } }
    })
    scheduleSaveCountry(countryId)
  }

  // ── 행 추가/삭제 ─────────────────────────────────────────────
  const addRow = () => {
    setMergeResult(prev => {
      const baseEnLines = [...(prev?.baseEnLines || []), '']
      const activeCountries = prev?.activeCountries || []
      const matrix = { ...(prev?.matrix || {}) }
      activeCountries.forEach(c => {
        matrix[c.id] = [...(matrix[c.id] || []), { en: '', local: '', missing: true }]
      })
      return { matrix, dntIssues: prev?.dntIssues || [], baseEnLines, activeCountries }
    })
    scheduleSaveEnLines()
  }

  const removeRow = (rowIndex) => {
    if (!window.confirm('이 행을 삭제하시겠습니까?')) return
    const touchedCountries = mergeResult?.activeCountries || []
    setMergeResult(prev => {
      const baseEnLines = prev.baseEnLines.filter((_, i) => i !== rowIndex)
      const matrix = {}
      prev.activeCountries.forEach(c => {
        matrix[c.id] = (prev.matrix[c.id] || []).filter((_, i) => i !== rowIndex)
      })
      return { ...prev, baseEnLines, matrix }
    })
    scheduleSaveEnLines()
    touchedCountries.forEach(c => scheduleSaveCountry(c.id))
  }

  // ── 국가 추가/삭제 ───────────────────────────────────────────
  const addCountry = (site) => {
    const id = `new_${idSeq}`
    setIdSeq(n => n + 1)
    const label = site?.code ?? `국가${idSeq}`
    setMergeResult(prev => {
      const baseEnLines = prev?.baseEnLines || []
      const rows = baseEnLines.map(en => ({ en, local: '', missing: true }))
      return {
        matrix: { ...(prev?.matrix || {}), [id]: rows },
        dntIssues: prev?.dntIssues || [],
        baseEnLines,
        activeCountries: [...(prev?.activeCountries || []), { id, dbId: null, label, isSaved: false }],
      }
    })
    scheduleSaveCountry(id)
  }

  const removeCountry = async (id) => {
    if (!isRegular()) { alert('권한이 없습니다.'); return }
    const c = mergeResult?.activeCountries.find(x => x.id === id)
    if (!c) return
    if (!window.confirm(`${c.label} 국가를 삭제하시겠습니까?`)) return
    if (countryTimers.current[id]) { clearTimeout(countryTimers.current[id]); delete countryTimers.current[id] }
    if (c.dbId) {
      try { await api.mergeDeleteCountry(project.id, c.dbId) } catch (e) { console.error(e) }
    }
    setMergeResult(prev => {
      const matrix = { ...prev.matrix }
      delete matrix[id]
      return { ...prev, matrix, activeCountries: prev.activeCountries.filter(x => x.id !== id) }
    })
    onUpdated()
  }

  // ── 엑셀 업로드 → 합집합 병합 ────────────────────────────────
  /**
   *  - 기존에 없던 EN 행(새 카피)      → 그대로 뒤에 추가 (합집합, 충돌 아님)   [경우 1, 3]
   *  - 기존에 없던 국가(새 카피덱)      → 국가 열 새로 추가, 충돌 없이 매핑     [경우 1, 3]
   *  - 기존 행인데 그 국가 값이 비어있음 → 새 값으로 채움 (합집합, 충돌 아님)    [경우 1, 3]
   *  - 기존 행 + 값 있음 + 새 값도 있음 + 서로 다름 → 충돌 목록에 수집          [경우 2]
   *  - 새 파일에 해당 행 자체가 없거나 빈 칸 → 기존 값 그대로 유지
   *  (mergeResult가 비어있어도 그대로 동작 — existingBase가 빈 배열일 뿐이라
   *   모든 값이 "비어있음 → 채움" 경로로 처리되어 최초 업로드와 결과가 같다.)
   */
  const buildExcelUnionMerge = (newEnLinesJoined, countryPasteMap) => {
    const newEnLines = parseEnLines(newEnLinesJoined)
    const existingBase = mergeResult?.baseEnLines || []
    const existingMatrix = mergeResult?.matrix || {}
    const existingSet = new Set(existingBase.map(en => en.trim()))

    const seenNew = new Set()
    const appendedEn = []
    newEnLines.forEach(en => {
      const key = en.trim()
      if (existingSet.has(key) || seenNew.has(key)) return
      seenNew.add(key)
      appendedEn.push(en)
    })
    const unionEnLines = [...existingBase, ...appendedEn]

    const matrix = {}
    const conflicts = []
    const touchedIds = new Set()
    let seq = idSeq
    const activeCountries = [...(mergeResult?.activeCountries || [])]

    Object.entries(countryPasteMap).forEach(([code, rawPaste]) => {
      const pairs = parseConfirmedPaste(rawPaste)
      if (pairs.length === 0) return
      const consume = makePairConsumer(pairs)

      let matched = activeCountries.find(c => (c.label || '').toUpperCase() === code.toUpperCase())
      if (!matched) {
        const id = `new_${seq}`; seq += 1
        matched = { id, dbId: null, label: code, isSaved: false }
        activeCountries.push(matched)
      }
      touchedIds.add(matched.id)

      const existingRows = existingMatrix[matched.id] || []
      matrix[matched.id] = unionEnLines.map((en, i) => {
        const existingLocal = (existingRows[i]?.local ?? '').trim()
        const newLocal = consume(en)
        const newLocalTrim = (newLocal ?? '').trim()

        if (newLocal === undefined || newLocalTrim === '') {
          return { en, local: existingRows[i]?.local ?? '', missing: !(existingRows[i]?.local) }
        }
        if (!existingLocal) {
          return { en, local: newLocal, missing: false }
        }
        if (existingLocal === newLocalTrim) {
          return { en, local: existingRows[i].local, missing: false }
        }
        conflicts.push({
          countryId: matched.id, countryLabel: matched.label,
          rowIndex: i, en, existingLocal: existingRows[i].local, newLocal,
        })
        return { en, local: existingRows[i].local, missing: false }
      })
    })

    activeCountries.forEach(c => {
      if (touchedIds.has(c.id)) return
      const existingRows = existingMatrix[c.id] || []
      matrix[c.id] = unionEnLines.map((en, i) => existingRows[i] ?? { en, local: '', missing: true })
    })

    setIdSeq(seq)
    return { unionEnLines, matrix, conflicts, activeCountries }
  }

  const commitExcelReimport = useCallback(async (unionEnLines, matrix, activeCountries) => {
    setSaveStatus('saving')
    setError('')
    try {
      const enLinesJoined = unionEnLines.join('\n')

      const dntIssues = []
      activeCountries.forEach(c => {
        (matrix[c.id] || []).forEach((m, i) => {
          if (!m.local || m.missing) return
          const issues = checkDNT(m.en, m.local, products)
          if (issues.length) dntIssues.push({ countryLabel: c.label, row: i + 1, enText: m.en, issues })
        })
      })

      setMergeResult({ matrix, dntIssues, baseEnLines: unionEnLines, activeCountries })

      await api.mergeUpdateProject(project.id, { enLines: enLinesJoined })

      const savedCountries = []
      for (const c of activeCountries) {
        const rows = matrix[c.id] || []
        const rawPaste = rows.map(r => `${r.en}\t${r.local}`).join('\n')
        const mappedJson = JSON.stringify(rows)
        const res = await api.mergeUpsertCountry(project.id, {
          countryId: c.dbId || null, label: c.label, rawPaste, mappedJson,
        })
        savedCountries.push({
          ...c,
          dbId: res.ok ? (res.id ?? c.dbId) : c.dbId,
          isSaved: res.ok ? true : c.isSaved,
        })
      }
      setMergeResult(prev => ({ ...prev, activeCountries: savedCountries }))
      setSaveStatus('saved')
      onUpdated()
      await load()
    } catch (e) {
      console.error(e)
      setSaveStatus('error')
      setError('엑셀 업로드 저장 중 오류가 발생했습니다.')
    }
  }, [project.id, products, onUpdated, load])

  const handleImportConflictConfirm = (choices) => {
    const { conflicts, unionEnLines, matrix, activeCountries } = importConflictModal
    const finalMatrix = { ...matrix }
    conflicts.forEach((c, i) => {
      const rows = [...(finalMatrix[c.countryId] || [])]
      const choice = choices[i] ?? 'keep'
      rows[c.rowIndex] = choice === 'replace'
        ? { en: c.en, local: c.newLocal.trim(), missing: !c.newLocal.trim() }
        : { en: c.en, local: c.existingLocal, missing: !c.existingLocal }
      finalMatrix[c.countryId] = rows
    })
    setImportConflictModal(null)
    commitExcelReimport(unionEnLines, finalMatrix, activeCountries)
  }
  const handleImportConflictCancel = () => setImportConflictModal(null)

  const applyExcelImport = (enLinesJoined, countryPasteMap) => {
    const { unionEnLines, matrix, conflicts, activeCountries } = buildExcelUnionMerge(enLinesJoined, countryPasteMap)
    setShowExcelImport(false)
    if (conflicts.length > 0) {
      setImportConflictModal({ conflicts, unionEnLines, matrix, activeCountries })
      return
    }
    commitExcelReimport(unionEnLines, matrix, activeCountries)
  }

  const handleRename = async () => {
    if (!titleVal.trim()) return
    await api.mergeUpdateProject(project.id, {
      title: titleVal.trim(),
      enLines: (mergeResult?.baseEnLines || []).join('\n'),
    })
    setEditTitle(false); onUpdated()
  }

  const handleExport = () => {
    if (!mergeResult) return
    exportCSV(
      mergeResult.baseEnLines,
      (mergeResult.activeCountries || []).map(c => ({ ...c, mappedJson: JSON.stringify(mergeResult.matrix[c.id] || []) })),
      project.title
    )
  }

  if (loading) return <div className="loading" style={{ padding: 60, textAlign: 'center' }}>불러오는 중...</div>

  const activeCountries = mergeResult?.activeCountries || []
  const baseEnLines = mergeResult?.baseEnLines || []

  // ── 검색 필터링 ──────────────────────────────────────────────
  const gq = globalSearch.trim().toLowerCase()
  const filteredIndices = baseEnLines.reduce((acc, en, i) => {
    if (!gq) { acc.push(i); return acc }
    if (en.toLowerCase().includes(gq)) { acc.push(i); return acc }
    const anyMatch = activeCountries.some(c => (mergeResult.matrix[c.id]?.[i]?.local ?? '').toLowerCase().includes(gq))
    if (anyMatch) acc.push(i)
    return acc
  }, [])

  const saveStatusText = {
    idle: '', editing: '편집 중…', saving: '저장 중…',
    saved: '모든 변경사항 저장됨', error: '저장 실패 — 다시 시도해주세요',
  }[saveStatus]

  return (
    <div className="mg-detail-view">
      {/* ── 엑셀 재업로드 충돌 확인 모달 ── */}
      {importConflictModal && (
        <ImportConflictModal
          conflicts={importConflictModal.conflicts}
          onConfirm={handleImportConflictConfirm}
          onCancel={handleImportConflictCancel}
        />
      )}

      {historyCountry && (
        <CountryHistoryDrawer
          projectId={project.id}
          country={historyCountry}
          onClose={() => setHistoryCountry(null)}
        />
      )}

      {showEnHistory && (
        <EnHistoryDrawer
          projectId={project.id}
          onClose={() => setShowEnHistory(false)}
        />
      )}

      {showExcelImport && (
        <ExcelImportModal
          onClose={() => setShowExcelImport(false)}
          onApply={applyExcelImport}
        />
      )}

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

      {error && <div className="error-banner" style={{ margin: '10px 0' }}>{error}</div>}

      {/* ── 툴바 ── */}
      <div className="mg-toolbar">
        <button className="btn-ghost mg-excel-import-btn" onClick={() => setShowExcelImport(true)}>
          📊 엑셀 업로드
        </button>
        <button className="btn-ghost" onClick={addRow}>+ 행 추가</button>
        <SiteDropdown
          label="+ 국가 추가"
          excludeCodes={activeCountries.map(c => c.label)}
          onAdd={addCountry}
        />
        {mergeResult && (
          <>
            <span className="cc-scroll-hint">← 가로 스크롤 →</span>
            <button className="btn-export" onClick={handleExport}>⬇ Excel 추출</button>
          </>
        )}
        <span className={`mg-save-status ${saveStatus === 'saving' || saveStatus === 'editing' ? 'is-saving' : ''} ${saveStatus === 'error' ? 'is-error' : ''}`}>
          {saveStatusText}
        </span>
      </div>

      {/* DNT 이슈 (엑셀 재업로드로 계산된 것) */}
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

      {!mergeResult ? (
        <div className="mg-empty-grid-state">
          <div className="empty-icon">📋</div>
          <p>아직 카피가 없습니다</p>
          <small>엑셀을 업로드하거나 "+ 행 추가"로 직접 입력해 시작하세요.</small>
        </div>
      ) : (
        <section className="mg-result-section">
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
            {(globalSearch || Object.values(perCountrySearch).some(v => v)) && (
              <button className="act-btn act-cancel" style={{ fontSize: 12, whiteSpace: 'nowrap' }}
                onClick={() => { setGlobalSearch(''); setPerCountrySearch({}) }}>
                ✕ 검색 초기화
              </button>
            )}
            {gq && (
              <span style={{ fontSize: 12, color: '#6b7280', whiteSpace: 'nowrap' }}>
                {filteredIndices.length}/{baseEnLines.length}건
              </span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: '#6b7280' }}>
              {baseEnLines.length}행 · {activeCountries.length}개국
            </span>
          </div>

          <div className="cc-table-wrap">
            <table className="cc-table mg-table">
              <thead>
                <tr>
                  <th className="cc-th cc-th-idx">#</th>
                  <th className="cc-th mg-th-en">
                    <span className="cc-th-name">
                      EN (기준)
                      <button className="mg-country-hist-btn" onClick={() => setShowEnHistory(true)} title="히스토리">🕐</button>
                    </span>
                  </th>
                  {activeCountries.map(c => (
                    <th key={c.id} className="cc-th mg-th-local">
                      <div className="cc-th-inner">
                        <span className="cc-th-name">
                          {c.label}
                          {c.dbId && (
                            <button className="mg-country-hist-btn" onClick={() => setHistoryCountry(c)} title="히스토리">🕐</button>
                          )}
                          {isRegular() && (
                            <button className="mg-country-del-btn" onClick={() => removeCountry(c.id)} title="국가 삭제">✕</button>
                          )}
                        </span>
                        <div className="mg-th-search">
                          <span className="mg-th-search-icon">🔍</span>
                          <input
                            className="mg-th-search-input"
                            placeholder="검색"
                            value={perCountrySearch[c.id] ?? ''}
                            onClick={e => e.stopPropagation()}
                            onChange={e => {
                              setGlobalSearch('')
                              setPerCountrySearch(prev => ({ ...prev, [c.id]: e.target.value }))
                            }}
                          />
                        </div>
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredIndices.map(i => {
                  const en = baseEnLines[i]

                  const perCountryVisible = (c) => {
                    const pq = (perCountrySearch[c.id] ?? '').trim().toLowerCase()
                    if (!pq) return true
                    const local = (mergeResult.matrix[c.id]?.[i]?.local ?? '').toLowerCase()
                    return local.includes(pq) || en.toLowerCase().includes(pq)
                  }
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
                      detectServiceIssues(local, c.label).length > 0
                    )
                  })

                  return (
                    <tr key={i} className={rowHasIssue ? 'cc-row-issue' : ''}>
                      <td className="cc-td cc-td-idx">
                        {i + 1}
                        <button className="mg-row-del-btn" onClick={() => removeRow(i)} title="행 삭제">✕</button>
                      </td>
                      <td className="cc-td mg-td-en">
                        <div
                          className="mg-en-text"
                          contentEditable
                          suppressContentEditableWarning
                          onBlur={e => {
                            const val = e.currentTarget.textContent.trim()
                            if (val !== en) updateEnCell(i, val)
                          }}
                        >{en}</div>
                      </td>
                      {activeCountries.map(c => {
                        const m = mergeResult.matrix[c.id]?.[i]
                        const dntIss        = m?.local ? checkDNT(en, m.local, products) : []
                        const urlIss        = m?.local ? checkUrlSiteCode(m.local, c.label) : []
                        const isTBD         = hasTBDorNA(m?.local)
                        const isMissing     = m?.missing || !m
                        const unreleased    = (!isMissing && m?.local) ? checkUnreleased(m.local, c.label, products) : []
                        const dntMismatch   = (!isMissing && m?.local) ? checkDNTCountMismatch(en, m.local, c.label, products) : null
                        const svcIssues     = (!isMissing && m?.local) ? detectServiceIssues(m.local, c.label) : []

                        const hasAnyIssue = dntIss.length || urlIss.length || unreleased.length || dntMismatch || svcIssues.length
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
                            <div
                              className="mg-local-text"
                              contentEditable
                              suppressContentEditableWarning
                              style={isTBD ? { fontWeight: 700, color: '#b45309' } : {}}
                              onBlur={e => {
                                const val = e.currentTarget.textContent.trim()
                                if (val !== (m?.local ?? '')) updateCountryCell(c.id, i, val)
                              }}
                            >{m?.local ?? ''}</div>
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
        </section>
      )}
    </div>
  )
}

// ════════════════════════════════════════════════════════════════
// 메인
// ════════════════════════════════════════════════════════════════
export default function MergeTab({ resetKey }) {
  const { dbReady }                   = useDB()
  const [projects, setProjects]       = useState([])
  const [folders, setFolders]         = useState([])
  const [projLoading, setProjLoading] = useState(false)
  const [openProject, setOpenProject] = useState(null)
  const [products, setProducts]       = useState([])

  // 상단 네비게이션의 "Copy Merge" 탭을 이미 이 탭에 있는 상태에서 다시 클릭하면
  // (App.jsx에서 resetKey가 증가) 프로젝트 상세 화면에 있어도 목록으로 돌아감
  useEffect(() => {
    if (resetKey) setOpenProject(null)
  }, [resetKey])

  const loadProjects = useCallback(async () => {
    if (!dbReady) return
    setProjLoading(true)
    try {
      const res = await api.mergeListProjects()
      if (res.ok) {
        setProjects(res.data)
        setFolders(res.folders || [])
      }
    } catch (e) { console.error(e) }
    finally { setProjLoading(false) }
  }, [dbReady])

  useEffect(() => { loadProjects() }, [loadProjects])
  useEffect(() => {
    api.getProducts().then(res => { if (res.ok) setProducts(res.data) }).catch(() => {})
  }, [])

  const handleCreate = async (title, folderId) => {
    const res = await api.mergeCreateProject({ title, enLines: '' })
    if (res.ok) {
      if (folderId) await api.mergeMoveProjectToFolder(res.id, { folderId })
      await loadProjects()
      setOpenProject({ id: res.id, title })
    }
  }
  const handleDelete = async (id, title) => {
    if (!isRegular()) { alert('권한이 없습니다.'); return }
    if (!window.confirm(`"${title}" 프로젝트를 삭제하시겠습니까?`)) return
    await api.mergeDeleteProject(id)
    if (openProject?.id === id) setOpenProject(null)
    loadProjects()
  }
  const handleRenameProject = async (id, newTitle) => {
    if (!isRegular()) { alert('권한이 없습니다.'); return }
    try {
      await api.mergeUpdateProject(id, { title: newTitle })
      setProjects(prev => prev.map(p => p.id === id ? { ...p, title: newTitle } : p))
    } catch (e) { console.error('[Merge] 프로젝트 이름 수정 실패:', e?.message || e) }
  }
  const handleBack = () => { setOpenProject(null); loadProjects() }

  // ── 폴더 핸들러 (StatusTab과 동일한 패턴) ─────────────────────
  const createFolder = async (name) => {
    if (!isRegular()) { alert('권한이 없습니다.'); return }
    try {
      const res = await api.mergeCreateFolder({ name })
      if (res?.ok) setFolders(prev => [...prev, { id: res.id, name, created_at: new Date().toISOString() }])
    } catch (e) { console.error('[Merge] 폴더 생성 실패:', e?.message || e) }
  }
  const renameFolder = async (folderId, newName) => {
    if (!isRegular()) { alert('권한이 없습니다.'); return }
    try {
      await api.mergeUpdateFolder(folderId, { name: newName })
      setFolders(prev => prev.map(f => f.id === folderId ? { ...f, name: newName } : f))
    } catch (e) { console.error('[Merge] 폴더 이름 수정 실패:', e?.message || e) }
  }
  const deleteFolder = async (folder) => {
    if (!isRegular()) { alert('권한이 없습니다.'); return }
    if (!window.confirm(`"${folder.name}" 폴더를 삭제하시겠습니까?\n폴더 내 프로젝트는 최상위로 이동됩니다.`)) return
    try {
      await api.mergeDeleteFolder(folder.id)
      setFolders(prev => prev.filter(f => f.id !== folder.id))
      setProjects(prev => prev.map(p => p.folder_id === folder.id ? { ...p, folder_id: null } : p))
    } catch (e) { console.error('[Merge] 폴더 삭제 실패:', e?.message || e) }
  }
  const moveProjectToFolder = async (projectId, folderId) => {
    if (!isRegular()) { alert('권한이 없습니다.'); return }
    try {
      await api.mergeMoveProjectToFolder(projectId, { folderId })
      setProjects(prev => prev.map(p => p.id === projectId ? { ...p, folder_id: folderId } : p))
    } catch (e) { console.error('[Merge] 폴더 이동 실패:', e?.message || e) }
  }

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
      folders={folders}
      loading={projLoading}
      onCreate={handleCreate}
      onOpen={p => setOpenProject(p)}
      onDelete={handleDelete}
      onRename={handleRenameProject}
      onCreateFolder={createFolder}
      onRenameFolder={renameFolder}
      onDeleteFolder={deleteFolder}
      onMoveToFolder={moveProjectToFolder}
    />
  )
}