import { C } from './theme'

export function ComingSoon({ title, desc, icon }: { title: string; desc: string; icon?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '72px 24px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
      <div style={{ width: 52, height: 52, borderRadius: 13, background: C.accentSoft, border: `1px solid ${C.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: C.accent }}>
        {icon ?? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
          </svg>
        )}
      </div>
      <div>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{title}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text2)', marginTop: 4, maxWidth: 380, lineHeight: 1.5 }}>{desc}</div>
      </div>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.8px', textTransform: 'uppercase', color: C.accent, background: C.accentSoft, border: `1px solid ${C.accentBorder}`, padding: '4px 12px', borderRadius: 999 }}>Segera Hadir</span>
    </div>
  )
}
