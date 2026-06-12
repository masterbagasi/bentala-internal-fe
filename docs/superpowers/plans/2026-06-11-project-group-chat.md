# Project Group Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A persistent, realtime group chat room per socmed project, with members auto-derived from project access and an unread badge in the sidebar.

**Architecture:** Mirror the existing `PostComments` pattern — messages persist in a Postgres table (`chat_messages`), live updates arrive via Supabase `postgres_changes` subscriptions. A second table (`chat_reads`) tracks per-user last-read for the unread badge. Room membership = "has `smm.<slug>.social` OR `smm.<slug>.projects` access, or super admin", enforced in middleware, API routes, and RLS (RLS is mandatory because realtime subscriptions bypass the server).

**Tech Stack:** Next.js 14 App Router, Supabase (Postgres + Auth + Realtime + RLS), TypeScript, React. No unit-test framework exists — verification uses `tsc --noEmit`, one-off Node scripts for pure logic, and explicit in-app runtime checks.

**Note on migrations:** Schema changes go to the shared **production** Supabase (project ref `gbmqudkkuzpqykmyrkqc`). Applying them requires explicit user authorization each time (the safety classifier blocks unauthorized prod DDL). Task 1 calls this out.

**Conventions observed in this codebase:**
- Untyped client cast: `const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient` (see `components/Social/AccountsView.tsx`).
- Realtime: `sb().channel(name).on('postgres_changes', {...}, cb).subscribe()`, cleanup via `removeChannel` (see `components/BPI/PostComments.tsx:192-208`).
- Server auth: `createServerSupabase().auth.getUser()`; super-admin check `isEffectiveSuperAdmin(email, role)` (see `app/api/social/instagram/analytics/route.ts`).
- i18n: wrap user-facing Indonesian strings in `t('...')` from `useT()`; add English to `lib/i18n/dictionary.ts`.
- Styling: inline styles with CSS vars (`var(--bg2)`, `var(--accent)`, `var(--text)`, etc.).

---

## File Structure

**Create:**
- `app/api/chat/[room]/route.ts` — GET (list messages, paginated) + POST (send message), access-gated.
- `app/api/chat/[room]/read/route.ts` — POST mark room read.
- `app/api/chat/unread/route.ts` — GET unread counts for all the caller's rooms.
- `app/(dashboard)/smm/[project]/chat/page.tsx` — chat room page (server-light wrapper).
- `components/Chat/ChatRoom.tsx` — message list + composer + realtime subscription.
- `lib/chat-access.ts` — shared `canAccessChat` / `chatRoomFromPath` helpers (re-exported via `lib/access.ts`).

**Modify:**
- `lib/access.ts` — add `chatRoomFromPath()` + `canAccessChat()` helpers.
- `middleware.ts` — gate `/smm/<slug>/chat` by social-OR-projects.
- `components/Sidebar.tsx` — add "Chat" nav item per project; access filter via `canAccessChat`; unread badge.

**DB (production migration):**
- `chat_messages`, `chat_reads` tables + realtime publication + RLS + `can_access_chat_room()` SQL function.

---

## Task 1: Database migration (tables, realtime, RLS)

**Files:**
- Apply via Supabase MCP `apply_migration` (project `gbmqudkkuzpqykmyrkqc`). Also save the SQL to `docs/sql/2026-06-11-chat.sql` for the record.

- [ ] **Step 1: Get explicit user authorization**

This migration alters the production database. Ask the user: *"Boleh saya jalankan migrasi chat (2 tabel baru + RLS) ke database produksi?"* Wait for a clear yes. (The classifier will block it otherwise.)

- [ ] **Step 2: Save the SQL to the repo**

Create `docs/sql/2026-06-11-chat.sql` with exactly:

```sql
-- Group chat: one room per socmed project (room = project slug).
create table if not exists public.chat_messages (
  id           uuid primary key default gen_random_uuid(),
  room         text not null,
  author_email text not null,
  author_name  text not null,
  body         text not null,
  created_at   timestamptz not null default now()
);
create index if not exists chat_messages_room_created_idx
  on public.chat_messages (room, created_at);

create table if not exists public.chat_reads (
  email        text not null,
  room         text not null,
  last_read_at timestamptz not null default now(),
  primary key (email, room)
);

-- Membership check used by RLS. SECURITY DEFINER so it can read menu_access
-- regardless of that table's own policies. Mirrors lib/access.ts:
--   super admin (hardcoded email OR role) OR menu_access grants
--   smm.<room>.social / smm.<room>.projects (or legacy 'smm' / bare slug).
create or replace function public.can_access_chat_room(p_room text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    lower(coalesce(auth.jwt()->>'email','')) = 'dandirivaldi@masterbagasi.com'
    or coalesce(auth.jwt()->'app_metadata'->>'role','') = 'super_admin'
    or exists (
      select 1 from public.menu_access ma
      where lower(ma.email) = lower(coalesce(auth.jwt()->>'email',''))
        and (
          ma.sections @> array['smm.'||p_room||'.social']
          or ma.sections @> array['smm.'||p_room||'.projects']
          or ma.sections @> array['smm']
          or ma.sections @> array[p_room]
        )
    );
$$;

alter table public.chat_messages enable row level security;
alter table public.chat_reads    enable row level security;

drop policy if exists chat_messages_select on public.chat_messages;
create policy chat_messages_select on public.chat_messages
  for select using ( public.can_access_chat_room(room) );

drop policy if exists chat_messages_insert on public.chat_messages;
create policy chat_messages_insert on public.chat_messages
  for insert with check (
    public.can_access_chat_room(room)
    and author_email = auth.jwt()->>'email'
  );

drop policy if exists chat_reads_rw on public.chat_reads;
create policy chat_reads_rw on public.chat_reads
  for all
  using ( email = auth.jwt()->>'email' )
  with check ( email = auth.jwt()->>'email' );

-- Live updates for both tables.
do $$ begin alter publication supabase_realtime add table public.chat_messages;
  exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.chat_reads;
  exception when duplicate_object then null; end $$;
```

- [ ] **Step 3: Apply the migration**

Call Supabase MCP `apply_migration` with `project_id: "gbmqudkkuzpqykmyrkqc"`, `name: "chat_rooms"`, and the SQL above.
Expected result: `{"success":true}`.

- [ ] **Step 4: Verify the tables exist**

Call `list_tables` (project `gbmqudkkuzpqykmyrkqc`, schema `public`, verbose true). Confirm `public.chat_messages` and `public.chat_reads` appear with the columns above and `rls_enabled: true`.

- [ ] **Step 5: Commit**

```bash
git add docs/sql/2026-06-11-chat.sql
git commit -m "feat(chat): chat_messages/chat_reads schema + RLS"
```

---

## Task 2: Access helpers

**Files:**
- Modify: `lib/access.ts` (append two exported helpers near `sectionForPath`)
- Test: `/tmp/chat-access.mjs` (one-off, not committed)

- [ ] **Step 1: Add the helpers to `lib/access.ts`**

Append after `sectionForPath` (around line 169):

```ts
/** Chat rooms live at /smm/<slug>/chat. Returns the slug, or null. */
export function chatRoomFromPath(pathname: string): string | null {
  const m = /^\/smm\/([a-z0-9-]+)\/chat(\/|$)/.exec(pathname)
  return m ? m[1] : null
}

/** A chat room is open to anyone with ANY access to that project (social OR
 *  projects). Pass the user's already-normalised sections. */
export function canAccessChat(allowed: Set<string> | string[], slug: string): boolean {
  const has = (id: string) => (Array.isArray(allowed) ? allowed.includes(id) : allowed.has(id))
  return has(`smm.${slug}.social`) || has(`smm.${slug}.projects`)
}
```

- [ ] **Step 2: Verify with a Node script**

Create `/tmp/chat-access.mjs`:

```js
function chatRoomFromPath(p){const m=/^\/smm\/([a-z0-9-]+)\/chat(\/|$)/.exec(p);return m?m[1]:null}
function canAccessChat(allowed,slug){const has=id=>Array.isArray(allowed)?allowed.includes(id):allowed.has(id);return has(`smm.${slug}.social`)||has(`smm.${slug}.projects`)}
const ok = chatRoomFromPath('/smm/bpi/chat')==='bpi'
  && chatRoomFromPath('/smm/bpi/social')===null
  && chatRoomFromPath('/smm/bpi')===null
  && canAccessChat(['smm.bpi.social'],'bpi')===true
  && canAccessChat(['smm.bpi.projects'],'bpi')===true
  && canAccessChat(['smm.bsi.social'],'bpi')===false
  && canAccessChat(new Set(['smm.bpi.projects']),'bpi')===true
console.log(ok?'PASS ✅':'FAIL ❌')
```

Run: `node /tmp/chat-access.mjs`
Expected: `PASS ✅`

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 4: Commit**

```bash
git add lib/access.ts
git commit -m "feat(chat): chatRoomFromPath + canAccessChat access helpers"
```

---

## Task 3: Middleware gating for /smm/<slug>/chat

**Files:**
- Modify: `middleware.ts:106-111` (the section-gate block) + import.

- [ ] **Step 1: Import the helpers**

Change the import block (`middleware.ts:3-8`) to add `chatRoomFromPath, canAccessChat`:

```ts
import {
  isEffectiveSuperAdmin,
  sectionForPath,
  firstAllowedLanding,
  normaliseSections,
  chatRoomFromPath,
  canAccessChat,
} from '@/lib/access'
```

- [ ] **Step 2: Special-case chat before the generic section check**

Replace `middleware.ts:106-111`:

```ts
    const section = sectionForPath(pathname)
    if (section !== null && !allowed.includes(section)) {
      const target = firstAllowedLanding(allowed) ?? '/no-access'
      // Guard against redirecting a path to itself (no-op → loop).
      if (target !== pathname) return redirectTo(target)
    }
```

with:

```ts
    // Chat rooms inherit project access: social OR projects grants entry.
    const chatRoom = chatRoomFromPath(pathname)
    if (chatRoom !== null) {
      if (!canAccessChat(allowed, chatRoom)) {
        const target = firstAllowedLanding(allowed) ?? '/no-access'
        if (target !== pathname) return redirectTo(target)
      }
    } else {
      const section = sectionForPath(pathname)
      if (section !== null && !allowed.includes(section)) {
        const target = firstAllowedLanding(allowed) ?? '/no-access'
        // Guard against redirecting a path to itself (no-op → loop).
        if (target !== pathname) return redirectTo(target)
      }
    }
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add middleware.ts
git commit -m "feat(chat): gate /smm/<slug>/chat by project access"
```

---

## Task 4: API routes (list, send, mark-read, unread counts)

**Files:**
- Create: `app/api/chat/[room]/route.ts`
- Create: `app/api/chat/[room]/read/route.ts`
- Create: `app/api/chat/unread/route.ts`

All routes read the caller's `menu_access` and gate with `canAccessChat` (server-authoritative; RLS is the second layer). Identity helper resolves display name.

- [ ] **Step 1: Create `app/api/chat/[room]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Resolve the caller, and whether they may access `room`.
async function gate(room: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) return { supabase, user }
  const { data } = await (supabase as any).from('menu_access').select('sections').limit(1).maybeSingle()
  const allowed = normaliseSections((data as { sections?: unknown } | null)?.sections)
  if (!canAccessChat(allowed, room)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { supabase, user }
}

function displayName(user: any): string {
  const m = (user.user_metadata ?? {}) as Record<string, unknown>
  return (m.full_name as string) || (m.name as string) || (user.email as string).split('@')[0]
}

// GET /api/chat/<room>?before=<iso>&limit=50  → messages ascending.
export async function GET(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const url = new URL(req.url)
  const before = url.searchParams.get('before')
  const limit = Math.min(Number(url.searchParams.get('limit')) || 50, 100)
  let q = (g.supabase as any).from('chat_messages').select('*').eq('room', params.room)
    .order('created_at', { ascending: false }).limit(limit)
  if (before) q = q.lt('created_at', before)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Return ascending for the UI.
  return NextResponse.json({ messages: ((data as any[]) ?? []).reverse() })
}

// POST /api/chat/<room>  { body }  → inserts a message authored by the caller.
export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await gate(params.room)
  if ('error' in g) return g.error
  const { body } = await req.json().catch(() => ({}))
  const text = String(body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const row = {
    room: params.room,
    author_email: g.user.email,
    author_name: displayName(g.user),
    body: text.slice(0, 4000),
  }
  const { data, error } = await (g.supabase as any).from('chat_messages').insert(row).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data })
}
```

- [ ] **Step 2: Create `app/api/chat/[room]/read/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'

/* eslint-disable @typescript-eslint/no-explicit-any */

// POST /api/chat/<room>/read  → mark the room read (last_read_at = now) for caller.
export async function POST(_req: NextRequest, { params }: { params: { room: string } }) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    const { data } = await (supabase as any).from('menu_access').select('sections').limit(1).maybeSingle()
    const allowed = normaliseSections((data as { sections?: unknown } | null)?.sections)
    if (!canAccessChat(allowed, params.room)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { error } = await (supabase as any).from('chat_reads')
    .upsert({ email: user.email, room: params.room, last_read_at: new Date().toISOString() }, { onConflict: 'email,room' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 3: Create `app/api/chat/unread/route.ts`**

```ts
import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/chat/unread → { counts: { <room>: number } } for the caller.
// RLS scopes chat_messages to rooms the caller may access, so a plain query is
// already correct without re-deriving access here.
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: reads }, { data: msgs }] = await Promise.all([
    (supabase as any).from('chat_reads').select('room,last_read_at').eq('email', user.email),
    (supabase as any).from('chat_messages').select('room,created_at,author_email'),
  ])
  const lastRead = new Map<string, string>()
  for (const r of (reads as any[]) ?? []) lastRead.set(r.room, r.last_read_at)
  const counts: Record<string, number> = {}
  for (const m of (msgs as any[]) ?? []) {
    if (m.author_email === user.email) continue            // own messages never unread
    const lr = lastRead.get(m.room)
    if (!lr || m.created_at > lr) counts[m.room] = (counts[m.room] ?? 0) + 1
  }
  return NextResponse.json({ counts })
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add app/api/chat
git commit -m "feat(chat): list/send/read/unread API routes (access-gated)"
```

---

## Task 5: Chat room UI + page

**Files:**
- Create: `components/Chat/ChatRoom.tsx`
- Create: `app/(dashboard)/smm/[project]/chat/page.tsx`
- Modify: `lib/i18n/dictionary.ts` (new strings)

- [ ] **Step 1: Create `components/Chat/ChatRoom.tsx`**

```tsx
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
  return new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso))
}

export function ChatRoom({ room, roomName, meEmail }: { room: string; roomName: string; meEmail: string }) {
  const t = useT()
  const [messages, setMessages] = useState<Msg[]>([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [hasMore, setHasMore] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
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
          setMessages(prev => (prev.some(m => m.id === row.id) ? prev : [...prev, row]))
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

  function onScroll() {
    const el = listRef.current
    if (!el) return
    atBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
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
      id: `tmp-${Date.now()}`, room, author_email: meEmail, author_name: t('Saya'),
      body, created_at: new Date().toISOString(),
    }
    atBottomRef.current = true
    setMessages(prev => [...prev, optimistic])
    try {
      const r = await fetch(`/api/chat/${encodeURIComponent(room)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body }),
      })
      const d = (await r.json()) as { message?: Msg }
      if (d.message) setMessages(prev => prev.map(m => (m.id === optimistic.id ? d.message! : m)))
    } catch {
      setMessages(prev => prev.map(m => (m.id === optimistic.id ? { ...m, body: m.body + ' ' + t('(gagal terkirim)') } : m)))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <div ref={listRef} onScroll={onScroll} style={{ flex: 1, overflowY: 'auto', minHeight: 0, padding: '8px 4px' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Memuat…')}</div>
        ) : messages.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Belum ada pesan. Mulai obrolan!')}</div>
        ) : (
          <>
            {hasMore && (
              <div style={{ textAlign: 'center', marginBottom: 10 }}>
                <button onClick={loadOlder} style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
                  {t('Muat lebih lama')}
                </button>
              </div>
            )}
            {messages.map(m => {
              const mine = m.author_email === meEmail
              return (
                <div key={m.id} style={{ display: 'flex', flexDirection: mine ? 'row-reverse' : 'row', gap: 10, margin: '10px 0', alignItems: 'flex-end' }}>
                  <span style={{ width: 32, height: 32, borderRadius: '50%', flexShrink: 0, background: mine ? 'var(--accent)' : 'var(--bg3)', color: mine ? '#fff' : 'var(--text2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                    {initials(m.author_name)}
                  </span>
                  <div style={{ maxWidth: '70%' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexDirection: mine ? 'row-reverse' : 'row', marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)' }}>{mine ? t('Saya') : m.author_name}</span>
                      <span style={{ fontSize: 10.5, color: 'var(--text3)' }}>{fmtTime(m.created_at)}</span>
                    </div>
                    <div style={{ background: mine ? 'var(--accent)' : 'var(--bg3)', color: mine ? '#fff' : 'var(--text)', borderRadius: 12, padding: '9px 13px', fontSize: 13.5, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                      {m.body}
                    </div>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '12px 4px 4px', borderTop: '1px solid var(--border)' }}>
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder={t('Tulis pesan… (Enter kirim, Shift+Enter baris baru)')}
          rows={1}
          style={{ flex: 1, resize: 'none', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', fontSize: 13.5, fontFamily: 'inherit', maxHeight: 120 }}
        />
        <button onClick={send} disabled={!text.trim()} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 10, padding: '0 18px', fontSize: 13, fontWeight: 600, cursor: text.trim() ? 'pointer' : 'default', opacity: text.trim() ? 1 : 0.6 }}>
          {t('Kirim')}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(dashboard)/smm/[project]/chat/page.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { ChatRoom } from '@/components/Chat/ChatRoom'
import { getSupabase } from '@/lib/supabase'
import { useSocmedProjects } from '@/lib/socmed-projects'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function ChatPage() {
  const params = useParams()
  const slug = String(params.project)
  const t = useT()
  const projects = useSocmedProjects(false)
  const roomName = projects.find(p => p.slug === slug)?.name || slug
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    const sb = getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient
    sb.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? null))
  }, [])

  return (
    <>
      <PageHeader title={`Group Chat — ${roomName}`} />
      <div className="flex-1 overflow-hidden min-h-0" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
        {email
          ? <ChatRoom room={slug} roomName={roomName} meEmail={email} />
          : <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Memuat…')}</div>}
      </div>
    </>
  )
}
```

- [ ] **Step 3: Add i18n strings to `lib/i18n/dictionary.ts`**

Add inside the `SEED` object (near the other socmed entries):

```ts
  'Belum ada pesan. Mulai obrolan!': 'No messages yet. Start the conversation!',
  'Muat lebih lama': 'Load older',
  'Tulis pesan… (Enter kirim, Shift+Enter baris baru)': 'Write a message… (Enter to send, Shift+Enter for newline)',
  'Kirim': 'Send',
  'Saya': 'Me',
  '(gagal terkirim)': '(failed to send)',
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add components/Chat app/\(dashboard\)/smm/\[project\]/chat lib/i18n/dictionary.ts
git commit -m "feat(chat): chat room UI + page"
```

---

## Task 6: Sidebar "Chat" item per project (access-filtered)

**Files:**
- Modify: `components/Sidebar.tsx` — import helper, add Chat nav item, special-case access filter.

- [ ] **Step 1: Import `canAccessChat` + `chatRoomFromPath`**

In `components/Sidebar.tsx`, add to the `@/lib/access` import (find the existing import of `sectionForPath`):

```ts
import { sectionForPath, canAccessChat, chatRoomFromPath } from '@/lib/access'
```

(Keep any other identifiers already imported from that module.)

- [ ] **Step 2: Add the Chat nav item to each project subgroup**

In the `smm` section (`components/Sidebar.tsx:360-363`), add a third item:

```ts
          items: [
            { href: `/smm/${p.slug}/social`, label: 'Social Media', icon: <ShareIcon />, color: COLOR.teal },
            { href: `/smm/${p.slug}`,        label: 'Projects',     icon: <ListIcon />,  color: p.color },
            { href: `/smm/${p.slug}/chat`,   label: 'Chat',         icon: <ChatBubbleIcon />, color: COLOR.blue },
          ],
```

- [ ] **Step 3: Add a `ChatBubbleIcon` near the other icon components**

Find where `ShareIcon`/`ListIcon` are defined in `components/Sidebar.tsx` and add:

```tsx
function ChatBubbleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  )
}
```

- [ ] **Step 4: Special-case chat in the access filter**

In `accessibleSections` (`components/Sidebar.tsx:457-462`), replace the leaf branch:

```ts
        } else {
          const href = (e as NavItem).href
          const secId = sectionForPath(href)
          // Routes with no managed section aren't gated; otherwise require grant.
          if (secId === null || access.allowed.has(secId)) out.push(e)
        }
```

with:

```ts
        } else {
          const href = (e as NavItem).href
          const chatRoom = chatRoomFromPath(href)
          if (chatRoom !== null) {
            // Chat inherits project access: social OR projects.
            if (canAccessChat(access.allowed, chatRoom)) out.push(e)
          } else {
            const secId = sectionForPath(href)
            // Routes with no managed section aren't gated; otherwise require grant.
            if (secId === null || access.allowed.has(secId)) out.push(e)
          }
        }
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(chat): sidebar Chat item per project (social-or-projects gated)"
```

---

## Task 7: Unread badge in the sidebar

**Files:**
- Modify: `components/Sidebar.tsx` — fetch unread counts, subscribe to new messages, render a badge on Chat items.

- [ ] **Step 1: Add an unread-counts hook near the top of the Sidebar component body**

Inside the `Sidebar` component (after `const access = ...` / other hooks), add:

```tsx
  const [unread, setUnread] = useState<Record<string, number>>({})
  useEffect(() => {
    let cancelled = false
    const load = () => fetch('/api/chat/unread')
      .then(r => (r.ok ? r.json() : { counts: {} }))
      .then((d: { counts?: Record<string, number> }) => { if (!cancelled) setUnread(d.counts ?? {}) })
      .catch(() => {})
    load()
    const supabase = getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient
    // Any new message recomputes counts; RLS already scopes to our rooms.
    const channel = supabase
      .channel('chat:unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, () => load())
      .subscribe()
    // Re-read when the route changes (opening a room marks it read).
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [pathname])
```

(`pathname` is already available in Sidebar via `usePathname()`. If not imported, add `import { usePathname } from 'next/navigation'` and `const pathname = usePathname()`. Also ensure `getSupabase` is imported from `@/lib/supabase`.)

- [ ] **Step 2: Render the badge on Chat items**

Where a `NavItem` row is rendered (the leaf `item` render around `components/Sidebar.tsx:747-1000`, both the top-level and nested-subgroup render paths), compute the room and badge. Add near the label, for any item whose href is a chat route:

```tsx
{(() => {
  const room = chatRoomFromPath(item.href)
  const n = room ? (unread[room] ?? 0) : 0
  if (!n) return null
  return (
    <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--accent2)', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
      {n > 9 ? '9+' : n}
    </span>
  )
})()}
```

Place this just before the row's closing tag so it sits at the right edge. Apply it in **both** render paths (the nested-subgroup item render is the one that matters for project rooms — `components/Sidebar.tsx:1000`).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat(chat): sidebar unread badge (realtime)"
```

---

## Task 8: End-to-end verification

**Files:** none (manual + scripted checks).

- [ ] **Step 1: Typecheck the whole project**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Runtime — super admin path**

With the dev server running, log in as the super admin. Open Bentala Project → **Chat**. Expected: page loads, "Belum ada pesan" (or history). Send a message → it appears immediately, bubble right-aligned.

- [ ] **Step 3: Runtime — realtime + two windows**

Open the same room in a second browser/incognito (any member). Send from window A → it appears in window B within ~1s without reload. Send from B → appears in A.

- [ ] **Step 4: Runtime — unread badge**

In window A, navigate away from the room. From window B, send a message. Expected: a red badge appears on window A's "Chat" item for that project. Open the room in A → badge clears. A message you send yourself never raises your own badge.

- [ ] **Step 5: Runtime — access isolation**

Log in as a user granted only `smm.bsi.social` (no bpi). Expected: they see a **Chat** item under Bentala Studio, none under Bentala Project; visiting `/smm/bpi/chat` directly redirects away (middleware). Confirm via DevTools that subscribing to `chat:bpi` yields no rows (RLS blocks it).

- [ ] **Step 6: Final commit (if any tweaks)**

```bash
git add -A
git commit -m "test(chat): verified realtime, access isolation, unread badge"
```

---

## Self-Review

**Spec coverage:**
- Room per project ✓ (Task 1 room=slug, Task 5/6 per-project page+nav).
- Membership = project access (social OR projects) + super admin ✓ (Task 2 helper; Task 3 middleware; Task 4 API; Task 1 RLS).
- Realtime ✓ (Task 5 subscription; Task 1 publication).
- Unread badge ✓ (Tasks 4 unread API + 7 sidebar badge; chat_reads in Task 1).
- Per-project sidebar "Chat" item ✓ (Task 6).
- Avatar = initials (from author_name) ✓ (Task 5 `initials`); `user_metadata` name resolved server-side in Task 4 `displayName`. Note: v1 renders initials in bubbles for simplicity (no image fetch); design said avatar_url with initials fallback — initials-only is an acceptable reduction, revisit if the user wants photos.
- Non-goals respected: no mentions/attachments/edit/reactions ✓.

**Placeholder scan:** No TBD/TODO; all steps contain concrete code and commands.

**Type consistency:** `Msg` shape matches `chat_messages` columns and the API `messages`/`message` envelopes. `canAccessChat`/`chatRoomFromPath` signatures consistent across middleware, sidebar, API. Unread shape `Record<string, number>` consistent (Task 4 returns `counts`, Task 7 reads `counts`).

**Deviation flagged for user:** Bubbles show **initials avatars**, not profile photos, in v1 (keeps the component dependency-free — no `/api/accounts` join per message). If profile photos are wanted, add an accounts lookup in Task 5. Confirm during execution.
