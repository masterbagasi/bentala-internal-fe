'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader, type TabKey } from '@/components/shared/PageHeader'
import { AccountsView } from '@/components/Social/AccountsView'
import { AnalyticsView, SocialAnalyticsFilterButton, SocialAnalyticsSubBar, type PlatformTab, type SubView } from '@/components/Social/AnalyticsView'
import { ReportsView, SocialReportsFilterButton, REPORT_PERIODS, type ReportPeriod } from '@/components/Social/ReportsView'
import { SocialPlanFilterButton } from '@/components/Social/PlanView'
import { SUBJECTS } from '@/components/Social/mock'
import { presetRange, type DateRange } from '@/components/Social/DateRangePicker'
import { getSupabase } from '@/lib/supabase'
import { useBrandRealtime } from '@/hooks/useBrandRealtime'
import { useSocmedProjects } from '@/lib/socmed-projects'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Card } from '@/components/Social/ui'

// A project is "logged in" when it has at least one account whose connection
// status is 'connected'. Analytics/Reports/Plan are gated behind this so a
// project with no signed-in account doesn't show data; the Accounts tab stays
// open so the user can connect the first account.
function useSocialConnected(slug: string): 'loading' | 'connected' | 'none' {
  const [state, setState] = useState<'loading' | 'connected' | 'none'>('loading')

  // A brand is "connected" when it has a real social_connections row (OAuth via
  // Composio) with status 'connected'. (The legacy social_accounts table held
  // manually-typed accounts; the live integration uses social_connections.)
  const check = useCallback(() => {
    let cancelled = false
    const sb = getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient
    sb.from('social_connections')
      .select('status')
      .eq('brand', slug)
      .eq('status', 'connected')
      .limit(1)
      .then(
        ({ data }) => {
          if (cancelled) return
          setState((data ?? []).length > 0 ? 'connected' : 'none')
        },
        () => { if (!cancelled) setState('none') },
      )
    return () => { cancelled = true }
  }, [slug])

  useEffect(() => {
    setState('loading')
    const dispose = check()
    return dispose
  }, [check])

  // Re-evaluate the gate live: connecting the first account (or disconnecting
  // the last) flips Analytics/Reports/Plan on/off without a page reload.
  useBrandRealtime(slug, ['social_connections'], check)

  return state
}

export default function Page() {
  const params = useParams()
  const slug = String(params.project)
  const t = useT()
  const projects = useSocmedProjects(false)
  const brandName = projects.find(p => p.slug === slug)?.name || slug

  const conn = useSocialConnected(slug)
  const [tab, setTab] = useState<TabKey>('accounts')
  const [subjectId, setSubjectId] = useState(SUBJECTS[0].id)
  const [platform, setPlatform] = useState<PlatformTab>('all')
  const [view, setView] = useState<SubView>('overview')
  const [range, setRange] = useState<DateRange>(presetRange('Lifetime'))
  const [period, setPeriod] = useState<ReportPeriod>(REPORT_PERIODS[0])

  // Data tabs need a signed-in account; the Accounts tab never gates.
  const gated = tab !== 'accounts' && conn !== 'connected'

  const notLoggedIn = (
    <Card style={{ padding: 40, textAlign: 'center', maxWidth: 520, margin: '40px auto' }}>
      <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>{t('Akun belum login')}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text3)', marginBottom: 16 }}>
        {t('Belum ada akun socmed yang login untuk')} <strong style={{ color: 'var(--text2)' }}>{brandName}</strong>.
        {' '}{t('Hubungkan akun terlebih dahulu untuk melihat data.')}
      </div>
      <button
        onClick={() => setTab('accounts')}
        style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        {t('Hubungkan akun')}
      </button>
    </Card>
  )

  return (
    <>
      <PageHeader
        title="Social Media"
        tabs={['analytics', 'accounts', 'reports', 'plan']}
        activeTab={tab}
        onTabChange={setTab}
        tabsRight={
          gated ? undefined
          : tab === 'analytics' ? <SocialAnalyticsFilterButton brand={slug} subjectId={subjectId} setSubjectId={setSubjectId} platform={platform} setPlatform={setPlatform} />
          : tab === 'reports' ? <SocialReportsFilterButton subjectId={subjectId} setSubjectId={setSubjectId} period={period} setPeriod={setPeriod} />
          : tab === 'plan' ? <SocialPlanFilterButton subjectId={subjectId} setSubjectId={setSubjectId} />
          : undefined}
      />
      {/* Fixed sub-header for Analytics — stays put while content scrolls */}
      {tab === 'analytics' && !gated && (
        <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <SocialAnalyticsSubBar view={view} setView={setView} range={range} setRange={setRange} />
        </div>
      )}
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        {tab === 'accounts' && <AccountsView brand={slug} brandName={brandName} />}
        {tab !== 'accounts' && conn === 'loading' && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Memuat…')}</div>
        )}
        {gated && conn === 'none' && notLoggedIn}
        {tab === 'analytics' && conn === 'connected' && (
          <AnalyticsView
            brand={slug}
            subjectId={subjectId} setSubjectId={setSubjectId}
            platform={platform} setPlatform={setPlatform}
            view={view} setView={setView} range={range} setRange={setRange}
          />
        )}
        {tab === 'reports' && conn === 'connected' && <ReportsView brand={slug} subjectId={subjectId} period={period} />}
        {tab === 'plan' && conn === 'connected' && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13, maxWidth: 520, margin: '40px auto' }}>
            {t('Plan (kalender konten + rekomendasi AI) untuk akun ini belum tersedia — menyusul setelah Analytics & Reports.')}
          </div>
        )}
      </div>
    </>
  )
}
