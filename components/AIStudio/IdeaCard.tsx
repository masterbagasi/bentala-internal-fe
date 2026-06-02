'use client'

import { IdeaItem } from '@/lib/types'

interface Props {
  idea: IdeaItem
  onSave: (id: string) => void
  onBuild: (idea: IdeaItem) => void
}

export default function IdeaCard({ idea, onSave, onBuild }: Props) {
  return (
    <div style={{
      background: 'var(--bg2)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: '16px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      animation: 'slideUp 0.18s ease',
    }}>
      <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 14, lineHeight: 1.4 }}>
        {idea.title}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>Konsep: </span>
        {idea.concept}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>
        <span style={{ color: 'var(--accent3)', fontWeight: 600 }}>Hook: </span>
        {idea.hook}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <button
          onClick={() => onSave(idea.id)}
          style={{
            flex: 1,
            padding: '6px 10px',
            background: idea.saved ? 'rgba(67,217,162,0.12)' : 'var(--bg3)',
            border: '1px solid',
            borderColor: idea.saved ? 'var(--accent3)' : 'var(--border)',
            borderRadius: 6,
            color: idea.saved ? 'var(--accent3)' : 'var(--text2)',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          {idea.saved ? '✓ Tersimpan' : 'Simpan'}
        </button>
        <button
          onClick={() => onBuild(idea)}
          style={{
            flex: 1,
            padding: '6px 10px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 12,
            cursor: 'pointer',
            fontWeight: 600,
          }}
        >
          Build →
        </button>
      </div>
    </div>
  )
}
