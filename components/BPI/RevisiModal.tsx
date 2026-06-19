'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { uploadFileResumable } from '@/lib/storage'
import type { Post, PostRevision, RevisionTrack, RevisionFile } from '@/lib/types'
import { revisionFiles, revisionLinks } from '@/lib/types'

// ── Revision (Revisi) popup + post-detail section ──────────────
// On the Socmed Management boards, moving a post to Revisi (drag or status
// dropdown) opens this popup to capture WHICH discipline the revision is for,
// the revision detail, and an optional reference link / file. Saved into
// posts.revisions (jsonb). Shown read-only on the worksheet pages, editable
// here. See lib/types.ts → PostRevision.

const TRACKS: Record<RevisionTrack, { label: string; color: string; icon: string }> = {
  video:  { label: 'Video Production', color: '#5b9bd5', icon: '🎬' },
  design: { label: 'Design Studio',    color: '#a78bfa', icon: '🎨' },
}

// Untyped client — posts.revisions / post_comments aren't in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sb(): { from: (t: string) => any } {
  return getSupabase() as unknown as { from: (t: string) => any }
}

/** Which tracks a post carries (content_types first, pics as a fallback). */
export function postTracks(post: Post): RevisionTrack[] {
  const ct = post.content_types || []
  const pics = post.pics || []
  const out: RevisionTrack[] = []
  if (ct.includes('video') || pics.includes('Video Production')) out.push('video')
  if (ct.includes('design') || pics.includes('Design Studio')) out.push('design')
  return out.length ? out : ['video', 'design']
}

interface RevisiModalProps {
  open: boolean
  post: Post
  /** Set → edit an existing revision. Unset → create a new one. */
  editing?: PostRevision | null
  /** Create mode only: also flip the post + selected tracks to 'revisi'. */
  applyStatus?: boolean
  onClose: () => void
  onSaved?: (post: Post) => void
}

export function RevisiModal({ open, post, editing, applyStatus = true, onClose, onSaved }: RevisiModalProps) {
  const t = useT()
  const upsertPost = useStore((s) => s.upsertPost)

  const avail = useMemo(() => postTracks(post), [post])
  const single = avail.length === 1

  const [selected, setSelected] = useState<RevisionTrack[]>(avail)
  const [detail, setDetail] = useState('')
  // Reference links (committed via "+ Link") + the in-progress input.
  const [links, setLinks] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState('')
  // Finished uploads + in-flight uploads (each with its own progress + cancel).
  const [uploaded, setUploaded] = useState<RevisionFile[]>([])
  const [uploads, setUploads] = useState<{ id: string; name: string; progress: number; abort: () => void }[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [me, setMe] = useState<{ name: string; email: string }>({ name: '', email: '' })
  const fileRef = useRef<HTMLInputElement>(null)
  const uploadSeq = useRef(0)

  // Reset the form whenever the popup (re)opens or the target revision changes.
  useEffect(() => {
    if (!open) return
    setSelected(editing ? editing.tracks.filter(tk => avail.includes(tk)) : avail)
    setDetail(editing?.detail ?? '')
    setLinks(editing ? revisionLinks(editing) : [])
    setLinkInput('')
    setUploaded(editing ? revisionFiles(editing) : [])
    setUploads([])
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing?.id])

  // Current user — author of the revision.
  useEffect(() => {
    let cancelled = false
    getSupabase().auth.getUser().then(({ data }) => {
      if (cancelled || !data.user) return
      const meta = data.user.user_metadata ?? {}
      setMe({
        name: meta.full_name ?? meta.name ?? data.user.email?.split('@')[0] ?? 'User',
        email: data.user.email ?? '',
      })
    })
    return () => { cancelled = true }
  }, [open])

  function toggleTrack(tk: RevisionTrack) {
    if (single) return // the only track stays selected
    setSelected(prev => (prev.includes(tk) ? prev.filter(x => x !== tk) : [...prev, tk]))
  }

  function addLink() {
    const v = linkInput.trim()
    if (!v) return
    setLinks(prev => (prev.includes(v) ? prev : [...prev, v]))
    setLinkInput('')
  }

  function removeLink(url: string) {
    setLinks(prev => prev.filter(l => l !== url))
  }

  // Upload every picked file immediately, each with its own progress + cancel.
  function pickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? [])
    if (fileRef.current) fileRef.current.value = ''
    for (const f of files) {
      const id = `up-${uploadSeq.current++}`
      const { promise, abort } = uploadFileResumable(f, 'posts/revisi', p => {
        setUploads(prev => prev.map(u => (u.id === id ? { ...u, progress: p.percent } : u)))
      })
      setUploads(prev => [...prev, { id, name: f.name, progress: 0, abort }])
      promise
        .then(res => setUploaded(prev => [...prev, { url: res.url, name: f.name }]))
        .catch(err => {
          if (!(err as { message?: string })?.message?.toLowerCase().includes('abort')) {
            setError(t('Gagal mengupload') + ' "' + f.name + '"')
          }
        })
        .finally(() => setUploads(prev => prev.filter(u => u.id !== id)))
    }
  }

  function cancelUpload(id: string) {
    setUploads(prev => {
      prev.find(u => u.id === id)?.abort()
      return prev.filter(u => u.id !== id)
    })
  }

  function removeUploaded(url: string) {
    setUploaded(prev => prev.filter(f => f.url !== url))
  }

  const uploading = uploads.length > 0
  const canSave = selected.length > 0 && detail.trim().length > 0 && !saving && !uploading

  async function save() {
    if (!canSave) return
    setSaving(true)
    setError('')
    try {
      const now = new Date().toISOString()
      // Fold a typed-but-not-yet-added link into the list so it isn't lost.
      const pending = linkInput.trim()
      const allLinks = pending && !links.includes(pending) ? [...links, pending] : links
      const rec: PostRevision = {
        id: editing?.id ?? rid(),
        tracks: selected,
        detail: detail.trim(),
        reference_links: allLinks,
        files: uploaded,
        // Legacy single fields are folded into the arrays above on save.
        reference_link: '',
        file_url: '',
        file_name: '',
        author_name: editing?.author_name || me.name,
        author_email: editing?.author_email || me.email,
        created_at: editing?.created_at ?? now,
        updated_at: now,
      }
      const existing = post.revisions ?? []
      const nextRevs = editing
        ? existing.map(r => (r.id === rec.id ? rec : r))
        : [...existing, rec]

      // Atomic insert-or-replace of THIS revision (by id) so a revision another
      // user adds at the same time is never dropped by a stale read-modify-write.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: revData, error: upErr } = await (sb() as any)
        .rpc('post_revision_upsert', { p_id: post.id, p_rev: rec })
      if (upErr) throw upErr

      // Status/track flip (drag → revisi) is a separate partial write — these
      // are scalar fields, not a shared list, so last-write-wins is fine here.
      const statusUpd: Record<string, unknown> = {}
      if (applyStatus && !editing) {
        statusUpd.status = 'revisi'
        if (selected.includes('video')) statusUpd.video_status = 'revisi'
        if (selected.includes('design')) statusUpd.design_status = 'revisi'
        const { error: stErr } = await sb().from('posts').update(statusUpd).eq('id', post.id)
        if (stErr) throw stErr
      }

      const fresh = useStore.getState().posts.find(p => p.id === post.id) ?? post
      const updatedPost = { ...fresh, ...statusUpd, revisions: (revData ?? nextRevs) as PostRevision[] } as Post
      upsertPost(updatedPost)

      // Log to the post's activity feed.
      if (me.email) {
        const verb = editing ? t('memperbarui revisi') : t('membuat revisi')
        const trackLabel = selected.map(tk => TRACKS[tk].label).join(' & ')
        await sb().from('post_comments').insert({
          post_id: post.id, type: 'activity', author_email: me.email, author_name: me.name,
          body: `${verb} (${trackLabel})`,
        })
      }

      onSaved?.(updatedPost)
      onClose()
    } catch (e) {
      setError((e as { message?: string })?.message || t('Gagal menyimpan revisi.'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth={720}
      title={t('Revisi')}
      footer={
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', justifyContent: 'flex-end' }}>
          {error && <span style={{ flex: 1, fontSize: 12, color: '#f87171' }}>{error}</span>}
          <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
          <button
            onClick={save}
            disabled={!canSave}
            style={{
              background: canSave ? 'var(--accent)' : 'var(--bg3)',
              color: canSave ? '#fff' : 'var(--text2)',
              border: 'none', borderRadius: 6, padding: '7px 16px',
              cursor: canSave ? 'pointer' : 'not-allowed', fontSize: 13, fontWeight: 600,
            }}
          >
            {saving ? t('Menyimpan…') : t('Simpan')}
          </button>
        </div>
      }
    >
      {/* 1 — Tracks (Video Production / Design Studio). Multi-select when the
            post has both content types; auto-locked when it has only one. */}
      <Field label={t('Untuk')}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {avail.map(tk => {
            const on = selected.includes(tk)
            const m = TRACKS[tk]
            return (
              <button
                key={tk}
                type="button"
                onClick={() => toggleTrack(tk)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '7px 12px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  cursor: single ? 'default' : 'pointer',
                  color: on ? m.color : 'var(--text2)',
                  background: on ? m.color + '1f' : 'var(--bg3)',
                  border: `1px solid ${on ? m.color + '88' : 'var(--border)'}`,
                }}
              >
                {m.label}
                {on && (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            )
          })}
        </div>
      </Field>

      {/* 2 — Revision detail */}
      <Field label={t('Detail Revisi')}>
        <textarea
          rows={9}
          value={detail}
          onChange={e => setDetail(e.target.value)}
          placeholder={t('Tulis detail revisi yang diminta…')}
          style={{
            width: '100%', boxSizing: 'border-box', resize: 'vertical', minHeight: 180,
            background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9,
            padding: '12px 14px', color: 'var(--text)', fontSize: 13.5, lineHeight: 1.6, fontFamily: 'inherit', outline: 'none',
            transition: 'border-color 0.13s, box-shadow 0.13s',
          }}
          onFocus={e => { const el = e.currentTarget; el.style.borderColor = REVISI + '88'; el.style.boxShadow = `0 0 0 3px ${REVISI}1f` }}
          onBlur={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border)'; el.style.boxShadow = 'none' }}
        />
      </Field>

      {/* 3 — Reference links + file uploads (unified references manager) */}
      <Field label={t('Link Referensi / Upload File')}>
        {/* Link input + an explicit "Tambah Link" button so the action is obvious */}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            type="url"
            value={linkInput}
            onChange={e => setLinkInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
            placeholder={t('Tempel link referensi (Drive / Figma / dll)…')}
            style={{
              flex: 1, minWidth: 0, boxSizing: 'border-box',
              background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9,
              padding: '10px 13px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
              transition: 'border-color 0.13s, box-shadow 0.13s',
            }}
            onFocus={e => { const el = e.currentTarget; el.style.borderColor = REVISI + '88'; el.style.boxShadow = `0 0 0 3px ${REVISI}1f` }}
            onBlur={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border)'; el.style.boxShadow = 'none' }}
          />
          <button
            type="button"
            onClick={addLink}
            disabled={!linkInput.trim()}
            style={{
              flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 15px', borderRadius: 9,
              fontSize: 13, fontWeight: 600, cursor: linkInput.trim() ? 'pointer' : 'not-allowed',
              color: linkInput.trim() ? REVISI : 'var(--text3)',
              background: linkInput.trim() ? REVISI + '18' : 'var(--bg3)',
              border: `1px solid ${linkInput.trim() ? REVISI + '66' : 'var(--border)'}`,
              transition: 'background 0.13s, border-color 0.13s, color 0.13s',
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('Tambah Link')}
          </button>
        </div>

        {/* Upload dropzone — dashed, multi-file */}
        <input ref={fileRef} type="file" multiple style={{ display: 'none' }} onChange={pickFiles} />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          style={{
            width: '100%', marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            padding: '13px', borderRadius: 10, cursor: 'pointer',
            background: 'var(--bg3)', border: '1.5px dashed var(--border)', color: 'var(--text2)',
            fontSize: 13, fontWeight: 600, transition: 'border-color 0.13s, color 0.13s, background 0.13s',
          }}
          onMouseOver={e => { const el = e.currentTarget; el.style.borderColor = REVISI + '88'; el.style.color = REVISI; el.style.background = REVISI + '0d' }}
          onMouseOut={e => { const el = e.currentTarget; el.style.borderColor = 'var(--border)'; el.style.color = 'var(--text2)'; el.style.background = 'var(--bg3)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          {t('Upload File')}
          <span style={{ fontWeight: 400, color: 'var(--text3)', fontSize: 12 }}>· {t('bisa lebih dari satu')}</span>
        </button>

        {/* Unified references list: links → uploading → finished files */}
        {(links.length > 0 || uploads.length > 0 || uploaded.length > 0) && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 12 }}>
            {links.map(l => (
              <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 11px 7px 7px' }}>
                <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#3b9dff22', color: '#3b9dff' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </span>
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{hostOf(l)}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t('Link referensi')}</span>
                </span>
                <button
                  type="button"
                  onClick={() => removeLink(l)}
                  title={t('Hapus')}
                  style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
                >✕</button>
              </div>
            ))}
            {uploads.map(u => {
              const pct = Math.min(100, Math.max(0, Math.round(u.progress)))
              return (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, padding: '8px 11px' }}>
                  <span style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, background: REVISI + '22', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ width: 12, height: 12, borderRadius: '50%', border: `2px solid ${REVISI}55`, borderTopColor: REVISI, display: 'inline-block', animation: 'spin 0.65s linear infinite' }} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{u.name}</span>
                  <div style={{ width: 90, height: 5, borderRadius: 3, background: 'var(--border)', overflow: 'hidden', flexShrink: 0 }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: REVISI, borderRadius: 3, transition: 'width 0.15s ease' }} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: REVISI, width: 32, textAlign: 'right', flexShrink: 0 }}>{pct}%</span>
                  <button
                    type="button"
                    onClick={() => cancelUpload(u.id)}
                    title={t('Batal')}
                    style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                    onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b' }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
                  >✕</button>
                </div>
              )
            })}
            {uploaded.map(f => (
              <div key={f.url} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 9, padding: '7px 11px 7px 7px' }}>
                <span style={{ width: 26, height: 26, flexShrink: 0, borderRadius: 7, overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: REVISI + '22', color: REVISI }}>
                  {isImageUrl(f.url) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
                    </svg>
                  )}
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#43d9a2" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                <button
                  type="button"
                  onClick={() => removeUploaded(f.url)}
                  title={t('Hapus')}
                  style={{ flexShrink: 0, background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}
                  onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b' }}
                  onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </Field>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', marginBottom: 8 }}>
        {label}
      </div>
      {children}
    </div>
  )
}

function rid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  } catch { /* fall through */ }
  return `rev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const s = Math.max(0, Math.floor((Date.now() - then) / 1000))
  if (s < 60) return 'baru saja'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} menit lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam lalu`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} hari lalu`
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
}

// ── Detail Revisi section (post-detail, above comments) ────────
// Read-only preview on the worksheet pages; on Socmed Management each entry has
// an Edit button (canEdit) that re-opens the popup. Each revision renders as a
// card with a purple "revisi" accent rail, layered surfaces, tile-style track
// badges, thumbnail-aware reference tiles, and an authored footer.
const REVISI = '#a78bfa'

export function RevisiSection({
  revisions, canEdit, onAdd, onEdit, onDelete, onOpenLink,
}: {
  revisions: PostRevision[]
  canEdit: boolean
  onAdd: () => void
  onEdit: (rev: PostRevision) => void
  onDelete: (rev: PostRevision) => void
  onOpenLink: (url: string, label: string) => void
}) {
  const t = useT()
  // Hidden entirely on read-only surfaces with no revisions; on Socmed
  // Management the header (with "+ Tambah Revisi") shows even when empty.
  if (!revisions.length && !canEdit) return null
  // Newest revision first.
  const sorted = revisions.slice().sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 11 }}>
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)' }}>
          {t('Revisi')}
        </span>
        {revisions.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '0 7px', lineHeight: '17px' }}>
            {revisions.length}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <button
            onClick={onAdd}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#fff', transition: 'filter 0.13s' }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.12)' }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.filter = 'none' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            {t('Tambah Revisi')}
          </button>
        )}
      </div>
      {revisions.length === 0 ? (
        <div style={{ fontSize: 12.5, color: 'var(--text3)', background: 'var(--bg3)', border: '1px dashed var(--border)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' }}>
          {t('Belum ada revisi. Klik "+ Tambah Revisi" untuk menambah.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {sorted.map(rev => (
            <RevisiCard
              key={rev.id}
              rev={rev}
              canEdit={canEdit}
              onEdit={onEdit}
              onDelete={onDelete}
              onOpenLink={onOpenLink}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function RevisiCard({
  rev, canEdit, onEdit, onDelete, onOpenLink,
}: {
  rev: PostRevision
  canEdit: boolean
  onEdit: (rev: PostRevision) => void
  onDelete: (rev: PostRevision) => void
  onOpenLink: (url: string, label: string) => void
}) {
  const t = useT()
  const files = revisionFiles(rev)
  const links = revisionLinks(rev)
  const hasRefs = links.length > 0 || files.length > 0
  return (
    <div
      style={{
        position: 'relative', borderRadius: 13, overflow: 'hidden',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.22)',
        padding: '13px 15px',
      }}
    >
      {/* Header — revisi index · track badges · edit */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: rev.detail || hasRefs ? 11 : 2 }}>
        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.05em', color: 'var(--text2)' }}>
          {t('REVISI')}
        </span>
        <span style={{ width: 1, height: 12, background: 'var(--border)', flexShrink: 0 }} />
        {rev.tracks.map(tk => {
          const m = TRACKS[tk]
          return (
            <span key={tk} style={{ fontSize: 11, fontWeight: 600, color: m.color, background: m.color + '16', border: `1px solid ${m.color}38`, borderRadius: 7, padding: '3px 9px' }}>
              {m.label}
            </span>
          )
        })}
        <span style={{ flex: 1 }} />
        {canEdit && (
          <button
            onClick={() => onEdit(rev)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '3px 10px', cursor: 'pointer', fontSize: 11, fontWeight: 600, color: 'var(--text2)', transition: 'color 0.13s, border-color 0.13s, background 0.13s' }}
            onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.color = REVISI; el.style.borderColor = REVISI + '7a'; el.style.background = REVISI + '14' }}
            onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--text2)'; el.style.borderColor = 'var(--border)'; el.style.background = 'transparent' }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
            {t('Edit')}
          </button>
        )}
        {canEdit && (
          <button
            onClick={() => onDelete(rev)}
            title={t('Hapus revisi')}
            aria-label={t('Hapus revisi')}
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 24, background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: 0, cursor: 'pointer', color: 'var(--text2)', transition: 'color 0.13s, border-color 0.13s, background 0.13s' }}
            onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.color = '#ff6b6b'; el.style.borderColor = '#ff6b6b7a'; el.style.background = '#ff6b6b14' }}
            onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.color = 'var(--text2)'; el.style.borderColor = 'var(--border)'; el.style.background = 'transparent' }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        )}
      </div>

      {/* Revision detail — set on its own subtle surface so it reads as the note */}
      {rev.detail && (
        <div style={{
          fontSize: 13.5, lineHeight: 1.65, color: 'var(--text)',
          background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.045)',
          borderRadius: 9, padding: '10px 13px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {rev.detail}
        </div>
      )}

      {/* Reference link + uploaded file — thumbnail-aware tiles */}
      {hasRefs && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
          {links.map(l => (
            <RefTile
              key={l}
              kind="link"
              title={hostOf(l)}
              subtitle={t('Link Referensi')}
              onClick={() => onOpenLink(l, t('Referensi'))}
            />
          ))}
          {files.map(f => (
            <RefTile
              key={f.url}
              kind="file"
              url={f.url}
              title={f.name || t('File')}
              subtitle={t('Lampiran')}
              onClick={() => onOpenLink(f.url, f.name || t('File'))}
            />
          ))}
        </div>
      )}

      {/* Footer — author + relative time */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
        <MiniAvatar name={rev.author_name || rev.author_email || 'U'} size={22} />
        <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text2)' }}>
          {rev.author_name || rev.author_email || t('Seseorang')}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>· {timeAgo(rev.created_at)}</span>
      </div>
    </div>
  )
}

function RefTile({
  kind, url, title, subtitle, onClick,
}: {
  kind: 'link' | 'file'
  url?: string
  title: string
  subtitle: string
  onClick: () => void
}) {
  const thumb = kind === 'file' && url && isImageUrl(url) ? url : null
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 10, maxWidth: 280,
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
        padding: '6px 12px 6px 6px', cursor: 'pointer', textAlign: 'left',
        transition: 'border-color 0.13s, background 0.13s',
      }}
      onMouseOver={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = REVISI + '7a'; el.style.background = 'var(--bg3)' }}
      onMouseOut={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--border)'; el.style.background = 'var(--bg2)' }}
    >
      <span style={{ width: 32, height: 32, borderRadius: 8, flexShrink: 0, overflow: 'hidden', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: kind === 'link' ? '#3b9dff22' : REVISI + '22', color: kind === 'link' ? '#3b9dff' : REVISI }}>
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : kind === 'link' ? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
        ) : (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" />
          </svg>
        )}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: 1 }}>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        <span style={{ fontSize: 10.5, color: 'var(--text3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{subtitle}</span>
      </span>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--text3)', marginLeft: 2 }}>
        <path d="M7 17 17 7" /><path d="M7 7h10v10" />
      </svg>
    </button>
  )
}

// ── small helpers (local) ──
function isImageUrl(url: string): boolean {
  const ext = url.split('?')[0].split('.').pop()?.toLowerCase() || ''
  return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return url }
}

const AV_COLORS = ['#6c63ff', '#43d9a2', '#ffc542', '#ff6b6b', '#3b9dff', '#c084fc', '#f97316', '#14b8a6']
function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AV_COLORS[h % AV_COLORS.length]
}
function initialsFor(name: string): string {
  const label = name.includes('@') ? name.split('@')[0] : name
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return label.slice(0, 2).toUpperCase()
}
function MiniAvatar({ name, size = 22 }: { name: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 700, color: '#fff', background: colorFor(name) }}>
      {initialsFor(name)}
    </span>
  )
}
