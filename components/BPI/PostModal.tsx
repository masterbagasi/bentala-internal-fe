'use client'

import { useState, useEffect, useRef } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { useLogActivity } from '@/hooks/useData'
import { BPI_STATUS_COLS, TEAM, POST_PLATFORMS, POST_RATIOS } from '@/lib/constants'
import { MultiFileUploader } from '@/components/website/FileUploader'
import { SingleDatePicker } from '@/components/Social/DateRangePicker'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import type { Post } from '@/lib/types'

interface PostModalProps {
  open: boolean
  onClose: () => void
  editId: string | null
  entity: 'bpi' | 'bsi'
}

type Platform = (typeof POST_PLATFORMS)[number]['key']
type ContentType = 'video' | 'design'

const DEFAULT_FORM = {
  title: '',
  platforms: [] as Platform[],
  date: '',
  status: 'todo' as Post['status'],
  pics: [] as string[],
  caption: '',
  brief: '',
  hashtags: '',
  content_types: [] as ContentType[],
  video_link: '',
  design_link: '',
  video_file_url: '',
  design_file_url: '',
  notes: '',
  tagged: [] as string[],
  ratio: '',
  files: [] as string[],
}

export function PostModal({ open, onClose, editId, entity }: PostModalProps) {
  const { posts } = useStore()
  const logActivity = useLogActivity()
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [originalTagged, setOriginalTagged] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [currentUserName, setCurrentUserName] = useState('')

  // Resolve the logged-in user's name so their own account shows as "You".
  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      if (data.user) {
        const meta = data.user.user_metadata ?? {}
        setCurrentUserName(meta.full_name ?? meta.name ?? data.user.email?.split('@')[0] ?? '')
      }
    })
  }, [])

  function addLink() {
    const v = linkInput.trim()
    if (!v) return
    setForm(f => (f.files.includes(v) ? f : { ...f, files: [...f.files, v] }))
    setLinkInput('')
  }

  // Hashtags: auto-prefix '#' on the first char and on every space.
  function onHashtagsKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === ' ') {
      e.preventDefault()
      setForm(f => {
        const v = f.hashtags
        if (!v.trim()) return { ...f, hashtags: '#' }
        if (v.endsWith(' ') || v.endsWith('#')) return f
        return { ...f, hashtags: v + ' #' }
      })
    }
  }
  function onHashtagsChange(value: string) {
    const v = value && !value.startsWith('#') ? '#' + value : value
    setForm(f => ({ ...f, hashtags: v }))
  }

  // Load existing post
  useEffect(() => {
    if (!open) return
    if (editId) {
      const p = posts.find(x => x.id === editId)
      if (p) {
        setForm({
          title:         p.title,
          platforms:     (p.platforms || []) as Platform[],
          date:          p.date || '',
          status:        p.status,
          pics:          p.pics || [],
          caption:       p.caption || '',
          brief:         p.brief || '',
          hashtags:      p.hashtags || '',
          content_types: (p.content_types || []) as ContentType[],
          video_link:      p.video_link || '',
          design_link:     p.design_link || '',
          video_file_url:  p.video_file_url || '',
          design_file_url: p.design_file_url || '',
          notes:           p.notes || '',
          tagged:        p.tagged || [],
          ratio:         p.ratio || '',
          files:         p.files || [],
        })
        setOriginalTagged(p.tagged || [])
      }
    } else {
      setForm(DEFAULT_FORM)
      setOriginalTagged([])
    }
  }, [open, editId, posts])

  async function handleSave() {
    if (!form.title.trim()) { alert('Judul post wajib diisi!'); return }

    setLoading(true)
    const supabase = getSupabase()

    // Auto-assign PIC based on content type
    const pics: string[] = []
    if (form.content_types.includes('video')) pics.push('Video Production')
    if (form.content_types.includes('design')) pics.push('Design Studio')

    const data = {
      entity,
      title:         form.title.trim(),
      platforms:     form.platforms,
      date:          form.date || null,
      status:        form.status,
      pics,
      caption:       form.caption,
      brief:         form.brief,
      hashtags:      form.hashtags,
      content_types: form.content_types,
      video_link:      form.video_link,
      design_link:     form.design_link,
      video_file_url:  form.video_file_url,
      design_file_url: form.design_file_url,
      notes:           form.notes,
      tagged:        form.tagged,
      ratio:         form.ratio,
      files:         form.files,
    }

    if (editId) {
      await supabase.from('posts').update(data).eq('id', editId)
      logActivity(`Post diupdate: "${form.title}"`)
    } else {
      // Stamp the creator from the logged-in user
      const { data: u } = await supabase.auth.getUser()
      const meta = u.user?.user_metadata ?? {}
      const creator = meta.full_name ?? meta.name ?? u.user?.email?.split('@')[0] ?? 'Unknown'
      await supabase.from('posts').insert({ ...data, created_by: creator })
      logActivity(`Post baru ditambahkan: "${form.title}"`, creator)
    }

    // Notify newly-tagged members: web-internal (activity log) + email.
    const newlyTagged = form.tagged.filter(name => !originalTagged.includes(name))
    for (const name of newlyTagged) {
      await logActivity(`🔔 ${name} di-tag pada post "${form.title}"`, name)
      // Fire-and-forget; the route resolves the recipient from the TEAM allowlist
      // server-side and no-ops gracefully if email isn't configured.
      fetch('/api/notify-tag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, postTitle: form.title, taggedBy: currentUserName }),
      }).catch(() => {})
    }

    setLoading(false)
    onClose()
  }

  const statusCols = entity === 'bpi' ? BPI_STATUS_COLS : [
    { key: 'todo', label: 'Idea' },
    { key: 'produksi', label: 'Production' },
    { key: 'published', label: 'Published' },
  ]

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? 'Edit Post' : 'Tambah Post Baru'}
      maxWidth={880}
      footer={
        <>
          <BtnSecondary onClick={onClose}>Batal</BtnSecondary>
          <BtnPrimary onClick={handleSave} loading={loading}>Simpan</BtnPrimary>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Title */}
        <FormGroup label="Judul Post *">
          <input
            type="text"
            placeholder="Judul konten..."
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </FormGroup>

        {/* 2. Tanggal Posting + Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormGroup label="Tanggal Posting">
            <SingleDatePicker
              value={form.date}
              onChange={d => setForm(f => ({ ...f, date: d }))}
            />
          </FormGroup>
          <FormGroup label="Status">
            <SingleDropdown
              options={statusCols.map((s: any) => ({ value: s.key, label: s.label }))}
              value={form.status}
              onChange={v => setForm(f => ({ ...f, status: v as Post['status'] }))}
            />
          </FormGroup>
        </div>

        {/* 3. Platform + Jenis Konten */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormGroup label="Platform">
            <MultiDropdown
              placeholder="Pilih platform..."
              options={POST_PLATFORMS.map(p => ({ value: p.key, label: p.label, avatar: <PlatformIcon platform={p.key} /> }))}
              selected={form.platforms}
              onChange={next => setForm(f => ({ ...f, platforms: next as Platform[] }))}
            />
          </FormGroup>
          <FormGroup label="Jenis Konten">
            <MultiDropdown
              placeholder="Pilih jenis konten..."
              options={[
                { value: 'video', label: '🎬 Video', color: '#6c63ff' },
                { value: 'design', label: '🎨 Design', color: '#43d9a2' },
              ]}
              selected={form.content_types}
              onChange={next => setForm(f => ({ ...f, content_types: next as ContentType[] }))}
            />
          </FormGroup>
        </div>

        {/* 4. Ratio + Tag Akun */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormGroup label="Ratio">
            <MultiDropdown
              placeholder="Pilih ratio..."
              options={POST_RATIOS.map(r => ({ value: r.key, label: r.label, hint: r.hint }))}
              selected={form.ratio ? form.ratio.split(',').map(s => s.trim()).filter(Boolean) : []}
              onChange={next => setForm(f => ({ ...f, ratio: next.join(', ') }))}
            />
          </FormGroup>
          <FormGroup label="Tag Akun">
            <MultiDropdown
              placeholder="Pilih akun..."
              options={TEAM.map(m => ({
                value: m.name,
                label: m.name === currentUserName ? `${m.name} (You)` : m.name,
                hint: m.email,
                avatar: <Avatar color={m.color} initials={m.initials} />,
              }))}
              selected={form.tagged}
              onChange={next => setForm(f => ({ ...f, tagged: next }))}
            />
          </FormGroup>
        </div>

        {/* Brief (above Caption) */}
        <FormGroup label="Brief">
          <textarea
            rows={4}
            placeholder="Tulis brief konten (konsep, referensi, arahan untuk tim)..."
            value={form.brief}
            onChange={e => setForm(f => ({ ...f, brief: e.target.value }))}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
          />
        </FormGroup>

        {/* Caption */}
        <FormGroup label="Caption">
          <textarea
            rows={4}
            placeholder="Tulis caption konten..."
            value={form.caption}
            onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
          />
        </FormGroup>

        {/* 6. Hashtags — auto '#' on space */}
        <FormGroup label="Hashtags">
          <input
            type="text"
            placeholder="#bentala #konten ..."
            value={form.hashtags}
            onChange={e => onHashtagsChange(e.target.value)}
            onKeyDown={onHashtagsKeyDown}
          />
        </FormGroup>

        {/* 7. Notes */}
        <FormGroup label="Catatan Internal">
          <textarea
            rows={3}
            placeholder="Catatan untuk tim..."
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </FormGroup>

        {/* 8. Lampiran File — link atau upload */}
        <FormGroup label="Lampiran File">
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="url"
              placeholder="Tempel link (Drive / Figma / dll)..."
              value={linkInput}
              onChange={e => setLinkInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
              style={{ flex: 1 }}
            />
            <button
              type="button"
              onClick={addLink}
              style={{
                flexShrink: 0, padding: '0 16px', borderRadius: 8, cursor: 'pointer',
                background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600,
              }}
            >
              + Link
            </button>
          </div>
          <MultiFileUploader
            value={form.files}
            onChange={urls => setForm(f => ({ ...f, files: urls }))}
            prefix="posts/files"
            accept="all"
          />
        </FormGroup>
      </div>
    </Modal>
  )
}

interface DropOption { value: string; label: string; color?: string; hint?: string; avatar?: React.ReactNode }

function MultiDropdown({ options, selected, onChange, placeholder = 'Pilih...' }: {
  options: DropOption[]
  selected: string[]
  onChange: (next: string[]) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  function toggle(v: string) {
    onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v])
  }
  const chosen = options.filter(o => selected.includes(o.value))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, minHeight: 42,
          background: 'var(--bg3)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8, padding: '6px 10px 6px 12px', cursor: 'pointer',
        }}
      >
        <div style={{ flex: 1, display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {chosen.length === 0
            ? <span style={{ color: 'var(--text3)', fontSize: 14 }}>{placeholder}</span>
            : chosen.map(o => (
                <span key={o.value} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, fontWeight: 500,
                  color: 'var(--text)', background: 'var(--bg-hover)', borderRadius: 6, padding: '2px 8px',
                }}>
                  {o.avatar ?? (o.color ? <span style={{ width: 7, height: 7, borderRadius: '50%', background: o.color }} /> : null)}
                  {o.label}
                </span>
              ))}
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: 'var(--text2)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)', maxHeight: 280, overflowY: 'auto', padding: 6,
        }}>
          {options.map(o => {
            const sel = selected.includes(o.value)
            return (
              <button
                key={o.value} type="button" onClick={() => toggle(o.value)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: sel ? 'var(--bg-hover)' : 'transparent', color: 'var(--text)',
                }}
              >
                {o.avatar ?? (o.color ? <span style={{ width: 9, height: 9, borderRadius: '50%', background: o.color, flexShrink: 0 }} /> : null)}
                <span style={{ flex: 1, fontSize: 13 }}>
                  {o.label}
                  {o.hint && <span style={{ color: 'var(--text3)', marginLeft: 6, fontSize: 11 }}>{o.hint}</span>}
                </span>
                {sel && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Avatar({ color, initials }: { color: string; initials: string }) {
  return (
    <span style={{
      width: 20, height: 20, borderRadius: '50%', background: color, color: '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, flexShrink: 0,
    }}>
      {initials}
    </span>
  )
}

function SingleDropdown({ options, value, onChange, placeholder = 'Pilih...' }: {
  options: { value: string; label: string }[]
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    if (open) document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])
  const cur = options.find(o => o.value === value)

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button" onClick={() => setOpen(o => !o)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8, minHeight: 42,
          background: 'var(--bg3)', border: `1px solid ${open ? 'var(--accent)' : 'var(--border)'}`,
          borderRadius: 8, padding: '6px 10px 6px 12px', cursor: 'pointer',
        }}
      >
        <span style={{ flex: 1, fontSize: 14, textAlign: 'left', color: cur ? 'var(--text)' : 'var(--text3)' }}>
          {cur?.label ?? placeholder}
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
          style={{ color: 'var(--text2)', flexShrink: 0, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 60,
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
          boxShadow: '0 12px 32px rgba(0,0,0,0.5)', maxHeight: 280, overflowY: 'auto', padding: 6,
        }}>
          {options.map(o => {
            const sel = o.value === value
            return (
              <button
                key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
                  padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
                  background: sel ? 'var(--bg-hover)' : 'transparent', color: 'var(--text)',
                }}
              >
                <span style={{ flex: 1, fontSize: 13 }}>{o.label}</span>
                {sel && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent3)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

function FormGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'baseline', gap: 7, fontSize: 12.5, fontWeight: 500, color: 'var(--text2)', marginBottom: 7 }}>
        {label}
        {hint && <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--text3)' }}>{hint}</span>}
      </label>
      {children}
    </div>
  )
}

