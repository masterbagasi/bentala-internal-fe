'use client'

import { useState, useEffect, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { isSuperAdmin } from '@/lib/access'

// ── Helpers ──────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?'
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(img.src)
      const MAX = 1920
      let { width, height } = img
      if (width > MAX || height > MAX) {
        if (width > height) {
          height = Math.round((height * MAX) / width)
          width = MAX
        } else {
          width = Math.round((width * MAX) / height)
          height = MAX
        }
      }
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('No canvas context'))
      ctx.drawImage(img, 0, 0, width, height)
      canvas.toBlob(
        blob => (blob ? resolve(blob) : reject(new Error('Blob null'))),
        'image/jpeg',
        0.92,
      )
    }
    img.onerror = (e) => {
      URL.revokeObjectURL(img.src)
      reject(e)
    }
    img.src = URL.createObjectURL(file)
  })
}

// ── PopupItem ────────────────────────────────────────────────

function PopupItem({
  icon,
  label,
  right,
  onClick,
  danger = false,
}: {
  icon: React.ReactNode
  label: string
  right?: React.ReactNode
  onClick: () => void
  danger?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        background: hovered
          ? danger
            ? 'rgba(239,68,68,0.1)'
            : 'var(--bg3)'
          : 'transparent',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        color: danger ? '#f87171' : 'var(--text)',
        fontSize: 13,
        textAlign: 'left',
        transition: 'background 0.12s',
      }}
    >
      <span style={{ opacity: 0.7, flexShrink: 0, display: 'flex' }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {right}
    </button>
  )
}

// ── AccountButton ─────────────────────────────────────────────

interface AccountButtonProps {
  isExpanded: boolean
}

export function AccountButton({ isExpanded }: AccountButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [user, setUser] = useState<{
    name: string
    email: string
    avatarUrl: string | null
  }>({ name: '', email: '', avatarUrl: null })
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark')
  const [lang, setLangState] = useState<'id' | 'en'>('id')
  const [isSuper, setIsSuper] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [popupPos, setPopupPos] = useState({ bottom: 0, left: 8, width: 220 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load user + settings on mount
  useEffect(() => {
    getSupabase()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user) {
          const meta = data.user.user_metadata ?? {}
          setUser({
            name:
              meta.full_name ??
              meta.name ??
              data.user.email?.split('@')[0] ??
              'User',
            email: data.user.email ?? '',
            avatarUrl: meta.avatar_url ?? null,
          })
          setIsSuper(isSuperAdmin(data.user.email))
        }
      })

    try {
      const t = localStorage.getItem('bentala_theme') as 'dark' | 'light' | null
      if (t) setThemeState(t)
      const l = localStorage.getItem('bentala_lang') as 'id' | 'en' | null
      if (l) setLangState(l)
    } catch {}
  }, [])

  // Click-outside to close popup
  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // ── Actions ──

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setThemeState(next)
    try { localStorage.setItem('bentala_theme', next) } catch {}
    if (next === 'light') {
      document.documentElement.setAttribute('data-theme', 'light')
    } else {
      document.documentElement.removeAttribute('data-theme')
    }
    window.dispatchEvent(new CustomEvent('bentala:theme', { detail: next }))
  }

  function toggleLang() {
    const next = lang === 'id' ? 'en' : 'id'
    setLangState(next)
    try { localStorage.setItem('bentala_lang', next) } catch {}
    window.dispatchEvent(new CustomEvent('bentala:lang', { detail: next }))
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')

    if (file.size > 20 * 1024 * 1024) {
      setUploadError('Ukuran file maks 20MB')
      return
    }

    setUploading(true)
    try {
      const blob = await compressImage(file)
      const supabase = getSupabase()
      const {
        data: { user: authUser },
      } = await supabase.auth.getUser()
      if (!authUser) throw new Error('no user')

      const path = `${authUser.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr

      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(path)

      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      setUser(u => ({ ...u, avatarUrl: publicUrl }))
    } catch {
      setUploadError('Upload gagal, coba lagi')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  async function handleLogout() {
    const { error } = await getSupabase().auth.signOut()
    if (!error) {
      router.push('/login')
      router.refresh()
    }
  }

  const initials = getInitials(user.name || 'User')

  // ── Render ──

  return (
    <div ref={wrapRef} style={{ position: 'relative', flexShrink: 0 }}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Card trigger */}
      <div
        onClick={() => {
          if (!open && wrapRef.current) {
            const rect = wrapRef.current.getBoundingClientRect()
            setPopupPos({ bottom: window.innerHeight - rect.top + 4, left: 8, width: 220 })
          }
          setOpen(o => !o)
        }}
        style={{ borderTop: '1px solid var(--border)', padding: 8, cursor: 'pointer' }}
      >
        <div
          style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: isExpanded ? '8px 10px' : '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: isExpanded ? 'flex-start' : 'center',
            gap: isExpanded ? 8 : 0,
            overflow: 'hidden',
            transition: 'border-color 0.15s, padding 0.22s ease, gap 0.22s ease, justify-content 0.22s ease',
          }}
          onMouseOver={e =>
            (e.currentTarget.style.borderColor = 'var(--accent)')
          }
          onMouseOut={e =>
            (e.currentTarget.style.borderColor = 'var(--border)')
          }
        >
          {/* Avatar */}
          <Avatar url={user.avatarUrl} initials={initials} size={28} />

          {/* Name + email (visible when expanded) */}
          <div
            style={{
              flex: 1,
              overflow: 'hidden',
              maxWidth: isExpanded ? 130 : 0,
              opacity: isExpanded ? 1 : 0,
              transition: 'max-width 0.22s ease, opacity 0.15s ease',
              whiteSpace: 'nowrap',
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 600,
                color: 'var(--text)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user.name}
            </div>
            <div
              style={{
                fontSize: 10,
                color: 'var(--text2)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {user.email}
            </div>
          </div>

          {/* Chevron */}
          {isExpanded && (
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--text2)"
              strokeWidth="2.5"
              style={{ flexShrink: 0 }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </div>
      </div>

      {/* Popup */}
      {open && (
        <div
          className="animate-slide-up"
          style={{
            position: 'fixed',
            bottom: popupPos.bottom,
            left: popupPos.left,
            width: popupPos.width,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            zIndex: 1000,
          }}
        >
          {/* User header — click avatar to change photo */}
          <div
            style={{
              padding: '12px 14px',
              borderBottom: '1px solid var(--border)',
              display: 'flex',
              gap: 10,
              alignItems: 'center',
            }}
          >
            <div
              onClick={() => fileInputRef.current?.click()}
              title="Ganti foto profil"
              style={{ cursor: 'pointer', borderRadius: '50%', flexShrink: 0 }}
            >
              <Avatar url={user.avatarUrl} initials={initials} size={40} hoverable />
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--text)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.name}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: 'var(--text2)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {user.email}
              </div>
            </div>
          </div>

          {/* Upload error */}
          {uploadError && (
            <div
              style={{
                padding: '6px 14px',
                fontSize: 11,
                color: 'var(--accent2)',
              }}
            >
              {uploadError}
            </div>
          )}

          {/* Menu */}
          <div style={{ padding: '6px 4px' }}>
            <PopupItem
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="8" r="4"/>
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              }
              label={uploading ? 'Mengupload...' : 'Edit Profil'}
              onClick={() => { if (!uploading) fileInputRef.current?.click() }}
            />

            <PopupItem
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              }
              label="Ganti Bahasa"
              right={
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--accent)',
                    background: 'rgba(108,99,255,0.12)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {lang.toUpperCase()}
                </span>
              }
              onClick={toggleLang}
            />

            <PopupItem
              icon={
                theme === 'dark' ? (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="5"/>
                    <line x1="12" y1="1" x2="12" y2="3"/>
                    <line x1="12" y1="21" x2="12" y2="23"/>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                    <line x1="1" y1="12" x2="3" y2="12"/>
                    <line x1="21" y1="12" x2="23" y2="12"/>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                  </svg>
                )
              }
              label="Tema"
              right={
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--accent)',
                    background: 'rgba(108,99,255,0.12)',
                    padding: '2px 6px',
                    borderRadius: 4,
                  }}
                >
                  {theme === 'dark' ? 'Dark' : 'Light'}
                </span>
              }
              onClick={toggleTheme}
            />

            {isSuper && (
              <PopupItem
                icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                }
                label="Setting Access"
                onClick={() => {
                  setOpen(false)
                  router.push('/settings/access')
                }}
              />
            )}

            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />

            <PopupItem
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
              }
              label="Keluar"
              danger
              onClick={handleLogout}
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Avatar sub-component ──────────────────────────────────────

function Avatar({
  url,
  initials,
  size,
  hoverable = false,
}: {
  url: string | null
  initials: string
  size: number
  hoverable?: boolean
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <div
      onMouseEnter={() => hoverable && setHovered(true)}
      onMouseLeave={() => hoverable && setHovered(false)}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: url
          ? 'transparent'
          : 'linear-gradient(135deg,#6c63ff,#a855f7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.36,
        fontWeight: 700,
        color: '#fff',
        overflow: 'hidden',
        flexShrink: 0,
        outline: hoverable && hovered ? '2px solid var(--accent)' : '2px solid transparent',
        outlineOffset: 1,
        transition: 'outline 0.15s',
      }}
    >
      {url ? (
        <img
          src={url}
          alt={initials}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      ) : (
        initials
      )}
    </div>
  )
}
