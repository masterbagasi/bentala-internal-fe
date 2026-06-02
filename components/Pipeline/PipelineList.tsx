'use client'

import React, { useState } from 'react'
import type { PipelineItem } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'

type FilterType = 'all' | 'source' | 'manual'

interface PipelineListProps {
  items: PipelineItem[]
  stages: PipelineStage[]
  selectedId: string | null
  onSelect: (id: string) => void
  onAddClick: () => void
}

export function PipelineList({ items, stages, selectedId, onSelect, onAddClick }: PipelineListProps) {
  const [filter, setFilter] = useState<FilterType>('all')

  const filtered = items.filter(item => {
    if (filter === 'source') return !!item.source_post_id
    if (filter === 'manual') return !item.source_post_id
    return true
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)' }}>
      {/* Header */}
      <div style={{ padding: '16px 16px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
            Konten ({items.length})
          </span>
          <button
            onClick={onAddClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 4,
              padding: '5px 12px', background: 'var(--accent)', color: '#fff',
              border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 500,
            }}
          >
            + Tambah
          </button>
        </div>

        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4 }}>
          {([
            { key: 'all', label: 'Semua' },
            { key: 'source', label: 'Dari BPI/BSI' },
            { key: 'manual', label: 'Mandiri' },
          ] as { key: FilterType; label: string }[]).map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500,
                cursor: 'pointer',
                background: filter === f.key ? 'var(--accent)' : 'transparent',
                color: filter === f.key ? '#fff' : 'var(--text2)',
                border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`,
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {filtered.length === 0 ? (
          <div style={{ padding: '32px 16px', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
            Belum ada konten
          </div>
        ) : filtered.map(item => {
          const stageDef = stages.find(s => s.key === item.current_stage)
          const isSelected = item.id === selectedId
          const doneCount = stages.filter(s => item.stages_data[s.key]?.status === 'done').length
          const pct = Math.round((doneCount / stages.length) * 100)

          return (
            <div
              key={item.id}
              onClick={() => onSelect(item.id)}
              style={{
                padding: '12px 16px',
                cursor: 'pointer',
                background: isSelected ? 'var(--bg3)' : 'transparent',
                borderBottom: '1px solid var(--border)',
                borderLeft: isSelected ? `3px solid var(--accent)` : '3px solid transparent',
                transition: 'background 0.12s',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{
                  width: 9, height: 9, borderRadius: '50%', flexShrink: 0, marginTop: 4,
                  background: stageDef?.color ?? 'var(--text2)',
                }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: 'var(--text)',
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    marginBottom: 4,
                  }}>
                    {item.title}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {stageDef && (
                      <span style={{ fontSize: 11, color: stageDef.color, fontWeight: 500 }}>
                        {stageDef.label}
                      </span>
                    )}
                    {item.source_post_id && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 20,
                        background: '#6c63ff22', color: '#6c63ff', textTransform: 'uppercase',
                      }}>
                        bpi/bsi
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>
                      {pct}%
                    </span>
                  </div>
                  {/* Mini progress bar */}
                  <div style={{ height: 3, background: 'var(--border)', borderRadius: 10, marginTop: 6, overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 10,
                      background: stageDef?.color ?? 'var(--accent)',
                      width: `${pct}%`, transition: 'width 0.4s ease',
                    }} />
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
