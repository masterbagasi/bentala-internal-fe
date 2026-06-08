'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/LanguageProvider'

interface Props {
  title: string
  action?: React.ReactNode
}

export function WebsiteAdminHeader({ title, action }: Props) {
  const t = useT()
  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
        height: 64,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 24px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Link
          href="/website"
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text2)',
            textDecoration: 'none',
          }}
          aria-label={t('Kembali')}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </Link>
        <span
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.005em',
            color: 'var(--text)',
          }}
        >
          {title}
        </span>
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}
