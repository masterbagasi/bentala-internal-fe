'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { StageCard } from './StageCard'
import type { PipelineItem, StageData } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'
import { useT } from '@/lib/i18n/LanguageProvider'

interface StagePanelProps {
  item: PipelineItem
  stages: PipelineStage[]
}

export function StagePanel({ item, stages }: StagePanelProps) {
  const t = useT()
  const { upsertPipelineItem } = useStore()
  const [saving, setSaving] = useState(false)

  async function handleStageUpdate(stageKey: string, stageData: StageData) {
    const newStagesData = { ...item.stages_data, [stageKey]: stageData }

    // Determine current_stage: first non-done stage, or last stage if all done
    let newCurrentStage = stages[stages.length - 1].key
    for (const s of stages) {
      if ((newStagesData[s.key]?.status ?? 'pending') !== 'done') {
        newCurrentStage = s.key
        break
      }
    }

    const updated: PipelineItem = {
      ...item,
      stages_data: newStagesData,
      current_stage: newCurrentStage,
      updated_at: new Date().toISOString(),
    }

    // Optimistic update
    upsertPipelineItem(updated)

    setSaving(true)
    try {
      const supabase = getSupabase()
      await (supabase as any)
        .from('pipeline_items')
        .update({ stages_data: newStagesData, current_stage: newCurrentStage, updated_at: updated.updated_at })
        .eq('id', item.id)
    } catch (err) {
      console.error('[StagePanel] update failed:', err)
    } finally {
      setSaving(false)
    }
  }

  const currentStageDef = stages.find(s => s.key === item.current_stage)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', margin: 0, marginBottom: 6 }}>
              {item.title}
            </h2>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {item.source_post_id && (
                <span style={{
                  fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                  background: '#6c63ff22', color: '#6c63ff', textTransform: 'uppercase',
                }}>
                  {t('dari BPI/BSI')}
                </span>
              )}
              {currentStageDef && (
                <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {t('Stage saat ini:')}
                  <span style={{ color: currentStageDef.color, fontWeight: 600, marginLeft: 4 }}>
                    {currentStageDef.label}
                  </span>
                </span>
              )}
              {saving && (
                <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{t('Menyimpan...')}</span>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        {(() => {
          const doneCount = stages.filter(s => item.stages_data[s.key]?.status === 'done').length
          const pct = Math.round((doneCount / stages.length) * 100)
          return (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)', marginBottom: 5 }}>
                <span>{doneCount} {t('dari')} {stages.length} {t('stage selesai')}</span>
                <span>{pct}%</span>
              </div>
              <div style={{ height: 5, background: 'var(--bg3)', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 10,
                  background: `linear-gradient(90deg, var(--accent), #43d9a2)`,
                  width: `${pct}%`, transition: 'width 0.4s ease',
                }} />
              </div>
            </div>
          )
        })()}
      </div>

      {/* Stages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 24px' }}>
        {stages.map((stageDef, idx) => {
          const stageData: StageData = item.stages_data[stageDef.key] ?? {
            status: 'pending', notes: '', files: [], checklist: [], started_at: null, completed_at: null,
          }
          // Unlocked if first stage, or previous stage is done
          const isUnlocked = idx === 0 || item.stages_data[stages[idx - 1].key]?.status === 'done'

          return (
            <StageCard
              key={stageDef.key}
              stageDef={stageDef}
              stageData={stageData}
              isUnlocked={isUnlocked}
              onUpdate={data => handleStageUpdate(stageDef.key, data)}
            />
          )
        })}
      </div>
    </div>
  )
}
