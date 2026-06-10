import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/accounts — list the real login accounts (for tagging people on
// posts, etc.). Available to ANY authenticated user; it only exposes internal
// teammates' name/email/avatar, not anything sensitive. Listing users needs the
// service role, so this runs server-side.
//
// PERFORMANCE: this endpoint is hit by many components (post preview, post
// modal, board, comments, workspace modal) on every open. The underlying admin
// listUsers() pages through every account and is slow, so we:
//   1. cache the result in module memory for a short window (per server
//      instance), with in-flight de-duplication so a burst of concurrent calls
//      triggers only ONE admin fetch, and
//   2. send Cache-Control so the browser serves repeat calls from its own cache
//      (no network / middleware round-trip at all) for a minute.

interface Account { email: string; name: string; avatarUrl: string | null }

const TTL_MS = 60_000
let cache: { at: number; accounts: Account[] } | null = null
let inflight: Promise<Account[]> | null = null

async function loadAccounts(): Promise<Account[]> {
  const admin = createSupabaseAdmin()
  const accounts: Account[] = []
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    for (const u of data.users) {
      if (!u.email) continue
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      accounts.push({
        email: u.email,
        name:
          (meta.full_name as string) ||
          (meta.name as string) ||
          u.email.split('@')[0],
        avatarUrl: (meta.avatar_url as string) ?? null,
      })
    }
    if (data.users.length < 200) break
    page += 1
  }
  accounts.sort((a, b) => a.name.localeCompare(b.name))
  return accounts
}

async function getAccountsCached(): Promise<Account[]> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.accounts
  // De-dupe concurrent refreshes: the first caller starts the fetch, the rest
  // await the same promise instead of each paging the admin API.
  if (!inflight) {
    inflight = loadAccounts()
      .then(accounts => { cache = { at: Date.now(), accounts }; return accounts })
      .finally(() => { inflight = null })
  }
  return inflight
}

export async function GET() {
  // Require a logged-in user (middleware already enforces auth, but re-check).
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const headers = { 'Cache-Control': 'private, max-age=60' }
  try {
    const accounts = await getAccountsCached()
    return NextResponse.json({ accounts }, { headers })
  } catch (err) {
    console.error('[/api/accounts] GET', err)
    // Serve a stale cache if we have one rather than failing the UI.
    if (cache) return NextResponse.json({ accounts: cache.accounts }, { headers })
    return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 })
  }
}
