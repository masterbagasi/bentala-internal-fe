'use client'

type FilterType = 'all' | 'international' | 'indonesia' | 'social'

interface Props {
  active: FilterType
  onChange: (f: FilterType) => void
  counts: Record<FilterType, number>
}

const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all',           label: 'Semua' },
  { key: 'international', label: 'Internasional' },
  { key: 'indonesia',     label: 'Indonesia' },
  { key: 'social',        label: 'Social Media' },
]

export default function NewsFilter({ active, onChange, counts }: Props) {
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
      {FILTERS.map(f => (
        <button
          key={f.key}
          onClick={() => onChange(f.key)}
          style={{
            padding: '5px 12px',
            borderRadius: 20,
            border: '1px solid',
            borderColor: active === f.key ? 'var(--accent)' : 'var(--border)',
            background: active === f.key ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
            color: active === f.key ? 'var(--accent)' : 'var(--text2)',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: active === f.key ? 600 : 400,
          }}
        >
          {f.label} {counts[f.key] > 0 && <span style={{ opacity: 0.7 }}>({counts[f.key]})</span>}
        </button>
      ))}
    </div>
  )
}
