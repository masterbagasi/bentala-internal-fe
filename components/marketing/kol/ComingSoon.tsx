export function ComingSoon({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>{title}</h2>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>{subtitle}</p>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
          padding: '64px 24px',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          textAlign: 'center',
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--text2)',
          }}
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <polyline points="12 7 12 12 15 14" />
          </svg>
        </div>
        <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Segera Hadir</div>
        <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 360 }}>
          Fitur ini sedang dalam pengembangan dan akan tersedia di pembaruan berikutnya.
        </div>
      </div>
    </div>
  )
}
