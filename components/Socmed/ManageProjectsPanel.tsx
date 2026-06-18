'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { useT } from '@/lib/i18n/LanguageProvider'
import { fetchSocmedProjects, notifySocmedProjectsChanged } from '@/lib/socmed-projects'
import { projectGlyph } from '@/lib/project-glyph'
import { Modal, BtnPrimary, BtnSecondary, ConfirmDialog } from '@/components/shared/Modal'
import type { SocmedProject } from '@/lib/types'

const PALETTE = ['#c46e1f', '#8845c0', '#1f5dca', '#2c9148', '#c4393a', '#2c85ad', '#c4a414', '#c4365a', '#4541b8', '#5a5a60']

interface Draft {
  slug?: string
  name: string
  glyph: string
  color: string
  pic: string
  phone: string
  email: string
  address: string
  instagram: string
  tiktok: string
  website: string
  description: string
}

const EMPTY: Draft = {
  name: '', glyph: '', color: PALETTE[2], pic: '', phone: '', email: '',
  address: '', instagram: '', tiktok: '', website: '', description: '',
}

export function ManageProjectsPanel() {
  const t = useT()
  const [isSuper, setIsSuper] = useState(false)
  const [projects, setProjects] = useState<SocmedProject[]>([])
  const [editing, setEditing] = useState<Draft | null>(null) // open modal when set
  const [confirmDel, setConfirmDel] = useState<SocmedProject | null>(null)
  const [delBusy, setDelBusy] = useState(false)
  const [actionError, setActionError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      setIsSuper(isEffectiveSuperAdmin(data.user?.email, data.user?.app_metadata?.role))
    })
  }, [])
  useEffect(() => { fetchSocmedProjects(true).then(setProjects) }, [])

  async function refresh() {
    // Clears the cache AND pings every live consumer (sidebar, Add Task
    // dropdown, calendars) so they update instantly — no refresh needed.
    notifySocmedProjectsChanged()
    setProjects(await fetchSocmedProjects(true))
  }

  function openCreate() { setError(''); setEditing({ ...EMPTY }) }
  function openEdit(p: SocmedProject) {
    setError('')
    setEditing({
      slug: p.slug, name: p.name, glyph: p.glyph || '', color: p.color || PALETTE[2],
      pic: p.pic || '', phone: p.phone || '', email: p.email || '', address: p.address || '',
      instagram: p.instagram || '', tiktok: p.tiktok || '', website: p.website || '',
      description: p.description || '',
    })
  }

  async function save() {
    if (!editing || !editing.name.trim() || busy) return
    setBusy(true); setError('')
    try {
      const isEdit = !!editing.slug
      const { slug: _omit, ...payload } = editing
      void _omit
      const r = await fetch('/api/socmed-projects', {
        method: isEdit ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { slug: editing.slug, ...payload } : payload),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Gagal menyimpan')
      setEditing(null)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal menyimpan') }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!confirmDel || delBusy) return
    setDelBusy(true); setActionError('')
    try {
      const r = await fetch('/api/socmed-projects', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: confirmDel.slug }),
      })
      if (!r.ok) throw new Error((await r.json()).error || 'Gagal menghapus')
      setConfirmDel(null)
      await refresh() // realtime: notifies sidebar / Add Task dropdown / calendars
    } catch (e) {
      setActionError(e instanceof Error ? e.message : 'Gagal menghapus project')
      setConfirmDel(null)
    } finally { setDelBusy(false) }
  }

  async function toggleArchive(p: SocmedProject) {
    await fetch('/api/socmed-projects', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: p.slug, active: !p.active }),
    })
    await refresh()
  }

  if (!isSuper) return null

  const set = (k: keyof Draft, v: string) => setEditing(d => (d ? { ...d, [k]: v } : d))

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('Kelola Project Socmed')}</span>
        <button onClick={openCreate} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          + {t('Tambah Project')}
        </button>
      </div>

      {actionError && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.4)', borderRadius: 9, padding: '9px 12px', marginBottom: 10 }}>
          <span style={{ fontSize: 12.5, color: '#f87171' }}>{actionError}</span>
          <button onClick={() => setActionError('')} style={{ background: 'none', border: 'none', color: '#f87171', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>✕</button>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {projects.map(p => (
          <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, opacity: p.active ? 1 : 0.55 }}>
            <span style={{ width: 28, height: 28, borderRadius: 7, flexShrink: 0, background: p.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#fff' }}>{p.glyph || projectGlyph(p.name)}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text3)' }}>/{p.slug}{p.pic ? ` · PIC: ${p.pic}` : ''}</div>
            </div>
            <button onClick={() => openEdit(p)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
            >{t('Edit')}</button>
            <button onClick={() => toggleArchive(p)} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 12px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
              {p.active ? t('Arsipkan') : t('Aktifkan')}
            </button>
            <button onClick={() => { setActionError(''); setConfirmDel(p) }} title={t('Hapus permanen')}
              style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '5px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent2)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent2)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /><path d="M10 11v6M14 11v6" /></svg>
              {t('Hapus')}
            </button>
          </div>
        ))}
        {projects.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text3)', fontSize: 13 }}>{t('Belum ada project.')}</div>
        )}
      </div>

      {editing && (
        <Modal
          open
          onClose={() => setEditing(null)}
          wide
          title={editing.slug ? t('Edit Project Socmed') : t('Tambah Project Socmed')}
          footer={
            <>
              <BtnSecondary onClick={() => setEditing(null)}>{t('Batal')}</BtnSecondary>
              <BtnPrimary onClick={save} disabled={busy || !editing.name.trim()}>
                {busy ? t('Menyimpan…') : t('Simpan')}
              </BtnPrimary>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* ── Identitas ── */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionHead>{t('Identitas')}</SectionHead>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-end' }}>
                <div style={{
                  width: 52, height: 52, flexShrink: 0, borderRadius: 14, background: editing.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff',
                  fontSize: 16, fontWeight: 800, letterSpacing: '0.01em',
                  boxShadow: `0 4px 14px ${editing.color}55, inset 0 1px 0 rgba(255,255,255,0.25)`,
                }}>
                  {(editing.glyph || projectGlyph(editing.name || '?')).slice(0, 3)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Field label={t('Nama Project *')}>
                    <Input value={editing.name} onChange={v => set('name', v)} placeholder={t('mis. Master Bagasi')} />
                  </Field>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 14, alignItems: 'end' }}>
                <Field label={t('Badge / Inisial')}>
                  <Input value={editing.glyph} onChange={v => set('glyph', v.slice(0, 6))} placeholder={editing.name ? projectGlyph(editing.name) : t('otomatis')} />
                </Field>
                <Field label={t('Warna Ikon')}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', minHeight: 38 }}>
                    {PALETTE.map(c => {
                      const on = editing.color === c
                      return (
                        <button key={c} type="button" onClick={() => set('color', c)} title={c} aria-label={c}
                          style={{
                            width: 26, height: 26, borderRadius: 8, background: c, cursor: 'pointer',
                            border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                            boxShadow: on ? '0 0 0 2px var(--bg2), 0 0 0 4px #fff' : 'inset 0 0 0 1px rgba(255,255,255,0.12)',
                            transition: 'box-shadow 0.12s',
                          }}>
                          {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>}
                        </button>
                      )
                    })}
                  </div>
                </Field>
              </div>
            </section>

            {/* ── Kontak ── */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionHead>{t('Kontak')}</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label={t('PIC (Penanggung Jawab)')}>
                  <Input value={editing.pic} onChange={v => set('pic', v)} placeholder={t('Nama PIC')} />
                </Field>
                <Field label={t('No. Telepon')}>
                  <Input value={editing.phone} onChange={v => set('phone', v)} placeholder="08…" />
                </Field>
              </div>
              <Field label={t('Email')}>
                <Input value={editing.email} onChange={v => set('email', v)} placeholder="nama@domain.com" />
              </Field>
              <Field label={t('Alamat')}>
                <Textarea value={editing.address} onChange={v => set('address', v)} placeholder={t('Alamat kantor / lokasi')} />
              </Field>
            </section>

            {/* ── Sosial & Website ── */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionHead>{t('Sosial & Website')}</SectionHead>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Instagram"><Input value={editing.instagram} onChange={v => set('instagram', v)} placeholder="@handle" /></Field>
                <Field label="TikTok"><Input value={editing.tiktok} onChange={v => set('tiktok', v)} placeholder="@handle" /></Field>
              </div>
              <Field label="Website"><Input value={editing.website} onChange={v => set('website', v)} placeholder="https://…" /></Field>
            </section>

            {/* ── Catatan ── */}
            <section style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionHead>{t('Catatan')}</SectionHead>
              <Field label={t('Deskripsi / Catatan')}>
                <Textarea value={editing.description} onChange={v => set('description', v)} placeholder={t('Catatan singkat tentang project ini')} />
              </Field>
            </section>

            {error && <span style={{ fontSize: 12.5, color: '#f87171' }}>{error}</span>}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!confirmDel}
        danger
        title={t('Hapus Project Permanen')}
        confirmLabel={delBusy ? t('Menghapus…') : t('Hapus Permanen')}
        cancelLabel={t('Batal')}
        onCancel={() => { if (!delBusy) setConfirmDel(null) }}
        onConfirm={remove}
        message={
          <>
            {t('Project')} <strong style={{ color: 'var(--text)' }}>{confirmDel?.name}</strong> {t('akan dihapus permanen beserta semua task yang sudah selesai, data chat & hak aksesnya. Project hanya bisa dihapus jika semua task sudah selesai. Tindakan ini tidak bisa dibatalkan.')}
          </>
        }
      />
    </div>
  )
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: 'var(--border)' }} />
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      {children}
    </label>
  )
}

const inputStyle: React.CSSProperties = {
  width: '100%', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
  padding: '9px 11px', color: 'var(--text)', fontSize: 13, outline: 'none',
}
function Input({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle}
    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
}
function Textarea({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={2} style={{ ...inputStyle, resize: 'vertical', minHeight: 38, lineHeight: 1.5 }}
    onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')} onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')} />
}
