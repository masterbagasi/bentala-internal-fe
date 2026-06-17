'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { ConfirmDialog, Modal } from '@/components/shared/Modal'
import { downloadFileNoNav } from '@/lib/download'
import { useIsMobile } from '@/hooks/useIsMobile'

const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

interface Msg {
  id: string; room: string; author_email: string; author_name: string; body: string; created_at: string
  edited_at?: string | null; deleted_at?: string | null
  attachment_path?: string | null; attachment_name?: string | null; attachment_type?: string | null; attachment_size?: number | null
  reply_to?: string | null
}

interface Read { email: string; last_read_at: string }
interface Reaction { id: string; message_id: string; user_email: string; emoji: string }

// WhatsApp-style quick reactions shown at the top of the message menu.
const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

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

// Re-encode an image blob to a clean JPEG via a canvas (the browser's own,
// reliable encoder). Used after decoding HEIC so we never store heic2any's
// chroma-mangled JPEG output.
function blobToJpeg(blob: Blob, quality = 0.9): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const canvas = document.createElement('canvas')
      canvas.width = img.naturalWidth
      canvas.height = img.naturalHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error('no 2d context')); return }
      ctx.drawImage(img, 0, 0)
      URL.revokeObjectURL(url)
      canvas.toBlob(b => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/jpeg', quality)
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')) }
    img.src = url
  })
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

const ACCEPT = 'image/*,.heic,.heif,video/mp4,video/quicktime,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.txt,.csv'
const MAX_BYTES = 10 * 1024 * 1024
// A message can only be unsent (retracted) within 24h of being sent.
const UNSEND_WINDOW_MS = 24 * 60 * 60 * 1000

export function ChatRoom({ room, roomName, meEmail, meName, meSuper }: { room: string; roomName: string; meEmail: string; meName: string; meSuper: boolean }) {
  const t = useT()
  const isMobile = useIsMobile()
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [pinned, setPinned] = useState(false) // user scrolled up — show "jump to latest"
  // In-app attachment preview (styled popup, consistent with the rest of the
  // app) — replaces opening the file in a new tab / the OS download sheet.
  const [lightbox, setLightbox] = useState<{ url: string; name: string; type: string } | null>(null)
  // Message actions / edit.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  // Message whose read-receipt info popup is open.
  const [infoFor, setInfoFor] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // Message currently being replied to (quoted above the composer).
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null)
  // Attachments.
  const [pending, setPending] = useState<File | null>(null)
  const [converting, setConverting] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [attachErr, setAttachErr] = useState('')
  // Selection / clear.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<null | { kind: 'selected' | 'all' }>(null)
  // Read receipts + transient action errors.
  const [reads, setReads] = useState<Read[]>([])
  // Emoji reactions for every message in the room.
  const [reactions, setReactions] = useState<Reaction[]>([])
  // Directory of teammates (email → name + profile photo) for avatars.
  const [accountDir, setAccountDir] = useState<Record<string, { name: string; avatarUrl: string | null }>>({})
  useEffect(() => {
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { email: string; name: string; avatarUrl: string | null }[] }) => {
        if (cancelled) return
        const dir: Record<string, { name: string; avatarUrl: string | null }> = {}
        for (const a of d.accounts ?? []) dir[a.email.toLowerCase()] = { name: a.name, avatarUrl: a.avatarUrl }
        setAccountDir(dir)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])
  const [opErr, setOpErr] = useState('')

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

  const loadReads = useCallback(() => {
    fetch(`/api/chat/${encodeURIComponent(room)}/reads`)
      .then(r => (r.ok ? r.json() : { reads: [] }))
      .then((d: { reads?: Read[] }) => setReads(d.reads ?? []))
      .catch(() => {})
  }, [room])

  const loadReactions = useCallback(() => {
    ;(sb() as any)
      .from('chat_message_reactions')
      .select('id,message_id,user_email,emoji')
      .eq('room', room)
      .then(({ data }: { data: Reaction[] | null }) => setReactions(data ?? []))
  }, [room])

  // Toggle my reaction on a message: same emoji removes it, a different one
  // replaces it (one reaction per person per message, like WhatsApp).
  async function react(messageId: string, emoji: string) {
    setMenuFor(null)
    const supa = sb() as any
    const mine = reactions.find(r => r.message_id === messageId && r.user_email === meEmail)
    // Optimistic update — realtime will reconcile to the authoritative rows.
    setReactions(prev => {
      const rest = prev.filter(r => !(r.message_id === messageId && r.user_email === meEmail))
      if (mine && mine.emoji === emoji) return rest
      return [...rest, { id: mine?.id ?? `tmp-${Date.now()}`, message_id: messageId, user_email: meEmail, emoji }]
    })
    try {
      if (mine && mine.emoji === emoji) {
        await supa.from('chat_message_reactions').delete().eq('id', mine.id)
      } else if (mine) {
        await supa.from('chat_message_reactions').update({ emoji }).eq('id', mine.id)
      } else {
        await supa.from('chat_message_reactions').insert({ message_id: messageId, room, user_email: meEmail, emoji })
      }
    } catch {
      loadReactions() // revert to server truth on failure
    }
  }

  function flashErr(msg: string) { setOpErr(msg); setTimeout(() => setOpErr(''), 4000) }

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
    fetch(`/api/chat/${encodeURIComponent(room)}/read`, { method: 'POST' }).then(loadReads)
    loadReads()
    loadReactions()

    const supabase = sb()
    const buildChannel = () => supabase
      .channel(`chat:${room}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_reads', filter: `room=eq.${room}` },
        () => { if (!cancelled) loadReads() })
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'chat_message_reactions', filter: `room=eq.${room}` },
        () => { if (!cancelled) loadReactions() })
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

    // CRITICAL: chat RLS (can_access_chat_room → auth.jwt()->>'email') means
    // realtime only delivers events when the socket carries the user's JWT.
    // Without setting it, an unauthenticated socket gets NOTHING, so other
    // accounts never receive new messages until they refresh. Set the token
    // before subscribing, and refresh it on every auth change (token expiry).
    let channel: ReturnType<typeof buildChannel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(token)
      channel = buildChannel()
    })
    const { data: authSub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.access_token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(session.access_token)
    })

    return () => {
      cancelled = true
      authSub.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [room, scrollToBottom, loadReads, loadReactions])

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
    if (menuFor) setMenuFor(null) // fixed-positioned menu shouldn't float while scrolling
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
  async function pickFile(f: File | null) {
    setAttachErr('')
    if (!f) return
    // iOS shares photos as HEIC, which browsers can't display and the bucket
    // may reject. Convert to JPEG up front so it both uploads and previews.
    const isHeic = /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)
    if (isHeic) {
      try {
        setConverting(true)
        // Use `heic-to` (maintained libheif build) — heic2any mangled the
        // chroma on some photos (green/yellow cast). Decode to PNG, then
        // re-encode to a clean JPEG with the browser's own canvas encoder.
        const { heicTo } = await import('heic-to')
        const png = await heicTo({ blob: f, type: 'image/png' })
        const jpeg = await blobToJpeg(png as Blob, 0.9)
        f = new File([jpeg], f.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
      } catch {
        setConverting(false)
        setAttachErr(t('Gagal mengonversi foto HEIC'))
        return
      }
      setConverting(false)
    }
    if (f.size > MAX_BYTES) { setAttachErr(t('File terlalu besar (maks 10MB)')); return }
    setPending(f)
  }

  async function send() {
    const body = text.trim()
    if (!body && !pending) return
    const replyId = replyingTo?.id ?? null
    setReplyingTo(null)

    let attach: { attachment_path: string; attachment_name: string; attachment_type: string; attachment_size: number } | null = null
    if (pending) {
      setUploading(true)
      const fd = new FormData(); fd.append('file', pending)
      const ur = await fetch(`/api/chat/${encodeURIComponent(room)}/upload`, { method: 'POST', body: fd })
      setUploading(false)
      if (!ur.ok) {
        // Surface the real reason instead of always blaming the file type.
        const reason = await ur.json().catch(() => null)
        if (ur.status === 415) setAttachErr(t('Tipe file tidak didukung'))
        else if (ur.status === 413) setAttachErr(t('File terlalu besar (maks 10MB)'))
        else setAttachErr(t('Gagal mengunggah file') + (reason?.error ? `: ${reason.error}` : ''))
        return
      }
      attach = await ur.json()
      setPending(null)
    }

    setText('')
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`, room, author_email: meEmail, author_name: meName,
      body, created_at: new Date().toISOString(), reply_to: replyId, ...(attach ?? {}),
    }
    atBottomRef.current = true
    setMessages(prev => [...prev, optimistic])
    try {
      const r = await fetch(`/api/chat/${encodeURIComponent(room)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, reply_to: replyId, ...(attach ?? {}) }),
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
  // A mutation is "real" only if it returns OK JSON of the expected shape. A
  // middleware auth-redirect would 200 the /login HTML, so verify and revert.
  async function mutateOk(p: Promise<Response>, expectMessage: boolean): Promise<boolean> {
    try {
      const r = await p
      if (!r.ok || !(r.headers.get('content-type') || '').includes('application/json')) return false
      const d = await r.json().catch(() => null)
      if (!d) return false
      return expectMessage ? !!d.message : d.ok === true
    } catch { return false }
  }

  async function retract(id: string) {
    setMenuFor(null)
    const snapshot = messages
    setMessages(prev => prev.map(m => m.id === id ? { ...m, deleted_at: new Date().toISOString(), body: '', attachment_path: null, attachment_type: null, attachment_name: null } : m))
    const ok = await mutateOk(fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retract' }),
    }), true)
    if (!ok) { setMessages(snapshot); flashErr(t('Gagal menarik pesan')) }
  }
  async function hardDelete(id: string) {
    setMenuFor(null)
    const snapshot = messages
    setMessages(prev => prev.filter(m => m.id !== id))
    const ok = await mutateOk(fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, { method: 'DELETE' }), false)
    if (!ok) { setMessages(snapshot); flashErr(t('Gagal menghapus pesan')) }
  }
  function startEdit(m: Msg) { setMenuFor(null); setEditing(m.id); setEditText(m.body) }
  function startReply(m: Msg) { setMenuFor(null); setEditing(null); setReplyingTo(m); setTimeout(() => taRef.current?.focus(), 0) }
  // Short one-line preview of a message for the reply quote.
  const msgSnippet = (m: Msg) =>
    m.deleted_at ? t('Pesan ini ditarik')
      : m.body ? m.body
      : m.attachment_path ? ((m.attachment_type ?? '').startsWith('image/') ? `📷 ${t('Foto')}` : `📎 ${m.attachment_name ?? t('Lampiran')}`)
      : ''
  async function saveEdit(id: string) {
    const body = editText.trim()
    if (!body) return
    setEditing(null)
    const snapshot = messages
    setMessages(prev => prev.map(m => m.id === id ? { ...m, body, edited_at: new Date().toISOString() } : m))
    const ok = await mutateOk(fetch(`/api/chat/${encodeURIComponent(room)}/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
    }), true)
    if (!ok) { setMessages(snapshot); flashErr(t('Gagal mengedit pesan')) }
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

  // Resolve a reader's display name from messages they've authored, else email.
  const nameByEmail = new Map(messages.map(m => [m.author_email, m.author_name]))
  const nameFor = (email: string) =>
    accountDir[email.toLowerCase()]?.name || nameByEmail.get(email) || email.split('@')[0]
  const avatarFor = (email: string) => accountDir[email.toLowerCase()]?.avatarUrl ?? null
  // Avatar = real profile photo when available, else a coloured initials disc.
  const personAvatar = (email: string, size: number) => {
    const url = avatarFor(email)
    const nm = nameFor(email)
    const common: React.CSSProperties = { width: size, height: size, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.12)' }
    if (url) {
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt={nm} style={common} referrerPolicy="no-referrer" />
    }
    return (
      <span style={{ ...common, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 700, color: '#fff', background: avatarColor(nm) }}>
        {initials(nm)}
      </span>
    )
  }

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
              // Name label repeats only when the author changes or the day changes —
              // NOT on every time-gap. So a long run of your own messages shows "Me" once.
              const showName = !prev || prev.author_email !== m.author_email || newDay
              const pendingMsg = m.id.startsWith('tmp-')
              const retracted = !!m.deleted_at
              const canDelete = mine || meSuper
              // The menu is available on EVERY message (so anyone can Reply /
              // React / Info / Select on others' messages). The menu's own items
              // stay gated: Edit/Unsend only for the author, Hapus only for a
              // super admin on someone else's message.
              const hasMenu = !selecting && !retracted && !pendingMsg
              const isImage = !!m.attachment_path && (m.attachment_type ?? '').startsWith('image/')
              const isFile = !!m.attachment_path && !isImage

              return (
                <div
                  key={m.id}
                  data-mid={m.id}
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
                          avatarFor(m.author_email)
                            ? personAvatar(m.author_email, 32)
                            : <span className="cr-av" style={{ background: mine ? 'linear-gradient(150deg, #2f63ff, #0B3DE7)' : avatarColor(m.author_name) }}>
                                {initials(m.author_name)}
                              </span>
                        )}
                      </span>
                      <div className="cr-col">
                        {showName && (
                          <div className="cr-meta">
                            <span className="cr-name">{mine ? t('Saya') : m.author_name}</span>
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
                                if (e.key === 'Enter' && !e.shiftKey && !isMobile) { e.preventDefault(); saveEdit(m.id) }
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
                          <>
                          <div className="cr-bubble-row">
                            <div className={`cr-bubble ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`} title={fmtTime(m.created_at)}>
                              {m.reply_to && (() => {
                                const orig = messages.find(x => x.id === m.reply_to)
                                return (
                                  <button
                                    type="button"
                                    className="cr-quote"
                                    onClick={e => {
                                      e.stopPropagation()
                                      const el = listRef.current?.querySelector(`[data-mid="${m.reply_to}"]`)
                                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                      el?.classList.add('cr-flash')
                                      setTimeout(() => el?.classList.remove('cr-flash'), 1300)
                                    }}
                                  >
                                    <span className="cr-quote-author">{orig ? (orig.author_email === meEmail ? t('Saya') : nameFor(orig.author_email)) : t('Pesan')}</span>
                                    <span className="cr-quote-snippet">{orig ? msgSnippet(orig) : t('Pesan tidak tersedia')}</span>
                                  </button>
                                )
                              })()}
                              {isImage && (
                                /* eslint-disable-next-line @next/next/no-img-element */
                                <img className="cr-img" src={fileUrl(m)} alt={m.attachment_name ?? ''} loading="lazy"
                                  onClick={e => { e.stopPropagation(); setLightbox({ url: fileUrl(m), name: m.attachment_name ?? 'image', type: m.attachment_type ?? '' }) }} />
                              )}
                              {isFile && (
                                <button type="button" className="cr-file-chip" onClick={e => { e.stopPropagation(); setLightbox({ url: fileUrl(m), name: m.attachment_name ?? 'file', type: m.attachment_type ?? '' }) }}>
                                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                                  <span className="cr-file-meta">
                                    <span className="cr-file-name">{m.attachment_name}</span>
                                    <span className="cr-file-size">{fmtSize(m.attachment_size ?? 0)}</span>
                                  </span>
                                </button>
                              )}
                              {m.body && <span className="cr-body-text">{m.body}</span>}
                              <span className="cr-stamp">
                                {m.edited_at && <span className="cr-stamp-edit">{t('(diedit)')} </span>}
                                {fmtTime(m.created_at)}
                                {mine && (
                                  <span className={`cr-tick ${pendingMsg ? 'pending' : ''}`} aria-hidden>
                                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                                  </span>
                                )}
                              </span>
                            </div>

                            {hasMenu && (
                              <div className="cr-actions-wrap">
                                <button
                                  className="cr-actions"
                                  onClick={e => {
                                    e.stopPropagation()
                                    if (menuFor === m.id) { setMenuFor(null); return }
                                    const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                                    // Clamp fully inside the viewport — on a short phone the menu
                                    // used to render above the button and off the top edge.
                                    const MENU_W = 212, MENU_H = 290
                                    const top = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - MENU_H - 8))
                                    const left = Math.max(8, Math.min(r.left, window.innerWidth - MENU_W - 8))
                                    setMenuPos({ top, left })
                                    setMenuFor(m.id)
                                  }}
                                  aria-label={t('Aksi')}
                                >
                                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg>
                                </button>
                                {/* The menu itself is rendered once at the component root (below),
                                    NOT here — `.cr-row` runs a transform animation, and a
                                    transformed ancestor would re-anchor this position:fixed menu
                                    to the row instead of the viewport, sending it off-screen. */}
                              </div>
                            )}
                          </div>
                          {(() => {
                            const rs = reactions.filter(r => r.message_id === m.id)
                            if (!rs.length) return null
                            const groups = new Map<string, { count: number; mine: boolean }>()
                            for (const r of rs) {
                              const gr = groups.get(r.emoji) ?? { count: 0, mine: false }
                              gr.count++
                              if (r.user_email === meEmail) gr.mine = true
                              groups.set(r.emoji, gr)
                            }
                            return (
                              <div className="cr-reactions">
                                {Array.from(groups.entries()).map(([emoji, gr]) => (
                                  <button key={emoji} type="button" className={`cr-reaction ${gr.mine ? 'mine' : ''}`} onClick={() => react(m.id, emoji)} title={t('Reaksi')}>
                                    <span className="cr-reaction-emoji">{emoji}</span>
                                    {gr.count > 1 && <span className="cr-reaction-count">{gr.count}</span>}
                                  </button>
                                ))}
                              </div>
                            )
                          })()}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
            {(() => {
              const last = view[view.length - 1]
              if (!last) return null
              const seers = reads
                .filter(r => r.email !== meEmail && new Date(r.last_read_at).getTime() >= new Date(last.created_at).getTime())
                .sort((a, b) => b.last_read_at.localeCompare(a.last_read_at))
              if (seers.length === 0) return null
              return (
                <div className="cr-seen" title={seers.map(r => nameFor(r.email)).join(', ')}>
                  <svg className="cr-seen-eye" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="2.5" /></svg>
                  <span className="cr-seen-label">{t('Dibaca')}</span>
                  <span className="cr-seen-avs">
                    {seers.slice(0, 8).map(r => {
                      const url = avatarFor(r.email)
                      const title = `${nameFor(r.email)} · ${fmtTime(r.last_read_at)}`
                      return url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img key={r.email} className="cr-seen-av" src={url} alt="" title={title} referrerPolicy="no-referrer" style={{ objectFit: 'cover' }} />
                        : <span key={r.email} className="cr-seen-av" title={title} style={{ background: avatarColor(nameFor(r.email)) }}>{initials(nameFor(r.email))}</span>
                    })}
                  </span>
                  {seers.length > 8 && <span className="cr-seen-more">+{seers.length - 8}</span>}
                </div>
              )
            })()}
          </div>
        )}

        {opErr && <div className="cr-op-err">{opErr}</div>}
        {menuFor && <div className="cr-menu-overlay" onClick={() => setMenuFor(null)} />}
        {/* Message action menu — rendered at the root (not inside the animated
            .cr-row) so its position:fixed anchors to the viewport. */}
        {menuFor && menuPos && (() => {
          const m = view.find(x => x.id === menuFor)
          if (!m) return null
          const mine = m.author_email === meEmail
          // Edit and Unsend are only allowed within 24h of sending; after that
          // the options disappear (the server enforces the same window).
          const within24h = Date.now() - new Date(m.created_at).getTime() < UNSEND_WINDOW_MS
          const canEdit = mine && within24h
          const canUnsend = mine && within24h
          const myReaction = reactions.find(r => r.message_id === m.id && r.user_email === meEmail)?.emoji
          return (
            <div className="cr-menu" style={{ position: 'fixed', top: menuPos.top, left: menuPos.left }}>
              <div className="cr-react-bar">
                {QUICK_EMOJIS.map(e => (
                  <button
                    key={e}
                    className={myReaction === e ? 'active' : ''}
                    onClick={() => react(m.id, e)}
                    aria-label={`React ${e}`}
                  >{e}</button>
                ))}
              </div>
              <button onClick={() => startReply(m)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-1a4 4 0 0 0-4-4H4" /></svg>
                {t('Balas')}
              </button>
              {canEdit && (
                <button onClick={() => startEdit(m)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                  {t('Edit')}
                </button>
              )}
              {canUnsend && (
                <button onClick={() => retract(m.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14L4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 5 5v2" /></svg>
                  {t('Tarik')}
                </button>
              )}
              <button onClick={() => { setMenuFor(null); setInfoFor(m.id) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                {t('Info')}
              </button>
              <button onClick={() => { setMenuFor(null); setSelecting(true); setSelected(new Set([m.id])) }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
                {t('Pilih')}
              </button>
              {(meSuper && !mine) && (
                <button className="danger" onClick={() => hardDelete(m.id)}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
                  {t('Hapus')}
                </button>
              )}
            </div>
          )
        })()}

        {/* Read-receipt info — who in the room has (and hasn't) read this message. */}
        {infoFor && (() => {
          const m = view.find(x => x.id === infoFor)
          if (!m) return null
          const msgTime = new Date(m.created_at).getTime()
          const others = reads.filter(r => r.email !== meEmail)
          const readers = others
            .filter(r => new Date(r.last_read_at).getTime() >= msgTime)
            .sort((a, b) => b.last_read_at.localeCompare(a.last_read_at))
          const unread = others.filter(r => new Date(r.last_read_at).getTime() < msgTime)
          const row = (email: string, time?: string) => (
            <div key={email} className="cr-info-row">
              {personAvatar(email, 38)}
              <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameFor(email)}</span>
              {time && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l2.5 2.5" /></svg>
                  {fmtTime(time)}
                </span>
              )}
            </div>
          )
          const chip = (n: number, accent: string) => (
            <span style={{ marginLeft: 'auto', minWidth: 20, height: 20, padding: '0 6px', borderRadius: 10, background: accent, color: '#fff', fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>{n}</span>
          )
          return (
            <Modal open onClose={() => setInfoFor(null)} title={t('Info Pesan')} maxWidth={400}>
              <div style={{ padding: '2px 0 4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px 8px' }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--accent3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="2.5" /></svg>
                  <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text2)' }}>{t('Dibaca')}</span>
                  {chip(readers.length, 'var(--accent3)')}
                </div>
                {readers.length > 0
                  ? readers.map(r => row(r.email, r.last_read_at))
                  : <div style={{ fontSize: 13, color: 'var(--text3)', padding: '4px 10px 10px' }}>{t('Belum ada yang membaca.')}</div>}

                {unread.length > 0 && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '10px 8px' }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 8px 8px' }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /></svg>
                      <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text2)' }}>{t('Belum dibaca')}</span>
                      {chip(unread.length, 'var(--bg-hover)')}
                    </div>
                    {unread.map(r => row(r.email))}
                  </>
                )}
              </div>
            </Modal>
          )
        })()}

        {/* In-app attachment preview — styled like every other popup in the app
            (shared Modal), with a download that doesn't leave the page. */}
        {lightbox && (
          <Modal
            open={!!lightbox}
            onClose={() => setLightbox(null)}
            title={lightbox.name}
            maxWidth={760}
            headerRight={
              <button
                type="button"
                onClick={() => downloadFileNoNav(lightbox.url, lightbox.name)}
                title="Download"
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
              >
                ⬇ Download
              </button>
            }
          >
            <ChatAttachPreview url={lightbox.url} name={lightbox.name} type={lightbox.type} />
          </Modal>
        )}

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
          {converting && (
            <div className="cr-pending-chip">
              <span className="cr-spin" />
              <span className="cr-pending-name">{t('Mengonversi foto…')}</span>
            </div>
          )}
          {pending && !converting && (
            <div className="cr-pending-chip">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
              <span className="cr-pending-name">{pending.name}</span>
              <span className="cr-pending-size">{fmtSize(pending.size)}</span>
              <button onClick={() => setPending(null)} aria-label={t('Hapus')}>✕</button>
            </div>
          )}
          {attachErr && <div className="cr-attach-err">{attachErr}</div>}
          {replyingTo && (
            <div className="cr-reply-preview">
              <span className="cr-reply-bar" />
              <div className="cr-reply-text">
                <span className="cr-reply-author">{replyingTo.author_email === meEmail ? t('Saya') : nameFor(replyingTo.author_email)}</span>
                <span className="cr-reply-snippet">{msgSnippet(replyingTo)}</span>
              </div>
              <button className="cr-reply-close" onClick={() => setReplyingTo(null)} aria-label={t('Batal balas')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          )}
          <div className="cr-input-wrap">
            <input ref={fileRef} type="file" accept={ACCEPT} hidden onChange={e => { pickFile(e.target.files?.[0] ?? null); e.target.value = '' }} />
            <button className="cr-attach-btn" onClick={() => fileRef.current?.click()} aria-label={t('Lampirkan file')} title={t('Lampirkan file')}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <textarea
              ref={taRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !isMobile) { e.preventDefault(); send() } }}
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

// Renders an attachment inside the preview popup by kind. Mirrors the
// PostPreviewModal preview so chat files open in the same styled popup.
function ChatAttachPreview({ url, name, type }: { url: string; name: string; type: string }) {
  const t = useT()
  if (type.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '72dvh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
  }
  if (type.startsWith('video/')) {
    return <video src={url} controls autoPlay style={{ width: '100%', maxHeight: '72dvh', borderRadius: 8, background: '#000' }} />
  }
  if (type === 'application/pdf') {
    return <iframe src={url} title={name} style={{ width: '100%', height: '72dvh', border: 'none', borderRadius: 8, background: '#fff' }} />
  }
  return (
    <div style={{ textAlign: 'center', padding: 32, fontSize: 13, color: 'var(--text2)' }}>
      {t('Preview tidak tersedia untuk tipe file ini. Gunakan tombol Download di atas.')}
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
/* Per-message time tucked at the bottom-right of every bubble. */
.cr-stamp {
  float:right; display:inline-flex; align-items:center; gap:3px;
  margin:5px 0 -1px 10px; font-size:10px; line-height:1; opacity:0.6; white-space:nowrap; user-select:none;
}
.cr-stamp-edit { font-style:italic; opacity:0.85; }
.cr-tick { display:inline-flex; color:currentColor; opacity:0.9; transition:opacity .2s; }
.cr-tick.pending { opacity:0.4; }
.cr-retracted { font-style:italic; color:var(--text3); background:transparent; border:1px dashed var(--border); box-shadow:none; }

/* ── Attachments ── */
.cr-img { display:block; max-width:260px; max-height:300px; border-radius:10px; cursor:pointer; margin-bottom:2px; }
.cr-bubble .cr-img:not(:only-child) { margin-bottom:6px; }
.cr-file-chip {
  display:flex; align-items:center; gap:10px; text-decoration:none;
  padding:8px 10px; border-radius:10px; margin:-1px 0 4px;
  background:rgba(255,255,255,0.10); color:inherit; min-width:160px;
  border:none; font:inherit; text-align:left; cursor:pointer; width:100%;
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
/* Touch devices have no hover, so the reveal-on-hover button is invisible /
   needs a double tap. Keep it always visible and give it a bigger hit area. */
@media (hover: none) {
  .cr-actions { opacity:1; width:32px; height:32px; }
}
.cr-menu {
  z-index:30; min-width:184px; max-width:78vw;
  background:linear-gradient(180deg, rgba(255,255,255,0.04), transparent 42%), var(--bg2);
  border:1px solid rgba(255,255,255,0.10); border-radius:14px; padding:6px;
  box-shadow:0 16px 44px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.06);
  -webkit-backdrop-filter:blur(14px) saturate(1.3); backdrop-filter:blur(14px) saturate(1.3);
  transform-origin:top left;
  animation:cr-menu-in 0.14s cubic-bezier(.2,.8,.2,1) both;
}
@keyframes cr-menu-in { from { opacity:0; transform:scale(0.94) translateY(-4px); } to { opacity:1; transform:scale(1) translateY(0); } }
.cr-menu button {
  display:flex; align-items:center; gap:11px; width:100%; text-align:left;
  background:none; border:none; cursor:pointer;
  padding:9px 12px; border-radius:9px; font-size:13.5px; font-weight:500;
  color:var(--text); letter-spacing:0.005em;
  transition:background .13s ease, color .13s ease, transform .06s ease;
}
.cr-menu button svg { width:16px; height:16px; flex-shrink:0; color:var(--text2); transition:color .13s ease; }
.cr-menu button:hover { background:rgba(255,255,255,0.07); }
.cr-menu button:hover svg { color:var(--text); }
.cr-menu button:active { transform:scale(0.975); }
/* Destructive action sits below a hairline divider and reads red. */
.cr-menu button.danger { color:#ff6b6b; margin-top:5px; padding-top:11px; position:relative; }
.cr-menu button.danger svg { color:#ff6b6b; }
.cr-menu button.danger::before {
  content:''; position:absolute; top:0; left:8px; right:8px; height:1px; background:rgba(255,255,255,0.08);
}
.cr-menu button.danger:hover { background:rgba(255,107,107,0.12); }
.cr-menu-overlay { position:fixed; inset:0; z-index:15; }
/* Read-receipt info rows. */
.cr-info-row { display:flex; align-items:center; gap:12px; padding:9px 8px; border-radius:10px; transition:background .12s ease; }
.cr-info-row:hover { background:rgba(255,255,255,0.04); }
/* Quick-reaction bar at the top of the action menu (WhatsApp-style). */
.cr-react-bar { display:flex; gap:2px; padding:2px 0 8px; margin-bottom:6px; border-bottom:1px solid rgba(255,255,255,0.08); }
.cr-react-bar button {
  flex:1; display:flex; align-items:center; justify-content:center; gap:0;
  width:auto; padding:6px 0; border:none; background:none; border-radius:10px; cursor:pointer;
  font-size:21px; line-height:1; transition:background .12s ease, transform .08s ease;
}
.cr-react-bar button:hover { background:rgba(255,255,255,0.08); transform:scale(1.14); }
.cr-react-bar button.active { background:var(--accent); }

/* Reaction pills under a message bubble. */
.cr-reactions { display:flex; flex-wrap:wrap; gap:4px; margin:4px 2px 0; }
.cr-row.mine .cr-reactions { justify-content:flex-end; }
.cr-reaction {
  display:inline-flex; align-items:center; gap:3px; padding:2px 7px;
  border:1px solid var(--border); background:var(--bg3); border-radius:999px;
  cursor:pointer; font-size:12px; line-height:1.4; color:var(--text);
  transition:background .12s ease, border-color .12s ease, transform .08s ease;
}
.cr-reaction:hover { background:var(--bg-hover); }
.cr-reaction:active { transform:scale(0.94); }
.cr-reaction.mine { background:rgba(11,61,231,0.18); border-color:var(--accent); }
.cr-reaction-emoji { font-size:13px; }
.cr-reaction-count { font-size:11px; font-weight:700; color:var(--text2); font-variant-numeric:tabular-nums; }
.cr-reaction.mine .cr-reaction-count { color:var(--accent); }

/* ── Reply quote ── */
/* Composer preview (above the input). */
.cr-reply-preview { display:flex; align-items:center; gap:10px; margin:0 0 8px; padding:8px 12px; background:var(--bg2); border:1px solid var(--border); border-radius:12px; }
.cr-reply-bar { width:3px; align-self:stretch; min-height:30px; border-radius:2px; background:var(--accent3); flex-shrink:0; }
.cr-reply-text { flex:1; min-width:0; display:flex; flex-direction:column; gap:1px; }
.cr-reply-author { font-size:12.5px; font-weight:700; color:var(--accent3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cr-reply-snippet { font-size:12.5px; color:var(--text2); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cr-reply-close { flex-shrink:0; width:28px; height:28px; border-radius:50%; border:none; background:var(--bg3); color:var(--text2); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:background .12s, color .12s; }
.cr-reply-close:hover { background:var(--bg-hover); color:var(--text); }
/* Quote inside a message bubble. */
.cr-quote { display:flex; flex-direction:column; gap:1px; width:100%; text-align:left; margin:0 0 6px; padding:5px 9px; border:none; cursor:pointer; border-left:3px solid var(--accent3); background:rgba(255,255,255,0.07); border-radius:6px; }
.cr-bubble.mine .cr-quote { background:rgba(255,255,255,0.16); border-left-color:rgba(255,255,255,0.9); }
.cr-quote:hover { filter:brightness(1.12); }
.cr-quote-author { font-size:12px; font-weight:700; color:var(--accent3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cr-bubble.mine .cr-quote-author { color:#fff; }
.cr-quote-snippet { font-size:12px; opacity:0.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px; }
/* Flash highlight when jumping to a quoted message. */
.cr-flash .cr-bubble { animation:cr-flash-anim 1.3s ease; }
@keyframes cr-flash-anim { 0%,100% { box-shadow:none; } 30% { box-shadow:0 0 0 3px var(--accent3); } }

/* Roomier tap targets for the action menu on touch devices. */
@media (hover: none) {
  .cr-menu { min-width:208px; padding:7px; }
  .cr-menu button { padding:12px 14px; font-size:15px; gap:13px; }
  .cr-menu button svg { width:18px; height:18px; }
  .cr-react-bar button { font-size:25px; padding:9px 0; }
  .cr-reaction { padding:3px 10px; font-size:13px; }
  .cr-reaction-emoji { font-size:14px; }
}

/* ── Inline edit ── */
.cr-edit-area { display:flex; flex-direction:column; gap:6px; max-width:100%; }
.cr-edit-input {
  background:var(--bg3); color:var(--text); border:1px solid var(--accent); border-radius:12px;
  padding:8px 12px; font-size:13.5px; line-height:1.5; font-family:inherit; resize:none; outline:none;
  min-width:200px; min-height:0; box-shadow:none;
}
.cr-edit-input:focus { box-shadow:none; }
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
.cr-input-wrap:hover { border-color:var(--border-strong); }
.cr-attach-btn {
  flex-shrink:0; width:36px; height:36px; border-radius:10px; border:none; cursor:pointer;
  display:flex; align-items:center; justify-content:center; background:transparent; color:var(--text3);
  transition:background .12s, color .12s;
}
.cr-attach-btn:hover { background:var(--bg-hover); color:var(--text); }
.cr-input {
  flex:1; resize:none; background:transparent; color:var(--text); border:none; outline:none;
  font-size:14px; line-height:1.45; font-family:inherit; padding:8px 2px; max-height:140px;
  min-height:0; height:38px; box-sizing:border-box; display:block;
}
/* Override global "textarea { min-height:70px }" + blue focus ring for the composer. */
.cr-input:focus { box-shadow:none; border-color:transparent; }
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

/* ── Read receipts ── */
.cr-seen { display:flex; align-items:center; gap:6px; justify-content:flex-end; margin:10px 6px 2px; color:var(--text3); }
.cr-seen-eye { opacity:0.7; flex-shrink:0; }
.cr-seen-label { font-size:11px; font-weight:600; }
.cr-seen-avs { display:flex; }
.cr-seen-av { width:20px; height:20px; border-radius:50%; display:inline-flex; align-items:center; justify-content:center; font-size:9px; font-weight:700; color:#fff; margin-left:-6px; border:1.5px solid var(--bg2); box-shadow:0 1px 2px rgba(0,0,0,0.3); }
.cr-seen-av:first-child { margin-left:0; }
.cr-seen-more { font-size:10.5px; color:var(--text3); margin-left:2px; }

/* ── Transient action error ── */
.cr-op-err {
  position:sticky; bottom:8px; z-index:6; margin:0 auto; width:fit-content; max-width:92%;
  background:var(--accent2); color:#fff; font-size:12.5px; font-weight:500;
  padding:7px 14px; border-radius:999px; box-shadow:0 6px 18px rgba(0,0,0,0.35);
  animation:cr-in 0.2s ease both;
}

@keyframes cr-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
@keyframes cr-shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
`
