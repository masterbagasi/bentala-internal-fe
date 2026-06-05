'use client'

import { SUBJECTS, PLAN_ITEMS, AI_RECOMMENDATIONS, PLATFORM_META } from './mock'
import { Card, PlatformChip, SectionTitle } from './ui'

const DOW = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
// June 2026 starts on a Monday (1 Jun 2026 = Monday) → offset 0
const FIRST_OFFSET = 0
const DAYS_IN_MONTH = 30

export function PlanView() {
  const byDay = new Map<number, typeof PLAN_ITEMS[number]>()
  PLAN_ITEMS.forEach(p => byDay.set(p.day, p))

  const cells: (number | null)[] = [
    ...Array(FIRST_OFFSET).fill(null),
    ...Array.from({ length: DAYS_IN_MONTH }, (_, i) => i + 1),
  ]

  return (
    <div>

      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <select
          style={{
            background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
            borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 500, minWidth: 220,
          }}
        >
          {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <button
          style={{
            marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Buat Plan dengan AI
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14 }}>
        {/* Calendar */}
        <Card>
          <SectionTitle>Kalender Konten — Juni 2026</SectionTitle>
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
          <SectionTitle>Rekomendasi AI</SectionTitle>
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
            Rekomendasi & kalender ini akan dibuat AI dari data performa live pada fase implementasi.
          </div>
        </Card>
      </div>
    </div>
  )
}
