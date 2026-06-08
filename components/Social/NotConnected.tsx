'use client'

import { Card } from './ui'
import { useT } from '@/lib/i18n/LanguageProvider'

/** Shown for a brand whose social account isn't connected to a live data source
 *  yet, so we don't display another account's data. */
export function NotConnected({ brandLabel, feature }: { brandLabel: string; feature: string }) {
  const t = useT()
  return (
    <Card style={{ padding: 48, textAlign: 'center', maxWidth: 560, margin: '24px auto' }}>
      <div style={{
        width: 48, height: 48, borderRadius: 12, margin: '0 auto 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg3)', border: '1px solid var(--border)',
      }}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.59 13.41a2 2 0 0 0 2.83 0l3.59-3.59a2 2 0 0 0-2.83-2.83l-.59.59" />
          <path d="M13.41 10.59a2 2 0 0 0-2.83 0l-3.59 3.59a2 2 0 0 0 2.83 2.83l.59-.59" />
        </svg>
      </div>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
        {feature} {t('belum tersedia untuk')} {brandLabel}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.7 }}>
        {t('Akun socmed')} {brandLabel} {t('belum tersambung ke sumber data live, jadi belum ada metrik asli untuk ditampilkan. Data analitik asli baru tersedia setelah akunnya di-connect via Composio.')}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 14 }}>
        {t('Sambungkan akun di tab')} <strong style={{ color: 'var(--text2)' }}>Accounts</strong>, {t('lalu aktifkan live-sync (Composio API key).')}
      </div>
    </Card>
  )
}
