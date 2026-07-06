'use client'

// Segment-level error boundary for the dashboard. Without this, any transient
// client render error (e.g. an unexpected realtime payload) would crash the
// whole app — blanking the screen and dropping any open popups, which reads as
// the page "closing/refreshing itself". Here it's caught locally: the sidebar
// stays, and `reset()` re-renders the segment WITHOUT a full page reload.

import { useEffect } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  const t = useT()
  useEffect(() => {
    // Surface it for debugging without taking the app down.
    console.error('[dashboard] render error caught by boundary:', error)
  }, [error])

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: 40,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: 34 }}>⚠️</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>
        {t('Terjadi gangguan sesaat')}
      </div>
      <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 420, lineHeight: 1.6 }}>
        {t('Halaman ini gagal dimuat sebentar. Coba muat ulang bagian ini — data dan sesi Anda tetap aman, tidak perlu login lagi.')}
      </div>
      <button
        onClick={reset}
        style={{
          marginTop: 4,
          background: 'var(--accent)',
          color: '#fff',
          border: 'none',
          borderRadius: 8,
          padding: '9px 18px',
          fontSize: 13,
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        {t('Coba lagi')}
      </button>
    </div>
  )
}
