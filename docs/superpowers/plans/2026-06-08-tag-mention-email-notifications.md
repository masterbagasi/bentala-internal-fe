# Tag & Comment-Mention Email + In-App Notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically notify teammates by email AND the in-app bell when they are @-mentioned in a post comment (post-tag email already exists and is enabled).

**Architecture:** Mentions are stored in a new `post_comments.mentions text[]` column. The comment composer gains inline `@` autocomplete; on submit it persists `mentions` and fires per-recipient emails (fire-and-forget) through the existing `/api/notify-tag` route, extended with a `kind: 'comment'` template. The notification bell adds a source that surfaces comments mentioning the current user, realtime.

**Tech Stack:** Next.js 14 App Router, React, Supabase (Postgres + realtime), Resend (email, already configured in `.env.local`).

**Testing note:** This repo has no unit-test runner. Each task is verified with `npx tsc --noEmit` (must be clean) plus the manual dev check described in the task. The dev server runs in the background; do NOT run `npm run build` while it is running (it corrupts `.next`). Commit after each task.

---

### Task 1: Add `mentions` column to `post_comments`

**Files:**
- Migration via Supabase MCP `apply_migration` (project_id `gbmqudkkuzpqykmyrkqc`).

- [ ] **Step 1: Apply the migration**

Use the Supabase `apply_migration` tool with name `post_comments_mentions` and query:

```sql
alter table public.post_comments
  add column if not exists mentions text[] not null default '{}';
```

- [ ] **Step 2: Verify the column exists**

Run `execute_sql`:

```sql
select column_name, data_type from information_schema.columns
where table_schema='public' and table_name='post_comments' and column_name='mentions';
```

Expected: one row, `mentions | ARRAY`.

- [ ] **Step 3: Confirm realtime covers the table (no action expected)**

`post_comments` is already in the `supabase_realtime` publication (the per-post composer subscribes to it today). Verify:

```sql
select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='post_comments';
```

Expected: one row. If empty, run `alter publication supabase_realtime add table public.post_comments;`.

---

### Task 2: Extend `/api/notify-tag` with a comment-mention template

**Files:**
- Modify: `app/api/notify-tag/route.ts`

- [ ] **Step 1: Accept `kind` + `snippet` in the request body**

Find:

```ts
  let body: { email?: string; name?: string; postTitle?: string; taggedBy?: string }
```

Replace with:

```ts
  let body: { email?: string; name?: string; postTitle?: string; taggedBy?: string; kind?: 'tag' | 'comment'; snippet?: string }
```

- [ ] **Step 2: Read the new fields after the existing field parsing**

Find:

```ts
  const taggedBy = String(body.taggedBy ?? '')
```

Add immediately after:

```ts
  const kind = body.kind === 'comment' ? 'comment' : 'tag'
  const snippet = String(body.snippet ?? '')
```

- [ ] **Step 3: Build subject + body per kind**

Find this block:

```ts
  const eName = escapeHtml(displayName || 'tim')
  const eBy = escapeHtml(taggedBy)
  const eTitle = escapeHtml(postTitle || '(tanpa judul)')
  // Subject is a mail header — strip CR/LF to prevent header injection.
  const subject = `Kamu di-tag pada post "${postTitle.replace(/[\r\n]+/g, ' ').slice(0, 120)}"`

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1d2e">
      <h2 style="margin:0 0 8px;font-size:18px">Halo ${eName} 👋</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5168">
        ${eBy ? `<strong>${eBy}</strong> me-` : 'Kamu di-'}tag kamu pada sebuah post di <strong>Bentala Internal System</strong>.
      </p>
      <div style="background:#f4f5fa;border:1px solid #d5d8ea;border-radius:8px;padding:14px 16px;margin-bottom:20px">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px">POST</div>
        <div style="font-size:15px;font-weight:600">${eTitle}</div>
      </div>
      ${appUrl ? `<a href="${appUrl}" style="display:inline-block;background:#0B3DE7;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Buka di Web Internal</a>` : ''}
      <p style="margin:24px 0 0;font-size:12px;color:#9aa0b4">Email otomatis dari Bentala Internal System.</p>
    </div>`
```

Replace with:

```ts
  const eName = escapeHtml(displayName || 'tim')
  const eBy = escapeHtml(taggedBy)
  const eTitle = escapeHtml(postTitle || '(tanpa judul)')
  const eSnippet = escapeHtml(snippet.slice(0, 300))
  const cleanTitle = postTitle.replace(/[\r\n]+/g, ' ').slice(0, 120)
  // Subject is a mail header — strip CR/LF to prevent header injection.
  const subject = kind === 'comment'
    ? `${taggedBy ? taggedBy.replace(/[\r\n]+/g, ' ').slice(0, 60) + ' ' : ''}me-mention kamu di komentar`
    : `Kamu di-tag pada post "${cleanTitle}"`

  const lead = kind === 'comment'
    ? `${eBy ? `<strong>${eBy}</strong> me-` : 'Kamu di-'}mention kamu di komentar pada sebuah post di <strong>Bentala Internal System</strong>.`
    : `${eBy ? `<strong>${eBy}</strong> me-` : 'Kamu di-'}tag kamu pada sebuah post di <strong>Bentala Internal System</strong>.`

  const snippetBlock = kind === 'comment' && eSnippet
    ? `<div style="background:#f4f5fa;border:1px solid #d5d8ea;border-radius:8px;padding:14px 16px;margin-bottom:20px">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px">KOMENTAR</div>
        <div style="font-size:14px;line-height:1.6">${eSnippet}</div>
       </div>`
    : ''

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1d2e">
      <h2 style="margin:0 0 8px;font-size:18px">Halo ${eName} 👋</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5168">${lead}</p>
      <div style="background:#f4f5fa;border:1px solid #d5d8ea;border-radius:8px;padding:14px 16px;margin-bottom:${snippetBlock ? 12 : 20}px">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px">POST</div>
        <div style="font-size:15px;font-weight:600">${eTitle}</div>
      </div>
      ${snippetBlock}
      ${appUrl ? `<a href="${appUrl}" style="display:inline-block;background:#0B3DE7;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Buka di Web Internal</a>` : ''}
      <p style="margin:24px 0 0;font-size:12px;color:#9aa0b4">Email otomatis dari Bentala Internal System.</p>
    </div>`
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no output (clean).

- [ ] **Step 5: Commit**

```bash
git add app/api/notify-tag/route.ts
git commit -m "feat(notify): comment-mention email template (kind + snippet)"
```

---

### Task 3: Comment hook — accounts, mention state, persist + email on submit

**Files:**
- Modify: `components/BPI/PostComments.tsx`

- [ ] **Step 1: Add `mentions` to the `CommentRow` interface**

Find the `CommentRow` interface (the one with `author_email`, `author_name`, `body`). Add a field:

```ts
  mentions?: string[] | null
```

- [ ] **Step 2: Add accounts + mentions state to `usePostComments`**

Find:

```ts
  const [posting, setPosting] = useState(false)
  const [error, setError] = useState('')
```

Add immediately after:

```ts
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
```

- [ ] **Step 3: Persist mentions + fire emails in `submit()`**

Find the whole `submit` function body and replace it with:

```ts
  async function submit() {
    const body = input.trim()
    if (!body || posting || !post) return
    if (!me.email) {
      setError(t('Tidak bisa mengenali akun Anda.'))
      return
    }
    setPosting(true)
    setError('')
    // Keep only mentions whose "@Name" is still present in the final body.
    const finalMentions = mentions.filter(em => {
      const name = accounts.find(a => a.email === em)?.name ?? em
      return body.includes(`@${name}`)
    })
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
      // Fire-and-forget mention emails (skip self). Endpoint no-ops if Resend
      // isn't configured, and resolves recipients server-side.
      const postTitle = post.title
      finalMentions
        .filter(em => em.toLowerCase() !== me.email.toLowerCase())
        .forEach(em => {
          fetch('/api/notify-tag', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: em, kind: 'comment', postTitle, taggedBy: me.name, snippet: body.slice(0, 200) }),
          }).catch(() => {})
        })
    } catch {
      setError(t('Gagal mengirim komentar. Coba lagi.'))
    } finally {
      setPosting(false)
    }
  }
```

- [ ] **Step 4: Expose new values + add `mentions` to comment feed entries**

Find the hook's return statement:

```ts
  return { tab, setTab, feed, loading, commentCount, me, input, setInput, posting, error, submit }
```

Replace with:

```ts
  return { tab, setTab, feed, loading, commentCount, me, input, setInput, posting, error, submit, accounts, addMention }
```

Then find `commentEntries` and add `mentions` to each mapped entry. Replace:

```ts
      comments.map(c => ({
        id: c.id,
        kind: 'comment' as const,
        authorName: c.author_name || c.author_email || 'User',
        authorEmail: c.author_email,
        at: c.created_at,
        body: c.body,
      })),
```

with:

```ts
      comments.map(c => ({
        id: c.id,
        kind: 'comment' as const,
        authorName: c.author_name || c.author_email || 'User',
        authorEmail: c.author_email,
        at: c.created_at,
        body: c.body,
        mentions: c.mentions ?? [],
      })),
```

- [ ] **Step 5: Add `mentions` to the `FeedEntry` type**

Find the `FeedEntry` interface/type (the one with `body?: string`). Add:

```ts
  mentions?: string[]
```

- [ ] **Step 6: Type-check**

Run: `npx tsc --noEmit`
Expected: clean. (The composer doesn't use `accounts`/`addMention` yet — that's Task 4 — but exposing them is harmless.)

- [ ] **Step 7: Commit**

```bash
git add components/BPI/PostComments.tsx
git commit -m "feat(comments): persist mentions + fire mention emails on submit"
```

---

### Task 4: Composer inline `@` autocomplete

**Files:**
- Modify: `components/BPI/PostComments.tsx` (the `PostCommentsComposer` component)

- [ ] **Step 1: Add the imports the composer needs**

At the top of the file, ensure `useMemo` and `useRef` are imported from `react` (the file already imports `useEffect, useMemo, useState`). Update the import to include `useRef`:

```ts
import { useEffect, useMemo, useRef, useState } from 'react'
```

- [ ] **Step 2: Replace `PostCommentsComposer` with the autocomplete version**

Replace the entire `PostCommentsComposer` function with:

```tsx
export function PostCommentsComposer({ s }: { s: PostCommentsState }) {
  const t = useT()
  const { me, input, setInput, submit, posting, error, accounts, addMention } = s
  const taRef = useRef<HTMLTextAreaElement>(null)
  // When typing an @token, `menu` holds the query text and the token start index.
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
    // An @token: "@" preceded by start-or-space, then word chars (letters incl.
    // unicode, digits, . _ -). Names with spaces are matched progressively.
    const m = /(?:^|\s)@([\p{L}0-9._-]*)$/u.exec(upto)
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
          <div
            style={{
              position: 'absolute', left: 0, bottom: 'calc(100% + 4px)', width: 240, zIndex: 50,
              background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8,
              boxShadow: '0 8px 28px rgba(0,0,0,0.5)', overflow: 'hidden', padding: 4,
            }}
          >
            {matches.map((a, i) => (
              <button
                key={a.email}
                onMouseDown={e => { e.preventDefault(); pick(a) }}
                onMouseEnter={() => setActive(i)}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
                  borderRadius: 6, border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: i === active ? 'var(--bg3)' : 'transparent', color: 'var(--text)',
                }}
              >
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
              height: 30, padding: '0 16px', borderRadius: 8, border: 'none', fontSize: 12.5, fontWeight: 600,
              cursor: posting || !input.trim() ? 'not-allowed' : 'pointer',
              background: posting || !input.trim() ? 'var(--border)' : 'var(--accent)', color: '#fff',
            }}
          >
            {posting ? t('Mengirim…') : t('Kirim')}
          </button>
        </div>
      </div>
    </div>
  )
}
```

> NOTE: The send button markup above mirrors the existing one. When applying, preserve any existing button text/handlers if they differ — keep the existing `submit`/`posting` wiring and only add the autocomplete dropdown + `onChange`/`onKeyDown`/`ref`. If the original button already exists below the textarea, do not duplicate it.

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 4: Manual dev check**

Open http://localhost:3000 → open a post → comments composer → type `@`. Expected: dropdown of teammates appears; arrow keys move; Enter/click inserts `@Name `. Send a comment mentioning yourself+another, confirm it saves and shows.

- [ ] **Step 5: Commit**

```bash
git add components/BPI/PostComments.tsx
git commit -m "feat(comments): inline @mention autocomplete in composer"
```

---

### Task 5: Highlight `@mentions` in the comment feed

**Files:**
- Modify: `components/BPI/PostComments.tsx` (`PostCommentsBody` + `FeedItem`)

- [ ] **Step 1: Add a body-rendering helper**

Add this helper function near the other module-level helpers (e.g. after `fileName`):

```tsx
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
): React.ReactNode {
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
```

- [ ] **Step 2: Pass accounts from `PostCommentsBody` into `FeedItem`**

In `PostCommentsBody`, destructure `accounts` from `s`:

```tsx
  const { tab, setTab, feed, loading, commentCount, accounts } = s
```

And pass it to each `FeedItem`:

```tsx
            <FeedItem key={`${e.kind}-${e.id}`} entry={e} accounts={accounts} />
```

- [ ] **Step 3: Use the helper in `FeedItem`**

In `FeedItem`'s signature, add the `accounts` prop:

```tsx
function FeedItem({ entry, accounts }: { entry: FeedEntry; accounts: { email: string; name: string }[] }) {
```

Find where the comment body is rendered inside `FeedItem` (the JSX that outputs `entry.body`) and replace `{entry.body}` with:

```tsx
{renderBodyWithMentions(entry.body ?? '', entry.mentions, accounts)}
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual dev check**

Reopen the post; the comment you posted in Task 4 shows the `@Name` portion in accent color.

- [ ] **Step 6: Commit**

```bash
git add components/BPI/PostComments.tsx
git commit -m "feat(comments): highlight @mentions in the feed"
```

---

### Task 6: Surface comment mentions in the NotificationBell

**Files:**
- Modify: `components/shared/NotificationBell.tsx`

- [ ] **Step 1: Extend `ActivityRow` with `mentions`**

Find the `ActivityRow` interface and add:

```ts
  mentions?: string[] | null
```

- [ ] **Step 2: Add state + fetch + realtime for mentions of me**

Find:

```ts
  const [postActivity, setPostActivity] = useState<ActivityRow[]>([])
```

Add immediately after:

```ts
  const [myMentions, setMyMentions] = useState<ActivityRow[]>([])
```

Then, after the existing `useEffect` that fetches/subscribes `postActivity` (the one keyed on `[myPostKey]`), add a new effect:

```ts
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
```

- [ ] **Step 3: Merge mentions into the `notifs` list**

Find the `notifs` `useMemo`. Inside it, after the `postActivity.forEach(...)` block and before the tag-notifications block, add:

```ts
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
```

Then add `myMentions` and `posts` to the `useMemo` dependency array:

```ts
  }, [postActivity, myMentions, myPostMap, posts, activity, me.name, me.email])
```

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 5: Manual dev check**

As user B, mention user A in a comment. Log in as user A (or use the same account mentioning itself is skipped for email but still recorded) → the bell shows "<author> me-mention kamu di komentar" with the post title, realtime.

- [ ] **Step 6: Commit**

```bash
git add components/shared/NotificationBell.tsx
git commit -m "feat(notif): show comment @mentions in the notification bell"
```

---

### Task 7: i18n dictionary entries

**Files:**
- Modify: `lib/i18n/dictionary.ts`

- [ ] **Step 1: Add the new Indonesian→English entries to `SEED`**

Add these keys inside the `SEED` object (anywhere; avoid duplicating an existing key — check first):

```ts
  'Tulis komentar… ketik @ untuk mention (⌘/Ctrl + Enter kirim)':
    'Write a comment… type @ to mention (⌘/Ctrl + Enter to send)',
  'Mengirim…': 'Sending…',
  'Kirim': 'Send',
  'me-mention kamu di komentar': 'mentioned you in a comment',
```

(`Seseorang`, `pada`, `Gagal mengirim komentar. Coba lagi.`, `Tidak bisa mengenali akun Anda.` already exist — do not re-add.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: clean (a duplicate-key error here means one of the strings already exists — remove the duplicate).

- [ ] **Step 3: Commit**

```bash
git add lib/i18n/dictionary.ts
git commit -m "i18n: strings for comment @mention composer + bell"
```

---

### Task 8: Final verification

- [ ] **Step 1: Type-check the whole project**

Run: `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 2: Dev smoke test (server already running; do NOT `npm run build`)**

Confirm a static chunk loads (server healthy):
`curl -s -o /tmp/l.html -w "%{http_code}\n" http://localhost:3000/login` → 200, and a chunk from it → 200.

Then in the browser:
1. Open a post → type `@` in the comment box → pick a teammate → send. Comment shows with highlighted `@Name`.
2. The mentioned teammate's bell shows the mention (realtime).
3. With Resend configured + sender domain verified, the teammate receives the email. Without it, no error — comment still posts.

- [ ] **Step 3: Final commit (if anything uncommitted)**

```bash
git add -A && git commit -m "chore: finalize tag/comment-mention notifications" || true
```

---

## Notes / prerequisites (ops, not code)

- `.env.local` already has `RESEND_API_KEY`, `RESEND_FROM=Bentala Internal <noreply@bentalaproject.com>`, `NEXT_PUBLIC_APP_URL`. For delivery to teammates, `bentalaproject.com` must be **Verified** in Resend, and the same env vars must be set in the **production** hosting environment.
- Nothing here is pushed automatically; push only when the user asks.
