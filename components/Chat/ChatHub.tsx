'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ChatRoom } from './ChatRoom'
import { useTaskThreads } from './useTaskThreads'
import { TaskThreadPanel } from './TaskThreads'
import { PostPreviewModal } from '@/components/BPI/PostPreviewModal'
import { ConfirmDialog } from '@/components/shared/Modal'
import { POST_STATUS_COLORS, POST_STATUS_LABELS } from '@/lib/constants'
import { getSupabase } from '@/lib/supabase'
import type { Post } from '@/lib/types'
import { useSocmedProjects } from '@/lib/socmed-projects'
import { projectGlyph } from '@/lib/project-glyph'
import { useT } from '@/lib/i18n/LanguageProvider'
import { isEffectiveSuperAdmin, normaliseSections, canAccessChat } from '@/lib/access'
import { useIsMobile } from '@/hooks/useIsMobile'
/* eslint-disable @typescript-eslint/no-explicit-any */

type RoomSummary = {
  lastBody: string; lastAt: string | null; lastAuthorEmail: string
  lastAuthorName: string; lastIsAttachment: boolean; unread: number; mentions: number
}
type Overview = Record<string, RoomSummary>

// "now" / "4m" / "3h" / "2d" / "12 Jun" — compact, WhatsApp-style.
function relTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return ''
  const diff = Date.now() - ms
  if (diff < 60_000) return 'now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`
  if (diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d`
  return new Date(ms).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

// Square avatar with the project glyph over its brand colour — same language as
// the sidebar's BrandGlyph so a room reads identically across the app.
function RoomAvatar({ glyph, color, size = 46 }: { glyph: string; color: string; size?: number }) {
  const txt = (glyph || '?').slice(0, 2)
  return (
    <div style={{
      width: size, height: size, borderRadius: size * 0.32, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: `linear-gradient(150deg, ${color}, ${color}cc)`,
      color: '#fff', fontWeight: 800, fontSize: size * 0.34, letterSpacing: '-0.02em',
      boxShadow: `0 3px 10px ${color}40`,
    }}>
      {txt}
    </div>
  )
}

export function ChatHub() {
  const t = useT()
  const isMobile = useIsMobile()
  const projects = useSocmedProjects(true) // active projects only — matches the sidebar

  const [me, setMe] = useState<{ email: string; name: string; super: boolean; fullBypass: boolean } | null>(null)
  const [allowed, setAllowed] = useState<Set<string>>(new Set())
  const [accessLoaded, setAccessLoaded] = useState(false)
  const [overview, setOverview] = useState<Overview>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  // Which rooms have their task sub-list expanded, and the open task thread
  // (shown in the conversation pane, replacing the room's general chat).
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [taskOpen, setTaskOpen] = useState<Post | null>(null)

  // Resolve the logged-in user + their access grants (super admins see all), and
  // keep the room list in sync in realtime: when an admin saves new chat grants
  // for this account, the visible rooms update with no refresh. menu_access RLS
  // scopes to the caller's own row, so only their change arrives.
  useEffect(() => {
    let cancelled = false
    const sb = getSupabase()
    const loadAccess = async () => {
      const { data } = await sb.auth.getUser()
      const u = data.user
      const email = u?.email ?? ''
      const m = (u?.user_metadata ?? {}) as Record<string, unknown>
      const name = (m.full_name as string) || (m.name as string) || email.split('@')[0]
      const sup = isEffectiveSuperAdmin(u?.email, (u?.app_metadata as Record<string, unknown> | undefined)?.role)
      let row: { sections?: unknown } | null = null
      try {
        const res = await sb.from('menu_access').select('sections').limit(1).maybeSingle()
        row = (res.data as { sections?: unknown } | null) ?? null
      } catch { row = null }
      if (cancelled) return
      // Configured super admins are gated by their chat grants like everyone else;
      // a super with no row yet (unconfigured) still sees all rooms.
      setMe({ email, name, super: sup, fullBypass: sup && row === null })
      setAllowed(new Set(normaliseSections(row?.sections)))
      setAccessLoaded(true)
    }
    loadAccess()

    let channel: ReturnType<typeof sb.channel> | null = null
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (sb.realtime as { setAuth: (t: string) => void }).setAuth(token)
      channel = sb.channel('chat:menu-access')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_access' }, () => loadAccess())
        .subscribe()
    })
    const auth = sb.auth.onAuthStateChange((_e, s) => {
      if (s?.access_token) (sb.realtime as { setAuth: (t: string) => void }).setAuth(s.access_token)
    })
    return () => {
      cancelled = true
      auth.data.subscription.unsubscribe()
      if (channel) sb.removeChannel(channel)
    }
  }, [])

  // Rooms = socmed projects the user may chat in.
  const rooms = useMemo(
    () => (!accessLoaded ? [] : projects.filter(p => me?.fullBypass || canAccessChat(allowed, p.slug))),
    [projects, allowed, accessLoaded, me?.fullBypass],
  )

  // Per-room summary (last message + unread), seeded once and kept live via a
  // chat_messages subscription. setAuth is REQUIRED: chat RLS only streams events
  // to an authenticated socket (otherwise the list never updates without reload).
  useEffect(() => {
    let cancelled = false
    const load = () => fetch('/api/chat/overview')
      .then(r => (r.ok ? r.json() : { rooms: {} }))
      .then(d => { if (!cancelled) setOverview(d.rooms ?? {}) })
      .catch(() => {})
    load()
    const sb = getSupabase()
    let channel: ReturnType<typeof sb.channel> | null = null
    sb.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (sb.realtime as { setAuth: (t: string) => void }).setAuth(token)
      channel = sb.channel('chat:overview')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, () => load())
        // Reading general chat (chat_reads) clears its unread + mention badge.
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, () => load())
        .subscribe()
    })
    const auth = sb.auth.onAuthStateChange((_e, s) => {
      if (s?.access_token) (sb.realtime as { setAuth: (t: string) => void }).setAuth(s.access_token)
    })
    return () => {
      cancelled = true
      auth.data.subscription.unsubscribe()
      if (channel) sb.removeChannel(channel)
    }
  }, [])

  const sortByActivity = useMemo(() => (a: { slug: string; name: string }, b: { slug: string; name: string }) => {
    const ta = overview[a.slug]?.lastAt ? Date.parse(overview[a.slug]!.lastAt!) : 0
    const tb = overview[b.slug]?.lastAt ? Date.parse(overview[b.slug]!.lastAt!) : 0
    if (tb !== ta) return tb - ta
    return a.name.localeCompare(b.name)
  }, [overview])

  const list = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rooms.filter(p => !q || p.name.toLowerCase().includes(q)).slice().sort(sortByActivity)
  }, [rooms, search, sortByActivity])

  // On desktop, auto-open the most-active room once rooms are known.
  const didAutoSelect = useRef(false)
  useEffect(() => {
    if (didAutoSelect.current || isMobile || !list.length) return
    didAutoSelect.current = true
    setSelected(list[0].slug)
  }, [list, isMobile])

  // If access to the open room is revoked in realtime, drop the selection so the
  // user falls back to the list (mobile) / placeholder (desktop).
  useEffect(() => {
    if (selected && accessLoaded && !rooms.some(p => p.slug === selected)) setSelected(null)
  }, [rooms, selected, accessLoaded])

  const openRoom = (slug: string) => {
    setSelected(slug)
    setTaskOpen(null) // open general chat (Obrolan), not a task thread
    // Optimistically clear the unread badge; ChatRoom marks it read on mount, and
    // the chat_reads subscription reloads the overview (clearing general mentions
    // too). Task-chat mentions stay until those task threads are opened.
    setOverview(o => (o[slug] ? { ...o, [slug]: { ...o[slug], unread: 0 } } : o))
  }
  const toggleExpand = (slug: string) => setExpanded(prev => {
    const n = new Set(prev)
    if (n.has(slug)) n.delete(slug); else n.add(slug)
    return n
  })
  const openTask = (post: Post) => {
    setSelected(post.entity)
    setExpanded(prev => new Set(prev).add(post.entity))
    setTaskOpen(post)
  }

  const selProject = rooms.find(p => p.slug === selected)
  const totalUnread = Object.values(overview).reduce((n, r) => n + (r.unread || 0), 0)

  const previewText = (s?: RoomSummary): string => {
    if (!s || (!s.lastBody && !s.lastIsAttachment)) return t('Belum ada pesan')
    // Prefix the sender so you can see WHO chatted last ("Anda" for yourself, the
    // first name otherwise) — e.g. "Dandi: postingan pajak".
    const who = me && s.lastAuthorEmail === me.email
      ? t('Anda')
      : (s.lastAuthorName || s.lastAuthorEmail.split('@')[0] || '').split(' ')[0]
    const msg = s.lastIsAttachment && !s.lastBody ? t('📎 Lampiran') : s.lastBody
    return who ? `${who}: ${msg}` : msg
  }

  return (
    <div style={{
      flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden',
      borderRadius: isMobile ? 0 : 14, border: isMobile ? 'none' : '1px solid var(--border)',
      background: 'var(--bg2)',
    }}>
      {/* ── Room list ── */}
      {(!isMobile || !selected) && (
        <aside style={{
          width: isMobile ? '100%' : 340, flexShrink: 0, minHeight: 0,
          display: 'flex', flexDirection: 'column',
          borderRight: isMobile ? 'none' : '1px solid var(--border)', background: 'var(--bg1)',
        }}>
          <div style={{ padding: '16px 16px 10px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)', letterSpacing: '-0.02em' }}>{t('Pesan')}</span>
            {totalUnread > 0 && (
              <span style={{ fontSize: 11, fontWeight: 800, color: '#fff', background: 'var(--accent)', borderRadius: 999, padding: '1px 8px' }}>{totalUnread}</span>
            )}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>{rooms.length} {t('room')}</span>
          </div>

          <div style={{ padding: '0 12px 10px' }}>
            <div style={{ position: 'relative' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)' }}>
                <circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('Cari room…')}
                style={{
                  width: '100%', padding: '9px 12px 9px 32px', fontSize: 13,
                  background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10,
                  color: 'var(--text)', outline: 'none',
                }}
              />
            </div>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '2px 8px 12px' }}>
            {!accessLoaded ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Memuat…')}</div>
            ) : !list.length ? (
              <div style={{ padding: 24, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>
                {search ? t('Tidak ada room yang cocok.') : t('Belum ada room chat.')}
              </div>
            ) : list.map(p => {
              const s = overview[p.slug]
              // Only one thing is "selected": the room (general chat) OR a task
              // under it — never both. When a task is open, the room row is not
              // highlighted (the task row is).
              const active = p.slug === selected && !taskOpen
              const isExp = expanded.has(p.slug)
              return (
                <div key={p.slug} style={{ marginBottom: 2 }}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => openRoom(p.slug)}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRoom(p.slug) } }}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 12,
                    padding: '10px 10px', borderRadius: 12, cursor: 'pointer',
                    background: active ? 'var(--bg3)' : 'transparent', border: '1px solid ' + (active ? 'var(--border)' : 'transparent'),
                    textAlign: 'left', transition: 'background 0.12s',
                  }}
                  onMouseOver={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }}
                  onMouseOut={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <RoomAvatar glyph={p.glyph || projectGlyph(p.name)} color={p.color} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                      <span style={{ flexShrink: 0, fontSize: 11, color: s?.unread ? 'var(--accent)' : 'var(--text3)', fontWeight: s?.unread ? 700 : 400 }}>{relTime(s?.lastAt ?? null)}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{previewText(s)}</span>
                      {!!s?.mentions && (
                        <span title={t('Anda di-mention di room ini')} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                          <span style={{ color: '#22c55e', fontSize: 14, fontWeight: 800, lineHeight: 1 }}>@</span>
                          <span style={{ minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: '#22c55e', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.mentions > 99 ? '99+' : s.mentions}</span>
                        </span>
                      )}
                      {!!s?.unread && (
                        <span style={{ flexShrink: 0, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 999, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{s.unread > 99 ? '99+' : s.unread}</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={e => { e.stopPropagation(); toggleExpand(p.slug) }}
                    title={isExp ? t('Sembunyikan task') : t('Lihat task')}
                    style={{ flexShrink: 0, width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', borderRadius: 6 }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isExp ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="9 18 15 12 9 6" /></svg>
                  </button>
                </div>
                {me && (
                  <RoomTaskList
                    room={p.slug}
                    meEmail={me.email}
                    activeId={taskOpen?.id ?? null}
                    onOpen={openTask}
                    collapsed={!isExp}
                    onAutoExpand={() => setExpanded(prev => (prev.has(p.slug) ? prev : new Set(prev).add(p.slug)))}
                  />
                )}
                </div>
              )
            })}
          </div>
        </aside>
      )}

      {/* ── Conversation ── */}
      {(!isMobile || selected) && (
        <section style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg2)' }}>
          {selProject && me ? (
            <>
              <header style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 12, padding: isMobile ? '10px 12px' : '12px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
                {isMobile && (
                  <button onClick={() => { setTaskOpen(null); setSelected(null) }} aria-label={t('Kembali')} style={{ background: 'none', border: 'none', color: 'var(--text)', cursor: 'pointer', display: 'flex', padding: 4, marginLeft: -4 }}>
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
                  </button>
                )}
                <RoomAvatar glyph={selProject.glyph || projectGlyph(selProject.name)} color={selProject.color} size={38} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selProject.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{t('Room tim Socmed Management')}</div>
                </div>
              </header>
              <div style={{ flex: 1, minHeight: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column', padding: isMobile ? '6px 8px 0' : '14px 16px 0' }}>
                {taskOpen ? (
                  <TaskThreadPanel key={taskOpen.id} post={taskOpen} onBack={() => setTaskOpen(null)} meEmail={me.email} meName={me.name} meSuper={me.super} />
                ) : (
                  /* key=slug → remount on room switch so state/subscriptions reset cleanly */
                  <ChatRoom key={selProject.slug} room={selProject.slug} roomName={selProject.name} meEmail={me.email} meName={me.name} meSuper={me.super} />
                )}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text3)', padding: 24, textAlign: 'center' }}>
              <div style={{ width: 64, height: 64, borderRadius: 18, background: 'var(--bg3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8A8.5 8.5 0 0 1 12.5 3 8.5 8.5 0 0 1 21 11.5z" /></svg>
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text2)' }}>{t('Pilih room untuk mulai chat')}</div>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

// Task threads listed under their project room in the message list. Each row
// opens that task's discussion thread in the conversation pane.
function RoomTaskList({ room, meEmail, activeId, onOpen, collapsed, onAutoExpand }: {
  room: string
  meEmail: string
  activeId: string | null
  onOpen: (post: Post) => void
  collapsed: boolean
  onAutoExpand: () => void
}) {
  const t = useT()
  const { items, markRead, clearChat } = useTaskThreads(room, meEmail)
  const [detailPost, setDetailPost] = useState<Post | null>(null)
  const [confirmClear, setConfirmClear] = useState<Post | null>(null)

  // Auto-open the group when a NEW task chat arrives (total unread increases) —
  // never on initial load or while the count is stable, so a manual collapse
  // isn't immediately undone. The hook runs even while collapsed, so an incoming
  // chat is detected and the group pops open on its own.
  const incoming = items.reduce((s, i) => s + i.unread, 0)
  const prevIncoming = useRef(incoming)
  useEffect(() => {
    if (incoming > prevIncoming.current && collapsed) onAutoExpand()
    prevIncoming.current = incoming
  }, [incoming, collapsed, onAutoExpand])

  if (collapsed) return null
  if (items.length === 0) {
    return <div style={{ margin: '2px 6px 8px 28px', paddingLeft: 16, borderLeft: '1px solid var(--border)', fontSize: 12, color: 'var(--text3)' }}>{t('Belum ada chat task.')}</div>
  }
  const iconBtn: React.CSSProperties = { flexShrink: 0, width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', borderRadius: 6 }
  return (
    <div style={{ margin: '2px 6px 8px 28px', paddingLeft: 12, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 2 }}>
      {items.map(it => {
        const color = POST_STATUS_COLORS[it.post.status] || '#8b8fa8'
        const label = POST_STATUS_LABELS[it.post.status] || it.post.status
        const active = it.post.id === activeId
        return (
          <div
            key={it.post.id}
            role="button"
            tabIndex={0}
            onClick={() => { markRead(it.post.id); onOpen(it.post) }}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); markRead(it.post.id); onOpen(it.post) } }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px',
              borderRadius: 9, cursor: 'pointer', textAlign: 'left',
              background: active ? 'var(--bg3)' : 'transparent', border: '1px solid ' + (active ? 'var(--border)' : 'transparent'),
            }}
            onMouseOver={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg2)' }}
            onMouseOut={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.post.title || t('(Tanpa judul)')}</span>
            <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 999, whiteSpace: 'nowrap', color, background: color + '1f', border: `1px solid ${color}55` }}>{label}</span>
            {it.mentionUnread > 0 && (
              <span title={t('Anda di-mention')} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                <span style={{ color: '#22c55e', fontSize: 13, fontWeight: 800, lineHeight: 1 }}>@</span>
                <span style={{ minWidth: 16, height: 16, padding: '0 4px', borderRadius: 999, background: '#22c55e', color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.mentionUnread}</span>
              </span>
            )}
            {it.unread > 0 && <span style={{ flexShrink: 0, minWidth: 17, height: 17, padding: '0 4px', borderRadius: 999, background: 'var(--accent2)', color: '#fff', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{it.unread}</span>}
            <button
              onClick={e => { e.stopPropagation(); setDetailPost(it.post) }}
              title={t('Detail task')}
              style={iconBtn}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
            </button>
            <button
              onClick={e => { e.stopPropagation(); setConfirmClear(it.post) }}
              title={t('Hapus chat task ini (untuk Anda)')}
              style={iconBtn}
              onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent2)' }}
              onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text3)' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
            </button>
          </div>
        )
      })}
      {detailPost && (
        <PostPreviewModal open postId={detailPost.id} canEdit={false} onClose={() => setDetailPost(null)} onEdit={() => {}} />
      )}

      <ConfirmDialog
        open={!!confirmClear}
        danger
        title={t('Hapus Chat Task')}
        confirmLabel={t('Hapus')}
        cancelLabel={t('Batal')}
        onCancel={() => setConfirmClear(null)}
        onConfirm={() => { if (confirmClear) clearChat(confirmClear.id); setConfirmClear(null) }}
        message={t('Hapus chat task ini dari daftar Anda? Hanya hilang untuk Anda dan akan muncul lagi saat ada chat baru.')}
      />
    </div>
  )
}
