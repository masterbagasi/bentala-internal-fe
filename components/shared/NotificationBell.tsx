'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { useRouter } from 'next/navigation'
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
  postId?: string
  href?: string
}

// Which board route a post lives on (so a notification can deep-link to it).
function postHref(post: Post | undefined): string | null {
  if (!post) return null
  if (post.entity === 'bpi') return '/bpi'
  if (post.entity === 'bsi') return '/bsi'
  const pics = post.pics || []
  if (pics.includes('Video Production')) return '/bpi-faizal'
  if (pics.includes('Design Studio')) return '/bpi-reinaldi'
  return '/bpi'
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
  const router = useRouter()
  const posts = useStore(s => s.posts)

  const [open, setOpen] = useState(false)
  const [lastSeen, setLastSeen] = useState<number>(0)
  const [me, setMe] = useState<{ email: string; name: string }>({ email: '', name: '' })
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

  // Click a notification → go to its post (deep-link opens the post preview).
  function openNotif(item: Notif) {
    if (!item.href || !item.postId) return
    setOpen(false)
    router.push(`${item.href}?post=${item.postId}`)
  }

  // Build the personalized feed:
  //  1) Detailed change activity on posts I'm tagged in (who + what changed).
  //  2) "You were tagged" events from the global log addressed to me.
  const notifs = useMemo<Notif[]>(() => {
    const out: Notif[] = []

    myMentions.forEach(r => {
      const post = posts.find(p => p.id === r.post_id)
      out.push({
        id: `mention-${r.id}`,
        at: r.created_at,
        author: r.author_name || r.author_email || t('Seseorang'),
        text: t('me-mention kamu di komentar'),
        postTitle: post?.title,
        postId: r.post_id,
        href: postHref(post) ?? undefined,
      })
    })

    // Post tags — derived directly from the posts where I'm tagged (reliable,
    // realtime via the store). Timestamp uses updated_at so being (re)tagged
    // when a post is saved surfaces it as a fresh notification.
    myPosts.forEach(p => {
      out.push({
        id: `tag-${p.id}`,
        at: p.updated_at || p.created_at,
        author: p.created_by || t('Seseorang'),
        text: t('Anda di-tag pada post ini'),
        postTitle: p.title,
        tag: true,
        postId: p.id,
        href: postHref(p) ?? undefined,
      })
    })

    return out
      .filter((n, i, arr) => arr.findIndex(x => x.id === n.id) === i)
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, 30)
  }, [myMentions, myPosts, posts, me.name, me.email])

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
            maxWidth: 'min(340px, 92vw)',
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
                  {t('Notifikasi muncul saat Anda di-tag pada post atau di-mention di komentar.')}
                </span>
              </div>
            ) : (
              notifs.map(item => {
                const isUnread = new Date(item.at).getTime() > lastSeen
                return (
                  <div
                    key={item.id}
                    onClick={() => openNotif(item)}
                    style={{
                      padding: '10px 14px', borderBottom: '1px solid var(--border)',
                      background: isUnread ? 'rgba(108,99,255,0.06)' : 'transparent',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      cursor: item.href ? 'pointer' : 'default',
                      transition: 'background 0.12s',
                    }}
                    onMouseOver={e => { if (item.href) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                    onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = isUnread ? 'rgba(108,99,255,0.06)' : 'transparent' }}
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
