'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import type { Post } from '@/lib/types'

// ── Comment room + activity feed for a single post ─────────────
// Comments live in the `post_comments` table. The activity feed (created /
// attached / completed) is DERIVED from the post's own fields so it works for
// every existing post without any event-logging plumbing.

interface CommentRow {
  id: string
  post_id: string
  type?: string | null // 'comment' (default) | 'activity'
  author_email: string | null
  author_name: string | null
  body: string
  created_at: string
  mentions?: string[] | null
}

interface FeedEntry {
  id: string
  kind: 'comment' | 'activity'
  authorName: string
  authorEmail?: string | null
  at: string
  // comment
  body?: string
  mentions?: string[]
  // activity
  text?: string
  attach?: string
  url?: string
  done?: boolean
}

// Untyped client — `post_comments` isn't in the generated Database types.
function sb(): SupabaseClient {
  return getSupabase() as unknown as SupabaseClient
}

const AVATAR_COLORS = ['#6c63ff', '#43d9a2', '#ffc542', '#ff6b6b', '#3b9dff', '#c084fc', '#f97316', '#14b8a6']
function colorFor(seed: string): string {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
function initialsFor(name: string): string {
  const label = name.includes('@') ? name.split('@')[0] : name
  const parts = label.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return label.slice(0, 2).toUpperCase()
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

function fileName(url: string): string {
  try {
    const last = new URL(url).pathname.split('/').pop() || url
    return decodeURIComponent(last)
  } catch {
    return url.split('/').pop() || url
  }
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Render a comment body with @Name highlighted for each mentioned account.
// Split on a capturing group so the matched "@Name" parts are kept, then test
// each part against the known names (avoids stateful global-regex .test).
function renderBodyWithMentions(
  body: string,
  mentions: string[] | undefined,
  accounts: { email: string; name: string }[],
): import('react').ReactNode {
  const names = (mentions ?? [])
    .map(em => accounts.find(a => a.email === em)?.name)
    .filter((n): n is string => !!n)
  if (!names.length) return body
  const re = new RegExp('(@(?:' + names.map(escapeRegExp).join('|') + '))', 'g')
  return body.split(re).map((part, i) =>
    part.startsWith('@') && names.some(n => part === '@' + n)
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : <span key={i}>{part}</span>,
  )
}

function Avatar({ name, size = 30 }: { name: string; size?: number }) {
  return (
    <span
      title={name}
      style={{
        width: size, height: size, borderRadius: '50%', flexShrink: 0,
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.4, fontWeight: 700, color: '#fff', background: colorFor(name),
      }}
    >
      {initialsFor(name)}
    </span>
  )
}

// State + handlers for a post's comment thread. Returned by the hook so the
// feed (in the modal body) and the composer (in the fixed modal footer) can be
// rendered in separate parts of the modal while sharing one source of truth.
export function usePostComments(post: Post | null | undefined) {
  const t = useT()
  const [tab, setTab] = useState<'comments' | 'activity'>('comments')
  // All rows for this post (comments + logged activity), kept in one list so a
  // single realtime subscription covers both.
  const [rows, setRows] = useState<CommentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<{ name: string; email: string }>({ name: '', email: '' })
  const [input, setInput] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState<{ email: string; name: string; avatarUrl: string | null }[]>([])
  const [mentions, setMentions] = useState<string[]>([])

  // Team accounts for @mention autocomplete.
  useEffect(() => {
    let cancelled = false
    fetch('/api/accounts')
      .then(r => (r.ok ? r.json() : { accounts: [] }))
      .then((d: { accounts?: { email: string; name: string; avatarUrl: string | null }[] }) => {
        if (!cancelled) setAccounts(d.accounts ?? [])
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [])

  function addMention(email: string) {
    setMentions(prev => (prev.includes(email) ? prev : [...prev, email]))
  }

  // Load current user + the comment thread.
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
  }, [])

  useEffect(() => {
    if (!post) {
      setRows([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    const supabase = sb()
    const postId = post.id

    supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', postId)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setRows((data as CommentRow[] | null) ?? [])
        setLoading(false)
      })

    // Realtime: append new rows (comments + activity) as they're inserted,
    // from this or any other user's session — no manual reload needed.
    const channel = supabase
      .channel(`post_comments:${postId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments', filter: `post_id=eq.${postId}` },
        payload => {
          if (cancelled) return
          const row = payload.new as CommentRow
          setRows(prev => (prev.some(r => r.id === row.id) ? prev : [...prev, row]))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [post?.id])

  const comments = useMemo(() => rows.filter(r => (r.type ?? 'comment') !== 'activity'), [rows])

  // Activity events derived from the post itself.
  const activity = useMemo<FeedEntry[]>(() => {
    if (!post) return []
    const author = post.created_by || t('Seseorang')
    const ev: FeedEntry[] = []
    if (post.created_at) {
      ev.push({ id: 'created', kind: 'activity', authorName: author, at: post.created_at, text: t('membuat post ini') })
    }
    const files = [...(post.files || [])]
    if (post.video_link) files.push(post.video_link)
    if (post.design_link) files.push(post.design_link)
    files.filter(Boolean).forEach((f, i) => {
      ev.push({
        id: `file-${i}`, kind: 'activity', authorName: author, at: post.created_at,
        text: t('melampirkan'), attach: fileName(f), url: f,
      })
    })
    if ((post.status === 'published' || post.status === 'done') && post.updated_at) {
      ev.push({ id: 'done', kind: 'activity', authorName: author, at: post.updated_at, text: t('menandai post selesai'), done: true })
    }
    return ev
  }, [post])

  const commentEntries = useMemo<FeedEntry[]>(
    () =>
      comments.map(c => ({
        id: c.id,
        kind: 'comment' as const,
        authorName: c.author_name || c.author_email || 'User',
        authorEmail: c.author_email,
        at: c.created_at,
        body: c.body,
        mentions: c.mentions ?? [],
      })),
    [comments],
  )

  // Logged activity rows (post edits: status/field changes).
  const loggedActivity = useMemo<FeedEntry[]>(
    () =>
      rows
        .filter(r => (r.type ?? 'comment') === 'activity')
        .map(r => ({
          id: r.id,
          kind: 'activity' as const,
          authorName: r.author_name || r.author_email || t('Seseorang'),
          at: r.created_at,
          text: r.body,
        })),
    [rows],
  )

  const feed = useMemo<FeedEntry[]>(() => {
    const items =
      tab === 'comments'
        ? commentEntries
        : [...activity, ...loggedActivity, ...commentEntries]
    // Newest first (top).
    return items.slice().sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [tab, activity, loggedActivity, commentEntries])

  async function submit() {
    const body = input.trim()
    if (!body || posting || !post) return
    if (!me.email) {
      setError(t('Tidak bisa mengenali akun Anda.'))
      return
    }
    setPosting(true)
    setError('')
    // Keep only mentions whose "@Name" is still present in the final body as a
    // whole token (word-boundary, so "@Andi" doesn't match "@Andi Setiawan").
    // Store emails lowercased for consistent matching in the bell.
    const finalMentions = mentions
      .filter(em => {
        const name = accounts.find(a => a.email === em)?.name ?? em
        return new RegExp(`(^|\\s)@${escapeRegExp(name)}(\\s|$)`).test(body)
      })
      .map(em => em.toLowerCase())
    try {
      const { data, error: insErr } = await sb()
        .from('post_comments')
        .insert({ post_id: post.id, author_email: me.email, author_name: me.name, body, mentions: finalMentions })
        .select('*')
        .single()
      if (insErr) throw insErr
      const row = data as CommentRow
      setRows(prev => (prev.some(r => r.id === row.id) ? prev : [...prev, row]))
      setInput('')
      setMentions([])
      setTab('comments')
      // Mentions are persisted on the comment row above; the mentioned user is
      // notified in-app via the NotificationBell (no email).
    } catch {
      setError(t('Gagal mengirim komentar. Coba lagi.'))
    } finally {
      setPosting(false)
    }
  }

  const commentCount = comments.length

  return { tab, setTab, feed, loading, commentCount, me, input, setInput, posting, error, submit, accounts, addMention }
}

export type PostCommentsState = ReturnType<typeof usePostComments>

// Tabs + scrollable feed — goes in the modal body.
export function PostCommentsBody({ s }: { s: PostCommentsState }) {
  const t = useT()
  const { tab, setTab, feed, loading, commentCount, accounts } = s
  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <Tab label={`${t('Komentar')}${commentCount ? ` (${commentCount})` : ''}`} active={tab === 'comments'} onClick={() => setTab('comments')} />
        <Tab label={t('Semua Aktivitas')} active={tab === 'activity'} onClick={() => setTab('activity')} />
      </div>

      {/* Feed — newest first */}
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>{t('Memuat…')}</div>
      ) : feed.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>
          {tab === 'comments' ? t('Belum ada komentar. Jadilah yang pertama!') : t('Belum ada aktivitas.')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {feed.map(e => (
            <FeedItem key={`${e.kind}-${e.id}`} entry={e} accounts={accounts} />
          ))}
        </div>
      )}
    </div>
  )
}

// The comment composer — goes in the fixed modal footer so it's ALWAYS visible
// at the very bottom, never scrolls with the feed.
export function PostCommentsComposer({ s }: { s: PostCommentsState }) {
  const t = useT()
  const { me, input, setInput, submit, posting, error, accounts, addMention } = s
  const taRef = useRef<HTMLTextAreaElement>(null)
  // While typing an @token, `menu` holds the query text + the token start index.
  const [menu, setMenu] = useState<{ query: string; start: number } | null>(null)
  const [active, setActive] = useState(0)

  const matches = useMemo(() => {
    if (!menu) return [] as typeof accounts
    const q = menu.query.toLowerCase()
    return accounts
      .filter(a => a.name.toLowerCase().includes(q) || a.email.toLowerCase().includes(q))
      .slice(0, 6)
  }, [menu, accounts])

  function onChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setInput(val)
    const caret = e.target.selectionStart ?? val.length
    const upto = val.slice(0, caret)
    const m = /(?:^|\s)@([^\s@]*)$/.exec(upto)
    if (m) { setMenu({ query: m[1], start: caret - m[1].length - 1 }); setActive(0) }
    else setMenu(null)
  }

  function pick(acc: { email: string; name: string }) {
    if (!menu) return
    const tokenEnd = menu.start + 1 + menu.query.length
    const before = input.slice(0, menu.start)
    const after = input.slice(tokenEnd)
    const insert = `@${acc.name} `
    const next = before + insert + after
    setInput(next)
    addMention(acc.email)
    setMenu(null)
    requestAnimationFrame(() => {
      const pos = (before + insert).length
      taRef.current?.focus()
      taRef.current?.setSelectionRange(pos, pos)
    })
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (menu && matches.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => (a + 1) % matches.length); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => (a - 1 + matches.length) % matches.length); return }
      if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(matches[active]); return }
      if (e.key === 'Escape')    { setMenu(null); return }
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
  }

  return (
    <div style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Avatar name={me.name || me.email || 'You'} size={30} />
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <textarea
          ref={taRef}
          rows={2}
          value={input}
          onChange={onChange}
          onKeyDown={onKeyDown}
          placeholder={t('Tulis komentar… ketik @ untuk mention (⌘/Ctrl + Enter kirim)')}
          style={{
            display: 'block',
            width: '100%', boxSizing: 'border-box', resize: 'vertical',
            background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }}
        />
        {menu && matches.length > 0 && (
          <div style={{ position: 'absolute', left: 0, bottom: 'calc(100% + 4px)', width: 240, zIndex: 50, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,0.5)', overflow: 'hidden', padding: 4 }}>
            {matches.map((a, i) => (
              <button key={a.email} onMouseDown={e => { e.preventDefault(); pick(a) }} onMouseEnter={() => setActive(i)}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, border: 'none', cursor: 'pointer', textAlign: 'left', background: i === active ? 'var(--bg3)' : 'transparent', color: 'var(--text)' }}>
                <Avatar name={a.name || a.email} size={22} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500 }}>{a.name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 6 }}>{a.email}</span>
                </span>
              </button>
            ))}
          </div>
        )}
        {error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>{error}</div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button
            onClick={submit}
            disabled={posting || !input.trim()}
            style={{
              height: 34, padding: '0 18px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
              background: !input.trim() ? 'var(--bg3)' : 'var(--accent)',
              color: !input.trim() ? 'var(--text2)' : '#fff',
              cursor: posting || !input.trim() ? 'not-allowed' : 'pointer',
              opacity: posting ? 0.7 : 1,
              whiteSpace: 'nowrap',
            }}
          >
            {posting ? t('Mengirim…') : t('Kirim')}
          </button>
        </div>
      </div>
    </div>
  )
}

function Tab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        padding: '0 0 10px', marginBottom: -1,
        borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
        color: active ? 'var(--text)' : 'var(--text2)',
        fontSize: 13, fontWeight: active ? 600 : 500,
      }}
    >
      {label}
    </button>
  )
}

function FeedItem({ entry, accounts }: { entry: FeedEntry; accounts: { email: string; name: string }[] }) {
  const t = useT()
  if (entry.kind === 'activity') {
    return (
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Avatar name={entry.authorName} size={28} />
        <div style={{ flex: 1, minWidth: 0, paddingTop: 2 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            <span style={{ fontWeight: 600, color: 'var(--text)' }}>{entry.authorName}</span>{' '}
            {entry.done ? (
              <span style={{ color: '#34d399', fontWeight: 600 }}>{entry.text} ✓</span>
            ) : (
              entry.text
            )}{' '}
            {entry.attach && <span style={{ color: 'var(--text)', fontWeight: 500 }}>{entry.attach}</span>}
            <span style={{ color: 'var(--text2)' }}> · {timeAgo(entry.at)}</span>
          </div>
          {entry.attach && entry.url && (
            <a
              href={entry.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
                background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '10px 12px', textDecoration: 'none', maxWidth: 360,
              }}
            >
              <span style={{ fontSize: 18, flexShrink: 0 }}>📎</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {entry.attach}
                </span>
                <span style={{ fontSize: 11, color: 'var(--accent)' }}>{t('Buka / Download')}</span>
              </span>
            </a>
          )}
        </div>
      </div>
    )
  }

  // comment
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      <Avatar name={entry.authorName} size={30} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{entry.authorName}</span>
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>{timeAgo(entry.at)}</span>
        </div>
        <div
          style={{
            fontSize: 13, lineHeight: 1.6, color: 'var(--text)', marginTop: 4,
            background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
            padding: '9px 12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          }}
        >
          {renderBodyWithMentions(entry.body ?? '', entry.mentions, accounts)}
        </div>
      </div>
    </div>
  )
}
