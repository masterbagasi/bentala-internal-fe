'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'

const STORAGE_KEY = 'bentala_notif_last_seen'

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours} jam lalu`
  return `${Math.floor(hours / 24)} hari lalu`
}

const BTN_H = 32

// A notification addressed to the current (tagged) account.
interface Notif {
  id: string
  at: string
  author: string
  text: string
  postTitle?: string
  tag?: boolean
}

interface ActivityRow {
  id: string
  post_id: string
  type?: string | null
  author_name: string | null
  author_email: string | null
  body: string
  created_at: string
  mentions?: string[] | null
}

// Untyped client — `post_comments` isn't in the generated Database types.
const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

export function NotificationBell() {
  const t = useT()
  const posts = useStore(s => s.posts)
  const activity = useStore(s => s.activity)

  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<number>(0)
  const [me, setMe] = useState<{ email: string; name: string }>({ email: '', name: '' })
  const [postActivity, setPostActivity] = useState<ActivityRow[]>([])
  const [myMentions, setMyMentions] = useState<ActivityRow[]>([])
  const ref = useRef<HTMLDivElement>(null)
  const wasOpenedRef = useRef(false)

  // Who am I? Notifications are per logged-in account.
  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const meta = u.user_metadata ?? {}
      setMe({
        email: (u.email ?? '').toLowerCase(),
        name: meta.full_name ?? meta.name ?? u.email?.split('@')[0] ?? '',
      })
    })
  }, [])

  // Posts where I'm tagged (tagged holds account emails; match name as fallback).
  const myPosts = useMemo(() => {
    if (!me.email && !me.name) return [] as Post[]
    const email = me.email
    const name = me.name.toLowerCase()
    return posts.filter(p =>
      (p.tagged || []).some(t => {
        const v = (t || '').toLowerCase()
        return (email && v === email) || (name && v === name)
      }),
    )
  }, [posts, me.email, me.name])

  const myPostMap = useMemo(() => {
    const m = new Map<string, Post>()
    myPosts.forEach(p => m.set(p.id, p))
    return m
  }, [myPosts])

  // Stable key so we only refetch/resubscribe when the *set* of my posts changes.
  const myPostKey = useMemo(() => myPosts.map(p => p.id).sort().join(','), [myPosts])

  // Fetch + live-subscribe to detailed change activity on my tagged posts.
  useEffect(() => {
    const ids = myPostKey ? myPostKey.split(',') : []
    if (ids.length === 0) { setPostActivity([]); return }

    let cancelled = false
    const supabase = sb()
    supabase
      .from('post_comments')
      .select('*')
      .in('post_id', ids)
      .eq('type', 'activity')
      .order('created_at', { ascending: false })
      .limit(60)
      .then(({ data }: { data: ActivityRow[] | null }) => {
        if (!cancelled) setPostActivity(data ?? [])
      })

    const idSet = new Set(ids)
    const channel = supabase
      // Unique per post-set so re-subscribing (when my posts change) doesn't
      // collide with the channel being torn down.
      .channel(`notif:post_comments:${myPostKey}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments' },
        (payload: { new: ActivityRow }) => {
          if (cancelled) return
          const row = payload.new
          if ((row.type ?? 'comment') !== 'activity') return
          if (!idSet.has(row.post_id)) return
          setPostActivity(prev => (prev.some(r => r.id === row.id) ? prev : [row, ...prev]))
        },
      )
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [myPostKey])

  // Comments that @mention me — email-independent in-app notifications.
  useEffect(() => {
    if (!me.email) return
    let cancelled = false
    const supabase = sb()
    supabase
      .from('post_comments')
      .select('*')
      .contains('mentions', [me.email])
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data }: { data: ActivityRow[] | null }) => {
        if (!cancelled) setMyMentions(data ?? [])
      })

    const channel = supabase
      .channel('notif:mentions')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'post_comments' },
        (payload: { new: ActivityRow }) => {
          if (cancelled) return
          const row = payload.new
          if (!(row.mentions ?? []).map(x => x.toLowerCase()).includes(me.email)) return
          setMyMentions(prev => (prev.some(r => r.id === row.id) ? prev : [row, ...prev]))
        },
      )
      .subscribe()

    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [me.email])

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) setLastSeen(parseInt(saved, 10))
    } catch {}
  }, [])

  useEffect(() => {
    if (!open) return
    function onMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    return () => document.removeEventListener('mousedown', onMouseDown)
  }, [open])

  // Mark all as read when popup closes (but not on initial render)
  useEffect(() => {
    if (open) { wasOpenedRef.current = true; return }
    if (!wasOpenedRef.current) return
    const now = Date.now()
    setLastSeen(now)
    try { localStorage.setItem(STORAGE_KEY, String(now)) } catch {}
  }, [open])

  function markAllRead() {
    const now = Date.now()
    setLastSeen(now)
    try { localStorage.setItem(STORAGE_KEY, String(now)) } catch {}
  }

  // Build the personalized feed:
  //  1) Detailed change activity on posts I'm tagged in (who + what changed).
  //  2) "You were tagged" events from the global log addressed to me.
  const notifs = useMemo<Notif[]>(() => {
    const out: Notif[] = []

    postActivity.forEach(r => {
      const post = myPostMap.get(r.post_id)
      out.push({
        id: r.id,
        at: r.created_at,
        author: r.author_name || r.author_email || t('Seseorang'),
        text: r.body,
        postTitle: post?.title,
      })
    })

    myMentions.forEach(r => {
      const post = posts.find(p => p.id === r.post_id)
      out.push({
        id: `mention-${r.id}`,
        at: r.created_at,
        author: r.author_name || r.author_email || t('Seseorang'),
        text: t('me-mention kamu di komentar'),
        postTitle: post?.title,
        tag: true,
      })
    })

    // Tag notifications (incl. brand-new posts where I was tagged on create).
    const nameLc = me.name.toLowerCase()
    const localpart = me.email.split('@')[0]
    activity.forEach(a => {
      if (!a.message.startsWith('🔔')) return
      const m = a.message.toLowerCase()
      const mine = (nameLc && m.includes(nameLc)) || (localpart && m.includes(localpart.toLowerCase()))
      if (!mine) return
      out.push({ id: a.id, at: a.created_at, author: a.user_name, text: a.message, tag: true })
    })

    return out
      .filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 30)
  }, [postActivity, myMentions, myPostMap, posts, activity, me.name, me.email])

  const unread = notifs.filter(n => new Date(n.at).getTime() > lastSeen).length

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(p => !p)}
        style={{
          height: BTN_H, width: BTN_H, display: 'flex', alignItems: 'center', justifyContent: 'center',
          borderRadius: 8, background: 'transparent', border: '1px solid var(--border)',
          color: 'var(--text2)', cursor: 'pointer', position: 'relative', flexShrink: 0,
        }}
        onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
        onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        title={t('Notifikasi')}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span
            style={{
              position: 'absolute', top: -4, right: -4, minWidth: 16, height: 16, borderRadius: 8,
              background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', pointerEvents: 'none',
            }}
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div
          className="animate-slide-up"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 4px)', width: 340,
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
            boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 999,
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 14px', borderBottom: '1px solid var(--border)',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('Notifikasi')}</span>
            {unread > 0 && (
              <button
                onClick={markAllRead}
                style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {t('Tandai semua dibaca')}
              </button>
            )}
          </div>

          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {notifs.length === 0 ? (
              <div style={{ padding: '24px 14px', textAlign: 'center', color: 'var(--text2)', fontSize: 13, lineHeight: 1.6 }}>
                {t('Belum ada notifikasi.')}<br />
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                  {t('Notifikasi muncul saat Anda di-tag atau ada perubahan pada post yang men-tag Anda.')}
                </span>
              </div>
            ) : (
              notifs.map(item => {
                const isUnread = new Date(item.at).getTime() > lastSeen
                return (
                  <div
                    key={item.id}
                    style={{
                      padding: '10px 14px', borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'rgba(108,99,255,0.06)' : 'transparent',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: item.tag ? 'linear-gradient(135deg,#f59e0b,#ef4444)' : 'linear-gradient(135deg,#6c63ff,#a855f7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: 12, fontWeight: 700, color: '#fff', flexShrink: 0,
                      }}
                    >
                      {item.tag ? '🔔' : (item.author || 'S').slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>
                        {item.tag ? (
                          item.text
                        ) : (
                          <>
                            <strong style={{ color: 'var(--text)' }}>{item.author}</strong> {item.text}
                          </>
                        )}
                      </div>
                      <div style={{ fontSize: 10.5, color: 'var(--text2)', marginTop: 3 }}>
                        {item.postTitle && (
                          <span style={{ color: 'var(--text3)' }}>{t('pada')} &ldquo;{item.postTitle}&rdquo; · </span>
                        )}
                        {relativeTime(item.at)}
                      </div>
                    </div>
                    {isUnread && (
                      <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', marginTop: 5, flexShrink: 0 }} />
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
