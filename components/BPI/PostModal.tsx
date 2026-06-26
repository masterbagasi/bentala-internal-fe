'use client'

import { useState, useEffect, useRef } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useLogActivity } from '@/hooks/useData'
import { BPI_STATUS_COLS, POST_PLATFORMS, POST_RATIOS } from '@/lib/constants'
import { MultiFileUploader } from '@/components/website/FileUploader'
import { SingleDatePicker } from '@/components/Social/DateRangePicker'
import { PlatformIcon } from '@/components/shared/PlatformIcon'
import { useSocmedProjects } from '@/lib/socmed-projects'
import type { Post } from '@/lib/types'
import { DANGEROUS_SCHEME, isUploadedFile, linkHref } from '@/lib/attachments'

interface PostModalProps {
  open: boolean
  onClose: () => void
  editId: string | null
  entity: string
  /** When set, show a Project dropdown listing every active socmed project
   *  below the name. A concrete slug pre-selects that project; 'all' starts
   *  empty. Omitted on workspace pages (post keeps its 'ws' entity). */
  projectScope?: string
}

type Platform = (typeof POST_PLATFORMS)[number]['key']
type ContentType = 'video' | 'design'

const DEFAULT_FORM = {
  title: '',
  project: '' as string,
  platforms: [] as Platform[],
  date: '',
  status: 'todo' as Post['status'],
  pics: [] as string[],
  caption: '',
  headline: '',
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
  reference_files: [] as string[],
}

export function PostModal({ open, onClose, editId, entity, projectScope }: PostModalProps) {
  const t = useT()
  const { posts, upsertPost } = useStore(useShallow((s) => ({ posts: s.posts, upsertPost: s.upsertPost })))
  const logActivity = useLogActivity()
  // Every active socmed project — so the Project dropdown auto-includes new
  // projects (e.g. Master Bagasi) the moment they're added, with no code change.
  const socmedProjects = useSocmedProjects(true)
  const [form, setForm] = useState(DEFAULT_FORM)
  const [loading, setLoading] = useState(false)
  const [originalTagged, setOriginalTagged] = useState<string[]>([])
  // Snapshot of the post's fields at edit-time, used to log what changed.
  const [originalForm, setOriginalForm] = useState<typeof DEFAULT_FORM | null>(null)
  const [refLinkInput, setRefLinkInput] = useState('')
  const [currentUserName, setCurrentUserName] = useState('')
  const [currentUserEmail, setCurrentUserEmail] = useState('')
  // Real login accounts (for the Tag Akun picker) — replaces the old dummy
  // TEAM list so only actually-registered accounts can be tagged.
  const [accounts, setAccounts] = useState<{ email: string; name: string; avatarUrl: string | null }[]>([])

  // Resolve the logged-in user so their own account shows as "You".
  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      if (data.user) {
        const meta = data.user.user_metadata ?? {}
        setCurrentUserName(meta.full_name ?? meta.name ?? data.user.email?.split('@')[0] ?? '')
        setCurrentUserEmail(data.user.email ?? '')
      }
    })
  }, [])

  // Load the real account list whenever the modal opens.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { email: string; name: string; avatarUrl: string | null }[] }) => {
        if (!cancelled) setAccounts(d.accounts ?? [])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [open])

  function addRefLink() {
    const v = refLinkInput.trim()
    if (!v) return
    if (DANGEROUS_SCHEME.test(v)) { alert(t('Link tidak valid — gunakan URL http(s).')); return }
    setForm(f => (f.reference_files.includes(v) ? f : { ...f, reference_files: [...f.reference_files, v] }))
    setRefLinkInput('')
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

  // Load existing post — ONCE per open/editId session.
  //
  // CRITICAL: we intentionally do NOT re-seed the form on every `posts` change.
  // Realtime echoes update the global `posts` array constantly on an active
  // board; re-running setForm() here would overwrite the user's in-progress
  // edits (e.g. a brief they just typed but haven't saved yet) with stale DB
  // values. The change-diff in handleSave would then see the brief as
  // "unchanged" and never write it — so the entered brief silently vanishes.
  // The ref guard pins the form to the values loaded when the modal opened;
  // the partial-diff save still keeps concurrent edits to OTHER fields intact.
  const initedKey = useRef<string | null>(null)
  useEffect(() => {
    if (!open) { initedKey.current = null; return }
    const key = editId ?? '__new__'
    if (initedKey.current === key) return // already seeded this session
    if (editId) {
      const p = posts.find(x => x.id === editId)
      if (!p) return // not loaded yet — wait, but don't mark as seeded
      const loaded = {
        title:         p.title,
        project:       p.entity || '',
        platforms:     (p.platforms || []) as Platform[],
        date:          p.date || '',
        status:        p.status,
        pics:          p.pics || [],
        caption:       p.caption || '',
        headline:      p.headline || '',
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
        reference_files: p.reference_files || [],
      }
      setForm(loaded)
      setOriginalTagged(p.tagged || [])
      setOriginalForm(loaded)
    } else {
      // New post: pre-select the project from the tab context ('all' → empty).
      setForm({ ...DEFAULT_FORM, project: projectScope && projectScope !== 'all' ? projectScope : '' })
      setOriginalTagged([])
      setOriginalForm(null)
    }
    initedKey.current = key
  }, [open, editId, posts, projectScope])

  // Record what changed on an edit as activity rows in post_comments, so the
  // post's activity feed reflects edits (status, fields, etc.).
  async function logPostChanges(postId: string) {
    const o = originalForm
    if (!o) return
    const n = form
    const arr = (a: string[]) => JSON.stringify(a ?? [])

    // ── Label helpers ──
    const statusLabel = (s: string) => {
      const cols = entity === 'bpi'
        ? BPI_STATUS_COLS
        : [{ key: 'todo', label: 'Idea' }, { key: 'produksi', label: 'Production' }, { key: 'published', label: 'Published' }]
      return cols.find(c => c.key === s)?.label ?? s
    }
    const platformLabel = (keys: string[]) =>
      keys.map(k => POST_PLATFORMS.find(p => p.key === k)?.label ?? k).join(', ')
    const contentLabel = (keys: string[]) =>
      keys.map(k => (k === 'video' ? 'Video' : k === 'design' ? 'Design' : k)).join(', ')
    const taggedLabel = (emails: string[]) =>
      emails.map(e => accounts.find(a => a.email === e)?.name ?? e).join(', ')
    const dateLabel = (d: string) => {
      if (!d) return ''
      const dt = new Date(d)
      return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    }
    const short = (t: string) => (t.length > 60 ? t.slice(0, 60) + '…' : t)
    const quo = (s: string) => (s && s.trim() ? `"${short(s)}"` : 'kosong')
    const lbl = (s: string) => (s && s.trim() ? s : 'kosong')

    // ── One activity entry per changed field, phrased "<field> dari <old>
    //    menjadi <new>". Combined with the actor name at render time it reads
    //    e.g. "trinaufalabd telah memperbarui judul dari "..." menjadi "...".
    const changes: string[] = []
    if (o.title !== n.title) changes.push(`telah memperbarui judul dari ${quo(o.title)} menjadi ${quo(n.title)}`)
    if (o.status !== n.status) changes.push(`telah mengubah status dari ${lbl(statusLabel(o.status))} menjadi ${lbl(statusLabel(n.status))}`)
    if (o.date !== n.date) changes.push(`telah mengubah jadwal posting dari ${lbl(dateLabel(o.date))} menjadi ${lbl(dateLabel(n.date))}`)
    if (arr(o.platforms) !== arr(n.platforms)) changes.push(`telah mengubah platform dari ${lbl(platformLabel(o.platforms))} menjadi ${lbl(platformLabel(n.platforms))}`)
    if (arr(o.content_types) !== arr(n.content_types)) changes.push(`telah mengubah jenis konten dari ${lbl(contentLabel(o.content_types))} menjadi ${lbl(contentLabel(n.content_types))}`)
    if (o.ratio !== n.ratio) changes.push(`telah mengubah ratio dari ${lbl(o.ratio)} menjadi ${lbl(n.ratio)}`)
    if (arr(o.tagged) !== arr(n.tagged)) changes.push(`telah mengubah tag akun dari ${lbl(taggedLabel(o.tagged))} menjadi ${lbl(taggedLabel(n.tagged))}`)
    if (o.hashtags !== n.hashtags) changes.push(`telah memperbarui hashtags dari ${quo(o.hashtags)} menjadi ${quo(n.hashtags)}`)
    if (o.caption !== n.caption) changes.push('telah memperbarui caption')
    if (o.brief !== n.brief) changes.push('telah memperbarui brief')
    if (o.notes !== n.notes) changes.push('telah memperbarui catatan')
    if (o.video_link !== n.video_link || o.design_link !== n.design_link || arr(o.files) !== arr(n.files)) {
      changes.push('telah memperbarui lampiran')
    }
    if (!changes.length) return

    const supabase = getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient
    const rows = changes.map(text => ({
      post_id: postId,
      type: 'activity',
      author_email: currentUserEmail || null,
      author_name: currentUserName || null,
      body: text,
    }))
    try {
      await supabase.from('post_comments').insert(rows)
    } catch { /* non-blocking — activity logging shouldn't fail the save */ }
  }

  async function handleSave() {
    if (!form.title.trim()) { alert(t('Nama project wajib diisi!')); return }
    // When the Project dropdown is shown, a choice is required.
    if (projectScope && !form.project) { alert(t('Pilih project terlebih dahulu!')); return }
    const finalEntity = projectScope ? form.project : entity

    setLoading(true)
    const supabase = getSupabase()

    // Auto-assign PIC based on content type
    const pics: string[] = []
    if (form.content_types.includes('video')) pics.push('Video Production')
    if (form.content_types.includes('design')) pics.push('Design Studio')

    const data = {
      entity:        finalEntity,
      title:         form.title.trim(),
      platforms:     form.platforms,
      date:          form.date || null,
      status:        form.status,
      pics,
      caption:       form.caption,
      headline:      form.headline,
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
      reference_files: form.reference_files,
    }

    if (editId) {
      // CRITICAL: only write fields the user actually changed. A full-object
      // update can blank a field that wasn't loaded into the form (data loss).
      // Diffing against the originally-loaded values makes a save incapable of
      // overwriting an untouched field (e.g. caption/brief stay intact).
      const o = originalForm
      const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
      let upd: Record<string, unknown> = data
      if (o) {
        upd = {}
        if (!same(form.title.trim(), (o.title || '').trim())) upd.title = data.title
        if (!same(form.caption, o.caption)) upd.caption = data.caption
        if (!same(form.headline, o.headline)) upd.headline = data.headline
        if (!same(form.brief, o.brief)) upd.brief = data.brief
        if (!same(form.hashtags, o.hashtags)) upd.hashtags = data.hashtags
        if (!same(form.notes, o.notes)) upd.notes = data.notes
        if (!same(form.date, o.date)) upd.date = data.date
        if (!same(form.status, o.status)) upd.status = data.status
        if (!same(form.ratio, o.ratio)) upd.ratio = data.ratio
        if (!same(form.platforms, o.platforms)) upd.platforms = data.platforms
        if (!same(form.content_types, o.content_types)) { upd.content_types = data.content_types; upd.pics = data.pics }
        if (!same(form.tagged, o.tagged)) upd.tagged = data.tagged
        if (!same(form.files, o.files)) upd.files = data.files
        if (!same(form.reference_files, o.reference_files)) upd.reference_files = data.reference_files
        if (!same(form.video_link, o.video_link)) upd.video_link = data.video_link
        if (!same(form.design_link, o.design_link)) upd.design_link = data.design_link
        if (!same(form.video_file_url, o.video_file_url)) upd.video_file_url = data.video_file_url
        if (!same(form.design_file_url, o.design_file_url)) upd.design_file_url = data.design_file_url
        if (projectScope && !same(form.project, o.project)) upd.entity = finalEntity
      }
      if (Object.keys(upd).length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase as any).from('posts').update(upd).eq('id', editId)
        if (error) { setLoading(false); alert(t('Gagal menyimpan: ') + error.message); return }
      }
      // Optimistically update the store so the change shows immediately,
      // without waiting for the realtime echo or a page reload.
      const existing = posts.find(p => p.id === editId)
      if (existing) upsertPost({ ...existing, ...upd, id: editId } as Post)
      logActivity(`Task diupdate: "${form.title}"`)
      await logPostChanges(editId)
    } else {
      // Stamp the creator from the logged-in user
      const { data: u } = await supabase.auth.getUser()
      const meta = u.user?.user_metadata ?? {}
      const creator = meta.full_name ?? meta.name ?? u.user?.email?.split('@')[0] ?? 'Unknown'
      // CRITICAL: surface insert errors instead of failing silently. A rejected
      // insert (e.g. an unknown project slug) must tell the user, not just close
      // the modal and look like a no-op bug.
      const { data: created, error } = await (supabase as any)
        .from('posts').insert({ ...data, created_by: creator }).select().single()
      if (error) { setLoading(false); alert(t('Gagal menyimpan: ') + error.message); return }
      // Optimistically add to the board so it shows immediately, without waiting
      // for the realtime echo or a page reload.
      if (created) upsertPost(created as Post)
      logActivity(`Task baru ditambahkan: "${form.title}"`, creator)
    }

    // Log newly-tagged accounts to the activity feed. The tagged user is
    // notified in-app via the NotificationBell (derived from posts that tag
    // them) — no email is sent.
    const newlyTagged = form.tagged.filter(email => !originalTagged.includes(email))
    for (const email of newlyTagged) {
      const displayName = accounts.find(a => a.email === email)?.name ?? email
      await logActivity(`🔔 ${displayName} di-tag pada task "${form.title}"`, displayName)
    }

    setLoading(false)
    onClose()
  }

  const statusCols = entity === 'bpi' ? BPI_STATUS_COLS : [
    { key: 'todo', label: 'Idea' },
    { key: 'produksi', label: 'Production' },
    { key: 'published', label: 'Published' },
  ]

  // Split the attachment list: pasted links render as openable chips below,
  // uploaded files go to the media uploader (which previews them as thumbnails).
  const refLinks = form.reference_files.filter(u => !isUploadedFile(u))
  const refFiles = form.reference_files.filter(isUploadedFile)

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editId ? t('Edit Task') : t('Tambah Task Baru')}
      maxWidth={880}
      footer={
        <>
          <BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary>
          <BtnPrimary onClick={handleSave} loading={loading}>{t('Simpan')}</BtnPrimary>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Project name */}
        <FormGroup label={t('Nama Project *')}>
          <input
            type="text"
            placeholder={t('Nama project...')}
            value={form.title}
            onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
          />
        </FormGroup>

        {/* Project (Bentala Project / Studio) — only on the socmed boards */}
        {projectScope && (
          <FormGroup label={t('Project *')}>
            <SingleDropdown
              placeholder={t('Pilih project...')}
              options={socmedProjects.map(p => ({ value: p.slug, label: p.name }))}
              value={form.project}
              onChange={v => setForm(f => ({ ...f, project: v }))}
            />
          </FormGroup>
        )}

        {/* 2. Tanggal Posting + Status */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormGroup label={t('Tanggal Posting')}>
            <SingleDatePicker
              value={form.date}
              onChange={d => setForm(f => ({ ...f, date: d }))}
            />
          </FormGroup>
          <FormGroup label={t('Status')}>
            <SingleDropdown
              options={statusCols.map((s: any) => ({ value: s.key, label: s.label }))}
              value={form.status}
              onChange={v => setForm(f => ({ ...f, status: v as Post['status'] }))}
            />
          </FormGroup>
        </div>

        {/* 3. Platform + Jenis Konten */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <FormGroup label={t('Platform')}>
            <MultiDropdown
              placeholder={t('Pilih platform...')}
              options={POST_PLATFORMS.map(p => ({ value: p.key, label: p.label, avatar: <PlatformIcon platform={p.key} /> }))}
              selected={form.platforms}
              onChange={next => setForm(f => ({ ...f, platforms: next as Platform[] }))}
            />
          </FormGroup>
          <FormGroup label={t('Jenis Konten')}>
            <MultiDropdown
              placeholder={t('Pilih jenis konten...')}
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
          <FormGroup label={t('Ratio')}>
            <MultiDropdown
              placeholder={t('Pilih ratio...')}
              options={POST_RATIOS.map(r => ({ value: r.key, label: r.label, hint: r.hint }))}
              selected={form.ratio ? form.ratio.split(',').map(s => s.trim()).filter(Boolean) : []}
              onChange={next => setForm(f => ({ ...f, ratio: next.join(', ') }))}
            />
          </FormGroup>
          <FormGroup label={t('Tag Akun')}>
            <MultiDropdown
              placeholder={accounts.length ? t('Pilih akun...') : t('Memuat akun...')}
              options={accounts.map(a => ({
                value: a.email,
                label: a.email === currentUserEmail ? `${a.name} (You)` : a.name,
                hint: a.email,
                avatar: <AccountAvatar name={a.name} email={a.email} url={a.avatarUrl} />,
              }))}
              selected={form.tagged}
              onChange={next => setForm(f => ({ ...f, tagged: next }))}
            />
          </FormGroup>
        </div>

        {/* Headline (above Brief) */}
        <FormGroup label={t('Headline')}>
          <textarea
            rows={2}
            placeholder={t('Tulis headline...')}
            value={form.headline}
            onChange={e => setForm(f => ({ ...f, headline: e.target.value }))}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
          />
        </FormGroup>

        {/* Brief (above Caption) */}
        <FormGroup label={t('Brief')}>
          <textarea
            rows={4}
            placeholder={t('Tulis brief konten (konsep, referensi, arahan untuk tim)...')}
            value={form.brief}
            onChange={e => setForm(f => ({ ...f, brief: e.target.value }))}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
          />
        </FormGroup>

        {/* Caption */}
        <FormGroup label={t('Caption')}>
          <textarea
            rows={4}
            placeholder={t('Tulis caption konten...')}
            value={form.caption}
            onChange={e => setForm(f => ({ ...f, caption: e.target.value }))}
            style={{ fontFamily: 'inherit', resize: 'vertical' }}
          />
        </FormGroup>

        {/* 6. Hashtags — auto '#' on space */}
        <FormGroup label={t('Hashtags')}>
          <input
            type="text"
            placeholder="#bentala #konten ..."
            value={form.hashtags}
            onChange={e => onHashtagsChange(e.target.value)}
            onKeyDown={onHashtagsKeyDown}
          />
        </FormGroup>

        {/* 7. Notes */}
        <FormGroup label={t('Catatan Internal')}>
          <textarea
            rows={3}
            placeholder={t('Catatan untuk tim...')}
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
          />
        </FormGroup>

        {/* 8. Reference — separate bucket (links + uploads) shown as its own
            section in the task detail. (File Attachments are added from the task
            detail, not here.) */}
        <FormGroup label={t('Referensi')}>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
            <input
              type="text"
              inputMode="url"
              placeholder={t('Tempel link apa pun (Drive / Figma / URL)...')}
              value={refLinkInput}
              onChange={e => setRefLinkInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRefLink() } }}
              style={{ flex: 1 }}
            />
            <button type="button" onClick={addRefLink} style={{ flexShrink: 0, padding: '0 16px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
              + Link
            </button>
          </div>
          {refLinks.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
              {refLinks.map(link => (
                <div key={link} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 8, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
                  <span aria-hidden style={{ fontSize: 14, flexShrink: 0 }}>🔗</span>
                  <a href={linkHref(link)} target="_blank" rel="noopener noreferrer" title={link} style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }}>{link}</a>
                  <button type="button" onClick={() => setForm(f => ({ ...f, reference_files: f.reference_files.filter(u => u !== link) }))} title={t('Hapus')} style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 6, cursor: 'pointer', background: 'var(--bg2)', border: '1px solid var(--border)', color: '#ff6b6b', fontSize: 14 }}>×</button>
                </div>
              ))}
            </div>
          )}
          <MultiFileUploader
            value={refFiles}
            onChange={urls => setForm(f => ({ ...f, reference_files: [...f.reference_files.filter(u => !isUploadedFile(u)), ...urls] }))}
            prefix="posts/reference"
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

// Deterministic accent color from a string (email), so each account gets a
// stable avatar tint without a hardcoded palette.
const AVATAR_COLORS = ['#6c63ff', '#43d9a2', '#ffc542', '#ff6b6b', '#3b9dff', '#c084fc', '#f97316', '#14b8a6']
function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

// Avatar for a real account — photo if available, else colored initials.
function AccountAvatar({ name, email, url }: { name: string; email: string; url: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img loading="lazy" decoding="async" src={url} alt={name} style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
    )
  }
  return <Avatar color={colorFor(email)} initials={initialsFor(name)} />
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

