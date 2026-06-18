'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { taskIdFromChatRoom } from '@/lib/access'
import type { Post } from '@/lib/types'

// A task's discussion is a full chat room (chat_messages) keyed
// "task.<projectSlug>.<postId>" — same features as a project room. A task only
// appears in the room's task list once it has at least one (non-deleted) message.
// Unread / mentions derive from chat_messages vs the account's chat_reads, exactly
// like a normal room.

export interface TaskThreadItem {
  post: Post
  count: number          // non-deleted messages
  lastAt: string | null  // newest message time
  unread: number         // messages after my last_read_at, not authored by me
  mentionUnread: number  // unread messages that @mention me
}

const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient
let chanSeq = 0

// Per-account "clear chat" for a task: hides it from THIS account's list until a
// new message arrives (the thread/history itself is never deleted). Stored in
// task_comment_reads.cleared_at, keyed by post id. A small pub/sub keeps every
// task-thread view (room list + open thread) in sync after a clear.
const readListeners = new Set<() => void>()
function notifyTaskReads() { readListeners.forEach(fn => { try { fn() } catch { /* ignore */ } }) }
export function onTaskReadsChanged(fn: () => void) { readListeners.add(fn); return () => { readListeners.delete(fn) } }
export async function clearTaskChat(email: string, postId: string) {
  if (!email) return
  const now = new Date().toISOString()
  await sb().from('task_comment_reads').upsert(
    { email, post_id: postId, cleared_at: now, last_read_at: now },
    { onConflict: 'email,post_id' },
  )
  notifyTaskReads()
}

interface MsgMeta { at: string; mine: boolean; mentionsMe: boolean; deleted: boolean }

export function useTaskThreads(projectSlug: string, meEmail: string) {
  const allPosts = useStore(s => s.posts)
  const meLower = meEmail.toLowerCase()
  const roomPrefix = `task.${projectSlug}.`

  const tasks = useMemo(
    () => allPosts.filter(p => p.entity === projectSlug && !p.deleted_at),
    [allPosts, projectSlug],
  )
  const postById = useMemo(() => {
    const m = new Map<string, Post>()
    for (const p of tasks) m.set(p.id, p)
    return m
  }, [tasks])

  const [meta, setMeta] = useState<Record<string, MsgMeta[]>>({}) // postId → messages
  const [reads, setReads] = useState<Record<string, string | null>>({}) // postId → last_read_at
  const [cleared, setCleared] = useState<Record<string, string | null>>({}) // postId → cleared_at

  const loadMeta = useCallback(async () => {
    const { data } = await sb()
      .from('chat_messages')
      .select('room, author_email, created_at, mentions, deleted_at')
      .like('room', roomPrefix + '%')
    const m: Record<string, MsgMeta[]> = {}
    for (const r of (data ?? []) as { room: string; author_email: string | null; created_at: string; mentions: string[] | null; deleted_at: string | null }[]) {
      const pid = taskIdFromChatRoom(r.room)
      if (!pid) continue
      ;(m[pid] ??= []).push({
        at: r.created_at,
        mine: (r.author_email ?? '').toLowerCase() === meLower,
        mentionsMe: (r.mentions ?? []).some(x => x.toLowerCase() === meLower),
        deleted: !!r.deleted_at,
      })
    }
    setMeta(m)
  }, [roomPrefix, meLower])

  const loadReads = useCallback(async () => {
    if (!meEmail) return
    const { data } = await sb().from('chat_reads').select('room, last_read_at').eq('email', meEmail).like('room', roomPrefix + '%')
    const r: Record<string, string | null> = {}
    for (const row of (data ?? []) as { room: string; last_read_at: string | null }[]) {
      const pid = taskIdFromChatRoom(row.room)
      if (pid) r[pid] = row.last_read_at
    }
    setReads(r)
  }, [meEmail, roomPrefix])

  const loadCleared = useCallback(async () => {
    if (!meEmail) return
    const { data } = await sb().from('task_comment_reads').select('post_id, cleared_at').eq('email', meEmail)
    const c: Record<string, string | null> = {}
    for (const row of (data ?? []) as { post_id: string; cleared_at: string | null }[]) c[row.post_id] = row.cleared_at
    setCleared(c)
  }, [meEmail])

  useEffect(() => { loadMeta() }, [loadMeta])
  useEffect(() => { loadReads() }, [loadReads])
  useEffect(() => { loadCleared() }, [loadCleared])
  useEffect(() => onTaskReadsChanged(loadCleared), [loadCleared])

  // Realtime: a new/edited/deleted message or a read in any of this project's task
  // rooms refreshes the list (auth the socket so RLS streams the events).
  useEffect(() => {
    const supabase = sb()
    let cancelled = false
    let channel: ReturnType<typeof supabase.channel> | null = null
    // A FRESH unique name per effect run. Subscribe is async (inside the session
    // .then), so under StrictMode's mount→unmount→remount a stable name would let
    // the remount grab the first run's still-subscribed channel and throw
    // "cannot add postgres_changes after subscribe()". A new name each run avoids
    // any collision; cleanup removes exactly this run's channel.
    const chanName = `task-threads:${projectSlug}:${++chanSeq}`
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(token)
      channel = supabase
        .channel(chanName)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages' }, payload => {
          const row = (payload.new ?? payload.old) as { room?: string }
          if (row?.room && row.room.startsWith(roomPrefix)) loadMeta()
        })
        .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reads' }, payload => {
          const row = (payload.new ?? payload.old) as { room?: string }
          if (row?.room && row.room.startsWith(roomPrefix)) loadReads()
        })
        .subscribe()
    })
    const auth = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.access_token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(s.access_token)
    })
    return () => {
      cancelled = true
      auth.data.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [projectSlug, roomPrefix, loadMeta, loadReads])

  // Optimistic read clear; ChatRoom POSTs the authoritative read on open and the
  // chat_reads subscription reconciles.
  const markRead = useCallback((postId: string) => {
    setReads(prev => ({ ...prev, [postId]: new Date().toISOString() }))
  }, [])
  // Per-account clear: hide this task from my list until a new message arrives.
  const clearChat = useCallback((postId: string) => {
    const now = new Date().toISOString()
    setCleared(prev => ({ ...prev, [postId]: now }))
    setReads(prev => ({ ...prev, [postId]: now }))
    void clearTaskChat(meEmail, postId)
  }, [meEmail])

  const items: TaskThreadItem[] = useMemo(() => {
    const out: TaskThreadItem[] = []
    for (const [pid, msgs] of Object.entries(meta)) {
      const post = postById.get(pid)
      if (!post) continue
      const clearedAt = cleared[pid] ?? null
      const visible = msgs.filter(c => !c.deleted && (!clearedAt || c.at > clearedAt))
      if (visible.length === 0) continue // no chat (or cleared, nothing new) → hidden
      const lastRead = reads[pid] ?? null
      const lastAt = visible.reduce((mx, c) => (c.at > mx ? c.at : mx), '')
      const isUnread = (c: MsgMeta) => !c.mine && (!lastRead || c.at > lastRead)
      const unread = visible.filter(isUnread).length
      const mentionUnread = visible.filter(c => c.mentionsMe && isUnread(c)).length
      out.push({ post, count: visible.length, lastAt, unread, mentionUnread })
    }
    return out.sort((a, b) => (b.lastAt ?? '').localeCompare(a.lastAt ?? ''))
  }, [meta, reads, cleared, postById])

  const totalUnread = useMemo(() => items.filter(i => i.unread > 0).length, [items])

  return { items, totalUnread, markRead, clearChat }
}
