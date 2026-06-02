'use client'

import { useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { usePipelineData } from '@/hooks/usePipelineData'
import { PipelineList } from './PipelineList'
import { StagePanel } from './StagePanel'
import { AddPipelineModal } from './AddPipelineModal'
import { PipelineSummary } from './PipelineSummary'
import type { PipelineStage } from '@/lib/constants'

type PipelineTab = 'pipeline' | 'summary'

interface PipelinePageProps {
  member: 'Video Production' | 'Design Studio'
  stages: PipelineStage[]
}

export function PipelinePage({ member, stages }: PipelinePageProps) {
  usePipelineData(member)

  const { pipelineItems } = useStore()
  const [tab, setTab] = useState<PipelineTab>('pipeline')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)

  const items = pipelineItems.filter(p => p.member === member)
  const selectedItem = items.find(p => p.id === selectedId) ?? null

  // Auto-select first item if none selected
  const displayItem = selectedItem ?? (items.length > 0 ? items[0] : null)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Tab Bar */}
      <div style={{
        display: 'flex', alignItems: 'center',
        borderBottom: '1px solid var(--border)', padding: '0 24px',
        background: 'var(--bg)', position: 'sticky', top: 0, zIndex: 10,
      }}>
        {(['pipeline', 'summary'] as PipelineTab[]).map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{
              padding: '10px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
              color: tab === t ? 'var(--accent)' : 'var(--text2)',
              background: 'none', border: 'none',
              borderBottom: `2px solid ${tab === t ? 'var(--accent)' : 'transparent'}`,
              marginBottom: -1, transition: 'all 0.15s', textTransform: 'capitalize',
            }}
          >
            {t === 'pipeline' ? 'Pipeline' : 'Ringkasan'}
          </button>
        ))}
      </div>

      {/* Content */}
      {tab === 'summary' ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <PipelineSummary items={items} stages={stages} member={member} />
        </div>
      ) : (
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Left panel — 35% */}
          <div style={{ width: '35%', minWidth: 240, maxWidth: 320, flexShrink: 0, overflowY: 'auto' }}>
            <PipelineList
              items={items}
              stages={stages}
              selectedId={displayItem?.id ?? null}
              onSelect={setSelectedId}
              onAddClick={() => setShowAdd(true)}
            />
          </div>

          {/* Right panel — 65% */}
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg)' }}>
            {displayItem ? (
              <StagePanel item={displayItem} stages={stages} />
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text2)', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 40 }}>🎬</div>
                <div style={{ fontSize: 14 }}>Belum ada konten pipeline</div>
                <button
                  onClick={() => setShowAdd(true)}
                  style={{ padding: '8px 18px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13 }}
                >
                  + Tambah Konten Pertama
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <AddPipelineModal
        open={showAdd}
        member={member}
        stages={stages}
        onClose={() => setShowAdd(false)}
      />
    </div>
  )
}
