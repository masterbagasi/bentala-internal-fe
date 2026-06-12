'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'

const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

interface Msg { id: string; room: string; author_email: string; author_name: string; body: string; created_at: string }

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('') || '?'
}
function fmtTime(iso: string) {
  return new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
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

export function ChatRoom({ room, roomName, meEmail, meName }: { room: string; roomName: string; meEmail: string; meName: string }) {
  const t = useT()
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const [pinned, setPinned] = useState(false) // user scrolled up — show "jump to latest"
  const listRef = useRef<HTMLDivElement>(null)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const atBottomRef = useRef(true)

  const scrollToBottom = useCallback(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  // Initial load + realtime subscription (RLS scopes inserts to this room).
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
    // Mark read on open.
    fetch(`/api/chat/${encodeURIComponent(room)}/read`, { method: 'POST' })

    const channel = sb()
      .channel(`chat:${room}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `room=eq.${room}` },
        payload => {
          if (cancelled) return
          const row = payload.new as Msg
          setMessages(prev => {
            // Already have the real row (e.g. our POST response landed first).
            if (prev.some(m => m.id === row.id)) return prev
            // Reconcile our own optimistic copy (tmp id) instead of appending a
            // duplicate: match the oldest pending message with same author + body.
            const idx = prev.findIndex(m => m.id.startsWith('tmp-') && m.author_email === row.author_email && m.body === row.body)
            if (idx !== -1) {
              const next = prev.slice()
              next[idx] = row
              return next
            }
            return [...prev, row]
          })
          // Keep our own read marker fresh while the room is open.
          fetch(`/api/chat/${encodeURIComponent(room)}/read`, { method: 'POST' })
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
    // Preserve scroll position after prepending.
    requestAnimationFrame(() => { if (el) el.scrollTop = el.scrollHeight - prevHeight })
  }

  async function send() {
    const body = text.trim()
    if (!body) return
    setText('')
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`, room, author_email: meEmail, author_name: meName,
      body, created_at: new Date().toISOString(),
    }
    atBottomRef.current = true
    setMessages(prev => [...prev, optimistic])
    try {
      const r = await fetch(`/api/chat/${encodeURIComponent(room)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      })
      const d = (await r.json()) as { message?: Msg }
      if (d.message) setMessages(prev => {
        const real = d.message!
        // Realtime may have already swapped in the real row — just drop the
        // optimistic placeholder so we never keep both.
        if (prev.some(m => m.id === real.id)) return prev.filter(m => m.id !== optimistic.id)
        return prev.map(m => (m.id === optimistic.id ? real : m))
      })
    } catch {
      setMessages(prev => prev.map(m => (m.id === optimistic.id ? { ...m, body: m.body + ' ' + t('(gagal terkirim)') } : m)))
    }
  }

  // Safety net: never render the same message id twice, no matter how an echo
  // and the optimistic copy raced into state. Keeps the first occurrence.
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
            <div className="cr-empty-sub">{t('Mulai obrolan dengan tim') /* room context */} {roomName}.</div>
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
              const pending = m.id.startsWith('tmp-')
              return (
                <div key={m.id}>
                  {newDay && (
                    <div className="cr-day">
                      <span className="cr-day-chip">{dayLabel(m.created_at, t)}</span>
                    </div>
                  )}
                  <div className={`cr-row ${mine ? 'mine' : ''}`} style={{ marginTop: grouped ? 2 : 14 }}>
                    {/* Avatar slot — holds width when grouped so bubbles stay aligned. */}
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
                        </div>
                      )}
                      <div className={`cr-bubble ${mine ? 'mine' : ''} ${grouped ? 'grouped' : ''}`} title={fmtTime(m.created_at)}>
                        {m.body}
                        {mine && (
                          <span className={`cr-tick ${pending ? 'pending' : ''}`} aria-hidden>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {pinned && (
          <button onClick={jumpToLatest} className="cr-jump" title={t('Ke pesan terbaru')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
          </button>
        )}
      </div>

      {/* ── Composer ── */}
      <div className="cr-composer">
        <div className="cr-input-wrap">
          <textarea
            ref={taRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder={t('Tulis pesan…')}
            rows={1}
            className="cr-input"
          />
          <button onClick={send} disabled={!text.trim()} className="cr-send" aria-label={t('Kirim')}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13" /><path d="M22 2l-7 20-4-9-9-4 20-7z" /></svg>
          </button>
        </div>
        <div className="cr-hint">{t('Enter kirim · Shift+Enter baris baru')}</div>
      </div>
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

/* ── Bubble ── */
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
.cr-tick { display:inline-block; vertical-align:bottom; margin:0 -2px -2px 6px; color:rgba(255,255,255,0.85); transition:opacity .2s, transform .2s; }
.cr-tick.pending { opacity:0.45; }

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

/* ── Composer — a single clean field; no outer ring/halo around it ── */
.cr-composer { padding:12px 2px 2px; }
.cr-input-wrap {
  display:flex; align-items:flex-end; gap:8px;
  background:var(--bg3); border:1px solid var(--border); border-radius:14px;
  padding:5px 5px 5px 14px; transition:border-color .15s; box-sizing:border-box;
}
.cr-input-wrap:focus-within { border-color:var(--border-strong); }
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
.cr-hint { font-size:10.5px; color:var(--text3); text-align:center; margin-top:7px; letter-spacing:0.01em; }

@keyframes cr-in { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
@keyframes cr-shimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
`
