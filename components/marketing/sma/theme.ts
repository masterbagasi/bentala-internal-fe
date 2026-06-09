// Self-contained design tokens for Social Media Analytics.
// Surfaces use the project's existing dark CSS variables; accent + status
// colours follow the SMA spec (cyan primary).

export const C = {
  accent: '#00D4FF', // cyan — primary buttons, active tab, highlights
  accentSoft: 'rgba(0,212,255,0.14)',
  accentBorder: 'rgba(0,212,255,0.45)',
  onAccent: '#06141c', // dark text on cyan buttons
  success: '#48BB78',
  warning: '#ECC94B',
  danger: '#FC8181',
  successSoft: 'rgba(72,187,120,0.14)',
  warningSoft: 'rgba(236,201,75,0.14)',
  dangerSoft: 'rgba(252,129,129,0.14)',
}

export const card: React.CSSProperties = { background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 18 }
export const innerCard: React.CSSProperties = { background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 14 }

export const sectionLabel: React.CSSProperties = {
  fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'var(--text2)',
}

export const btnPrimary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
  padding: '10px 18px', borderRadius: 8, background: C.accent, color: C.onAccent,
  border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer',
}
export const btnSecondary: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '10px 16px', borderRadius: 8, background: 'transparent', color: 'var(--text2)',
  border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
}

export function disabledStyle(disabled: boolean): React.CSSProperties {
  return disabled ? { opacity: 0.45, cursor: 'not-allowed' } : {}
}

export const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: 8, background: 'var(--bg3)',
  border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13,
}
