import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export function createClient(): SupabaseClient<Database> {
  // @supabase/ssr@0.6.1 mis-threads the Database generic into
  // @supabase/supabase-js@2.103's SupabaseClient, which collapses every
  // query result to `never`. The runtime client is correct; only the types
  // are wrong, so cast to a properly-typed SupabaseClient<Database>.
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
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
