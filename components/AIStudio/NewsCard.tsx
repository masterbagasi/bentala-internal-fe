'use client'

import { NewsItem } from '@/lib/types'

interface Props {
  item: NewsItem
  selected: boolean
  onSelect: (id: string) => void
}

const SOURCE_COLORS: Record<string, string> = {
  bbc:              '#bb1919',
  aljazeera:        '#ff8c00',
  google_indonesia: '#4285f4',
  kompas:           '#e00025',
  detik:            '#e00025',
  tempo:            '#1a73e8',
  cnn_indonesia:    '#cc0000',
  reddit_indonesia: '#ff4500',
  reddit_worldnews: '#ff4500',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins} menit lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}

export default function NewsCard({ item, selected, onSelect }: Props) {
  const color = SOURCE_COLORS[item.source] ?? 'var(--text2)'

  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 8,
        border: '1px solid',
        borderColor: selected ? 'var(--accent)' : 'var(--border)',
        background: selected ? 'rgba(108,99,255,0.06)' : 'var(--bg2)',
        cursor: 'pointer',
        transition: 'all 0.12s',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
      onClick={() => onSelect(item.id)}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, textTransform: 'uppercase' }}>
          {item.source.replace(/_/g, ' ')}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>
          {timeAgo(item.published_at)}
        </span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600, lineHeight: 1.4 }}>
        {item.title}
      </div>
      {item.summary && (
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.4 }}>
          {item.summary.slice(0, 120)}{item.summary.length > 120 ? '...' : ''}
        </div>
      )}
    </div>
  )
}
