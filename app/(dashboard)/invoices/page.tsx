'use client'

import { useRef } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { InvoicesPage, type InvoicesPageHandle } from '@/components/Invoices'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function InvoicesPageRoute() {
  const t = useT()
  const ref = useRef<InvoicesPageHandle>(null)

  return (
    <>
      <PageHeader
        title="Invoice & Pembayaran"
        action={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={() => ref.current?.openSettings()}
              title={t('Pengaturan Invoice')}
              style={{ height: 32, width: 32, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg2)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
            </button>
            <button
              onClick={() => ref.current?.openNew()}
              style={{ height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}
            >
              + {t('Invoice Baru')}
            </button>
          </div>
        }
      />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <InvoicesPage ref={ref} />
      </div>
    </>
  )
}
