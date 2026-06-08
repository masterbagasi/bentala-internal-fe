'use client'

import { SUBJECTS, CONNECTED_SUBJECTS, PLAN_ITEMS, AI_RECOMMENDATIONS, PLATFORM_META } from './mock'
import { Card, PlatformChip, SectionTitle } from './ui'
import { SocialFilterChip } from './AnalyticsView'
import { SocialFilterButton, SocialFilterLabel } from './FilterButton'
import { useT } from '@/lib/i18n/LanguageProvider'

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
// June 2026 starts on a Monday (1 Jun 2026 = Monday) → offset 0
const FIRST_OFFSET = 0
const DAYS_IN_MONTH = 30

export function PlanView() {
  const t = useT()
  const byDay = new Map<number, typeof PLAN_ITEMS[number]>()
  PLAN_ITEMS.forEach(p => byDay.set(p.day, p))

  const cells: (number | null)[] = [
    ...Array(FIRST_OFFSET).fill(null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ]

  return (
    <div>

      {/* Page action (account filter moved to the top-right Filter button) */}
      <div style={{ display: 'flex', marginBottom: 18, justifyContent: 'flex-end' }}>
        <button
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t('Buat Plan dengan AI')}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        {/* Calendar */}
        <Card>
          <SectionTitle>{t('Kalender Konten — Juni 2026')}</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
            {DOW.map(d => (
              <div key={d} style={{ fontSize: 11, fontWeight: 600, color: 'var(--text3)', textAlign: 'center', padding: '4px 0' }}>
                {d}
              </div>
            ))}
            {cells.map((day, i) => {
              const item = day ? byDay.get(day) : undefined
              return (
                <div
                  key={i}
                  style={{
                    minHeight: 64, borderRadius: 8, padding: 6, fontSize: 11,
                    background: day ? 'var(--bg3)' : 'transparent',
                    border: day ? '1px solid var(--border)' : 'none',
                  }}
                >
                  {day && <div style={{ color: 'var(--text3)', marginBottom: 4 }}>{day}</div>}
                  {item && (
                    <div
                      style={{
                        display: 'flex', flexDirection: 'column', gap: 3, padding: 5, borderRadius: 6,
                        background: PLATFORM_META[item.platform].color + '22',
                        borderLeft: `2px solid ${PLATFORM_META[item.platform].color}`,
                      }}
                    >
                      <PlatformChip platform={item.platform} />
                      <span style={{ color: 'var(--text2)', lineHeight: 1.3 }}>{item.title}</span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </Card>

        {/* AI recommendations */}
        <Card>
          <SectionTitle>{t('Rekomendasi AI')}</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {AI_RECOMMENDATIONS.map((rec, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span
                  style={{
                    flexShrink: 0, width: 22, height: 22, borderRadius: 6, fontSize: 11, fontWeight: 700,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent)', color: '#fff',
                  }}
                >
                  {i + 1}
                </span>
                <p style={{ fontSize: 13, lineHeight: 1.6, color: 'var(--text2)', margin: 0 }}>{rec}</p>
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 18, padding: '12px 14px', borderRadius: 10, fontSize: 12,
              background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)',
            }}
          >
            {t('Rekomendasi & kalender ini akan dibuat AI dari data performa live pada fase implementasi.')}
          </div>
        </Card>
      </div>
    </div>
  )
}

/** Top-right Filter button for the Plan tab — Akun. */
export function SocialPlanFilterButton({ subjectId, setSubjectId }: {
  subjectId: string
  setSubjectId: (id: string) => void
}) {
  const t = useT()
  const count = subjectId !== SUBJECTS[0].id ? 1 : 0
  return (
    <SocialFilterButton count={count}>
      <SocialFilterLabel>{t('Akun')}</SocialFilterLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {CONNECTED_SUBJECTS.map(s => (
          <SocialFilterChip key={s.id} label={s.name} active={subjectId === s.id} onClick={() => setSubjectId(s.id)} />
        ))}
      </div>
    </SocialFilterButton>
  )
}
