'use client'

import { useState } from 'react'
import { SUBJECTS, REPORT_NARRATIVE } from './mock'
import { Card, StatCard, SectionTitle, fmtNum } from './ui'
import { SocialFilterChip } from './AnalyticsView'
import { SocialFilterButton, SocialFilterLabel } from './FilterButton'
import { useT } from '@/lib/i18n/LanguageProvider'

export const REPORT_PERIODS = ['Mei 2026', 'April 2026', 'Q2 2026'] as const
export type ReportPeriod = typeof REPORT_PERIODS[number]

export function ReportsView({
  subjectId: subjectIdProp,
  period: periodProp,
}: {
  subjectId?: string
  period?: ReportPeriod
} = {}) {
  const t = useT()
  const [subjectIdState] = useState(SUBJECTS[0].id)
  const subjectId = subjectIdProp ?? subjectIdState
  const period = periodProp ?? REPORT_PERIODS[0]
  const subject = SUBJECTS.find(s => s.id === subjectId)!
  const totalFollowers = subject.connections.reduce((a, c) => a + c.followers, 0)

  return (
    <div>

      {/* Page actions (filters moved to the top-right Filter button) */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 18, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
        <button
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9,
            padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {t('Generate Laporan (AI)')}
        </button>
        <button
          style={{
            background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
          }}
        >
          Export PDF
        </button>
      </div>

      {/* Report document mockup */}
      <Card style={{ padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {t('Laporan Performa Sosial Media')}
            </h2>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              {subject.name} · {t('Periode')} {period}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>{t('Dibuat 3 Jun 2026')}</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard label="Followers" value={fmtNum(totalFollowers)} delta="17.0%" />
          <StatCard label="Reach" value="433k" delta="22.3%" />
          <StatCard label="Engagement" value="5.4%" delta="1.6pts" />
          <StatCard label="Posts" value="38" delta="6 vs lalu" />
        </div>

        <SectionTitle>{t('Ringkasan Eksekutif')}</SectionTitle>
        <div style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--text2)', whiteSpace: 'pre-line' }}>
          {REPORT_NARRATIVE}
        </div>

        <div
          style={{
            marginTop: 22, padding: '12px 14px', borderRadius: 10, fontSize: 12,
            background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)',
          }}
        >
          {t('Narasi ini akan dihasilkan otomatis oleh AI (Claude/GPT) dari data metrik live pada fase implementasi.')}
        </div>
      </Card>
    </div>
  )
}

/** Top-right Filter button for the Reports tab — Akun + Periode. */
export function SocialReportsFilterButton({ subjectId, setSubjectId, period, setPeriod }: {
  subjectId: string
  setSubjectId: (id: string) => void
  period: ReportPeriod
  setPeriod: (p: ReportPeriod) => void
}) {
  const t = useT()
  const count = (subjectId !== SUBJECTS[0].id ? 1 : 0) + (period !== REPORT_PERIODS[0] ? 1 : 0)
  return (
    <SocialFilterButton count={count}>
      <SocialFilterLabel>{t('Akun')}</SocialFilterLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
        {SUBJECTS.map(s => (
          <SocialFilterChip key={s.id} label={s.name} active={subjectId === s.id} onClick={() => setSubjectId(s.id)} />
        ))}
      </div>
      <SocialFilterLabel>{t('Periode')}</SocialFilterLabel>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {REPORT_PERIODS.map(p => (
          <SocialFilterChip key={p} label={p} active={period === p} onClick={() => setPeriod(p)} />
        ))}
      </div>
    </SocialFilterButton>
  )
}
