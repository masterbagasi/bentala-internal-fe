'use client'

import { useEffect, useMemo, useState } from 'react'

// ── Types (mirror /api/access GET response) ──
interface SectionMeta {
  id: string
  label: string
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

  // Add-account form.
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')

  // Per-row password change.
  const [pwOpen, setPwOpen] = useState<Record<string, boolean>>({})
  const [pwValue, setPwValue] = useState<Record<string, string>>({})
  const [pwStatus, setPwStatus] = useState<Record<string, RowState>>({})

  // Load (or reload) the account list. Preserves any unsaved section toggles
  // for accounts that already exist so a refresh after adding an account
  // doesn't wipe in-progress edits on other rows.
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
      .catch(() => {
        if (!cancelled) setLoadError('Gagal memuat data akses. Pastikan Anda super admin.')
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addAccount() {
    setAddError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) {
      setAddError('Email tidak valid')
      return
    }
    if (newPassword.length < 6) {
      setAddError('Password minimal 6 karakter')
      return
    }
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
      setShowAdd(false)
      setNewEmail('')
      setNewPassword('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Gagal membuat akun')
    } finally {
      setAddBusy(false)
    }
  }

  async function changePassword(email: string) {
    const pw = pwValue[email] ?? ''
    if (pw.length < 6) {
      setPwStatus(prev => ({ ...prev, [email]: 'error' }))
      return
    }
    setPwStatus(prev => ({ ...prev, [email]: 'saving' }))
    try {
      const r = await fetch('/api/access/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pw }),
      })
      if (!r.ok) throw new Error(String(r.status))
      setPwStatus(prev => ({ ...prev, [email]: 'saved' }))
      setPwValue(prev => ({ ...prev, [email]: '' }))
      setTimeout(() => {
        setPwOpen(prev => ({ ...prev, [email]: false }))
        setPwStatus(prev => (prev[email] === 'saved' ? { ...prev, [email]: 'idle' } : prev))
      }, 1400)
    } catch {
      setPwStatus(prev => ({ ...prev, [email]: 'error' }))
    }
  }

  const filteredUsers = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return users
    return users.filter(
      u => u.email.toLowerCase().includes(q) || u.name.toLowerCase().includes(q),
    )
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
    setDraft(prev => ({
      ...prev,
      [email]: all ? new Set(sections.map(s => s.id)) : new Set(),
    }))
    setStatus(prev => ({ ...prev, [email]: 'idle' }))
  }

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
      setTimeout(
        () => setStatus(prev => (prev[email] === 'saved' ? { ...prev, [email]: 'idle' } : prev)),
        1800,
      )
    } catch {
      setStatus(prev => ({ ...prev, [email]: 'error' }))
    }
  }

  if (loading) {
    return <div style={{ color: 'var(--text2)', fontSize: 13, padding: 8 }}>Memuat…</div>
  }
  if (loadError) {
    return <div style={{ color: '#f87171', fontSize: 13, padding: 8 }}>{loadError}</div>
  }

  return (
    <div>
      {/* Intro + search + add */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', maxWidth: 480, lineHeight: 1.5 }}>
          Centang menu yang boleh diakses tiap akun. Akun tanpa centang sama
          sekali tidak bisa membuka menu apa pun (default tertutup).
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Cari akun…"
            style={{
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '8px 12px',
              color: 'var(--text)',
              fontSize: 13,
              minWidth: 180,
              outline: 'none',
            }}
          />
          <button
            onClick={() => {
              setShowAdd(v => !v)
              setAddError('')
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 8,
              border: 'none',
              background: 'var(--accent)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            + Tambah Akun
          </button>
        </div>
      </div>

      {/* Add-account form */}
      {showAdd && (
        <div
          style={{
            background: 'var(--bg2)',
            border: '1px solid var(--accent)',
            borderRadius: 12,
            padding: 16,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
            Tambah Akun Baru
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <input
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder="email@masterbagasi.com"
              autoComplete="off"
              style={addInputStyle}
            />
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Password (min 6 karakter)"
              autoComplete="new-password"
              style={addInputStyle}
            />
            <button
              onClick={addAccount}
              disabled={addBusy}
              style={{
                padding: '9px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 13,
                fontWeight: 600,
                cursor: addBusy ? 'not-allowed' : 'pointer',
                opacity: addBusy ? 0.7 : 1,
                whiteSpace: 'nowrap',
              }}
            >
              {addBusy ? 'Membuat…' : 'Buat Akun'}
            </button>
          </div>
          {addError && (
            <div style={{ fontSize: 12, color: '#f87171', marginTop: 10 }}>{addError}</div>
          )}
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10, lineHeight: 1.5 }}>
            Akun baru dibuat tanpa akses menu apa pun. Beri centang menu lalu
            Simpan setelah akun muncul di daftar.
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {filteredUsers.map(u => {
          const sel = draft[u.email] ?? new Set<string>()
          const dirty = isDirty(u.email)
          const st = status[u.email] ?? 'idle'
          return (
            <div
              key={u.email}
              style={{
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 16,
              }}
            >
              {/* Account header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                <div
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: u.avatarUrl ? 'transparent' : 'linear-gradient(135deg,#6c63ff,#a855f7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#fff',
                    overflow: 'hidden',
                  }}
                >
                  {u.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatarUrl} alt={u.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    initials(u.name)
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{u.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.email}
                  </div>
                </div>

                {u.isSuperAdmin ? (
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: 'var(--accent)',
                      background: 'rgba(108,99,255,0.12)',
                      padding: '4px 10px',
                      borderRadius: 6,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Super Admin · Akses Penuh
                  </span>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    <button
                      onClick={() => setAll(u.email, true)}
                      style={quickBtnStyle}
                    >
                      Semua
                    </button>
                    <button
                      onClick={() => setAll(u.email, false)}
                      style={quickBtnStyle}
                    >
                      Kosongkan
                    </button>
                    <button
                      onClick={() => {
                        setPwOpen(prev => ({ ...prev, [u.email]: !prev[u.email] }))
                        setPwStatus(prev => ({ ...prev, [u.email]: 'idle' }))
                      }}
                      style={quickBtnStyle}
                    >
                      Ubah Password
                    </button>
                  </div>
                )}
              </div>

              {/* Section checkboxes */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                  gap: 8,
                  opacity: u.isSuperAdmin ? 0.6 : 1,
                  pointerEvents: u.isSuperAdmin ? 'none' : 'auto',
                }}
              >
                {sections.map(s => {
                  const checked = u.isSuperAdmin || sel.has(s.id)
                  return (
                    <label
                      key={s.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: `1px solid ${checked ? 'var(--accent)' : 'var(--border)'}`,
                        background: checked ? 'rgba(108,99,255,0.10)' : 'var(--bg3)',
                        cursor: u.isSuperAdmin ? 'default' : 'pointer',
                        fontSize: 13,
                        color: 'var(--text)',
                        userSelect: 'none',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={u.isSuperAdmin}
                        onChange={() => toggle(u.email, s.id)}
                        style={{ accentColor: 'var(--accent)', width: 15, height: 15 }}
                      />
                      {s.label}
                    </label>
                  )
                })}
              </div>

              {/* Inline password change */}
              {!u.isSuperAdmin && pwOpen[u.email] && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                    marginTop: 12,
                    paddingTop: 12,
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <input
                    type="password"
                    value={pwValue[u.email] ?? ''}
                    onChange={e => setPwValue(prev => ({ ...prev, [u.email]: e.target.value }))}
                    placeholder="Password baru (min 6 karakter)"
                    autoComplete="new-password"
                    style={{ ...addInputStyle, minWidth: 240 }}
                  />
                  <button
                    onClick={() => changePassword(u.email)}
                    disabled={pwStatus[u.email] === 'saving'}
                    style={{
                      padding: '9px 16px',
                      borderRadius: 8,
                      border: 'none',
                      background: 'var(--accent)',
                      color: '#fff',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: pwStatus[u.email] === 'saving' ? 'not-allowed' : 'pointer',
                      opacity: pwStatus[u.email] === 'saving' ? 0.7 : 1,
                    }}
                  >
                    {pwStatus[u.email] === 'saving' ? 'Menyimpan…' : 'Simpan Password'}
                  </button>
                  {pwStatus[u.email] === 'saved' && (
                    <span style={{ fontSize: 12, color: '#34d399' }}>Password diganti ✓</span>
                  )}
                  {pwStatus[u.email] === 'error' && (
                    <span style={{ fontSize: 12, color: '#f87171' }}>
                      Gagal — pastikan min 6 karakter
                    </span>
                  )}
                </div>
              )}

              {/* Save row */}
              {!u.isSuperAdmin && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 12 }}>
                  {st === 'saved' && <span style={{ fontSize: 12, color: '#34d399' }}>Tersimpan ✓</span>}
                  {st === 'error' && <span style={{ fontSize: 12, color: '#f87171' }}>Gagal menyimpan</span>}
                  <button
                    onClick={() => save(u.email)}
                    disabled={!dirty || st === 'saving'}
                    style={{
                      padding: '8px 16px',
                      borderRadius: 8,
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: !dirty || st === 'saving' ? 'not-allowed' : 'pointer',
                      background: !dirty ? 'var(--bg3)' : 'var(--accent)',
                      color: !dirty ? 'var(--text2)' : '#fff',
                      opacity: st === 'saving' ? 0.7 : 1,
                    }}
                  >
                    {st === 'saving' ? 'Menyimpan…' : 'Simpan'}
                  </button>
                </div>
              )}
            </div>
          )
        })}

        {filteredUsers.length === 0 && (
          <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: 20 }}>
            Tidak ada akun yang cocok.
          </div>
        )}
      </div>
    </div>
  )
}

const quickBtnStyle: React.CSSProperties = {
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid var(--border)',
  background: 'var(--bg3)',
  color: 'var(--text2)',
  fontSize: 12,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
}

const addInputStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 200,
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  padding: '9px 12px',
  color: 'var(--text)',
  fontSize: 13,
  outline: 'none',
}

function cloneMap(m: Record<string, Set<string>>): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {}
  for (const k of Object.keys(m)) out[k] = new Set(m[k])
  return out
}
