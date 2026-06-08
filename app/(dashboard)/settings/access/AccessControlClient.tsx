'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'

// ── Types (mirror /api/access GET response) ──
interface SectionMeta {
  id: string
  label: string
  group: string
  subgroup?: string
}
interface AccessUser {
  email: string
  name: string
  avatarUrl: string | null
  isSuperAdmin: boolean
  sections: string[]
}

type RowState = 'idle' | 'saving' | 'saved' | 'error'

function initials(name: string): string {
  return (
    name
      .split(' ')
      .filter(Boolean)
      .map(w => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || '?'
  )
}

export default function AccessControlClient() {
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [sections, setSections] = useState<SectionMeta[]>([])
  const [users, setUsers] = useState<AccessUser[]>([])

  // Per-row editable selection + saved baseline + status.
  const [draft, setDraft] = useState<Record<string, Set<string>>>({})
  const [saved, setSaved] = useState<Record<string, Set<string>>>({})
  const [status, setStatus] = useState<Record<string, RowState>>({})
  const [query, setQuery] = useState('')

  // Which account's access modal is open.
  const [editEmail, setEditEmail] = useState<string | null>(null)

  // Add-account form.
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')

  // Password-change modal (one account at a time).
  const [pwEmail, setPwEmail] = useState<string | null>(null)
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [show1, setShow1] = useState(false)
  const [show2, setShow2] = useState(false)
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwDone, setPwDone] = useState(false)

  function openPwModal(email: string) {
    setPwEmail(email)
    setPw1(''); setPw2(''); setShow1(false); setShow2(false)
    setPwError(''); setPwDone(false); setPwBusy(false)
  }
  function closePwModal() { setPwEmail(null) }

  async function reload(preserveDraft: boolean) {
    const r = await fetch('/api/access')
    if (!r.ok) throw new Error(String(r.status))
    const data: { users: AccessUser[]; sections: SectionMeta[] } = await r.json()
    setSections(data.sections)
    setUsers(data.users)
    const fresh: Record<string, Set<string>> = {}
    for (const u of data.users) fresh[u.email] = new Set(u.sections)
    setSaved(cloneMap(fresh))
    setDraft(prev => {
      const d: Record<string, Set<string>> = {}
      for (const u of data.users) {
        d[u.email] = preserveDraft && prev[u.email] ? prev[u.email] : new Set(u.sections)
      }
      return d
    })
  }

  useEffect(() => {
    let cancelled = false
    reload(false)
      .catch(() => { if (!cancelled) setLoadError('Gagal memuat data akses. Pastikan Anda super admin.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addAccount() {
    setAddError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { setAddError('Email tidak valid'); return }
    if (newPassword.length < 6) { setAddError('Password minimal 6 karakter'); return }
    setAddBusy(true)
    try {
      const r = await fetch('/api/access/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), password: newPassword }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Gagal membuat akun')
      await reload(true)
      setShowAdd(false); setNewEmail(''); setNewPassword('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Gagal membuat akun')
    } finally {
      setAddBusy(false)
    }
  }

  async function submitPassword() {
    if (!pwEmail) return
    setPwError('')
    if (pw1.length < 6) { setPwError('Password minimal 6 karakter'); return }
    if (pw1 !== pw2) { setPwError('Password tidak sama dengan pengulangannya'); return }
    setPwBusy(true)
    try {
      const r = await fetch('/api/access/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: pwEmail, password: pw1 }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || 'Gagal mengganti password')
      setPwDone(true)
      setTimeout(() => closePwModal(), 1200)
    } catch (e) {
      setPwError(e instanceof Error ? e.message : 'Gagal mengganti password')
    } finally {
      setPwBusy(false)
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(u => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q))
  }, [users, query])

  function toggle(email: string, sectionId: string) {
    setDraft(prev => {
      const next = new Set(prev[email] ?? [])
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return { ...prev, [email]: next }
    })
    setStatus(prev => ({ ...prev, [email]: 'idle' }))
  }

  function setAll(email: string, all: boolean) {
    setDraft(prev => ({ ...prev, [email]: all ? new Set(sections.map(s => s.id)) : new Set() }))
    setStatus(prev => ({ ...prev, [email]: 'idle' }))
  }

  function setGroupAll(email: string, group: string, on: boolean) {
    const ids = sections.filter(s => s.group === group).map(s => s.id)
    setDraft(prev => {
      const next = new Set(prev[email] ?? [])
      ids.forEach(id => (on ? next.add(id) : next.delete(id)))
      return { ...prev, [email]: next }
    })
    setStatus(prev => ({ ...prev, [email]: 'idle' }))
  }

  // group (ordered) → subgroup-key (ordered) → items.
  const grouped = useMemo(() => {
    const groupOrder: string[] = []
    const map = new Map<string, Map<string, SectionMeta[]>>()
    for (const s of sections) {
      if (!map.has(s.group)) { map.set(s.group, new Map()); groupOrder.push(s.group) }
      const subs = map.get(s.group)!
      const key = s.subgroup ?? ''
      if (!subs.has(key)) subs.set(key, [])
      subs.get(key)!.push(s)
    }
    return { groupOrder, map }
  }, [sections])

  function isDirty(email: string): boolean {
    const a = draft[email] ?? new Set<string>()
    const b = saved[email] ?? new Set<string>()
    if (a.size !== b.size) return true
    return Array.from(a).some(v => !b.has(v))
  }

  async function save(email: string) {
    const sel = Array.from(draft[email] ?? new Set())
    setStatus(prev => ({ ...prev, [email]: 'saving' }))
    try {
      const r = await fetch('/api/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, sections: sel }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setSaved(prev => ({ ...prev, [email]: new Set(sel) }))
      setStatus(prev => ({ ...prev, [email]: 'saved' }))
      setTimeout(() => setStatus(prev => (prev[email] === 'saved' ? { ...prev, [email]: 'idle' } : prev)), 1800)
    } catch {
      setStatus(prev => ({ ...prev, [email]: 'error' }))
    }
  }

  if (loading) return <div style={{ color: 'var(--text2)', fontSize: 13, padding: 8 }}>Memuat…</div>
  if (loadError) return <div style={{ color: '#f87171', fontSize: 13, padding: 8 }}>{loadError}</div>

  const editUser = users.find(u => u.email === editEmail) ?? null
  const editSel = editEmail ? (draft[editEmail] ?? new Set<string>()) : new Set<string>()
  const editSt = editEmail ? (status[editEmail] ?? 'idle') : 'idle'
  const editDirty = editEmail ? isDirty(editEmail) : false

  return (
    <div>
      {/* Intro + search + add */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 480, lineHeight: 1.5 }}>
          Pilih akun untuk mengatur menu yang boleh diaksesnya. Akun tanpa akses
          sama sekali tidak bisa membuka menu apa pun (default tertutup).
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari akun…"
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, minWidth: 180, outline: 'none' }}
          />
          <button
            onClick={() => { setShowAdd(v => !v); setAddError('') }}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + Tambah Akun
          </button>
        </div>
      </div>

      {/* Add-account form */}
      {showAdd && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Tambah Akun Baru</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="email@masterbagasi.com" autoComplete="off" style={addInputStyle} />
            <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="Password (min 6 karakter)" autoComplete="new-password" style={addInputStyle} />
            <button onClick={addAccount} disabled={addBusy} style={{ padding: '9px 18px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: addBusy ? 'not-allowed' : 'pointer', opacity: addBusy ? 0.7 : 1, whiteSpace: 'nowrap' }}>
              {addBusy ? 'Membuat…' : 'Buat Akun'}
            </button>
          </div>
          {addError && <div style={{ fontSize: 12, color: '#f87171', marginTop: 10 }}>{addError}</div>}
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10, lineHeight: 1.5 }}>
            Akun baru dibuat tanpa akses menu apa pun. Klik <strong>Atur Akses</strong> di daftar untuk memberi akses.
          </div>
        </div>
      )}

      {/* Account list (compact) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredUsers.map(u => {
          const count = saved[u.email]?.size ?? 0
          return (
            <div key={u.email} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: u.avatarUrl ? 'transparent' : 'linear-gradient(135deg,#6c63ff,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', overflow: 'hidden' }}>
                {u.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={u.avatarUrl} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : initials(u.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.email}</div>
              </div>

              {u.isSuperAdmin ? (
                <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', background: 'rgba(108,99,255,0.12)', padding: '5px 12px', borderRadius: 6, whiteSpace: 'nowrap' }}>
                  Super Admin · Akses Penuh
                </span>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text3)', whiteSpace: 'nowrap' }}>
                    {count > 0 ? `${count} menu` : 'Tanpa akses'}
                  </span>
                  <button
                    onClick={() => setEditEmail(u.email)}
                    style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                  >
                    Atur Akses
                  </button>
                  <button onClick={() => openPwModal(u.email)} style={quickBtnStyle}>Ubah Password</button>
                </div>
              )}
            </div>
          )
        })}

        {filteredUsers.length === 0 && (
          <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: 20 }}>Tidak ada akun yang cocok.</div>
        )}
      </div>

      {/* Per-account access modal */}
      <Modal
        open={editEmail !== null}
        onClose={() => setEditEmail(null)}
        wide
        maxWidth={760}
        title={editUser ? `Atur Akses — ${editUser.name}` : 'Atur Akses'}
        headerRight={
          editEmail ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setAll(editEmail, true)} style={groupBtnStyle}>Pilih semua</button>
              <button onClick={() => setAll(editEmail, false)} style={groupBtnStyle}>Kosongkan</button>
            </div>
          ) : undefined
        }
        footer={
          <>
            {editSt === 'saved' && <span style={{ fontSize: 12, color: '#34d399', marginRight: 'auto' }}>Tersimpan ✓</span>}
            {editSt === 'error' && <span style={{ fontSize: 12, color: '#f87171', marginRight: 'auto' }}>Gagal menyimpan</span>}
            <BtnSecondary onClick={() => setEditEmail(null)}>Tutup</BtnSecondary>
            <BtnPrimary onClick={() => editEmail && save(editEmail)} loading={editSt === 'saving'} disabled={!editDirty}>
              Simpan
            </BtnPrimary>
          </>
        }
      >
        {editEmail && (
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>
            {editEmail} · centang menu yang boleh diakses.
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {grouped.groupOrder.map(group => {
            const subs = grouped.map.get(group)!
            const groupIds = sections.filter(s => s.group === group).map(s => s.id)
            const allOn = groupIds.every(id => editSel.has(id))
            return (
              <div key={group}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{group}</div>
                  <button onClick={() => editEmail && setGroupAll(editEmail, group, !allOn)} style={groupBtnStyle}>
                    {allOn ? 'Kosongkan' : 'Pilih semua'}
                  </button>
                </div>
                {Array.from(subs.entries()).map(([subKey, items]) => (
                  <div key={subKey || '_'} style={{ marginBottom: subKey ? 10 : 0, paddingLeft: subKey ? 10 : 0, borderLeft: subKey ? '2px solid var(--border)' : 'none' }}>
                    {subKey && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{subKey}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
                      {items.map(s => {
                        const checked = editSel.has(s.id)
                        return (
                          <label key={s.id} style={{
                            display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8,
                            border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                            background: checked ? 'rgba(108,99,255,0.10)' : 'var(--bg3)',
                            cursor: 'pointer', fontSize: 13, color: 'var(--text)', userSelect: 'none',
                          }}>
                            <input type="checkbox" checked={checked} onChange={() => editEmail && toggle(editEmail, s.id)} style={{ accentColor: 'var(--accent)', width: 15, height: 15 }} />
                            {s.label}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </Modal>

      {/* Password-change modal */}
      <Modal
        open={pwEmail !== null}
        onClose={closePwModal}
        title="Ubah Password"
        footer={
          <>
            <BtnSecondary onClick={closePwModal} disabled={pwBusy}>Batal</BtnSecondary>
            <BtnPrimary onClick={submitPassword} loading={pwBusy} disabled={pwDone}>
              {pwDone ? 'Tersimpan ✓' : 'Simpan Password'}
            </BtnPrimary>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Akun: <span style={{ color: 'var(--text)', fontWeight: 600 }}>{pwEmail}</span>
          </div>
          <PasswordField label="Password baru" value={pw1} onChange={setPw1} show={show1} onToggleShow={() => setShow1(s => !s)} placeholder="Minimal 6 karakter" onEnter={submitPassword} />
          <PasswordField label="Ulangi password" value={pw2} onChange={setPw2} show={show2} onToggleShow={() => setShow2(s => !s)} placeholder="Ketik ulang password baru" onEnter={submitPassword} />
          {pwError && <div style={{ fontSize: 12, color: '#f87171' }}>{pwError}</div>}
          {pwDone && <div style={{ fontSize: 12, color: '#34d399' }}>Password berhasil diganti ✓</div>}
        </div>
      </Modal>
    </div>
  )
}

// ── Password input with show/hide toggle ──
function PasswordField({
  label, value, onChange, show, onToggleShow, placeholder, onEnter,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  show: boolean
  onToggleShow: () => void
  placeholder?: string
  onEnter?: () => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && onEnter) onEnter() }}
          placeholder={placeholder}
          autoComplete="new-password"
          style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 42px 10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
        <button
          type="button" onClick={onToggleShow}
          aria-label={show ? 'Sembunyikan password' : 'Lihat password'} title={show ? 'Sembunyikan' : 'Lihat'}
          style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'transparent', border: 'none', color: 'var(--text2)', cursor: 'pointer' }}
        >
          {show ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          ) : (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}

const groupBtnStyle: React.CSSProperties = {
  padding: '3px 9px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--bg3)', color: 'var(--text2)', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
}

const quickBtnStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)',
  background: 'var(--bg3)', color: 'var(--text2)', fontSize: 12.5, cursor: 'pointer', whiteSpace: 'nowrap',
}

const addInputStyle: React.CSSProperties = {
  flex: 1, minWidth: 200, background: 'var(--bg3)', border: '1px solid var(--border)',
  borderRadius: 8, padding: '9px 12px', color: 'var(--text)', fontSize: 13, outline: 'none',
}

function cloneMap(m: Record<string, Set<string>>): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {}
  for (const k of Object.keys(m)) out[k] = new Set(m[k])
  return out
}
