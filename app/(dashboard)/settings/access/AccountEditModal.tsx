'use client'

import { useRef, useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { getSupabase } from '@/lib/supabase'
import { CropModal } from './CropModal'
import type { AccessUser } from './AccessControlClient'

const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function AccountEditModal({ user, onClose, onSaved, self = false, canEditRole = false }: {
  user: AccessUser
  onClose: () => void
  onSaved: () => void
  /** Self-service mode: the logged-in user editing their own profile (uses
   *  supabase.auth.updateUser instead of the admin API; email is read-only). */
  self?: boolean
  /** Allow a super admin to change this account's role (Admin / Super Admin). */
  canEditRole?: boolean
}) {
  const [name, setName] = useState(user.name)
  const [email, setEmail] = useState(user.email)
  const [phone, setPhone] = useState(user.phone)
  const [position, setPosition] = useState(user.position)
  const [role, setRole] = useState<'super_admin' | 'admin' | 'user'>(user.role)

  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl)
  const [avatarFile, setAvatarFile] = useState<File | null>(null)
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [preview, setPreview] = useState(false)

  function applyCropped(file: File) {
    setAvatarFile(file)
    setAvatarPreview(URL.createObjectURL(file))
    setCropFile(null)
  }

  async function uploadAvatar(): Promise<string | null> {
    if (!avatarFile) return null
    const ext = (avatarFile.name.split('.').pop() || 'jpg').toLowerCase()
    if (self) {
      const { data: au } = await sb().auth.getUser()
      const id = au.user?.id
      if (!id) throw new Error('Sesi tidak ditemukan')
      const path = `${id}/avatar-${Date.now()}.${ext}`
      const { error: upErr } = await sb().storage.from('avatars').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })
      if (upErr) throw new Error('Gagal upload foto: ' + upErr.message)
      return sb().storage.from('avatars').getPublicUrl(path).data.publicUrl
    }
    const path = `avatars/${user.email.replace(/[^a-z0-9]/gi, '_')}-${Date.now()}.${ext}`
    const { error: upErr } = await sb().storage.from('bsi-website').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type })
    if (upErr) throw new Error('Gagal upload foto: ' + upErr.message)
    return sb().storage.from('bsi-website').getPublicUrl(path).data.publicUrl
  }

  async function save() {
    setError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) { setError('Email tidak valid'); return }
    setBusy(true)
    try {
      let finalAvatar = avatarUrl
      if (avatarFile) finalAvatar = await uploadAvatar()

      if (self) {
        // Logged-in user updating their own profile. Any account can change its
        // own email — this triggers Supabase's email-confirmation flow.
        const payload: { data: Record<string, unknown>; email?: string } = {
          data: { full_name: name, phone, position, avatar_url: finalAvatar ?? '' },
        }
        if (email.trim() && email.trim() !== user.email) payload.email = email.trim()
        const { error: upErr } = await sb().auth.updateUser(payload)
        if (upErr) throw new Error(upErr.message)
      } else {
        const r = await fetch('/api/access/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: user.email,
            profile: { full_name: name, email: email.trim(), phone, position, avatar_url: finalAvatar ?? '', ...(canEditRole ? { role } : {}) },
          }),
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || 'Gagal menyimpan')
      }

      setDone(true)
      setTimeout(() => onSaved(), 700)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setBusy(false)
    }
  }

  const shownAvatar = avatarPreview || avatarUrl

  return (
    <>
    <Modal
      open
      onClose={onClose}
      wide
      maxWidth={620}
      title="Edit Akun"
      footer={
        <>
          {done && <span style={{ fontSize: 12.5, color: '#34d399', marginRight: 'auto' }}>Tersimpan ✓</span>}
          {error && <span style={{ fontSize: 12.5, color: '#f87171', marginRight: 'auto' }}>{error}</span>}
          <BtnSecondary onClick={onClose} disabled={busy}>Tutup</BtnSecondary>
          <BtnPrimary onClick={save} loading={busy}>Simpan Perubahan</BtnPrimary>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
        {/* Identity header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div
              onClick={() => { if (shownAvatar) setPreview(true) }}
              title={shownAvatar ? 'Lihat foto' : undefined}
              style={{
                width: 72, height: 72, borderRadius: '50%', overflow: 'hidden',
                background: shownAvatar ? 'var(--bg3)' : 'linear-gradient(135deg,#6c63ff,#a855f7)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 26,
                boxShadow: '0 0 0 2px var(--bg2), 0 0 0 4px var(--border)',
                cursor: shownAvatar ? 'zoom-in' : 'default',
              }}
            >
              {shownAvatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={shownAvatar} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (name[0] || '?').toUpperCase()}
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              title="Ganti foto"
              style={{
                position: 'absolute', right: -2, bottom: -2, width: 28, height: 28, borderRadius: '50%',
                border: '2px solid var(--bg2)', background: 'var(--accent)', color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
              </svg>
            </button>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name || '—'}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user.email}</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => fileRef.current?.click()} style={btnGhost}>Ganti Foto</button>
              {shownAvatar && <button onClick={() => { setAvatarFile(null); setAvatarPreview(null); setAvatarUrl(null) }} style={btnGhostMuted}>Hapus</button>}
            </div>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { const f = e.target.files?.[0]; if (f) setCropFile(f); e.currentTarget.value = '' }} />
          </div>
        </div>

        <Divider />

        {/* Profile */}
        <Section title="Profil">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Nama lengkap"><Input value={name} onChange={setName} placeholder="Nama lengkap" /></Field>
            <Field label="Email">
              <Input value={email} onChange={setEmail} type="email" placeholder="email@masterbagasi.com" />
              {self && email.trim() !== user.email && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 4 }}>Link konfirmasi akan dikirim ke email baru.</div>
              )}
            </Field>
            <Field label="Nomor telepon"><Input value={phone} onChange={setPhone} placeholder="08xxxxxxxxxx" /></Field>
            <Field label="Jabatan / posisi"><Input value={position} onChange={setPosition} placeholder="mis. Videographer" /></Field>
            {canEditRole && (
              <div style={{ gridColumn: '1 / -1' }}>
                <Field label="Peran (role)">
                  <div style={{ display: 'flex', gap: 8 }}>
                    {([['super_admin', 'Super Admin'], ['admin', 'Admin'], ['user', 'User']] as const).map(([r, lbl]) => (
                      <button
                        key={r}
                        onClick={() => setRole(r)}
                        style={{
                          flex: 1, padding: '9px 0', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                          border: `1px solid ${role === r ? 'var(--accent)' : 'var(--border)'}`,
                          background: role === r ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
                          color: role === r ? 'var(--accent)' : 'var(--text2)',
                        }}
                      >
                        {lbl}
                      </button>
                    ))}
                  </div>
                </Field>
              </div>
            )}
          </div>
        </Section>

        <Divider />

        {/* Info */}
        <Section title="Info Akun">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <InfoCell label="Tanggal bergabung" value={fmtDate(user.createdAt)} />
            <InfoCell label="Login terakhir" value={fmtDate(user.lastSignInAt)} />
          </div>
        </Section>
      </div>

      {/* Photo preview lightbox */}
      {preview && shownAvatar && (
        <div
          onClick={() => setPreview(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32, cursor: 'zoom-out' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={shownAvatar} alt="" style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 12, boxShadow: '0 12px 48px rgba(0,0,0,0.6)' }} />
          <button
            onClick={(e) => { e.stopPropagation(); setPreview(false) }}
            aria-label="Tutup"
            style={{ position: 'absolute', top: 18, right: 22, width: 40, height: 40, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,0.12)', color: '#fff', fontSize: 20, cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}
    </Modal>

    {cropFile && (
      <CropModal file={cropFile} onCancel={() => setCropFile(null)} onDone={applyCropped} />
    )}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>{title}</div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 500, color: 'var(--text2)' }}>{label}</label>
      {children}
    </div>
  )
}

function Input({ value, onChange, type = 'text', placeholder, disabled = false }: { value: string; onChange: (v: string) => void; type?: string; placeholder?: string; disabled?: boolean }) {
  const [focus, setFocus] = useState(false)
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      placeholder={placeholder}
      disabled={disabled}
      autoComplete={type === 'password' ? 'new-password' : 'off'}
      style={{
        width: '100%', boxSizing: 'border-box', background: disabled ? 'var(--bg2)' : 'var(--bg3)',
        border: `1px solid ${focus && !disabled ? 'var(--accent)' : 'var(--border)'}`,
        boxShadow: focus && !disabled ? '0 0 0 3px rgba(108,99,255,0.15)' : 'none',
        borderRadius: 9, padding: '10px 12px', color: disabled ? 'var(--text2)' : 'var(--text)', fontSize: 13, outline: 'none',
        cursor: disabled ? 'not-allowed' : 'text',
        transition: 'border-color 0.12s, box-shadow 0.12s',
      }}
    />
  )
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{value}</div>
    </div>
  )
}

function Divider() {
  return <div style={{ height: 1, background: 'var(--border)', opacity: 0.6 }} />
}

const btnGhost: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg3)', color: 'var(--text)', fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
}
const btnGhostMuted: React.CSSProperties = {
  padding: '6px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'transparent', color: 'var(--text2)', fontSize: 12.5, cursor: 'pointer',
}
