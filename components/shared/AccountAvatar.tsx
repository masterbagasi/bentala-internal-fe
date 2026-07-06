'use client'

// One account avatar — the profile photo when there is one, otherwise a stable
// coloured initial. Used wherever an account/actor is shown (Team table, the
// activity feed, the sidebar) so everyone is identified the same way.

function hue(seed: string): number {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360
  return h
}

export function AccountAvatar({ name, url, size = 32 }: { name?: string; url?: string | null; size?: number }) {
  const label = (name || '?').trim()
  const initial = (label[0] || '?').toUpperCase()
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={label}
        title={label}
        width={size}
        height={size}
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, background: 'var(--bg3)' }}
      />
    )
  }
  return (
    <span
      title={label}
      style={{
        width: size, height: size, flexShrink: 0, borderRadius: '50%',
        background: `hsl(${hue(label)} 42% 30%)`, color: '#fff',
        fontSize: Math.round(size * 0.4), fontWeight: 700,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      {initial}
    </span>
  )
}
