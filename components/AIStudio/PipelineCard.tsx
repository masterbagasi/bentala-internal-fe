'use client'

import { PipelineCard as PipelineCardType } from '@/lib/types'
import { useT } from '@/lib/i18n/LanguageProvider'

const ENTITY_COLORS: Record<string, string> = {
  bpi: '#6c63ff',
  bsi: '#43d9a2',
}

const PLATFORM_LABELS: Record<string, string> = {
  ig: 'Instagram',
  tiktok: 'TikTok',
  keduanya: 'IG + TikTok',
}

interface Props {
  card: PipelineCardType
  onGenerateBrief: (card: PipelineCardType) => void
  onOpenBuilder: (card: PipelineCardType) => void
}

export default function PipelineCard({ card, onGenerateBrief, onOpenBuilder }: Props) {
  const t = useT()
  const entityColor = ENTITY_COLORS[card.entity] ?? '#6c63ff'

  return (
    <div style={{
      background: 'var(--bg)',
      border: '1px solid var(--border)',
      borderRadius: 8,
      padding: '10px 12px',
      display: 'flex',
      flexDirection: 'column',
      gap: 8,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>
            {card.title}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: entityColor,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}>
              {card.entity}
            </span>
            <span style={{ fontSize: 10, color: 'var(--text2)' }}>
              {PLATFORM_LABELS[card.platform]}
            </span>
          </div>
        </div>
      </div>

      {/* Stage-specific actions */}
      {card.stage === 'ide' && (
        <button
          onClick={() => onGenerateBrief(card)}
          style={{
            width: '100%',
            padding: '6px 0',
            background: '#6c63ff',
            border: 'none',
            borderRadius: 6,
            color: '#fff',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ⚡ Generate Brief
        </button>
      )}

      {card.stage === 'brief' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ fontSize: 10, color: 'var(--text2)' }}>{t('Brief dalam proses produksi...')}</div>
          <button
            onClick={() => onOpenBuilder(card)}
            style={{
              width: '100%',
              padding: '5px 0',
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text2)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            ✎ {t('Buat Caption')}
          </button>
        </div>
      )}

      {card.stage === 'caption' && (
        <button
          onClick={() => onOpenBuilder(card)}
          style={{
            width: '100%',
            padding: '6px 0',
            background: '#43d9a2',
            border: 'none',
            borderRadius: 6,
            color: '#000',
            fontSize: 11,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          → Content Builder
        </button>
      )}
    </div>
  )
}
