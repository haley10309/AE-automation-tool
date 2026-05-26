import { useState, useEffect, useRef } from 'react'
import { ALL_SITES, REGIONS, REGION_COLORS, REGION_BG } from '../constants.js'

export default function SiteDropdown({ excludeCodes = [], onAdd, label = '+ 국가 추가', className = '' }) {
  const [open, setOpen]     = useState(false)
  const [search, setSearch] = useState('')
  const [region, setRegion] = useState('ALL')
  const ref = useRef(null)

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const available = ALL_SITES
    .filter(s => !excludeCodes.includes(s.code))
    .filter(s => region === 'ALL' || s.region === region)
    .filter(s => !search || s.name.includes(search) || s.code.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className={`cc-add-wrap ${className}`} ref={ref} style={{ position: 'relative' }}>
      <button className="cc-add-col-btn" onClick={() => setOpen(v => !v)}>{label}</button>
      {open && (
        <div className="cc-dropdown" style={{ top: 'calc(100% + 4px)', left: 0 }}>
          <div className="cc-dropdown-search">
            <input autoFocus className="form-input" style={{ width: '100%', fontSize: 12 }}
              placeholder="국가명/코드 검색" value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="cc-dropdown-regions">
            {['ALL', ...REGIONS].map(r => (
              <button key={r} className={`cc-region-btn ${region === r ? 'active' : ''}`}
                style={region === r && r !== 'ALL' ? { background: REGION_COLORS[r], color: '#fff' } : {}}
                onClick={() => setRegion(r)}>{r}</button>
            ))}
          </div>
          <div className="cc-dropdown-list">
            {available.length === 0 && <div className="cc-no-result">검색 결과 없음</div>}
            {available.map(s => (
              <div key={s.code} className="cc-dropdown-item"
                onClick={() => { onAdd(s); setOpen(false); setSearch('') }}>
                <span className="cc-flag">{s.flag}</span>
                <span className="cc-dropdown-name">{s.name}</span>
                <span className="cc-card-code"
                  style={{ background: REGION_BG[s.region], color: REGION_COLORS[s.region] }}>
                  {s.code}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}