'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { ConfirmDialog, Modal } from '@/components/shared/Modal'
import { downloadFileNoNav } from '@/lib/download'
import { useIsMobile } from '@/hooks/useIsMobile'

const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

// Unique realtime channel suffix per subscription. The SAME room can now be
// mounted by two ChatRoom instances at once (a task thread in the chat pane AND
// its Task Details popup), and StrictMode double-mounts effects — both would
// reuse the channel named `chat:<room>` and throw "cannot add postgres_changes
// after subscribe()". A fresh name per effect run avoids any collision.
let crChanSeq = 0

interface Msg {
  id: string; room: string; author_email: string; author_name: string; body: string; created_at: string
  edited_at?: string | null; deleted_at?: string | null
  attachment_path?: string | null; attachment_name?: string | null; attachment_type?: string | null; attachment_size?: number | null
  reply_to?: string | null
  mentions?: string[] | null
  // Client-only: local object-URL preview shown on an optimistic message while
  // its attachment is still uploading, and a flag that clears the spinner the
  // moment the upload finishes (not when the whole message round-trip ends).
  _preview?: string
  _uploading?: boolean
}

type Attach = { attachment_path: string; attachment_name: string; attachment_type: string; attachment_size: number }
interface PendingItem { id: string; file: File; preview: string; pct: number; attach: Attach | null; error: boolean }

// Upload a chat attachment with progress via XHR (fetch can't report upload %).
function uploadWithProgress(room: string, file: File, onProgress: (pct: number) => void): Promise<Attach> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    const fd = new FormData()
    fd.append('file', file)
    xhr.open('POST', `/api/chat/${encodeURIComponent(room)}/upload`)
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100))) }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(100)
        try { resolve(JSON.parse(xhr.responseText) as Attach) } catch { reject({ status: xhr.status, body: xhr.responseText }) }
      } else {
        reject({ status: xhr.status, body: xhr.responseText })
      }
    }
    xhr.onerror = () => reject({ status: 0, body: '' })
    xhr.send(fd)
  })
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
const MAX_BYTES = 200 * 1024 * 1024
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
  // Lightbox holds a navigable list of items (1 for a sent message, all pending
  // attachments for the composer) so you can slide left/right between them.
  type LbItem = { url: string; name: string; type: string; msg?: Msg }
  const [lightbox, setLightbox] = useState<{ items: LbItem[]; index: number } | null>(null)
  // Tapping a chat avatar opens that person's profile photo in a preview popup.
  const [profileView, setProfileView] = useState<{ email: string } | null>(null)
  const [gallery, setGallery] = useState(false) // "All media" grid open?
  const lbTouch = useRef<number | null>(null)
  // In-chat search.
  const [searching, setSearching] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [matchIdx, setMatchIdx] = useState(0)
  const [calOpen, setCalOpen] = useState(false)
  const [calMonth, setCalMonth] = useState(() => new Date())
  // Arrow keys navigate the lightbox on desktop.
  useEffect(() => {
    if (!lightbox || lightbox.items.length < 2) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const d = e.key === 'ArrowRight' ? 1 : -1
        setLightbox(lb => (lb ? { ...lb, index: ((lb.index + d) % lb.items.length + lb.items.length) % lb.items.length } : lb))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [lightbox])
  // Message actions / edit.
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  // Message whose read-receipt info popup is open.
  const [infoFor, setInfoFor] = useState<string | null>(null)
  // Message whose reaction-details popup is open, + the selected emoji tab.
  const [reactInfoFor, setReactInfoFor] = useState<string | null>(null)
  const [reactInfoTab, setReactInfoTab] = useState<string>('all')
  const [editing, setEditing] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  // Message currently being replied to (quoted above the composer).
  const [replyingTo, setReplyingTo] = useState<Msg | null>(null)
  // Members with access to this room — for @mentions.
  const [members, setMembers] = useState<{ email: string; name: string; avatarUrl: string | null }[]>([])
  useEffect(() => {
    let cancelled = false
    fetch(`/api/chat/${encodeURIComponent(room)}/members`)
      .then(r => (r.ok ? r.json() : { members: [] }))
      .then((d: { members?: { email: string; name: string; avatarUrl: string | null }[] }) => { if (!cancelled) setMembers(d.members ?? []) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [room])
  // Active @mention autocomplete (query typed after '@', and the '@' position).
  const [mention, setMention] = useState<{ q: string; at: number } | null>(null)
  const [mentionSel, setMentionSel] = useState(0)
  // Regex that matches "@<member name>" for highlighting (longest name first).
  const mentionRe = useMemo(() => {
    const names = members.map(m => m.name).filter(Boolean).sort((a, b) => b.length - a.length)
    if (!names.length) return null
    const esc = names.map(n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    return new RegExp(`@(${esc.join('|')})`, 'g')
  }, [members])
  // Attachments.
  // Pending attachments (multiple). Each uploads in the background the moment
  // it's attached, so hitting Send is instant. `pct` drives the progress bar,
  // `attach` is set when the upload finishes, `error` on failure.
  const [pendingFiles, setPendingFiles] = useState<PendingItem[]>([])
  const uploadsRef = useRef<Map<string, Promise<Attach>>>(new Map())
  const [converting, setConverting] = useState(false)
  const [attachErr, setAttachErr] = useState('')
  // Selection / clear.
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [confirm, setConfirm] = useState<null | { kind: 'selected' | 'all' } | { kind: 'unsend'; id: string }>(null)
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
        // Always open at the newest message. A single rAF scroll lands in the
        // middle when attachments/avatars finish loading AFTER it (their height
        // pushes content down). Stay pinned to the bottom across those late
        // layout shifts with a few retries — cancelled if the user scrolls up.
        atBottomRef.current = true
        setPinned(false)
        const stick = () => { if (!cancelled && atBottomRef.current) scrollToBottom() }
        requestAnimationFrame(stick)
        ;[60, 180, 360, 700].forEach(ms => setTimeout(stick, ms))
      })
    fetch(`/api/chat/${encodeURIComponent(room)}/read`, { method: 'POST' }).then(loadReads)
    loadReads()
    loadReactions()

    const supabase = sb()
    // Fresh, unique channel name per effect run so two ChatRooms on the same room
    // (task thread + its Task Details popup) and StrictMode remounts never collide.
    const chanName = `chat:${room}:${++crChanSeq}`
    const buildChannel = () => supabase
      .channel(chanName)
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
  // Attach one or more files. Each is HEIC-converted if needed, validated, and
  // its upload is kicked off immediately in the background.
  async function addFiles(files: FileList | File[] | null) {
    setAttachErr('')
    const list = files ? Array.from(files) : []
    for (let f of list) {
      const isHeic = /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name)
      if (isHeic) {
        try {
          setConverting(true)
          const { heicTo } = await import('heic-to')
          const png = await heicTo({ blob: f, type: 'image/png' })
          const jpeg = await blobToJpeg(png as Blob, 0.9)
          f = new File([jpeg], f.name.replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' })
        } catch {
          setConverting(false)
          setAttachErr(t('Gagal mengonversi foto HEIC'))
          continue
        }
        setConverting(false)
      }
      if (f.size > MAX_BYTES) { setAttachErr(t('File terlalu besar (maks 200MB)')); continue }
      const id = crypto.randomUUID()
      const file = f
      // Object-URL for every file (image thumbnail AND the click-to-preview).
      const preview = URL.createObjectURL(file)
      setPendingFiles(prev => [...prev, { id, file, preview, pct: 0, attach: null, error: false }])
      // Upload NOW so Send is instant.
      const p = uploadWithProgress(room, file, pct => setPendingFiles(prev => prev.map(it => (it.id === id ? { ...it, pct } : it))))
      uploadsRef.current.set(id, p)
      p.then(attach => setPendingFiles(prev => prev.map(it => (it.id === id ? { ...it, attach, pct: 100 } : it))))
       .catch(() => setPendingFiles(prev => prev.map(it => (it.id === id ? { ...it, error: true } : it))))
    }
  }

  function removePending(id: string) {
    setPendingFiles(prev => {
      const it = prev.find(x => x.id === id)
      if (it?.preview) URL.revokeObjectURL(it.preview)
      return prev.filter(x => x.id !== id)
    })
    uploadsRef.current.delete(id)
  }

  // Post one message (optionally with one attachment), optimistic + reconcile.
  async function sendOne(body: string, item: PendingItem | null, replyId: string | null) {
    const tmpId = `tmp-${crypto.randomUUID()}`
    const uploadPromise = item ? uploadsRef.current.get(item.id) ?? null : null
    const preview = item?.preview ?? null
    const optimistic: Msg = {
      id: tmpId, room, author_email: meEmail, author_name: meName,
      body, created_at: new Date().toISOString(), reply_to: replyId,
      ...(item ? { attachment_name: item.file.name, attachment_type: item.file.type, attachment_size: item.file.size, _preview: preview ?? undefined, _uploading: !item.attach } : {}),
    }
    atBottomRef.current = true
    setMessages(prev => [...prev, optimistic])

    let attach: Attach | null = item?.attach ?? null
    if (item && !attach && uploadPromise) {
      try { attach = await uploadPromise }
      catch (err) {
        const status = (err as { status?: number })?.status
        flashErr(status === 415 ? t('Tipe file tidak didukung') : status === 413 ? t('File terlalu besar (maks 200MB)') : t('Gagal mengunggah file'))
        setMessages(prev => prev.filter(m => m.id !== tmpId))
        if (preview) URL.revokeObjectURL(preview)
        return
      }
    }
    // Upload done → drop the in-bubble spinner immediately.
    if (item) setMessages(prev => prev.map(m => (m.id === tmpId ? { ...m, _uploading: false } : m)))

    try {
      const r = await fetch(`/api/chat/${encodeURIComponent(room)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body, reply_to: replyId, mentions: extractMentions(body), ...(attach ?? {}) }),
      })
      const d = (await r.json()) as { message?: Msg }
      if (d.message) setMessages(prev => {
        const real = d.message!
        if (prev.some(m => m.id === real.id)) return prev.filter(m => m.id !== tmpId)
        // Keep the local preview so the <img loading="lazy" decoding="async"> src doesn't reload (no flash).
        return prev.map(m => (m.id === tmpId ? { ...real, _preview: preview ?? undefined } : m))
      })
    } catch {
      setMessages(prev => prev.map(m => (m.id === tmpId ? { ...m, body: m.body + ' ' + t('(gagal terkirim)') } : m)))
    }
    if (item) uploadsRef.current.delete(item.id)
  }

  function send() {
    const body = text.trim()
    const items = pendingFiles
    if (!body && items.length === 0) return
    const replyId = replyingTo?.id ?? null
    setReplyingTo(null)
    setText('')
    setPendingFiles([])      // clear composer (previews stay alive on the optimistic bubbles)

    if (items.length === 0) {
      void sendOne(body, null, replyId)
      return
    }
    // One message per file; the caption (+ reply) rides the FIRST attachment.
    items.forEach((item, i) => { void sendOne(i === 0 ? body : '', item, i === 0 ? replyId : null) })
  }

  // ── @mentions ──
  const mentionMatches = mention
    ? members.filter(mm => {
        const q = mention.q.toLowerCase()
        return mm.name.toLowerCase().includes(q) || mm.email.toLowerCase().startsWith(q)
      }).slice(0, 6)
    : []

  function onTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setText(val)
    const pos = e.target.selectionStart ?? val.length
    const m = val.slice(0, pos).match(/(?:^|\s)@([^\s@]*)$/)
    if (m) { setMention({ q: m[1], at: pos - m[1].length - 1 }); setMentionSel(0) }
    else setMention(null)
  }

  function insertMention(member: { name: string }) {
    if (!mention) return
    const ta = taRef.current
    const pos = ta?.selectionStart ?? text.length
    const before = text.slice(0, mention.at)
    const after = text.slice(pos)
    const inserted = `@${member.name} `
    setText(before + inserted + after)
    setMention(null)
    requestAnimationFrame(() => {
      ta?.focus()
      const c = (before + inserted).length
      ta?.setSelectionRange(c, c)
    })
  }

  // Emails of members @mentioned in a body (for notifications).
  function extractMentions(body: string): string[] {
    if (!body || !mentionRe) return []
    mentionRe.lastIndex = 0
    const emails = new Set<string>()
    let m: RegExpExecArray | null
    while ((m = mentionRe.exec(body)) !== null) {
      const mem = members.find(x => x.name === m![1])
      if (mem) emails.add(mem.email)
    }
    return Array.from(emails)
  }

  // Render a message body with @mentions of known members highlighted.
  // Highlight the active search query inside a plain string segment.
  function highlightSearch(text: string, kb: number): React.ReactNode {
    const q = searching ? searchQ : ''
    if (!q) return text
    const lower = text.toLowerCase()
    if (lower.indexOf(q) === -1) return text
    const out: React.ReactNode[] = []
    let i = 0, k = 0
    let idx = lower.indexOf(q, i)
    while (idx !== -1) {
      if (idx > i) out.push(text.slice(i, idx))
      out.push(<mark key={`h${kb}-${k++}`} className="cr-hl">{text.slice(idx, idx + q.length)}</mark>)
      i = idx + q.length
      idx = lower.indexOf(q, i)
    }
    if (i < text.length) out.push(text.slice(i))
    return out
  }

  // Render a message body with @mentions highlighted and search terms marked.
  function renderBody(body: string): React.ReactNode {
    if (!body) return body
    const segs: React.ReactNode[] = []
    let key = 0
    if (mentionRe) {
      mentionRe.lastIndex = 0
      let last = 0
      let m: RegExpExecArray | null
      while ((m = mentionRe.exec(body)) !== null) {
        if (m.index > last) segs.push(highlightSearch(body.slice(last, m.index), key++))
        const name = m[1]
        const mem = members.find(x => x.name === name)
        segs.push(<span key={`m${key++}`} className={`cr-mention${mem?.email === meEmail ? ' me' : ''}`}>@{name}</span>)
        last = m.index + m[0].length
      }
      if (last < body.length) segs.push(highlightSearch(body.slice(last), key++))
    } else {
      segs.push(highlightSearch(body, key++))
    }
    return segs
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

  // ── In-chat search ──
  const searchQ = searchQuery.trim().toLowerCase()
  const matchIds = searchQ
    ? view.filter(m => !m.deleted_at && (m.body ?? '').toLowerCase().includes(searchQ)).map(m => m.id)
    : []
  function scrollToMid(id: string) {
    const el = listRef.current?.querySelector(`[data-mid="${id}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el?.classList.add('cr-flash')
    setTimeout(() => el?.classList.remove('cr-flash'), 1300)
  }
  function runSearch(q: string) {
    setSearchQuery(q)
    const ql = q.trim().toLowerCase()
    if (!ql) { setMatchIdx(0); return }
    const ids = view.filter(m => !m.deleted_at && (m.body ?? '').toLowerCase().includes(ql)).map(m => m.id)
    const last = ids.length - 1
    setMatchIdx(last < 0 ? 0 : last)
    if (last >= 0) requestAnimationFrame(() => scrollToMid(ids[last]))
  }
  function gotoMatch(delta: number) {
    if (!matchIds.length) return
    const i = Math.max(0, Math.min(matchIdx + delta, matchIds.length - 1))
    setMatchIdx(i)
    scrollToMid(matchIds[i])
  }
  function closeSearch() { setSearching(false); setSearchQuery(''); setMatchIdx(0); setCalOpen(false) }
  function jumpToDate(d: Date) {
    setCalOpen(false)
    const start = new Date(d); start.setHours(0, 0, 0, 0)
    const m = view.find(mm => new Date(mm.created_at).getTime() >= start.getTime())
    if (m) scrollToMid(m.id)
    else flashErr(t('Tidak ada pesan pada/ setelah tanggal itu.'))
  }

  const imgUrl = (m: Msg) => m._preview ?? fileUrl(m)
  const isImgOnly = (m: Msg) =>
    !m.deleted_at && !m.body && (m.attachment_type ?? '').startsWith('image/') &&
    (!!m.attachment_path || !!m._preview)

  // Group consecutive image-only messages from the same author into an album
  // (WhatsApp-style collage). `anchors` maps the first message's id → the run;
  // `skip` are the follow-up images (rendered inside the album, not on their own).
  const album = (() => {
    const anchors = new Map<string, Msg[]>()
    const skip = new Set<string>()
    let i = 0
    while (i < view.length) {
      const m = view[i]
      if (isImgOnly(m)) {
        const run = [m]
        let j = i + 1
        while (j < view.length && isImgOnly(view[j]) && view[j].author_email === m.author_email) { run.push(view[j]); j++ }
        if (run.length >= 2) {
          anchors.set(m.id, run)
          for (let k = 1; k < run.length; k++) skip.add(run[k].id)
          i = j; continue
        }
      }
      i++
    }
    return { anchors, skip }
  })()

  // Every image in the room (newest last) — for the "All media" gallery.
  const allMedia: LbItem[] = view
    .filter(m => !m.deleted_at && (m.attachment_type ?? '').startsWith('image/') && (!!m.attachment_path || !!m._preview))
    .map(m => ({ url: imgUrl(m), name: m.attachment_name ?? 'image', type: m.attachment_type ?? 'image/jpeg', msg: m }))

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
      return <img loading="lazy" decoding="async" src={url} alt={nm} style={common} referrerPolicy="no-referrer" />
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

      {/* ── Search bar ── */}
      {searching ? (
        <div className="cr-search">
          <div className="cr-search-cal-wrap">
            <button className={`cr-search-icon ${calOpen ? 'on' : ''}`} onClick={() => setCalOpen(v => !v)} title={t('Cari tanggal')}>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /><circle cx="16.5" cy="16.5" r="2.5" /><line x1="18.3" y1="18.3" x2="20" y2="20" /></svg>
            </button>
            {calOpen && (
              <div className="cr-cal">
                <MiniCalendar month={calMonth} onMonth={setCalMonth} onPick={jumpToDate} />
              </div>
            )}
          </div>
          <div className="cr-search-field">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input
              autoFocus
              value={searchQuery}
              onChange={e => runSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); gotoMatch(e.shiftKey ? 1 : -1) }
                if (e.key === 'Escape') closeSearch()
              }}
              placeholder={t('Cari di chat ini…')}
            />
          </div>
          {searchQ && (
            <span className="cr-search-count">{matchIds.length ? `${matchIdx + 1} ${t('dari')} ${matchIds.length}` : t('Tidak ada')}</span>
          )}
          <button className="cr-search-nav" disabled={!matchIds.length || matchIdx <= 0} onClick={() => gotoMatch(-1)} title={t('Sebelumnya')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
          </button>
          <button className="cr-search-nav" disabled={!matchIds.length || matchIdx >= matchIds.length - 1} onClick={() => gotoMatch(1)} title={t('Berikutnya')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
          </button>
          <button className="cr-search-done" onClick={closeSearch}>{t('Selesai')}</button>
        </div>
      ) : (
        <button className="cr-search-open" onClick={() => setSearching(true)} title={t('Cari pesan')}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
        </button>
      )}

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
              if (album.skip.has(m.id)) return null // rendered inside its album anchor
              const albumMsgs = album.anchors.get(m.id) // non-null → this message anchors an album
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
              // An optimistic (tmp) message carries attachment_name + _preview
              // before it has a stored attachment_path, so treat both as having
              // an attachment.
              const hasAttach = !!m.attachment_path || !!m._preview || (!!m.attachment_name && m.id.startsWith('tmp-'))
              const isImage = hasAttach && (m.attachment_type ?? '').startsWith('image/')
              const isFile = hasAttach && !isImage
              const uploadingMsg = m._uploading === true

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
                          <button type="button" className="cr-av-btn" title={m.author_name} onClick={() => setProfileView({ email: m.author_email })}>
                            {avatarFor(m.author_email)
                              ? personAvatar(m.author_email, 32)
                              : <span className="cr-av" style={{ background: mine ? 'linear-gradient(150deg, #2f63ff, #0B3DE7)' : avatarColor(m.author_name) }}>
                                  {initials(m.author_name)}
                                </span>}
                          </button>
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
                            <div className={`cr-bubble ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''} ${(albumMsgs || isImage) ? 'has-media' : ''} ${albumMsgs ? 'album media-only' : (isImage && !m.body ? 'media-only' : '')} ${(m.mentions ?? []).includes(meEmail) ? 'mentions-me' : ''}`} title={fmtTime(m.created_at)}>
                              {m.reply_to && (() => {
                                const orig = messages.find(x => x.id === m.reply_to)
                                const origImg = orig && (orig.attachment_type ?? '').startsWith('image/') && (!!orig.attachment_path || !!orig._preview)
                                return (
                                  <button
                                    type="button"
                                    className={`cr-quote ${origImg ? 'has-thumb' : ''}`}
                                    onClick={e => {
                                      e.stopPropagation()
                                      // Move to the original message first (scroll + flash)…
                                      const el = listRef.current?.querySelector(`[data-mid="${m.reply_to}"]`)
                                      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                                      el?.classList.add('cr-flash')
                                      setTimeout(() => el?.classList.remove('cr-flash'), 1300)
                                      // …then, once we've arrived, auto-open its image preview.
                                      if (origImg && orig) {
                                        setTimeout(() => setLightbox({ items: [{ url: imgUrl(orig), name: orig.attachment_name ?? 'image', type: orig.attachment_type ?? 'image/jpeg', msg: orig }], index: 0 }), 520)
                                      }
                                    }}
                                  >
                                    <span className="cr-quote-text">
                                      <span className="cr-quote-author">{orig ? (orig.author_email === meEmail ? t('Saya') : nameFor(orig.author_email)) : t('Pesan')}</span>
                                      <span className="cr-quote-snippet">{orig ? msgSnippet(orig) : t('Pesan tidak tersedia')}</span>
                                    </span>
                                    {origImg && orig && (
                                      /* eslint-disable-next-line @next/next/no-img-element */
                                      <img loading="lazy" decoding="async" className="cr-quote-thumb" src={imgUrl(orig)} alt="" />
                                    )}
                                  </button>
                                )
                              })()}
                              {albumMsgs && (() => {
                                const items = albumMsgs.map(a => ({ url: imgUrl(a), name: a.attachment_name ?? 'image', type: a.attachment_type ?? 'image/jpeg', msg: a }))
                                const open = (idx: number) => setLightbox({ items, index: idx })
                                const shown = Math.min(4, albumMsgs.length)
                                const extra = albumMsgs.length - 4
                                return (
                                  <div className={`cr-album cr-album-${shown === albumMsgs.length ? shown : 4} ${albumMsgs.length === 3 ? 'three' : ''}`}>
                                    {albumMsgs.slice(0, 4).map((a, idx) => (
                                      <button key={a.id} type="button" className="cr-album-tile" onClick={e => { e.stopPropagation(); open(idx) }}>
                                        {/* eslint-disable-next-line @next/next/no-img-element */}
                                        <img src={imgUrl(a)} alt="" loading="lazy" onLoad={() => { if (atBottomRef.current) scrollToBottom() }} />
                                        {idx === 3 && extra > 0 && <span className="cr-album-more">+{extra}</span>}
                                        {a.id.startsWith('tmp-') && a._uploading && <span className="cr-img-uploading"><span className="cr-spin" /></span>}
                                      </button>
                                    ))}
                                  </div>
                                )
                              })()}
                              {!albumMsgs && isImage && (
                                <span className="cr-img-wrap">
                                  {/* eslint-disable-next-line @next/next/no-img-element */}
                                  <img className="cr-img" src={m._preview ?? fileUrl(m)} alt={m.attachment_name ?? ''} loading="lazy"
                                    onLoad={() => { if (atBottomRef.current) scrollToBottom() }}
                                    onClick={e => { e.stopPropagation(); if (!uploadingMsg) setLightbox({ items: [{ url: m._preview ?? fileUrl(m), name: m.attachment_name ?? 'image', type: m.attachment_type ?? '', msg: m }], index: 0 }) }} />
                                  {uploadingMsg && <span className="cr-img-uploading"><span className="cr-spin" /></span>}
                                </span>
                              )}
                              {isFile && (
                                <button type="button" className="cr-file-chip" onClick={e => { e.stopPropagation(); if (!uploadingMsg) setLightbox({ items: [{ url: fileUrl(m), name: m.attachment_name ?? 'file', type: m.attachment_type ?? '', msg: m }], index: 0 }) }}>
                                  {uploadingMsg
                                    ? <span className="cr-spin" />
                                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>}
                                  <span className="cr-file-meta">
                                    <span className="cr-file-name">{m.attachment_name}</span>
                                    <span className="cr-file-size">{fmtSize(m.attachment_size ?? 0)}</span>
                                  </span>
                                </button>
                              )}
                              {m.body && <span className="cr-body-text">{renderBody(m.body)}</span>}
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
                                  <button key={emoji} type="button" className={`cr-reaction ${gr.mine ? 'mine' : ''}`} onClick={e => { e.stopPropagation(); setReactInfoTab('all'); setReactInfoFor(m.id) }} title={t('Lihat reaksi')}>
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
                        ? <img loading="lazy" decoding="async" key={r.email} className="cr-seen-av" src={url} alt="" title={title} referrerPolicy="no-referrer" style={{ objectFit: 'cover' }} />
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
                <button onClick={() => { setMenuFor(null); setConfirm({ kind: 'unsend', id: m.id }) }}>
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

        {/* Reaction details — who reacted and with what (tap a reaction pill). */}
        {reactInfoFor && (() => {
          const rs = reactions.filter(r => r.message_id === reactInfoFor)
          if (!rs.length) return null
          const byEmoji = new Map<string, Reaction[]>()
          for (const r of rs) { const arr = byEmoji.get(r.emoji) ?? []; arr.push(r); byEmoji.set(r.emoji, arr) }
          const tabs: { key: string; label: React.ReactNode }[] = [
            { key: 'all', label: `${t('Semua')} ${rs.length}` },
            ...Array.from(byEmoji.entries()).map(([e, arr]) => ({ key: e, label: <>{e} {arr.length}</> })),
          ]
          const shown = reactInfoTab === 'all' ? rs : rs.filter(r => r.emoji === reactInfoTab)
          return (
            <Modal open onClose={() => setReactInfoFor(null)} title={t('Reaksi')} maxWidth={400}>
              <div className="cr-reactinfo-tabs">
                {tabs.map(tb => (
                  <button key={String(tb.key)} className={`cr-reactinfo-tab ${reactInfoTab === tb.key ? 'active' : ''}`} onClick={() => setReactInfoTab(tb.key)}>
                    {tb.label}
                  </button>
                ))}
              </div>
              <div style={{ padding: '2px 0 4px' }}>
                {shown.map(r => {
                  const isMine = r.user_email === meEmail
                  return (
                    <button
                      key={r.id}
                      type="button"
                      className="cr-info-row cr-reactinfo-row"
                      onClick={isMine ? () => { react(reactInfoFor, r.emoji); setReactInfoFor(null) } : undefined}
                      title={isMine ? t('Ketuk untuk menghapus reaksimu') : undefined}
                    >
                      {personAvatar(r.user_email, 38)}
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1, textAlign: 'left' }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isMine ? t('Saya') : nameFor(r.user_email)}</span>
                        {isMine && <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{t('Ketuk untuk menghapus')}</span>}
                      </span>
                      <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{r.emoji}</span>
                    </button>
                  )
                })}
              </div>
            </Modal>
          )
        })()}

        {/* In-app attachment preview — styled like every other popup in the app
            (shared Modal). Navigable: slide/click left & right through all the
            attached files (wraps around, no limit). */}
        {profileView && (() => {
          const url = avatarFor(profileView.email)
          const nm = nameFor(profileView.email)
          return (
            <div className="cr-profile-overlay" onClick={() => setProfileView(null)}>
              <button className="cr-profile-close" onClick={() => setProfileView(null)} aria-label={t('Tutup')}>✕</button>
              <div className="cr-profile-card" onClick={e => e.stopPropagation()}>
                {url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img loading="lazy" decoding="async" src={url} alt={nm} className="cr-profile-img" referrerPolicy="no-referrer" />
                  : <div className="cr-profile-fallback" style={{ background: avatarColor(nm) }}>{initials(nm)}</div>}
                <div className="cr-profile-name">{nm}</div>
                <div className="cr-profile-email">{profileView.email}</div>
              </div>
            </div>
          )
        })()}

        {lightbox && (() => {
          const n = lightbox.items.length
          const cur = lightbox.items[lightbox.index]
          const go = (d: number) => setLightbox(lb => (lb ? { ...lb, index: ((lb.index + d) % n + n) % n } : lb))
          return (
            <Modal
              open
              onClose={() => setLightbox(null)}
              title={cur.name}
              maxWidth={760}
              headerRight={
                <button
                  type="button"
                  onClick={() => downloadFileNoNav(cur.url, cur.name)}
                  title="Download"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', borderRadius: 8, background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer' }}
                >
                  ⬇ Download
                </button>
              }
            >
              <div
                style={{ position: 'relative' }}
                onTouchStart={e => { lbTouch.current = e.touches[0]?.clientX ?? null }}
                onTouchEnd={e => {
                  const x0 = lbTouch.current; lbTouch.current = null
                  if (x0 == null || n < 2) return
                  const dx = (e.changedTouches[0]?.clientX ?? x0) - x0
                  if (Math.abs(dx) > 45) go(dx < 0 ? 1 : -1)
                }}
              >
                <ChatAttachPreview url={cur.url} name={cur.name} type={cur.type} />
                {n > 1 && (
                  <>
                    <button type="button" className="cr-lb-nav left" onClick={() => go(-1)} aria-label={t('Sebelumnya')}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                    </button>
                    <button type="button" className="cr-lb-nav right" onClick={() => go(1)} aria-label={t('Berikutnya')}>
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
                    </button>
                    <div className="cr-lb-count">{lightbox.index + 1} / {n}</div>
                  </>
                )}
              </div>
              {/* Filmstrip + All media (WhatsApp-style). */}
              <div className="cr-lb-strip">
                <button type="button" className="cr-lb-allmedia" onClick={() => setGallery(true)}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>
                  All Media
                </button>
                <div className="cr-lb-thumbs no-scrollbar">
                  {lightbox.items.map((it, idx) => (
                    <button key={idx} type="button" className={`cr-lb-thumb ${idx === lightbox.index ? 'active' : ''}`} onClick={() => setLightbox(lb => (lb ? { ...lb, index: idx } : lb))}>
                      {it.type.startsWith('image/')
                        ? /* eslint-disable-next-line @next/next/no-img-element */ <img loading="lazy" decoding="async" src={it.url} alt="" />
                        : <span className="cr-lb-thumb-file"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg></span>}
                    </button>
                  ))}
                </div>
                {cur.msg && (
                  <button type="button" className="cr-lb-reply" onClick={() => { if (cur.msg) startReply(cur.msg); setLightbox(null) }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7" /><path d="M20 18v-1a4 4 0 0 0-4-4H4" /></svg>
                    {t('Balas')}
                  </button>
                )}
              </div>
            </Modal>
          )
        })()}

        {/* All-media gallery grid (every image in the room). */}
        {gallery && (
          <Modal open onClose={() => setGallery(false)} title="All Media" maxWidth={760}>
            {allMedia.length === 0
              ? <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Belum ada media.')}</div>
              : <div className="cr-gallery-grid">
                  {allMedia.map((it, idx) => (
                    <button key={idx} type="button" className="cr-gallery-cell" onClick={() => { setGallery(false); setLightbox({ items: allMedia, index: idx }) }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={it.url} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>}
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
          {pendingFiles.length > 0 && (
            <div className="cr-attach-list">
              {pendingFiles.map((it, idx) => (
                <div key={it.id} className="cr-attach-card">
                  {/* Tap to preview — opens a gallery of all attached files. */}
                  <button
                    type="button"
                    className="cr-attach-open"
                    title={t('Pratinjau')}
                    onClick={() => setLightbox({ items: pendingFiles.map(p => ({ url: p.preview, name: p.file.name, type: p.file.type })), index: idx })}
                  >
                    {it.file.type.startsWith('image/')
                      ? // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async" className="cr-attach-thumb" src={it.preview} alt={it.file.name} />
                      : <span className="cr-attach-thumb cr-attach-thumb-file">
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
                        </span>}
                  </button>
                  {/* Progress ring overlay until upload finishes. */}
                  {!it.attach && !it.error && (
                    <span className="cr-attach-progress"><span className="cr-spin" /><span className="cr-attach-pct">{it.pct}%</span></span>
                  )}
                  {it.error && <span className="cr-attach-progress cr-attach-failed">!</span>}
                  <button className="cr-attach-x" onClick={() => removePending(it.id)} aria-label={t('Hapus')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
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
              {(replyingTo.attachment_type ?? '').startsWith('image/') && (!!replyingTo.attachment_path || !!replyingTo._preview) && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img loading="lazy" decoding="async" className="cr-reply-thumb" src={imgUrl(replyingTo)} alt="" />
              )}
              <button className="cr-reply-close" onClick={() => setReplyingTo(null)} aria-label={t('Batal balas')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
          )}
          {mention && mentionMatches.length > 0 && (
            <div className="cr-mention-list">
              {mentionMatches.map((mm, i) => (
                <button
                  key={mm.email}
                  type="button"
                  className={`cr-mention-item ${i === mentionSel ? 'active' : ''}`}
                  onMouseEnter={() => setMentionSel(i)}
                  onMouseDown={e => { e.preventDefault(); insertMention(mm) }}
                >
                  {personAvatar(mm.email, 30)}
                  <span className="cr-mention-name">{mm.name}{mm.email === meEmail ? ` (${t('Saya')})` : ''}</span>
                </button>
              ))}
            </div>
          )}
          <div className="cr-input-wrap">
            <input ref={fileRef} type="file" accept={ACCEPT} hidden multiple onChange={e => { addFiles(e.target.files); e.target.value = '' }} />
            <button className="cr-attach-btn" onClick={() => fileRef.current?.click()} aria-label={t('Lampirkan file')} title={t('Lampirkan file')}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
            </button>
            <textarea
              ref={taRef}
              value={text}
              onChange={onTextChange}
              onKeyDown={e => {
                if (mention && mentionMatches.length > 0) {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setMentionSel(s => Math.min(s + 1, mentionMatches.length - 1)); return }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setMentionSel(s => Math.max(s - 1, 0)); return }
                  if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionMatches[mentionSel] ?? mentionMatches[0]); return }
                  if (e.key === 'Escape') { e.preventDefault(); setMention(null); return }
                }
                if (e.key === 'Enter' && !e.shiftKey && !isMobile) { e.preventDefault(); send() }
              }}
              placeholder={t('Tulis pesan…')}
              rows={1}
              className="cr-input"
            />
            <button onClick={send} disabled={(!text.trim() && pendingFiles.length === 0) || converting} className="cr-send" aria-label={t('Kirim')}>
              {converting
                ? <span className="cr-spin" />
                : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirm}
        danger
        title={confirm?.kind === 'all' ? t('Kosongkan room') : confirm?.kind === 'unsend' ? t('Tarik pesan?') : t('Hapus pesan terpilih')}
        message={confirm?.kind === 'all'
          ? t('Kosongkan seluruh room? Semua pesan akan terhapus permanen.')
          : confirm?.kind === 'unsend'
            ? t('Tarik pesan ini? Pesan akan hilang untuk semua orang di room.')
            : `${t('Hapus')} ${selected.size} ${t('pesan terpilih')}? ${t('Tindakan ini permanen.')}`}
        confirmLabel={confirm?.kind === 'unsend' ? t('Tarik') : t('Hapus')}
        cancelLabel={t('Batal')}
        onConfirm={() => {
          if (confirm?.kind === 'all') clearAll()
          else if (confirm?.kind === 'unsend') { void retract(confirm.id); setConfirm(null) }
          else clearSelected()
        }}
        onCancel={() => setConfirm(null)}
      />
    </div>
  )
}

// Renders an attachment inside the preview popup by kind. Mirrors the
// PostPreviewModal preview so chat files open in the same styled popup.
// Compact month calendar for the chat search → jump to a date.
function MiniCalendar({ month, onMonth, onPick }: { month: Date; onMonth: (d: Date) => void; onPick: (d: Date) => void }) {
  const y = month.getFullYear(), mo = month.getMonth()
  const startDow = new Date(y, mo, 1).getDay()
  const daysInMonth = new Date(y, mo + 1, 0).getDate()
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const title = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const cells: (number | null)[] = []
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  return (
    <div className="cr-cal-inner">
      <div className="cr-cal-head">
        <span className="cr-cal-title">{title}</span>
        <span className="cr-cal-navs">
          <button type="button" onClick={() => onMonth(new Date(y, mo - 1, 1))} aria-label="Prev"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg></button>
          <button type="button" onClick={() => onMonth(new Date(y, mo + 1, 1))} aria-label="Next"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg></button>
        </span>
      </div>
      <div className="cr-cal-grid">
        {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => <span key={d} className="cr-cal-dow">{d}</span>)}
        {cells.map((c, i) => {
          if (c === null) return <span key={`e${i}`} />
          const date = new Date(y, mo, c)
          const isToday = date.getTime() === today.getTime()
          return <button key={i} type="button" className={`cr-cal-day ${isToday ? 'today' : ''}`} onClick={() => onPick(date)}>{c}</button>
        })}
      </div>
    </div>
  )
}

function ChatAttachPreview({ url, name, type }: { url: string; name: string; type: string }) {
  const t = useT()
  if (type.startsWith('image/')) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img loading="lazy" decoding="async" src={url} alt={name} style={{ maxWidth: '100%', maxHeight: '72dvh', display: 'block', margin: '0 auto', borderRadius: 8 }} />
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
.cr-root { display:flex; flex-direction:column; height:100%; min-height:0; position:relative; }

/* ── Search ── */
.cr-search { display:flex; align-items:center; gap:8px; flex-shrink:0; margin-bottom:8px; padding:6px; background:var(--bg2); border:1px solid var(--border); border-radius:14px; position:relative; }
.cr-search-cal-wrap { position:relative; flex-shrink:0; }
.cr-search-icon { width:34px; height:34px; border-radius:9px; border:1px solid var(--border); background:var(--bg3); color:var(--text2); cursor:pointer; display:flex; align-items:center; justify-content:center; transition:color .12s, border-color .12s; }
.cr-search-icon.on, .cr-search-icon:hover { color:var(--accent3); border-color:var(--accent3); }
.cr-search-field { flex:1; min-width:0; display:flex; align-items:center; gap:8px; padding:0 12px; height:34px; border-radius:9px; background:var(--bg3); border:1px solid var(--border); color:var(--text2); }
.cr-search-field input { flex:1; min-width:0; background:none; border:none; outline:none; color:var(--text); font-size:13.5px; font-family:inherit; }
.cr-search-count { flex-shrink:0; font-size:12.5px; color:var(--text2); font-variant-numeric:tabular-nums; white-space:nowrap; }
.cr-search-nav { flex-shrink:0; width:30px; height:30px; border-radius:8px; border:1px solid var(--border); background:var(--bg3); color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:center; }
.cr-search-nav:disabled { opacity:0.35; cursor:default; }
.cr-search-nav:not(:disabled):hover { background:var(--bg-hover); }
.cr-search-done { flex-shrink:0; padding:7px 12px; border:none; background:none; color:var(--accent3); font-size:13.5px; font-weight:700; cursor:pointer; border-radius:8px; }
.cr-search-done:hover { background:rgba(67,217,162,0.12); }
.cr-search-open { position:absolute; top:14px; right:14px; z-index:6; width:34px; height:34px; border-radius:50%; border:1px solid var(--border); background:var(--bg3); color:var(--text2); cursor:pointer; display:flex; align-items:center; justify-content:center; box-shadow:0 2px 8px rgba(0,0,0,0.35); transition:color .12s, background .12s; }
.cr-search-open:hover { color:var(--text); background:var(--bg-hover); }
/* Calendar */
.cr-cal { position:absolute; top:calc(100% + 8px); left:0; z-index:40; }
.cr-cal-inner { width:300px; max-width:84vw; background:var(--bg2); border:1px solid var(--border); border-radius:14px; padding:14px; box-shadow:0 16px 44px rgba(0,0,0,0.55); }
.cr-cal-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; }
.cr-cal-title { font-size:15px; font-weight:700; color:var(--text); }
.cr-cal-navs { display:flex; gap:4px; }
.cr-cal-navs button { width:28px; height:28px; border-radius:7px; border:none; background:none; color:var(--accent3); cursor:pointer; display:flex; align-items:center; justify-content:center; }
.cr-cal-navs button:hover { background:var(--bg-hover); }
.cr-cal-grid { display:grid; grid-template-columns:repeat(7, 1fr); gap:2px; }
.cr-cal-dow { text-align:center; font-size:10.5px; font-weight:700; color:var(--text3); padding:4px 0 6px; }
.cr-cal-day { aspect-ratio:1 / 1; border:none; background:none; color:var(--text); font-size:13px; border-radius:8px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.cr-cal-day:hover { background:var(--bg-hover); }
.cr-cal-day.today { color:var(--accent3); font-weight:700; box-shadow:inset 0 0 0 1.5px var(--accent3); }
/* Search highlight */
.cr-hl { background:rgba(255,210,90,0.42); color:inherit; border-radius:3px; padding:0 1px; }
.cr-bubble.mine .cr-hl { background:rgba(255,255,255,0.42); color:#0b2a6b; }

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
.cr-av-btn { background:none; border:none; padding:0; margin:0; cursor:pointer; display:flex; border-radius:50%; transition:transform 0.12s ease, box-shadow 0.12s ease; }
.cr-av-btn:hover { transform:scale(1.06); box-shadow:0 0 0 2px var(--accent); }
.cr-av-btn:active { transform:scale(0.97); }

/* Profile-photo preview popup (tap an avatar) */
.cr-profile-overlay { position:fixed; inset:0; z-index:1200; background:rgba(6,8,14,0.82); backdrop-filter:blur(6px); display:flex; flex-direction:column; align-items:center; justify-content:center; padding:24px; animation:cr-fade 0.16s ease; }
.cr-profile-close { position:absolute; top:16px; right:18px; width:40px; height:40px; border-radius:50%; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.08); color:#fff; font-size:16px; cursor:pointer; display:flex; align-items:center; justify-content:center; }
.cr-profile-close:hover { background:rgba(255,255,255,0.16); }
.cr-profile-card { display:flex; flex-direction:column; align-items:center; gap:6px; animation:cr-pop 0.18s ease; }
.cr-profile-img, .cr-profile-fallback { width:min(78vw, 300px); height:min(78vw, 300px); border-radius:50%; object-fit:cover; box-shadow:0 18px 60px rgba(0,0,0,0.55), inset 0 0 0 1px rgba(255,255,255,0.12); }
.cr-profile-fallback { display:flex; align-items:center; justify-content:center; color:#fff; font-size:84px; font-weight:800; }
.cr-profile-name { margin-top:14px; font-size:18px; font-weight:800; color:#fff; text-align:center; }
.cr-profile-email { font-size:13px; color:rgba(255,255,255,0.6); text-align:center; }
@keyframes cr-fade { from { opacity:0 } to { opacity:1 } }
@keyframes cr-pop { from { opacity:0; transform:scale(0.92) } to { opacity:1; transform:scale(1) } }
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
/* Preserve aspect ratio (no crop) — caps width, lets tall screenshots stay
   complete; the bubble shrinks to the photo. */
.cr-img { display:block; max-width:100%; max-height:340px; width:auto; height:auto; border-radius:11px; cursor:pointer; }

/* Image messages — WhatsApp-style: a thin bubble frame, the photo fills it
   edge-to-edge with rounded corners, and (when there's no caption) the time
   overlays the bottom-right of the photo on a soft scrim. */
.cr-bubble.has-media { padding:3px; overflow:hidden; }
.cr-bubble.has-media .cr-img { border-radius:13px; }
.cr-bubble.mine.has-media { border-radius:15px 15px 6px 15px; }
.cr-bubble.has-media:not(.mine) { border-radius:15px 15px 15px 6px; }
.cr-bubble.has-media.grouped { border-radius:15px; }
/* Caption (image + text): give the text room and a touch of padding. */
.cr-bubble.has-media .cr-body-text { display:block; padding:5px 8px 0; }
.cr-bubble.has-media:not(.media-only) .cr-stamp { margin-right:7px; margin-bottom:2px; }
.cr-bubble.has-media .cr-quote { margin:3px 3px 5px; }
/* Image-only: overlay the timestamp on the photo. */
.cr-bubble.media-only .cr-img { display:block; }
.cr-bubble.media-only .cr-stamp {
  position:absolute; right:8px; bottom:8px; float:none; margin:0;
  padding:2px 8px; border-radius:11px; font-size:10.5px; opacity:1; color:#fff;
  background:rgba(0,0,0,0.42); backdrop-filter:blur(6px); -webkit-backdrop-filter:blur(6px);
}
.cr-bubble.media-only .cr-tick { opacity:1; }
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
/* Reaction pills hang off the bubble's bottom edge (negative margin pulls them
   up to overlap it) with a bg-coloured ring so they read as "stuck on". */
.cr-reactions { display:flex; flex-wrap:wrap; gap:3px; margin:-13px 8px 1px; position:relative; z-index:3; }
.cr-row.mine .cr-reactions { justify-content:flex-end; }
.cr-reaction {
  display:inline-flex; align-items:center; gap:3px; padding:2px 7px;
  border:2px solid var(--bg2); background:var(--bg3); border-radius:999px;
  cursor:pointer; font-size:12px; line-height:1.4; color:var(--text);
  box-shadow:0 1px 3px rgba(0,0,0,0.35);
  transition:background .12s ease, border-color .12s ease, transform .08s ease;
}
.cr-reaction:hover { background:var(--bg-hover); }
.cr-reaction:active { transform:scale(0.94); }
.cr-reaction.mine { background:rgba(11,61,231,0.32); }
.cr-reaction-emoji { font-size:14px; }
.cr-reaction-count { font-size:11px; font-weight:700; color:var(--text); font-variant-numeric:tabular-nums; }

/* Reaction-details popup. */
.cr-reactinfo-tabs { display:flex; gap:6px; flex-wrap:wrap; padding:2px 0 12px; border-bottom:1px solid var(--border); margin-bottom:6px; }
.cr-reactinfo-tab { padding:6px 13px; border-radius:999px; border:1px solid var(--border); background:var(--bg3); color:var(--text2); font-size:13px; font-weight:600; cursor:pointer; transition:background .12s, color .12s, border-color .12s; }
.cr-reactinfo-tab:hover { background:var(--bg-hover); color:var(--text); }
.cr-reactinfo-tab.active { background:var(--accent); border-color:var(--accent); color:#fff; }
.cr-reactinfo-row { width:100%; background:none; border:none; cursor:default; }
.cr-reactinfo-row[title] { cursor:pointer; }

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
.cr-quote { display:flex; align-items:center; gap:8px; width:100%; text-align:left; margin:0 0 6px; padding:5px 9px; border:none; cursor:pointer; border-left:3px solid var(--accent3); background:rgba(255,255,255,0.07); border-radius:6px; overflow:hidden; }
.cr-quote.has-thumb { padding:4px 4px 4px 9px; }
.cr-quote-text { display:flex; flex-direction:column; gap:1px; flex:1; min-width:0; }
.cr-quote-thumb { width:42px; height:42px; border-radius:5px; object-fit:cover; flex-shrink:0; }
.cr-reply-thumb { width:42px; height:42px; border-radius:7px; object-fit:cover; flex-shrink:0; }
.cr-bubble.mine .cr-quote { background:rgba(255,255,255,0.16); border-left-color:rgba(255,255,255,0.9); }
.cr-quote:hover { filter:brightness(1.12); }
.cr-quote-author { font-size:12px; font-weight:700; color:var(--accent3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.cr-bubble.mine .cr-quote-author { color:#fff; }
.cr-quote-snippet { font-size:12px; opacity:0.85; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:240px; }
/* Flash highlight when jumping to a quoted message. */
.cr-flash .cr-bubble { animation:cr-flash-anim 1.3s ease; }
@keyframes cr-flash-anim { 0%,100% { box-shadow:none; } 30% { box-shadow:0 0 0 3px var(--accent3); } }

/* ── @mentions ── */
/* Distinct text colour only — no chip/background. High contrast on both the
   dark bubble (bright blue) and my own blue bubble (bright aqua, clearly
   different from the white body text). Cool = others, warm/amber = you. */
.cr-mention { color:#79aaff; font-weight:700; }
.cr-bubble.mine .cr-mention { color:#8af3ff; font-weight:800; text-shadow:0 1px 1px rgba(0,0,0,0.25); }
.cr-mention.me { color:#ffc23d; }
.cr-bubble.mine .cr-mention.me { color:#ffe08a; text-shadow:0 1px 1px rgba(0,0,0,0.25); }
/* The whole bubble gets an amber edge when a message tags me. */
.cr-bubble.mentions-me { box-shadow:inset 3px 0 0 #ffce5a, 0 1px 2px rgba(0,0,0,0.2); }
.cr-bubble.mine.mentions-me { box-shadow:inset -3px 0 0 #ffd56e, 0 2px 10px rgba(11,61,231,0.32); }
/* Autocomplete dropdown above the composer. */
.cr-mention-list { display:flex; flex-direction:column; gap:1px; margin:0 0 8px; padding:5px; background:var(--bg2); border:1px solid var(--border); border-radius:12px; box-shadow:0 12px 34px rgba(0,0,0,0.5); max-height:232px; overflow-y:auto; }
.cr-mention-item { display:flex; align-items:center; gap:10px; width:100%; text-align:left; background:none; border:none; cursor:pointer; padding:7px 9px; border-radius:9px; transition:background .1s ease; }
.cr-mention-item.active { background:rgba(255,255,255,0.08); }
.cr-mention-name { font-size:13.5px; font-weight:500; color:var(--text); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

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

/* Composer attachment previews — a row of thumbnails (multiple files). */
.cr-attach-list { display:flex; gap:8px; flex-wrap:wrap; margin:0 0 8px; }
.cr-attach-card { position:relative; width:64px; height:64px; flex-shrink:0; }
.cr-attach-thumb { width:64px; height:64px; border-radius:11px; object-fit:cover; background:var(--bg3); box-shadow:inset 0 0 0 1px rgba(255,255,255,0.1); display:block; }
.cr-attach-thumb-file { display:inline-flex; align-items:center; justify-content:center; color:var(--text2); }
.cr-attach-progress { position:absolute; inset:0; border-radius:11px; background:rgba(0,0,0,0.5); display:flex; flex-direction:column; align-items:center; justify-content:center; gap:3px; }
.cr-attach-pct { font-size:10px; font-weight:700; color:#fff; }
.cr-attach-failed { color:#ff6b6b; font-size:22px; font-weight:800; background:rgba(0,0,0,0.55); }
.cr-attach-x { position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%; border:2px solid var(--bg2); background:var(--bg-hover); color:var(--text); cursor:pointer; display:flex; align-items:center; justify-content:center; padding:0; box-shadow:0 1px 4px rgba(0,0,0,0.4); z-index:2; }
.cr-attach-x:hover { background:#ff6b6b; }
.cr-attach-open { display:block; width:64px; height:64px; padding:0; border:none; background:none; cursor:pointer; border-radius:11px; overflow:hidden; }

/* Lightbox prev/next navigation. */
.cr-lb-nav { position:absolute; top:50%; transform:translateY(-50%); width:40px; height:40px; border-radius:50%; border:none; background:rgba(0,0,0,0.5); color:#fff; cursor:pointer; display:flex; align-items:center; justify-content:center; backdrop-filter:blur(4px); transition:background .12s; }
.cr-lb-nav:hover { background:rgba(0,0,0,0.7); }
.cr-lb-nav.left { left:8px; }
.cr-lb-nav.right { right:8px; }
.cr-lb-count { position:absolute; bottom:10px; left:50%; transform:translateX(-50%); background:rgba(0,0,0,0.6); color:#fff; font-size:12px; font-weight:600; padding:3px 11px; border-radius:20px; backdrop-filter:blur(4px); }
/* Lightbox filmstrip + All media. */
.cr-lb-strip { display:flex; align-items:center; gap:8px; margin-top:12px; padding-top:10px; border-top:1px solid var(--border); }
.cr-lb-allmedia { flex-shrink:0; display:inline-flex; align-items:center; gap:6px; padding:7px 12px; border-radius:9px; border:1px solid var(--border); background:var(--bg3); color:var(--text); font-size:12.5px; font-weight:600; cursor:pointer; transition:background .12s; }
.cr-lb-allmedia:hover { background:var(--bg-hover); }
.cr-lb-thumbs { display:flex; gap:6px; overflow-x:auto; padding:2px; flex:1; min-width:0; }
.cr-lb-reply { flex-shrink:0; display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:9px; border:none; background:var(--accent); color:#fff; font-size:12.5px; font-weight:600; cursor:pointer; transition:filter .12s; }
.cr-lb-reply:hover { filter:brightness(1.08); }
.cr-lb-thumb { flex-shrink:0; width:46px; height:46px; border-radius:8px; overflow:hidden; border:2px solid transparent; padding:0; cursor:pointer; background:var(--bg3); }
.cr-lb-thumb.active { border-color:var(--accent); }
.cr-lb-thumb img { width:100%; height:100%; object-fit:cover; display:block; }
.cr-lb-thumb-file { display:flex; width:100%; height:100%; align-items:center; justify-content:center; color:var(--text2); }
/* All-media gallery grid. */
.cr-gallery-grid { display:grid; grid-template-columns:repeat(4, 1fr); gap:3px; }
@media (max-width: 560px) { .cr-gallery-grid { grid-template-columns:repeat(3, 1fr); } }
.cr-gallery-cell { aspect-ratio:1 / 1; padding:0; border:none; cursor:pointer; background:var(--bg3); overflow:hidden; border-radius:2px; }
.cr-gallery-cell img { width:100%; height:100%; object-fit:cover; display:block; transition:transform .15s ease; }
.cr-gallery-cell:hover img { transform:scale(1.05); }

/* In-bubble image while its upload finishes. */
.cr-img-wrap { position:relative; display:block; line-height:0; border-radius:13px; overflow:hidden; max-width:min(260px, 68vw); }
.cr-img-uploading { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.32); }

/* Image album collage (WhatsApp-style). */
.cr-album { display:grid; gap:3px; width:264px; max-width:74vw; border-radius:12px; overflow:hidden; }
.cr-album-2, .cr-album-3, .cr-album-4 { grid-template-columns:1fr 1fr; }
.cr-album-3.three .cr-album-tile:first-child { grid-column:1 / -1; aspect-ratio:2 / 1; }
.cr-album-tile { position:relative; padding:0; border:none; cursor:pointer; background:var(--bg3); aspect-ratio:1 / 1; overflow:hidden; }
.cr-album-tile img { width:100%; height:100%; object-fit:cover; display:block; }
.cr-album-more { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,0.52); color:#fff; font-size:25px; font-weight:700; }
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
