'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { isSuperAdmin } from '@/lib/access'
import { AccountEditModal } from '@/app/(dashboard)/settings/access/AccountEditModal'
import type { AccessUser } from '@/app/(dashboard)/settings/access/AccessControlClient'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useLang } from '@/lib/i18n/LanguageProvider'

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
    phone: string
    position: string
    createdAt: string | null
    lastSignInAt: string | null
  }>({ name: '', email: '', avatarUrl: null, phone: '', position: '', createdAt: null, lastSignInAt: null })
  const [editOpen, setEditOpen] = useState(false)
  // Self-service password change.
  const [pwOpen, setPwOpen] = useState(false)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [pwErr, setPwErr] = useState('')
  const [pwOk, setPwOk] = useState(false)
  const { lang, setLang, t } = useLang()
  const [isSuper, setIsSuper] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [popupPos, setPopupPos] = useState({ bottom: 0, left: 8, width: 220 })
  const wrapRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadUser = useCallback(async () => {
    const { data } = await getSupabase().auth.getUser()
    if (!data.user) return
    const meta = data.user.user_metadata ?? {}
    setUser({
      name: meta.full_name ?? meta.name ?? data.user.email?.split('@')[0] ?? 'User',
      email: data.user.email ?? '',
      avatarUrl: meta.avatar_url ?? null,
      phone: meta.phone ?? '',
      position: meta.position ?? '',
      createdAt: data.user.created_at ?? null,
      lastSignInAt: data.user.last_sign_in_at ?? null,
    })
    // Role is in app_metadata (service-role-only; not user-writable).
    setIsSuper(isSuperAdmin(data.user.email) || data.user.app_metadata?.role === 'super_admin')
  }, [])

  // Load user on mount
  useEffect(() => {
    loadUser()
  }, [loadUser])

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

  function toggleLang() {
    setLang(lang === 'id' ? 'en' : 'id')
  }

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadError('')

    if (file.size > 20 * 1024 * 1024) {
      setUploadError(t('Ukuran file maks 20MB'))
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

      const path = `avatars/${authUser.id}/avatar.jpg`
      const { error: upErr } = await supabase.storage
        .from('bsi-website')
        .upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (upErr) throw upErr

      const {
        data: { publicUrl },
      } = supabase.storage.from('bsi-website').getPublicUrl(path)

      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      setUser(u => ({ ...u, avatarUrl: publicUrl }))
    } catch {
      setUploadError(t('Upload gagal, coba lagi'))
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  function openPwModal() {
    setPw1(''); setPw2(''); setShowPw(false); setPwErr(''); setPwOk(false)
    setOpen(false); setPwOpen(true)
  }

  async function submitPassword() {
    setPwErr(''); setPwOk(false)
    if (pw1.length < 6) { setPwErr(t('Password minimal 6 karakter')); return }
    if (pw1 !== pw2) { setPwErr(t('Konfirmasi password tidak cocok')); return }
    setPwBusy(true)
    try {
      const { error } = await getSupabase().auth.updateUser({ password: pw1 })
      if (error) throw new Error(error.message)
      setPwOk(true)
      setPw1(''); setPw2('')
    } catch (err) {
      setPwErr(err instanceof Error ? err.message : 'Gagal mengubah password')
    } finally {
      setPwBusy(false)
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
              title={t('Ganti foto profil')}
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
              label={t('Edit Profil')}
              onClick={() => { setOpen(false); setEditOpen(true) }}
            />

            <PopupItem
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="11" width="18" height="11" rx="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  <circle cx="12" cy="16" r="1"/>
                </svg>
              }
              label={t('Ubah Password')}
              onClick={openPwModal}
            />

            <PopupItem
              icon={
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="2" y1="12" x2="22" y2="12"/>
                  <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              }
              label={t('Ganti Bahasa')}
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

            {isSuper && (
              <PopupItem
                icon={
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                }
                label={t('Setting Access')}
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
              label={t('Keluar')}
              danger
              onClick={handleLogout}
            />
          </div>
        </div>
      )}

      {/* Self profile edit modal */}
      {editOpen && (
        <AccountEditModal
          self
          user={{
            email: user.email, name: user.name, avatarUrl: user.avatarUrl,
            isSuperAdmin: isSuper, role: isSuper ? 'super_admin' : 'admin', locked: isSuperAdmin(user.email),
            sections: [], phone: user.phone, position: user.position,
            language: 'id', notif: { email: true, inApp: true, push: false }, active: true,
            createdAt: user.createdAt, lastSignInAt: user.lastSignInAt,
          }}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); loadUser() }}
        />
      )}

      {/* Self password-change modal */}
      <Modal
        open={pwOpen}
        onClose={() => setPwOpen(false)}
        title={t('Ubah Password')}
        footer={
          pwOk ? (
            <BtnPrimary onClick={() => setPwOpen(false)}>{t('Selesai')}</BtnPrimary>
          ) : (
            <>
              <BtnSecondary onClick={() => setPwOpen(false)}>{t('Batal')}</BtnSecondary>
              <BtnPrimary onClick={submitPassword} loading={pwBusy} disabled={!pw1 || !pw2}>
                {t('Simpan Password')}
              </BtnPrimary>
            </>
          )
        }
      >
        {pwOk ? (
          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
            {t('Password berhasil diubah. Gunakan password baru saat login berikutnya.')}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <PwField label={t('Password baru')} value={pw1} onChange={setPw1} show={showPw} placeholder={t('Minimal 6 karakter')} onEnter={submitPassword} />
            <PwField label={t('Ulangi password baru')} value={pw2} onChange={setPw2} show={showPw} placeholder={t('Ketik ulang password')} onEnter={submitPassword} />
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: 'var(--text2)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showPw} onChange={e => setShowPw(e.target.checked)} style={{ width: 'auto' }} />
              {t('Tampilkan password')}
            </label>
            {pwErr && <div style={{ fontSize: 12, color: 'var(--accent2)' }}>{pwErr}</div>}
          </div>
        )}
      </Modal>
    </div>
  )
}

// ── Password field ────────────────────────────────────────────

function PwField({
  label, value, onChange, show, placeholder, onEnter,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  placeholder?: string
  onEnter?: () => void
}) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="new-password"
        onKeyDown={e => { if (e.key === 'Enter') onEnter?.() }}
      />
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
        <img loading="lazy" decoding="async"
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
