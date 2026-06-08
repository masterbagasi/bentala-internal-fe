'use client'

import { useT } from '@/lib/i18n/LanguageProvider'
import type { PipelineItem } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'

interface PipelineSummaryProps {
  items: PipelineItem[]
  stages: PipelineStage[]
  member: string
}

function msToHours(ms: number) {
  const h = Math.round(ms / 3600000)
  if (h < 24) return `${h}j`
  return `${Math.round(h / 24)}h`
}

export function PipelineSummary({ items, stages, member }: PipelineSummaryProps) {
  const t = useT()
  const total = items.length
  const completed = items.filter(item => item.stages_data[stages[stages.length - 1].key]?.status === 'done').length
  const inProgress = items.filter(item => {
    const cs = item.stages_data[item.current_stage]
    return cs?.status === 'in_progress'
  }).length
  const completionRate = total ? Math.round((completed / total) * 100) : 0

  // Per-stage stats
  const stageStats = stages.map(s => {
    const inStage = items.filter(item => item.current_stage === s.key).length
    const doneInStage = items.filter(item => item.stages_data[s.key]?.status === 'done').length

    // Average time in stage (for done stages with timestamps)
    const times = items
      .map(item => item.stages_data[s.key])
      .filter(sd => sd?.status === 'done' && sd.started_at && sd.completed_at)
      .map(sd => new Date(sd!.completed_at!).getTime() - new Date(sd!.started_at!).getTime())
    const avgMs = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0

    return { ...s, inStage, doneInStage, avgTime: avgMs ? msToHours(avgMs) : null }
  })

  return (
    <div style={{ padding: 24 }}>
      {/* Top stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px,1fr))', gap: 12, marginBottom: 24 }}>
        {[
          { label: t('Total Konten'), value: total, color: 'var(--text)' },
          { label: t('Sedang Berjalan'), value: inProgress, color: '#ffc542' },
          { label: t('Selesai'), value: completed, color: '#43d9a2' },
          { label: 'Completion Rate', value: `${completionRate}%`, color: 'var(--accent)' },
        ].map(stat => (
          <div key={stat.label} style={{
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px 18px',
          }}>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              {stat.label}
            </div>
            <div style={{ fontSize: 28, fontWeight: 700, color: stat.color }}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Per-stage breakdown */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden', marginBottom: 24 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 600 }}>
          {t('Breakdown per Stage')}
        </div>
        {stageStats.map(s => (
          <div key={s.key} style={{
            display: 'grid', gridTemplateColumns: '1fr 80px 80px 80px',
            padding: '12px 18px', borderBottom: '1px solid var(--border)', alignItems: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: s.color }}>{s.inStage}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{t('aktif')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#43d9a2' }}>{s.doneInStage}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{t('selesai')}</div>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.avgTime ?? '—'}</div>
              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{t('rata-rata')}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
