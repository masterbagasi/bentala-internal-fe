'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
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
}

interface FeedEntry {
  id: string
  kind: 'comment' | 'activity'
  authorName: string
  authorEmail?: string | null
  at: string
  // comment
  body?: string
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

export function PostComments({ post }: { post: Post }) {
  const [tab, setTab] = useState<'comments' | 'activity'>('comments')
  // All rows for this post (comments + logged activity), kept in one list so a
  // single realtime subscription covers both.
  const [rows, setRows] = useState<CommentRow[]>([])
  const [loading, setLoading] = useState(true)
  const [me, setMe] = useState<{ name: string; email: string }>({ name: '', email: '' })
  const [input, setInput] = useState('')
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')

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
    let cancelled = false
    setLoading(true)
    const supabase = sb()

    supabase
      .from('post_comments')
      .select('*')
      .eq('post_id', post.id)
      .order('created_at', { ascending: true })
      .then(({ data }) => {
        if (cancelled) return
        setRows((data as CommentRow[] | null) ?? [])
        setLoading(false)
      })

    // Realtime: append new rows (comments + activity) as they're inserted,
    // from this or any other user's session — no manual reload needed.
    const channel = supabase
      .channel(`post_comments:${post.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments', filter: `post_id=eq.${post.id}` },
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
  }, [post.id])

  const comments = useMemo(() => rows.filter(r => (r.type ?? 'comment') !== 'activity'), [rows])

  // Activity events derived from the post itself.
  const activity = useMemo<FeedEntry[]>(() => {
    const author = post.created_by || 'Seseorang'
    const ev: FeedEntry[] = []
    if (post.created_at) {
      ev.push({ id: 'created', kind: 'activity', authorName: author, at: post.created_at, text: 'membuat post ini' })
    }
    const files = [...(post.files || [])]
    if (post.video_link) files.push(post.video_link)
    if (post.design_link) files.push(post.design_link)
    files.filter(Boolean).forEach((f, i) => {
      ev.push({
        id: `file-${i}`, kind: 'activity', authorName: author, at: post.created_at,
        text: 'melampirkan', attach: fileName(f), url: f,
      })
    })
    if ((post.status === 'published' || post.status === 'done') && post.updated_at) {
      ev.push({ id: 'done', kind: 'activity', authorName: author, at: post.updated_at, text: 'menandai post selesai', done: true })
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
          authorName: r.author_name || r.author_email || 'Seseorang',
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
    if (!body || posting) return
    if (!me.email) {
      setError('Tidak bisa mengenali akun Anda.')
      return
    }
    setPosting(true)
    setError('')
    try {
      const { data, error: insErr } = await sb()
        .from('post_comments')
        .insert({ post_id: post.id, author_email: me.email, author_name: me.name, body })
        .select('*')
        .single()
      if (insErr) throw insErr
      const row = data as CommentRow
      setRows(prev => (prev.some(r => r.id === row.id) ? prev : [...prev, row]))
      setInput('')
      setTab('comments')
    } catch {
      setError('Gagal mengirim komentar. Coba lagi.')
    } finally {
      setPosting(false)
    }
  }

  const commentCount = comments.length

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 18 }}>
      {/* Tabs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <Tab label={`Komentar${commentCount ? ` (${commentCount})` : ''}`} active={tab === 'comments'} onClick={() => setTab('comments')} />
        <Tab label="Semua Aktivitas" active={tab === 'activity'} onClick={() => setTab('activity')} />
      </div>

      {/* Composer — kept at the top so a new comment appears right below it
          (newest-first ordering). */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-start' }}>
        <Avatar name={me.name || me.email || 'You'} size={30} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <textarea
            rows={2}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit()
            }}
            placeholder="Tulis komentar… (⌘/Ctrl + Enter untuk kirim)"
            style={{
              width: '100%', boxSizing: 'border-box', resize: 'vertical',
              background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
              padding: '10px 12px', color: 'var(--text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
            }}
          />
          {error && <div style={{ fontSize: 12, color: '#f87171', marginTop: 6 }}>{error}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button
              onClick={submit}
              disabled={posting || !input.trim()}
              style={{
                padding: '8px 16px', borderRadius: 8, border: 'none', fontSize: 13, fontWeight: 600,
                background: !input.trim() ? 'var(--bg3)' : 'var(--accent)',
                color: !input.trim() ? 'var(--text2)' : '#fff',
                cursor: posting || !input.trim() ? 'not-allowed' : 'pointer',
                opacity: posting ? 0.7 : 1,
              }}
            >
              {posting ? 'Mengirim…' : 'Kirim'}
            </button>
          </div>
        </div>
      </div>

      {/* Feed — newest first */}
      {loading ? (
        <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>Memuat…</div>
      ) : feed.length === 0 ? (
        <div style={{ fontSize: 13, color: 'var(--text2)', padding: '8px 0' }}>
          {tab === 'comments' ? 'Belum ada komentar. Jadilah yang pertama!' : 'Belum ada aktivitas.'}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {feed.map(e => (
            <FeedItem key={`${e.kind}-${e.id}`} entry={e} />
          ))}
        </div>
      )}
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

function FeedItem({ entry }: { entry: FeedEntry }) {
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
                <span style={{ fontSize: 11, color: 'var(--accent)' }}>Buka / Download</span>
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
          {entry.body}
        </div>
      </div>
    </div>
  )
}
