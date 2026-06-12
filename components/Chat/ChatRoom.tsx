'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { ConfirmDialog } from '@/components/shared/Modal'

const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

interface Msg {
  id: string; room: string; author_email: string; author_name: string; body: string; created_at: string
  edited_at?: string | null; deleted_at?: string | null
  attachment_path?: string | null; attachment_name?: string | null; attachment_type?: string | null; attachment_size?: number | null
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}
function fmtSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
// Deterministic, vivid-but-muted colour per person so avatars stay distinguishable.
function avatarColor(name: string) {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 360
  return `linear-gradient(150deg, hsl(${h},46%,52%), hsl(${(h + 26) % 360},48%,40%))`
}
// Group a message with the previous one when same author within 5 minutes.
const GROUP_WINDOW_MS = 5 * 60_000
const dayKey = (iso: string) => iso.slice(0, 10)
function dayLabel(iso: string, t: (s: string) => string) {
  const d = new Date(iso)
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(new Date()) - startOf(d)) / 86_400_000)
  if (diff === 0) return t('Hari ini')
  if (diff === 1) return t('Kemarin')
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(d)
}

const ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip'
const MAX_BYTES = 10 * 1024 * 1024

export function ChatRoom({ room, roomName, meEmail, meName, meSuper }: { room: string; roomName: string; meEmail: string; meName: string; meSuper: boolean }) {
  const t = useT()
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [pinned, setPinned] = useState(false) // user scrolled up — show "jump to latest"
  // Message actions / edit.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // Attachments.
  const [pending, setPending] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [attachErr, setAttachErr] = useState('')
  // Selection / clear.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<null | { kind: 'selected' | 'all' }>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const atBottomRef = useRef(true)

  const fileUrl = useCallback(
    (m: Msg) => `/api/chat/${encodeURIComponent(room)}/file?path=${encodeURIComponent(m.attachment_path ?? '')}`,
    [room],
  )

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  // Initial load + realtime subscription (RLS scopes rows to this room).
  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/chat/${encodeURIComponent(room)}?limit=50`)
      .then(r => (r.ok ? r.json() : { messages: [] }))
      .then((d: { messages?: Msg[] }) => {
        if (cancelled) return
        const list = d.messages ?? []
        setMessages(list)
        setHasMore(list.length >= 50)
        setLoading(false)
        requestAnimationFrame(scrollToBottom)
      })
    fetch(`/api/chat/${encodeURIComponent(room)}/read`, { method: 'POST' })

    const channel = sb()
      .channel(`chat:${room}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` },
        payload => {
          if (cancelled) return
          const row = payload.new as Msg
          setMessages(prev => {
            if (prev.some(m => m.id === row.id)) return prev
            // Reconcile our own optimistic copy (tmp id) instead of duplicating.
            const idx = prev.findIndex(m => m.id.startsWith('tmp-') && m.author_email === row.author_email && m.body === row.body)
            if (idx !== -1) { const next = prev.slice(); next[idx] = row; return next }
            return [...prev, row]
          })
          fetch(`/api/chat/${encodeURIComponent(room)}/read`, { method: 'POST' })
        })
      .on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` },
        payload => {
          if (cancelled) return
          const row = payload.new as Msg
          setMessages(prev => prev.map(m => (m.id === row.id ? row : m)))
        })
      .on('postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` },
        payload => {
          if (cancelled) return
          const old = payload.old as { id: string }
          setMessages(prev => prev.filter(m => m.id !== old.id))
        })
      .subscribe()

    return () => { cancelled = true; sb().removeChannel(channel) }
  }, [room, scrollToBottom])

  // Auto-scroll on new messages only if the user is already at the bottom.
  useEffect(() => {
    if (atBottomRef.current) requestAnimationFrame(scrollToBottom)
  }, [messages, scrollToBottom])

  // Auto-grow the composer.
  useEffect(() => {
    const ta = taRef.current
    if (!ta) return
    ta.style.height = 'auto'
    ta.style.height = Math.min(ta.scrollHeight, 140) + 'px'
  }, [text])

  function onScroll() {
    const el = listRef.current
    if (!el) return
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    atBottomRef.current = atBottom
    setPinned(!atBottom)
  }

  function jumpToLatest() {
    atBottomRef.current = true
    setPinned(false)
    scrollToBottom()
  }

  async function loadOlder() {
    const oldest = messages[0]?.created_at
    if (!oldest) return
    const el = listRef.current
    const prevHeight = el?.scrollHeight ?? 0
    const r = await fetch(`/api/chat/${encodeURIComponent(room)}?before=${encodeURIComponent(oldest)}&limit=50`)
    const d = (await r.json()) as { messages?: Msg[] }
    const older = d.messages ?? []
    setHasMore(older.length >= 50)
    setMessages(prev => [...older, ...prev])
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight })
  }

  // ── Compose / send ──
  function pickFile(f: File | null) {
    setAttachErr('')
    if (!f) return
    if (f.size > MAX_BYTES) { setAttachErr(t('File terlalu besar (maks 10MB)')); return }
    setPending(f)
  }

  async function send() {
    const body = text.trim()
    if (!body && !pending) return

    let attach: { attachment_path: string; attachment_name: string; attachment_type: string; attachment_size: number } | null = null
    if (pending) {
      setUploading(true)
      const fd = new FormData(); fd.append('file', pending)
      const ur = await fetch(`/api/chat/${encodeURIComponent(room)}/upload`, { method: 'POST', body: fd })
      setUploading(false)
      if (!ur.ok) { setAttachErr(t('Tipe file tidak didukung')); return }
      attach = await ur.json()
      setPending(null)
    }

    setText('')
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`, room, author_email: meEmail, author_name: meName,
      body, created_at: new Date().toISOString(), ...(attach ?? {}),
    }
    atBottomRef.current = true
    setMessages(prev => [...prev, optimistic])
    try {
      const r = await fetch(`/api/chat/${encodeURIComponent(room)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, ...(attach ?? {}) }),
      })
      const d = (await r.json()) as { message?: Msg }
      if (d.message) setMessages(prev => {
        const real = d.message!
        if (prev.some(m => m.id === real.id)) return prev.filter(m => m.id !== optimistic.id)
        return prev.map(m => (m.id === optimistic.id ? real : m))
      })
    } catch {
      setMessages(prev => prev.map(m => (m.id === optimistic.id ? { ...m, body: m.body + ' ' + t('(gagal terkirim)') } : m)))
    }
  }

  // ── Per-message actions ──
  async function retract(id: string) {
    setMenuFor(null)
    setMessages(prev => prev.map(m => m.id === id ? { ...m, deleted_at: new Date().toISOString(), body: '', attachment_path: null, attachment_type: null, attachment_name: null } : m))
    await fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retract' }),
    })
  }
  async function hardDelete(id: string) {
    setMenuFor(null)
    setMessages(prev => prev.filter(m => m.id !== id))
    await fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, { method: 'DELETE' })
  }
  function startEdit(m: Msg) { setMenuFor(null); setEditing(m.id); setEditText(m.body) }
  async function saveEdit(id: string) {
    const body = editText.trim()
    if (!body) return
    setEditing(null)
    setMessages(prev => prev.map(m => m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m))
    await fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    })
  }

  // ── Selection / clear ──
  function toggleSel(id: string) {
    setSelected(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }
  function exitSelect() { setSelecting(false); setSelected(new Set()) }
  async function clearSelected() {
    const ids = Array.from(selected)
    setConfirm(null); exitSelect()
    setMessages(prev => prev.filter(m => !ids.includes(m.id)))
    await fetch(`/api/chat/${encodeURIComponent(room)}/clear`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
    })
  }
  async function clearAll() {
    setConfirm(null); exitSelect()
    setMessages([])
    await fetch(`/api/chat/${encodeURIComponent(room)}/clear`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }),
    })
  }

  // Never render the same message id twice (echo/optimistic safety net).
  const seenIds = new Set<string>()
  const view = messages.filter(m => (seenIds.has(m.id) ? false : (seenIds.add(m.id), true)))

  return (
    <div className="cr-root">
      <style>{CR_CSS}</style>

      {/* ── Message stream ── */}
      <div ref={listRef} onScroll={onScroll} className="cr-stream">
        <div className="cr-atmos" aria-hidden />

        {loading ? (
          <div className="cr-skel-wrap">
            {[0, 1, 2, 3].map(i => (
              <div key={i} className={`cr-skel ${i % 2 ? 'mine' : ''}`}>
                {i % 2 === 0 && <span className="cr-skel-av" />}
                <span className="cr-skel-bubble" style={{ width: `${42 + ((i * 17) % 34)}%` }} />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="cr-empty">
            <div className="cr-empty-glyph">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="cr-empty-title">{t('Belum ada pesan')}</div>
            <div className="cr-empty-sub">{t('Mulai obrolan dengan tim')} {roomName}.</div>
          </div>
        ) : (
          <div className="cr-list">
            {hasMore && (
              <div className="cr-older">
                <button onClick={loadOlder} className="cr-older-btn">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 15l-6-6-6 6" /></svg>
                  {t('Muat lebih lama')}
                </button>
              </div>
            )}
            {view.map((m, i) => {
              const mine = m.author_email === meEmail
              const prev = view[i - 1]
              const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at)
              const grouped = !newDay && !!prev && prev.author_email === m.author_email &&
                new Date(m.created_at).getTime() - new Date(prev.created_at).getTime() < GROUP_WINDOW_MS
              const pendingMsg = m.id.startsWith('tmp-')
              const retracted = !!m.deleted_at
              const canDelete = mine || meSuper
              const hasMenu = !selecting && !retracted && !pendingMsg && (mine || meSuper)
              const isImage = !!m.attachment_path && (m.attachment_type ?? '').startsWith('image/')
              const isFile = !!m.attachment_path && !isImage

              return (
                <div
                  key={m.id}
                  className={`cr-msg ${selecting ? 'selecting' : ''} ${selected.has(m.id) ? 'sel' : ''} ${selecting && !canDelete ? 'nosel' : ''}`}
                  onClick={selecting && canDelete ? () => toggleSel(m.id) : undefined}
                >
                  {selecting && (
                    <span className="cr-check" aria-hidden>
                      {selected.has(m.id) && (
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                      )}
                    </span>
                  )}

                  <div className="cr-msg-body">
                    {newDay && (
                      <div className="cr-day"><span className="cr-day-chip">{dayLabel(m.created_at, t)}</span></div>
                    )}
                    <div className={`cr-row ${mine ? 'mine' : ''}`} style={{ marginTop: grouped ? 2 : 14 }}>
                      <span className="cr-av-slot">
                        {!grouped && (
                          <span className="cr-av" style={{ background: mine ? 'linear-gradient(150deg, #2f63ff, #0B3DE7)' : avatarColor(m.author_name) }}>
                            {initials(m.author_name)}
                          </span>
                        )}
                      </span>
                      <div className="cr-col">
                        {!grouped && (
                          <div className="cr-meta">
                            <span className="cr-name">{mine ? t('Saya') : m.author_name}</span>
                            <span className="cr-time">{fmtTime(m.created_at)}</span>
                            {m.edited_at && !retracted && <span className="cr-edited">{t('(diedit)')}</span>}
                          </div>
                        )}

                        {retracted ? (
                          <div className="cr-bubble cr-retracted">{t('Pesan ini ditarik')}</div>
                        ) : editing === m.id ? (
                          <div className="cr-edit-area">
                            <textarea
                              autoFocus value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveEdit(m.id) }
                                if (e.key === 'Escape') setEditing(null)
                              }}
                              className="cr-edit-input" rows={1}
                            />
                            <div className="cr-edit-actions">
                              <button className="cr-link-btn" onClick={() => setEditing(null)}>{t('Batal')}</button>
                              <button className="cr-link-btn primary" onClick={() => saveEdit(m.id)}>{t('Simpan')}</button>
                            </div>
                          </div>
                        ) : (
                          <div className="cr-bubble-row">
                            <div className={`cr-bubble ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`} title={fmtTime(m.created_at)}>
                              {isImage && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img className="cr-img" src={fileUrl(m)} alt={m.attachment_name ?? ''} loading="lazy"
                                  onClick={e => { e.stopPropagation(); window.open(fileUrl(m), '_blank') }} />
                              )}
                              {isFile && (
                                <a className="cr-file-chip" href={fileUrl(m)} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()}>
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                                  <span className="cr-file-meta">
                                    <span className="cr-file-name">{m.attachment_name}</span>
                                    <span className="cr-file-size">{fmtSize(m.attachment_size ?? 0)}</span>
                                  </span>
                                </a>
                              )}
                              {m.body && <span className="cr-body-text">{m.body}</span>}
                              {mine && (
                                <span className={`cr-tick ${pendingMsg ? 'pending' : ''}`} aria-hidden>
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                </span>
                              )}
                            </div>

                            {hasMenu && (
                              <div className="cr-actions-wrap">
                                <button className="cr-actions" onClick={() => setMenuFor(menuFor === m.id ? null : m.id)} aria-label={t('Aksi')}>
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                                </button>
                                {menuFor === m.id && (
                                  <div className={`cr-menu ${mine ? 'right' : 'left'}`}>
                                    {mine && <button onClick={() => startEdit(m)}>{t('Edit')}</button>}
                                    {mine && <button onClick={() => retract(m.id)}>{t('Tarik')}</button>}
                                    {(meSuper && !mine) && <button className="danger" onClick={() => hardDelete(m.id)}>{t('Hapus')}</button>}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {menuFor && <div className="cr-menu-overlay" onClick={() => setMenuFor(null)} />}

        {pinned && !selecting && (
          <button onClick={jumpToLatest} className="cr-jump" title={t('Ke pesan terbaru')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}
      </div>

      {/* ── Composer / selection bar ── */}
      {selecting ? (
        <div className="cr-selbar">
          <button className="cr-link-btn" onClick={exitSelect}>{t('Batal pilih')}</button>
          <span className="cr-sel-count">{selected.size} {t('dipilih')}</span>
          <div style={{ flex: 1 }} />
          {meSuper && <button className="cr-selbar-btn danger" onClick={() => setConfirm({ kind: 'all' })}>{t('Kosongkan room')}</button>}
          <button className="cr-selbar-btn primary" disabled={selected.size === 0} onClick={() => setConfirm({ kind: 'selected' })}>
            {t('Hapus terpilih')} ({selected.size})
          </button>
        </div>
      ) : (
        <div className="cr-composer">
          {pending && (
            <div className="cr-pending-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              <span className="cr-pending-name">{pending.name}</span>
              <span className="cr-pending-size">{fmtSize(pending.size)}</span>
              <button onClick={() => setPending(null)} aria-label={t('Hapus')}>✕</button>
            </div>
          )}
          {attachErr && <div className="cr-attach-err">{attachErr}</div>}
          <div className="cr-input-wrap">
            <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={e => { pickFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
            <button className="cr-attach-btn" onClick={() => fileRef.current?.click()} aria-label={t('Lampirkan file')} title={t('Lampirkan file')}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <textarea
              ref={taRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder={t('Tulis pesan…')}
              rows={1}
              className="cr-input"
            />
            <button onClick={send} disabled={(!text.trim() && !pending) || uploading} className="cr-send" aria-label={t('Kirim')}>
              {uploading
                ? <span className="cr-spin" />
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>}
            </button>
          </div>
          <div className="cr-hint-row">
            <span className="cr-hint">{t('Enter kirim · Shift+Enter baris baru')}</span>
            {messages.length > 0 && <button className="cr-link-btn" onClick={() => setSelecting(true)}>{t('Pilih')}</button>}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        danger
        title={confirm?.kind === 'all' ? t('Kosongkan room') : t('Hapus pesan terpilih')}
        message={confirm?.kind === 'all'
          ? t('Kosongkan seluruh room? Semua pesan akan terhapus permanen.')
          : `${t('Hapus')} ${selected.size} ${t('pesan terpilih')}? ${t('Tindakan ini permanen.')}`}
        confirmLabel={t('Hapus')}
        cancelLabel={t('Batal')}
        onConfirm={() => (confirm?.kind === 'all' ? clearAll() : clearSelected())}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

const CR_CSS = `
.cr-root { display:flex; flex-direction:column; height:100%; min-height:0; }

/* ── Stream ── */
.cr-stream {
  position:relative; flex:1; overflow-y:auto; min-height:0;
  padding:8px 6px 4px;
  border:1px solid var(--border); border-radius:16px;
  background:
    radial-gradient(120% 60% at 50% -10%, rgba(11,61,231,0.10), transparent 60%),
    var(--bg2);
}
.cr-atmos {
  position:absolute; inset:0; pointer-events:none; border-radius:inherit;
  background-image: radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: linear-gradient(180deg, rgba(0,0,0,0.5), transparent 40%);
  -webkit-mask-image: linear-gradient(180deg, rgba(0,0,0,0.5), transparent 40%);
}
.cr-list { position:relative; padding:6px 6px 2px; }

/* ── Selection wrapper ── */
.cr-msg { position:relative; }
.cr-msg.selecting { display:flex; align-items:center; gap:10px; cursor:pointer; padding:2px 6px; border-radius:12px; transition:background .12s; }
.cr-msg.selecting:hover { background:var(--bg-hover); }
.cr-msg.selecting.sel { background:rgba(11,61,231,0.14); }
.cr-msg.selecting.nosel { cursor:default; opacity:0.5; }
.cr-msg-body { flex:1; min-width:0; }
.cr-check { width:22px; height:22px; flex-shrink:0; border-radius:7px; border:1.5px solid var(--border-strong); display:flex; align-items:center; justify-content:center; color:#fff; }
.cr-msg.selecting.sel .cr-check { background:var(--accent); border-color:var(--accent); }
.cr-msg.selecting.nosel .cr-check { visibility:hidden; }

/* ── Day separator ── */
.cr-day { position:sticky; top:4px; z-index:2; display:flex; justify-content:center; margin:14px 0 8px; pointer-events:none; }
.cr-day-chip {
  font-size:11px; font-weight:600; letter-spacing:0.02em; color:var(--text2);
  background:var(--bg3); border:1px solid var(--border);
  padding:4px 12px; border-radius:999px;
  backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
  box-shadow:0 2px 8px rgba(0,0,0,0.25);
}

/* ── Row + avatar ── */
.cr-row { display:flex; flex-direction:row; gap:9px; align-items:flex-end; animation:cr-in 0.26s cubic-bezier(.2,.7,.3,1) both; }
.cr-row.mine { flex-direction:row-reverse; }
.cr-av-slot { width:32px; flex-shrink:0; }
.cr-av {
  width:32px; height:32px; border-radius:50%;
  display:inline-flex; align-items:center; justify-content:center;
  font-size:12px; font-weight:700; color:#fff;
  box-shadow:0 2px 6px rgba(0,0,0,0.3), inset 0 0 0 1px rgba(255,255,255,0.14);
}
.cr-col { max-width:74%; display:flex; flex-direction:column; }
.cr-row:not(.mine) .cr-col { align-items:flex-start; }
.cr-row.mine .cr-col { align-items:flex-end; }

.cr-meta { display:flex; gap:8px; align-items:baseline; margin:0 4px 4px; }
.cr-row.mine .cr-meta { flex-direction:row-reverse; }
.cr-name { font-size:12.5px; font-weight:600; color:var(--text); }
.cr-time { font-size:10.5px; color:var(--text3); }
.cr-edited { font-size:10.5px; color:var(--text3); font-style:italic; }

/* ── Bubble + actions ── */
.cr-bubble-row { display:flex; align-items:center; gap:4px; }
.cr-row.mine .cr-bubble-row { flex-direction:row-reverse; }
.cr-bubble {
  position:relative; font-size:13.5px; line-height:1.5;
  white-space:pre-wrap; word-break:break-word;
  padding:9px 13px; border-radius:16px 16px 16px 5px;
  background:var(--bg3); color:var(--text);
  border:1px solid var(--border);
  box-shadow:0 1px 2px rgba(0,0,0,0.2);
}
.cr-bubble.grouped { border-radius:16px; }
.cr-bubble.mine {
  border:none; color:#fff;
  background:linear-gradient(155deg, #2f63ff, #0B3DE7);
  border-radius:16px 16px 5px 16px;
  box-shadow:0 2px 10px rgba(11,61,231,0.32);
}
.cr-bubble.mine.grouped { border-radius:16px; }
.cr-body-text { }
.cr-tick { display:inline-block; vertical-align:bottom; margin:0 -2px -2px 6px; color:rgba(255,255,255,0.85); transition:opacity .2s; }
.cr-tick.pending { opacity:0.45; }
.cr-retracted { font-style:italic; color:var(--text3); background:transparent; border:1px dashed var(--border); box-shadow:none; }

/* ── Attachments ── */
.cr-img { display:block; max-width:260px; max-height:300px; border-radius:10px; cursor:pointer; margin-bottom:2px; }
.cr-bubble .cr-img:not(:only-child) { margin-bottom:6px; }
.cr-file-chip {
  display:flex; align-items:center; gap:10px; text-decoration:none;
  padding:8px 10px; border-radius:10px; margin:-1px 0 4px;
  background:rgba(255,255,255,0.10); color:inherit; min-width:160px;
}
.cr-bubble:not(.mine) .cr-file-chip { background:var(--bg2); }
.cr-file-chip:hover { filter:brightness(1.08); }
.cr-file-meta { display:flex; flex-direction:column; min-width:0; }
.cr-file-name { font-size:12.5px; font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:200px; }
.cr-file-size { font-size:10.5px; opacity:0.7; }

/* ── Action menu ── */
.cr-actions-wrap { position:relative; }
.cr-actions {
  width:26px; height:26px; border-radius:8px; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center;
  background:transparent; color:var(--text3); opacity:0; transition:opacity .12s, background .12s, color .12s;
}
.cr-row:hover .cr-actions { opacity:1; }
.cr-actions:hover { background:var(--bg-hover); color:var(--text); }
.cr-menu {
  position:absolute; top:calc(100% + 4px); z-index:20; min-width:130px;
  background:var(--bg2); border:1px solid var(--border); border-radius:10px; padding:4px;
  box-shadow:0 10px 30px rgba(0,0,0,0.4);
}
.cr-menu.left { left:0; } .cr-menu.right { right:0; }
.cr-menu button {
  display:block; width:100%; text-align:left; background:none; border:none; cursor:pointer;
  padding:7px 10px; border-radius:7px; font-size:13px; color:var(--text);
}
.cr-menu button:hover { background:var(--bg-hover); }
.cr-menu button.danger { color:var(--accent2); }
.cr-menu-overlay { position:fixed; inset:0; z-index:15; }

/* ── Inline edit ── */
.cr-edit-area { display:flex; flex-direction:column; gap:6px; max-width:100%; }
.cr-edit-input {
  background:var(--bg3); color:var(--text); border:1px solid var(--accent); border-radius:12px;
  padding:8px 12px; font-size:13.5px; line-height:1.5; font-family:inherit; resize:none; outline:none; min-width:200px;
}
.cr-edit-actions { display:flex; gap:6px; justify-content:flex-end; }

/* ── Older button ── */
.cr-older { text-align:center; margin:4px 0 6px; }
.cr-older-btn {
  display:inline-flex; align-items:center; gap:6px;
  background:var(--bg3); color:var(--text2); border:1px solid var(--border);
  border-radius:999px; padding:6px 14px; font-size:12px; font-weight:500; cursor:pointer;
  transition:background .14s, color .14s, border-color .14s;
}
.cr-older-btn:hover { background:var(--bg-hover); color:var(--text); border-color:var(--border-strong); }

/* ── Empty state ── */
.cr-empty { position:relative; height:100%; min-height:280px; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; padding:40px; text-align:center; }
.cr-empty-glyph {
  width:64px; height:64px; border-radius:20px; margin-bottom:10px;
  display:flex; align-items:center; justify-content:center; color:var(--accent);
  background:rgba(11,61,231,0.10); border:1px solid var(--border);
  box-shadow:0 8px 28px rgba(11,61,231,0.2);
}
.cr-empty-title { font-size:15px; font-weight:600; color:var(--text); }
.cr-empty-sub { font-size:13px; color:var(--text3); max-width:280px; }

/* ── Skeleton ── */
.cr-skel-wrap { padding:18px 8px; display:flex; flex-direction:column; gap:16px; }
.cr-skel { display:flex; gap:9px; align-items:flex-end; }
.cr-skel.mine { flex-direction:row-reverse; }
.cr-skel-av, .cr-skel-bubble {
  background:linear-gradient(100deg, var(--bg3) 30%, var(--bg-hover) 50%, var(--bg3) 70%);
  background-size:200% 100%; animation:cr-shimmer 1.3s linear infinite; border-radius:14px;
}
.cr-skel-av { width:32px; height:32px; border-radius:50%; flex-shrink:0; }
.cr-skel-bubble { height:38px; }

/* ── Jump to latest ── */
.cr-jump {
  position:sticky; float:right; bottom:10px; right:6px;
  width:38px; height:38px; border-radius:50%;
  display:flex; align-items:center; justify-content:center;
  background:var(--accent); color:#fff; border:none; cursor:pointer;
  box-shadow:0 6px 18px rgba(11,61,231,0.4);
  animation:cr-in 0.2s ease both;
}
.cr-jump:hover { filter:brightness(1.08); }

/* ── Composer ── */
.cr-composer { padding:12px 2px 2px; }
.cr-pending-chip {
  display:inline-flex; align-items:center; gap:8px; margin:0 0 8px;
  background:var(--bg3); border:1px solid var(--border); border-radius:10px; padding:6px 10px; color:var(--text2); font-size:12.5px;
}
.cr-pending-name { font-weight:600; color:var(--text); max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.cr-pending-size { color:var(--text3); }
.cr-pending-chip button { background:none; border:none; color:var(--text3); cursor:pointer; font-size:13px; padding:0 2px; }
.cr-pending-chip button:hover { color:var(--text); }
.cr-attach-err { color:var(--accent2); font-size:12px; margin:0 0 8px 2px; }
.cr-input-wrap {
  display:flex; align-items:flex-end; gap:6px;
  background:var(--bg3); border:1px solid var(--border); border-radius:14px;
  padding:5px 5px 5px 6px; transition:border-color .15s; box-sizing:border-box;
}
.cr-input-wrap:focus-within { border-color:var(--border-strong); }
.cr-attach-btn {
  flex-shrink:0; width:36px; height:36px; border-radius:10px; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; background:transparent; color:var(--text3);
  transition:background .12s, color .12s;
}
.cr-attach-btn:hover { background:var(--bg-hover); color:var(--text); }
.cr-input {
  flex:1; resize:none; background:transparent; color:var(--text); border:none; outline:none;
  font-size:14px; line-height:1.45; font-family:inherit; padding:9px 0; max-height:140px;
  box-sizing:border-box; display:block;
}
.cr-input::placeholder { color:var(--text3); }
.cr-send {
  flex-shrink:0; width:36px; height:36px; border-radius:12px; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; color:#fff;
  background:linear-gradient(155deg, #2f63ff, #0B3DE7);
  box-shadow:0 2px 8px rgba(11,61,231,0.34);
  transition:transform .14s, opacity .14s, box-shadow .14s;
}
.cr-send:hover:not(:disabled) { transform:translateY(-1px) scale(1.03); box-shadow:0 4px 14px rgba(11,61,231,0.45); }
.cr-send:active:not(:disabled) { transform:scale(0.96); }
.cr-send:disabled { opacity:0.4; cursor:default; background:var(--bg-hover); box-shadow:none; }
.cr-spin { width:15px; height:15px; border-radius:50%; border:2px solid rgba(255,255,255,0.35); border-top-color:#fff; animation:cr-shimmer 0s, spin 0.65s linear infinite; }
@keyframes spin { to { transform:rotate(360deg); } }
.cr-hint-row { display:flex; align-items:center; justify-content:space-between; margin-top:7px; padding:0 4px; }
.cr-hint { font-size:10.5px; color:var(--text3); letter-spacing:0.01em; }
.cr-link-btn { background:none; border:none; cursor:pointer; color:var(--text2); font-size:12px; font-weight:600; padding:2px 4px; }
.cr-link-btn:hover { color:var(--accent); }
.cr-link-btn.primary { color:var(--accent); }

/* ── Selection bar ── */
.cr-selbar {
  display:flex; align-items:center; gap:12px; margin-top:12px;
  background:var(--bg3); border:1px solid var(--border); border-radius:14px; padding:10px 12px;
}
.cr-sel-count { font-size:13px; color:var(--text2); font-weight:600; }
.cr-selbar-btn { border:none; border-radius:10px; padding:8px 14px; font-size:13px; font-weight:600; cursor:pointer; }
.cr-selbar-btn.primary { background:var(--accent); color:#fff; }
.cr-selbar-btn.primary:disabled { opacity:0.4; cursor:default; }
.cr-selbar-btn.danger { background:transparent; color:var(--accent2); border:1px solid var(--accent2); }

@keyframes cr-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
@keyframes cr-shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
`
