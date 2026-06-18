'use client'

import { useEffect, useMemo, useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary, ConfirmDialog } from '@/components/shared/Modal'
import { AccountEditModal } from './AccountEditModal'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'

// ── Types (mirror /api/access GET response) ──
interface SectionMeta {
  id: string
  label: string
  group: string
  subgroup?: string
}
export interface AccessUser {
  email: string
  name: string
  avatarUrl: string | null
  isSuperAdmin: boolean
  role: 'super_admin' | 'admin' | 'user'
  locked: boolean
  sections: string[]
  phone: string
  position: string
  language: string
  notif: { email: boolean; inApp: boolean; push: boolean }
  active: boolean
  createdAt: string | null
  lastSignInAt: string | null
}

type RowState = 'idle' | 'saving' | 'saved' | 'error'

const ROLE_LABEL: Record<'super_admin' | 'admin' | 'user', string> = {
  super_admin: 'Super Admin', admin: 'Admin', user: 'User',
}

// Group display order — mirrors the sidebar/navbar so the access panel reads the
// same way (Chat right under Dashboard). Groups not listed fall to the end.
const GROUP_NAV_ORDER = [
  'Dashboard', 'Chat', 'Website', 'Socmed Management', 'Social Media',
  'Client', 'Projects', 'AI Studio', 'Settings',
]

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
  const t = useT()
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
  // Which account's profile/edit modal is open.
  const [profileUser, setProfileUser] = useState<AccessUser | null>(null)
  // The currently logged-in super admin (to route their own row to self-edit).
  const [me, setMe] = useState('')

  // Delete-account confirmation.
  const [confirmDel, setConfirmDel] = useState<AccessUser | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [delError, setDelError] = useState('')

  async function deleteAccount() {
    if (!confirmDel || delBusy) return
    setDelBusy(true); setDelError('')
    try {
      const r = await fetch('/api/access/account', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: confirmDel.email }),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Gagal menghapus akun')
      setConfirmDel(null)
      await reload(true)
    } catch (e) {
      setDelError(e instanceof Error ? e.message : 'Gagal menghapus akun')
      setConfirmDel(null)
    } finally { setDelBusy(false) }
  }

  // Add-account form.
  const [showAdd, setShowAdd] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newPassword2, setNewPassword2] = useState('')
  const [showNp1, setShowNp1] = useState(false)
  const [showNp2, setShowNp2] = useState(false)
  const [addBusy, setAddBusy] = useState(false)
  const [addError, setAddError] = useState('')

  function openAddModal() {
    setNewEmail(''); setNewPassword(''); setNewPassword2('')
    setShowNp1(false); setShowNp2(false); setAddError('')
    setShowAdd(true)
  }

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
    getSupabase().auth.getUser().then(({ data }) => setMe((data.user?.email ?? '').toLowerCase()))
  }, [])

  useEffect(() => {
    let cancelled = false
    reload(false)
      .catch(() => { if (!cancelled) setLoadError(t('Gagal memuat data akses. Pastikan Anda super admin.')) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function addAccount() {
    setAddError('')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail.trim())) { setAddError(t('Email tidak valid')); return }
    if (newPassword.length < 6) { setAddError(t('Password minimal 6 karakter')); return }
    if (newPassword !== newPassword2) { setAddError(t('Password tidak sama dengan pengulangannya')); return }
    setAddBusy(true)
    try {
      const r = await fetch('/api/access/account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail.trim(), password: newPassword }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || t('Gagal membuat akun'))
      await reload(true)
      setShowAdd(false); setNewEmail(''); setNewPassword(''); setNewPassword2('')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : t('Gagal membuat akun'))
    } finally {
      setAddBusy(false)
    }
  }

  async function submitPassword() {
    if (!pwEmail) return
    setPwError('')
    if (pw1.length < 6) { setPwError(t('Password minimal 6 karakter')); return }
    if (pw1 !== pw2) { setPwError(t('Password tidak sama dengan pengulangannya')); return }
    setPwBusy(true)
    try {
      if (pwEmail.toLowerCase() === me) {
        // Changing own password — use self update (admin API blocks editing self/super).
        const { error } = await getSupabase().auth.updateUser({ password: pw1 })
        if (error) throw new Error(error.message)
      } else {
        const r = await fetch('/api/access/account', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: pwEmail, password: pw1 }),
        })
        const data = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(data.error || t('Gagal mengganti password'))
      }
      setPwDone(true)
      setTimeout(() => closePwModal(), 1200)
    } catch (e) {
      setPwError(e instanceof Error ? e.message : t('Gagal mengganti password'))
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
    const map = new Map<string, Map<string, SectionMeta[]>>()
    for (const s of sections) {
      if (!map.has(s.group)) map.set(s.group, new Map())
      const subs = map.get(s.group)!
      const key = s.subgroup ?? ''
      if (!subs.has(key)) subs.set(key, [])
      subs.get(key)!.push(s)
    }
    // Order groups to mirror the sidebar/navbar (Chat sits under Dashboard).
    // Unknown groups keep their natural insertion order after the known ones.
    const seen = Array.from(map.keys())
    const rank = (g: string) => {
      const i = GROUP_NAV_ORDER.indexOf(g)
      return i === -1 ? GROUP_NAV_ORDER.length + seen.indexOf(g) : i
    }
    const groupOrder = seen.slice().sort((a, b) => rank(a) - rank(b))
    return { groupOrder, map }
  }, [sections])

  function isDirty(email: string): boolean {
    const a = draft[email] ?? new Set<string>()
    const b = saved[email] ?? new Set<string>()
    if (a.size !== b.size) return true
    return Array.from(a).some(v => !b.has(v))
  }

  // Close the access modal WITHOUT applying: discard unsaved toggles by
  // reverting the draft back to the last saved state. Nothing changes unless
  // the user clicks Simpan.
  function closeEditModal() {
    if (editEmail) {
      const base = new Set(saved[editEmail] ?? [])
      setDraft(prev => ({ ...prev, [editEmail]: base }))
      setStatus(prev => ({ ...prev, [editEmail]: 'idle' }))
    }
    setEditEmail(null)
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

  if (loading) return <div style={{ color: 'var(--text2)', fontSize: 13, padding: 8 }}>{t('Memuat…')}</div>
  if (loadError) return <div style={{ color: '#f87171', fontSize: 13, padding: 8 }}>{loadError}</div>

  const editUser = users.find(u => u.email === editEmail) ?? null
  const editSel = editEmail ? (draft[editEmail] ?? new Set<string>()) : new Set<string>()
  const editSt = editEmail ? (status[editEmail] ?? 'idle') : 'idle'
  const editDirty = editEmail ? isDirty(editEmail) : false

  return (
    <div>
      {/* Search + add */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder={t('Cari akun…')}
            style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', color: 'var(--text)', fontSize: 13, minWidth: 180, outline: 'none' }}
          />
          <button
            onClick={openAddModal}
            style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
          >
            + {t('Tambah Akun')}
          </button>
        </div>
      </div>

      {/* Add-account modal */}
      <Modal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={t('Tambah Akun Baru')}
        footer={
          <>
            <BtnSecondary onClick={() => setShowAdd(false)} disabled={addBusy}>{t('Batal')}</BtnSecondary>
            <BtnPrimary onClick={addAccount} loading={addBusy}>{t('Buat Akun')}</BtnPrimary>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>Email</label>
            <input
              type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
              placeholder="email@masterbagasi.com" autoComplete="off"
              onKeyDown={e => { if (e.key === 'Enter') addAccount() }}
              style={{ width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
            />
          </div>
          <PasswordField label={t('Password')} value={newPassword} onChange={setNewPassword} show={showNp1} onToggleShow={() => setShowNp1(s => !s)} placeholder={t('Minimal 6 karakter')} onEnter={addAccount} />
          <PasswordField label={t('Ulangi Password')} value={newPassword2} onChange={setNewPassword2} show={showNp2} onToggleShow={() => setShowNp2(s => !s)} placeholder={t('Ketik ulang password')} onEnter={addAccount} />
          {addError && <div style={{ fontSize: 12, color: '#f87171' }}>{addError}</div>}
        </div>
      </Modal>

      {delError && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 10, padding: '10px 14px', marginBottom: 12 }}>
          <span style={{ fontSize: 13, color: '#f87171' }}>{delError}</span>
          <button onClick={() => setDelError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 15, lineHeight: 1 }}>✕</button>
        </div>
      )}

      {/* Account list (compact) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {filteredUsers.map(u => {
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

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap', padding: '3px 10px', borderRadius: 999,
                  color: u.role === 'super_admin' ? 'var(--accent)' : 'var(--text2)',
                  background: u.role === 'super_admin' ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
                  border: `1px solid ${u.role === 'super_admin' ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`,
                }}>
                  {ROLE_LABEL[u.role]}
                </span>
                <button
                  onClick={() => setEditEmail(u.email)}
                  style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  {t('Atur Akses')}
                </button>
                <button onClick={() => setProfileUser(u)} style={quickBtnStyle}>{t('Edit Akun')}</button>
                <button onClick={() => openPwModal(u.email)} style={quickBtnStyle}>{t('Ubah Password')}</button>
                {!u.locked && u.email.toLowerCase() !== me && (
                  <button
                    onClick={() => { setDelError(''); setConfirmDel(u) }}
                    title={t('Hapus Akun')}
                    style={{ ...quickBtnStyle, display: 'inline-flex', alignItems: 'center', gap: 5 }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent2)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent2)' }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
                    {t('Hapus')}
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {filteredUsers.length === 0 && (
          <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: 20 }}>{t('Tidak ada akun yang cocok.')}</div>
        )}
      </div>

      {/* Per-account access modal */}
      <Modal
        open={editEmail !== null}
        onClose={closeEditModal}
        wide
        maxWidth={760}
        title={t('Atur Akses')}
        headerRight={
          editEmail ? (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => setAll(editEmail, true)} style={groupBtnStyle}>{t('Pilih semua')}</button>
              <button onClick={() => setAll(editEmail, false)} style={groupBtnStyle}>{t('Kosongkan')}</button>
            </div>
          ) : undefined
        }
        footer={
          <>
            {editSt === 'saved' && <span style={{ fontSize: 12, color: '#34d399', marginRight: 'auto' }}>{t('Tersimpan ✓')}</span>}
            {editSt === 'error' && <span style={{ fontSize: 12, color: '#f87171', marginRight: 'auto' }}>{t('Gagal menyimpan')}</span>}
            <BtnSecondary onClick={closeEditModal}>{t('Tutup')}</BtnSecondary>
            <BtnPrimary onClick={() => editEmail && save(editEmail)} loading={editSt === 'saving'} disabled={!editDirty}>
              {t('Simpan')}
            </BtnPrimary>
          </>
        }
      >
        {editEmail && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: editUser?.avatarUrl ? 'transparent' : 'linear-gradient(135deg,#6c63ff,#a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13 }}>
              {editUser?.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={editUser.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (editUser?.name?.[0] || '?').toUpperCase()}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{editUser?.name}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{editEmail}</div>
            </div>
          </div>
        )}
        <div>
          {grouped.groupOrder.map((group, gi) => {
            const subs = grouped.map.get(group)!
            const groupIds = sections.filter(s => s.group === group).map(s => s.id)
            const selCount = groupIds.filter(id => editSel.has(id)).length
            const allOn = selCount === groupIds.length
            return (
              <div key={group} style={{ paddingTop: gi === 0 ? 0 : 18, marginTop: gi === 0 ? 0 : 18, borderTop: gi === 0 ? 'none' : '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group}</div>
                  <span style={{ fontSize: 10.5, fontWeight: 600, color: selCount ? 'var(--accent)' : 'var(--text3)', background: selCount ? 'rgba(108,99,255,0.12)' : 'var(--bg3)', border: `1px solid ${selCount ? 'rgba(108,99,255,0.3)' : 'var(--border)'}`, borderRadius: 999, padding: '1px 8px' }}>{selCount}/{groupIds.length}</span>
                  <button onClick={() => editEmail && setGroupAll(editEmail, group, !allOn)} style={{ ...groupBtnStyle, marginLeft: 'auto' }}>
                    {allOn ? t('Kosongkan') : t('Pilih semua')}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {Array.from(subs.entries()).map(([subKey, items]) => (
                    <div key={subKey || '_'}>
                      {subKey && <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', marginBottom: 8 }}>{subKey}</div>}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(165px, 1fr))', gap: 8 }}>
                        {items.map(s => (
                          <AccessTile key={s.id} label={s.label} checked={editSel.has(s.id)} onToggle={() => editEmail && toggle(editEmail, s.id)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </Modal>

      {/* Per-account profile/edit modal */}
      {profileUser && (
        <AccountEditModal
          user={profileUser}
          self={profileUser.email.toLowerCase() === me}
          canEditRole={!profileUser.locked && profileUser.email.toLowerCase() !== me}
          onClose={() => setProfileUser(null)}
          onSaved={() => { setProfileUser(null); reload(true) }}
        />
      )}

      {/* Password-change modal */}
      <Modal
        open={pwEmail !== null}
        onClose={closePwModal}
        title={t('Ubah Password')}
        footer={
          <>
            <BtnSecondary onClick={closePwModal} disabled={pwBusy}>{t('Batal')}</BtnSecondary>
            <BtnPrimary onClick={submitPassword} loading={pwBusy} disabled={pwDone}>
              {pwDone ? t('Tersimpan ✓') : t('Simpan Password')}
            </BtnPrimary>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {t('Akun:')} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{pwEmail}</span>
          </div>
          <PasswordField label={t('Password baru')} value={pw1} onChange={setPw1} show={show1} onToggleShow={() => setShow1(s => !s)} placeholder={t('Minimal 6 karakter')} onEnter={submitPassword} />
          <PasswordField label={t('Ulangi password')} value={pw2} onChange={setPw2} show={show2} onToggleShow={() => setShow2(s => !s)} placeholder={t('Ketik ulang password baru')} onEnter={submitPassword} />
          {pwError && <div style={{ fontSize: 12, color: '#f87171' }}>{pwError}</div>}
          {pwDone && <div style={{ fontSize: 12, color: '#34d399' }}>{t('Password berhasil diganti ✓')}</div>}
        </div>
      </Modal>

      {/* Delete-account confirmation */}
      <ConfirmDialog
        open={!!confirmDel}
        danger
        title={t('Hapus Akun Permanen')}
        confirmLabel={delBusy ? t('Menghapus…') : t('Hapus Permanen')}
        cancelLabel={t('Batal')}
        onCancel={() => { if (!delBusy) setConfirmDel(null) }}
        onConfirm={deleteAccount}
        message={
          <>
            {t('Akun')} <strong style={{ color: 'var(--text)' }}>{confirmDel?.name}</strong> ({confirmDel?.email}) {t('akan dihapus permanen dan tidak bisa login lagi. Tindakan ini tidak bisa dibatalkan.')}
          </>
        }
      />
    </div>
  )
}

// ── Access checkbox tile (with hover) ──
function AccessTile({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <label
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 9, padding: '9px 11px', borderRadius: 9,
        border: `1px solid ${checked ? 'var(--accent)' : hover ? 'var(--text3)' : 'var(--border)'}`,
        background: checked ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
        cursor: 'pointer', fontSize: 13, color: 'var(--text)', userSelect: 'none',
        transition: 'border-color 0.12s, background 0.12s',
      }}
    >
      <input type="checkbox" checked={checked} onChange={onToggle} style={{ accentColor: 'var(--accent)', width: 15, height: 15, flexShrink: 0 }} />
      {label}
    </label>
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
  const t = useT()
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
          aria-label={show ? t('Sembunyikan password') : t('Lihat password')} title={show ? t('Sembunyikan') : t('Lihat')}
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

function cloneMap(m: Record<string, Set<string>>): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {}
  for (const k of Object.keys(m)) out[k] = new Set(m[k])
  return out
}
