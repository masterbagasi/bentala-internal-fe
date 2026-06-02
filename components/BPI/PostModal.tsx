'use client'

import { useState, useEffect } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { useLogActivity } from '@/hooks/useData'
import { BPI_STATUS_COLS, TEAM } from '@/lib/constants'
import type { Post } from '@/lib/types'

interface PostModalProps {
  open: boolean
  onClose: () => void
  editId: string | null
  entity: 'bpi' | 'bsi'
}

type Platform = 'ig' | 'tiktok'
type ContentType = 'video' | 'design'

const DEFAULT_FORM = {
  title: '',
  platforms: [] as Platform[],
  date: '',
  status: 'todo' as Post['status'],
  pics: [] as string[],
  caption: '',
  hashtags: '',
  content_types: [] as ContentType[],
  video_link: '',
  design_link: '',
  notes: '',
}

export function PostModal({ open, onClose, editId, entity }: PostModalProps) {
  const { posts } = useStore()
  const logActivity = useLogActivity()
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)

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
          hashtags:      p.hashtags || '',
          content_types: (p.content_types || []) as ContentType[],
          video_link:    p.video_link || '',
          design_link:   p.design_link || '',
          notes:         p.notes || '',
        })
      }
    } else {
      setForm(DEFAULT_FORM)
    }
  }, [open, editId, posts])

  function togglePlatform(p: Platform) {
    setForm(f => ({
      ...f,
      platforms: f.platforms.includes(p) ? f.platforms.filter(x => x !== p) : [...f.platforms, p],
    }))
  }

  function toggleContentType(t: ContentType) {
    setForm(f => ({
      ...f,
      content_types: f.content_types.includes(t)
        ? f.content_types.filter(x => x !== t)
        : [...f.content_types, t],
    }))
  }

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
      hashtags:      form.hashtags,
      content_types: form.content_types,
      video_link:    form.video_link,
      design_link:   form.design_link,
      notes:         form.notes,
    }

    if (editId) {
      await supabase.from('posts').update(data).eq('id', editId)
      logActivity(`Post diupdate: "${form.title}"`)
    } else {
      await supabase.from('posts').insert(data)
      logActivity(`Post baru ditambahkan: "${form.title}"`)
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
      wide
      footer={
        <>
          <BtnSecondary onClick={onClose}>Batal</BtnSecondary>
          <BtnPrimary onClick={handleSave} loading={loading}>Simpan</BtnPrimary>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Title */}
        <FormGroup label="Judul Post *">
          <input
            type="text"
            placeholder="Judul konten..."
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </FormGroup>

        {/* Date + Status row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FormGroup label="Tanggal Posting">
            <input
              type="date"
              value={form.date}
              onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            />
          </FormGroup>
          <FormGroup label="Status">
            <select
              value={form.status}
              onChange={e => setForm(f => ({ ...f, status: e.target.value as Post['status'] }))}
            >
              {statusCols.map((s: any) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </FormGroup>
        </div>

        {/* Platform chips */}
        <FormGroup label="Platform">
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'ig' as Platform, label: 'Instagram', color: '#e1306c', bg: '#2a1028' },
              { key: 'tiktok' as Platform, label: 'TikTok', color: '#69c9d0', bg: '#0a1a1a' },
            ].map(p => (
              <ChipToggle
                key={p.key}
                label={p.label}
                selected={form.platforms.includes(p.key)}
                color={p.color}
                bg={p.bg}
                onClick={() => togglePlatform(p.key)}
              />
            ))}
          </div>
        </FormGroup>

        {/* Content types */}
        <FormGroup label="Jenis Konten">
          <div style={{ display: 'flex', gap: 8 }}>
            {[
              { key: 'video' as ContentType, label: '🎬 Video', color: '#6c63ff' },
              { key: 'design' as ContentType, label: '🎨 Design', color: '#43d9a2' },
            ].map(t => (
              <ChipToggle
                key={t.key}
                label={t.label}
                selected={form.content_types.includes(t.key)}
                color={t.color}
                bg={t.color + '18'}
                onClick={() => toggleContentType(t.key)}
              />
            ))}
          </div>
        </FormGroup>

        {/* Links */}
        {form.content_types.includes('video') && (
          <FormGroup label="Link Video (Google Drive / Dropbox)">
            <input
              type="url"
              placeholder="https://drive.google.com/..."
              value={form.video_link}
              onChange={e => setForm(f => ({ ...f, video_link: e.target.value }))}
            />
          </FormGroup>
        )}
        {form.content_types.includes('design') && (
          <FormGroup label="Link Design (Figma / Drive)">
            <input
              type="url"
              placeholder="https://figma.com/..."
              value={form.design_link}
              onChange={e => setForm(f => ({ ...f, design_link: e.target.value }))}
            />
          </FormGroup>
        )}

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

        {/* Hashtags */}
        <FormGroup label="Hashtags">
          <input
            type="text"
            placeholder="#bentala #konten ..."
            value={form.hashtags}
            onChange={e => setForm(f => ({ ...f, hashtags: e.target.value }))}
          />
        </FormGroup>

        {/* Notes */}
        <FormGroup label="Catatan Internal">
          <textarea
            rows={2}
            placeholder="Catatan untuk tim..."
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </FormGroup>
      </div>
    </Modal>
  )
}

function FormGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}

function ChipToggle({
  label, selected, color, bg, onClick,
}: {
  label: string
  selected: boolean
  color: string
  bg: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', borderRadius: 20,
        border: `1px solid ${selected ? color : 'var(--border)'}`,
        background: selected ? bg : 'var(--bg3)',
        color: selected ? color : 'var(--text2)',
        cursor: 'pointer', fontSize: 12, fontWeight: selected ? 600 : 400,
        transition: 'all 0.15s',
      }}
    >
      {selected && <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />}
      {label}
    </button>
  )
}
