'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

// Same fallback the Sidebar uses — keeps the login page from rendering
// a broken image if `bsi_hero.logo_url` is null/empty on first install.
const FALLBACK_LOGO_SRC = '/logo%20bentala.png'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  // Brand logo fetched from `bsi_hero.logo_url` — same source the
  // Sidebar reads from so the admin Hero settings is the single
  // source of truth for the Bentala mark across the entire admin.
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()
    supabase
      .from('bsi_hero')
      .select('logo_url')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const url = (data as { logo_url: string | null } | null)?.logo_url
        setLogoUrl(url && url.trim() !== '' ? url : FALLBACK_LOGO_SRC)
      })
    return () => {
      cancelled = true
    }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) { setError('Email dan password wajib diisi.'); return }

    setLoading(true)
    setError('')

    const supabase = getSupabase()
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password })

    if (authError) {
      setError(authError.message === 'Invalid login credentials'
        ? 'Email atau password salah.'
        : authError.message)
      setLoading(false)
      return
    }

    router.push('/')
    router.refresh()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#0f1117',
      padding: 16,
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      <div style={{
        width: '100%',
        maxWidth: 360,
        background: '#1a1d27',
        border: '1px solid #2e3147',
        borderRadius: 16,
        padding: '36px 32px',
        boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
      }}>
        {/* Header — logo on the LEFT, heading + subtitle on the RIGHT.
            Logo pulled live from `bsi_hero.logo_url` (single source of
            truth with the Sidebar). Spacer block renders while the URL
            fetches so the layout doesn't jump on first paint. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 28 }}>
          {logoUrl === null ? (
            <div
              style={{
                width: 56,
                height: 56,
                flexShrink: 0,
                background: 'transparent',
              }}
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Bentala"
              width={56}
              height={56}
              style={{
                flexShrink: 0,
                display: 'block',
                objectFit: 'contain',
              }}
            />
          )}
          <div style={{ minWidth: 0 }}>
            <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e8eaf6', margin: '0 0 4px', lineHeight: 1.15 }}>Selamat datang</h1>
            <p style={{ fontSize: 13, color: '#8b8fa8', margin: 0, lineHeight: 1.3 }}>Masuk ke akun tim kamu</p>
          </div>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Email */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8b8fa8', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="nama@bentala.id"
              autoComplete="email"
              style={{
                width: '100%', boxSizing: 'border-box',
                background: '#222534',
                border: `1px solid ${error ? '#ff6b6b' : '#2e3147'}`,
                borderRadius: 8,
                color: '#e8eaf6',
                padding: '10px 12px',
                fontSize: 13,
                outline: 'none',
                transition: 'border-color 0.15s',
              }}
              onFocus={e => { if (!error) e.target.style.borderColor = '#6c63ff' }}
              onBlur={e => { if (!error) e.target.style.borderColor = '#2e3147' }}
            />
          </div>

          {/* Password — wrapped in a relative container so the
              show/hide toggle button can absolute-position on the
              right side of the input without breaking the label
              above. Input gets extra right padding to keep typed
              text from sliding under the button. */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#8b8fa8', marginBottom: 7, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Password</label>
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                style={{
                  width: '100%', boxSizing: 'border-box',
                  background: '#222534',
                  border: `1px solid ${error ? '#ff6b6b' : '#2e3147'}`,
                  borderRadius: 8,
                  color: '#e8eaf6',
                  padding: '10px 44px 10px 12px',
                  fontSize: 13,
                  outline: 'none',
                  transition: 'border-color 0.15s',
                }}
                onFocus={e => { if (!error) e.target.style.borderColor = '#6c63ff' }}
                onBlur={e => { if (!error) e.target.style.borderColor = '#2e3147' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                tabIndex={-1}
                style={{
                  position: 'absolute',
                  top: '50%',
                  right: 6,
                  transform: 'translateY(-50%)',
                  width: 32,
                  height: 32,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'transparent',
                  border: 'none',
                  borderRadius: 6,
                  cursor: 'pointer',
                  color: '#8b8fa8',
                  transition: 'color 0.15s, background 0.15s',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.color = '#e8eaf6'
                  e.currentTarget.style.background = 'rgba(108, 99, 255, 0.08)'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.color = '#8b8fa8'
                  e.currentTarget.style.background = 'transparent'
                }}
              >
                {showPassword ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9.88 9.88a3 3 0 1 0 4.24 4.24" />
                    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68" />
                    <path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61" />
                    <line x1="2" y1="2" x2="22" y2="22" />
                  </svg>
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(255,107,107,0.1)',
              border: '1px solid rgba(255,107,107,0.35)',
              color: '#ff6b6b', fontSize: 12, lineHeight: 1.4,
            }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4,
              width: '100%', padding: '11px',
              borderRadius: 9, border: 'none',
              background: loading ? '#2e3147' : '#6c63ff',
              color: loading ? '#8b8fa8' : '#fff',
              fontSize: 13, fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'background 0.15s, opacity 0.15s',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}
          >
            {loading ? (
              <>
                <span style={{
                  width: 14, height: 14, borderRadius: '50%',
                  border: '2px solid rgba(139,143,168,0.4)',
                  borderTopColor: '#8b8fa8',
                  animation: 'spin 0.7s linear infinite',
                  display: 'inline-block', flexShrink: 0,
                }} />
                Masuk...
              </>
            ) : 'Masuk'}
          </button>
        </form>

        <p style={{ textAlign: 'center', fontSize: 12, color: '#8b8fa8', marginTop: 24, marginBottom: 0 }}>
          Butuh akses?{' '}
          <span style={{ color: '#6c63ff', cursor: 'pointer', fontWeight: 600 }}>Hubungi admin</span>
        </p>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
