# Account Button & Notification Bell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a user account card button at the bottom of the sidebar (with photo, settings, lang/theme toggle, logout popup) and a notification bell at the top-right of the PageHeader, while removing the existing "Keluar" button from PageHeader.

**Architecture:** Two new client components (`AccountButton`, `NotificationBell`) wired into the existing `Sidebar` and `PageHeader`. Notifications use the existing `activity_log` Zustand store with localStorage-based unread tracking. Theme and language preferences are persisted in localStorage and propagated via `CustomEvent` so all components update without a page reload.

**Tech Stack:** Next.js 13+ App Router, React hooks, Supabase auth + Storage, Zustand store, localStorage, browser Canvas API, CSS custom properties.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `app/globals.css` | Modify | Add `[data-theme="light"]` CSS variable overrides |
| `app/layout.tsx` | Modify | Inject inline `<script>` to set theme before paint (no flash) |
| `components/shared/NotificationBell.tsx` | Create | Bell icon, unread badge, activity popup |
| `components/shared/AccountButton.tsx` | Create | Card button, popup with all account actions |
| `components/Sidebar.tsx` | Modify | Mount `<AccountButton isExpanded={isExpanded} />` at the bottom |
| `components/shared/PageHeader.tsx` | Modify | Remove Keluar button, add `<NotificationBell />` |

---

## Task 1: Light Mode CSS Variables

**Files:**
- Modify: `app/globals.css`

- [ ] **Step 1: Add light theme block to globals.css**

Open `app/globals.css` and append this block at the end of the file (after the last rule):

```css
[data-theme="light"] {
  --bg: #f4f5fa;
  --bg2: #ffffff;
  --bg3: #eef0f7;
  --border: #d5d8ea;
  --text: #1a1d2e;
  --text2: #6b7280;
}
```

- [ ] **Step 2: Verify in browser**

Open the app. In browser DevTools console run:
```js
document.documentElement.setAttribute('data-theme', 'light')
```
Confirm backgrounds turn light and text turns dark. Then remove: `document.documentElement.removeAttribute('data-theme')`.

- [ ] **Step 3: Commit**

```bash
git add app/globals.css
git commit -m "feat: add light mode CSS variables"
```

---

## Task 2: Theme Initializer (No Flash)

**Files:**
- Modify: `app/layout.tsx`

- [ ] **Step 1: Add inline script to RootLayout**

Replace the entire `app/layout.tsx` with:

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bentala Internal System',
  description: 'Internal management system for Bentala',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="id">
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('bentala_theme');if(t==='light')document.documentElement.setAttribute('data-theme','light');}catch(e){}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 2: Verify no hydration error**

Run `npm run dev`. Open the app, check browser console — no hydration mismatch errors.

- [ ] **Step 3: Commit**

```bash
git add app/layout.tsx
git commit -m "feat: inject theme init script to prevent flash on load"
```

---

## Task 3: NotificationBell Component

**Files:**
- Create: `components/shared/NotificationBell.tsx`

- [ ] **Step 1: Create the component**

Create `components/shared/NotificationBell.tsx` with the following content:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { useStore } from '@/hooks/useStore'

const STORAGE_KEY = 'bentala_notif_last_seen'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}

const BTN_H = 32

export function NotificationBell() {
  const activity = useStore(s => s.activity)
  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<number>(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setLastSeen(parseInt(saved, 10))
    } catch {}
  }, [])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  function handleOpen() {
    const nowOpen = !open
    setOpen(nowOpen)
    if (nowOpen) {
      const now = Date.now()
      setLastSeen(now)
      try { localStorage.setItem(STORAGE_KEY, String(now)) } catch {}
    }
  }

  function markAllRead() {
    const now = Date.now()
    setLastSeen(now)
    try { localStorage.setItem(STORAGE_KEY, String(now)) } catch {}
  }

  const recent = activity.slice(0, 20)
  const unread = activity.filter(
    a => new Date(a.created_at).getTime() > lastSeen
  ).length

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={handleOpen}
        style={{
          height: BTN_H,
          width: BTN_H,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: 8,
          background: 'transparent',
          border: '1px solid var(--border)',
          color: 'var(--text2)',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
        }}
        onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        title="Notifikasi"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: '#ef4444',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 3px',
              pointerEvents: 'none',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="animate-slide-up"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 4px)',
            width: 320,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            zIndex: 999,
          }}
        >
          {/* Header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>
              Aktivitas
            </span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{
                  fontSize: 11,
                  color: 'var(--accent)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                Tandai semua dibaca
              </button>
            )}
          </div>

          {/* List */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {recent.length === 0 ? (
              <div
                style={{
                  padding: '24px 14px',
                  textAlign: 'center',
                  color: 'var(--text2)',
                  fontSize: 13,
                }}
              >
                Belum ada aktivitas
              </div>
            ) : (
              recent.map(item => {
                const isUnread = new Date(item.created_at).getTime() > lastSeen
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 14px',
                      borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'rgba(108,99,255,0.06)' : 'transparent',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: '50%',
                        background: 'linear-gradient(135deg,#6c63ff,#a855f7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {item.user_name.slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                        {item.message}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>
                        {relativeTime(item.created_at)}
                      </div>
                    </div>
                    {isUnread && (
                      <div
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: 'var(--accent)',
                          marginTop: 5,
                          flexShrink: 0,
                        }}
                      />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/shared/NotificationBell.tsx
git commit -m "feat: add NotificationBell component with unread tracking"
```

---

## Task 4: AccountButton Component

**Files:**
- Create: `components/shared/AccountButton.tsx`

- [ ] **Step 1: Create the component**

Create `components/shared/AccountButton.tsx`:

```tsx
'use client'

import { useState, useEffect, useRef } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

// ── Helpers ──────────────────────────────────────────────────

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

async function compressImage(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
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
    img.onerror = reject
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
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
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
    await getSupabase().auth.signOut()
    router.push('/login')
    router.refresh()
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
        onClick={() => setOpen(o => !o)}
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
            gap: isExpanded ? 8 : 0,
            overflow: 'hidden',
            transition: 'border-color 0.15s, padding 0.22s ease, gap 0.22s ease',
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
            position: 'absolute',
            bottom: 'calc(100% + 4px)',
            left: 8,
            right: 8,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
            overflow: 'hidden',
            zIndex: 200,
            minWidth: 220,
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
```

- [ ] **Step 2: Commit**

```bash
git add components/shared/AccountButton.tsx
git commit -m "feat: add AccountButton with photo upload, theme/lang toggle, and logout"
```

---

## Task 5: Wire AccountButton into Sidebar

**Files:**
- Modify: `components/Sidebar.tsx`

- [ ] **Step 1: Import AccountButton**

At the top of `components/Sidebar.tsx`, add this import after the existing imports:

```tsx
import { AccountButton } from '@/components/shared/AccountButton'
```

- [ ] **Step 2: Mount AccountButton at the bottom of the sidebar**

In `components/Sidebar.tsx`, the `<nav>` currently contains two children:
1. The logo `<div>` (lines ~199–227)
2. The nav sections `<div className="flex-1 overflow-y-auto ...">` (lines ~229–342)

After the closing `</div>` of the nav sections div (and before `</nav>`), add:

```tsx
      {/* Account button */}
      <AccountButton isExpanded={isExpanded} />
```

The full bottom of the `<nav>` should look like:

```tsx
      {/* Nav Sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
        {/* ... existing sections map ... */}
      </div>

      {/* Account button */}
      <AccountButton isExpanded={isExpanded} />
    </nav>
```

- [ ] **Step 3: Verify visually**

Run `npm run dev`. Open the app. Confirm:
- A card button appears at the bottom of the sidebar
- When sidebar is collapsed (not hovered): only avatar shows
- When sidebar is expanded (hover): avatar + name + email + chevron show
- Clicking the card opens a popup above it with all menu items

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: mount AccountButton at bottom of Sidebar"
```

---

## Task 6: Update PageHeader — Remove Keluar, Add NotificationBell

**Files:**
- Modify: `components/shared/PageHeader.tsx`

- [ ] **Step 1: Import NotificationBell**

At the top of `components/shared/PageHeader.tsx`, add this import:

```tsx
import { NotificationBell } from '@/components/shared/NotificationBell'
```

- [ ] **Step 2: Remove the Keluar button**

In `components/shared/PageHeader.tsx`, find and delete the entire Keluar button block. It looks like this (currently around lines 226–249):

```tsx
          {/* Keluar */}
          <button
            onClick={handleLogout}
            style={{
              height: BTN_H,
              padding: '0 14px',
              borderRadius: 8,
              background: 'transparent',
              border: '1px solid var(--border)',
              color: 'var(--text2)',
              fontSize: 13,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
            onMouseOver={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent2)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--accent2)'
            }}
            onMouseOut={e => {
              (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text2)'
            }}
          >
            Keluar
          </button>
```

Delete this block entirely.

- [ ] **Step 3: Also remove handleLogout and its imports if now unused**

In `PageHeader.tsx`, `handleLogout`, `getSupabase`, and `useRouter` are now only used by the Keluar button. Remove them:

Delete this function:
```tsx
  async function handleLogout() {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }
```

Remove from the import at line 1:
- `getSupabase` from `@/lib/supabase`
- `useRouter` from `next/navigation`

Remove from the `useState` import block if `useRouter` was the only one from `next/navigation`.

- [ ] **Step 4: Add NotificationBell in the actions div**

Find the `{/* Actions */}` div in `PageHeader.tsx`. It currently looks like:

```tsx
        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Date filter */}
          {showDateFilter && (
            ...
          )}
          {/* [Keluar was here, now deleted] */}
        </div>
```

Add `<NotificationBell />` inside the actions div, after the date filter block:

```tsx
        {/* Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Date filter */}
          {showDateFilter && (
            <div style={{ position: 'relative' }}>
              {/* ... existing date filter JSX unchanged ... */}
            </div>
          )}

          {/* Notification bell */}
          <NotificationBell />
        </div>
```

- [ ] **Step 5: Verify all pages**

Run `npm run dev`. Check each page:
- No "Keluar" button in topbar on any page
- Bell icon appears top-right on all pages
- Bell badge appears if there are activity_log entries newer than last seen
- Clicking bell opens dropdown; badge disappears after click
- Clicking outside closes the dropdown

- [ ] **Step 6: Commit**

```bash
git add components/shared/PageHeader.tsx
git commit -m "feat: replace Keluar button with NotificationBell in PageHeader"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Account card button bottom-left sidebar | Task 4, 5 |
| Option C card style (avatar + name + email + chevron) | Task 4 |
| Collapsed sidebar: avatar only | Task 4 (isExpanded prop) |
| Photo upload — click avatar or Edit Profil | Task 4 |
| File > 20MB → reject with inline error | Task 4 (handleFileChange) |
| File ≤ 20MB but large → canvas compress 1920px max, JPEG 0.92 | Task 4 (compressImage) |
| Upload to Supabase Storage `avatars` bucket | Task 4 |
| Save publicUrl to user_metadata.avatar_url | Task 4 |
| Ganti Bahasa toggle ID/EN | Task 4 (toggleLang + CustomEvent) |
| Tema toggle dark/light | Task 1, 2, 4 |
| Theme persisted via localStorage | Task 4 |
| No flash on page load | Task 2 |
| Keluar → signOut + redirect | Task 4 |
| Notification bell top-right in PageHeader | Task 6 |
| Unread badge with count, cap 9+ | Task 3 |
| Popup with up to 20 activity_log entries | Task 3 |
| Relative timestamps (menit lalu, jam lalu) | Task 3 |
| Unread tracking via localStorage timestamp | Task 3 |
| Mark all read button | Task 3 |
| Click outside closes both popups | Task 3, 4 |
| Empty state "Belum ada aktivitas" | Task 3 |
| Remove Keluar button from PageHeader | Task 6 |
| Light mode CSS variables | Task 1 |

**Placeholder scan:** No TBD, TODO, or incomplete steps found.

**Type consistency:** `isExpanded: boolean` prop used consistently Tasks 4→5. `ActivityLog` type from `@/lib/types` matches `useStore().activity` shape. `getSupabase()` used consistently across Tasks 4 and 6.
