import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

// In-memory mutex for gotrue auth operations. Each acquisition waits for the
// previous one to settle, so token refreshes never overlap within this tab.
// Failures don't break the chain (we swallow them for the *chain*, while still
// returning the real result/rejection to the caller).
let authLockChain: Promise<unknown> = Promise.resolve()
function inMemoryLock<R>(_name: string, _acquireTimeout: number, fn: () => Promise<R>): Promise<R> {
  const run = authLockChain.then(fn, fn)
  authLockChain = run.then(noop, noop)
  return run
}
function noop() { /* keep the lock chain alive regardless of outcome */ }

export function createClient(): SupabaseClient<Database> {
  // @supabase/ssr@0.6.1 mis-threads the Database generic into
  // @supabase/supabase-js@2.103's SupabaseClient, which collapses every
  // query result to `never`. The runtime client is correct; only the types
  // are wrong, so cast to a properly-typed SupabaseClient<Database>.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        // Serialize auth operations with an in-memory mutex instead of gotrue's
        // default Web Locks. Two reasons:
        //   1. The Web Locks default throws a transient "AbortError: Lock was
        //      stolen by another request" when several consumers (realtime,
        //      getUser, queries) contend for it.
        //   2. A passthrough/no-op lock (the previous workaround) is WORSE: it
        //      lets concurrent calls refresh the token simultaneously, which
        //      rotates the refresh token so all-but-one become invalid — the
        //      session is then wiped and the user is logged out / the page
        //      "refreshes itself" at random (typically ~1h in, at token expiry).
        // The in-memory chain serializes refreshes within the tab (the common
        // case) without ever touching the Web Locks API.
        lock: inMemoryLock,
      },
    }
  ) as unknown as SupabaseClient<Database>
}

// Singleton for client-side usage
let _client: ReturnType<typeof createClient> | null = null

export function getSupabase() {
  if (!_client) {
    _client = createClient()
  }
  return _client
}
