import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Local row type for ai_settings — kept here (not in database.types.ts) because
// this is a new app-managed table whose types we don't want to regenerate from
// Supabase to avoid drift across teammates.
export interface AiSettingsRow {
  provider: string
  api_key: string | null
  model: string | null
  enabled: boolean | null
  notes: string | null
  last_tested_at: string | null
  last_test_status: 'ok' | 'failed' | null
  last_test_message: string | null
  updated_at: string | null
  updated_by: string | null
}

// Service-role client — used by API routes that need to read/write the
// ai_settings table without depending on the request user's session. Service
// role key MUST stay server-side only (never expose to client).
//
// Typed as `SupabaseClient` (untyped Database) so we can hit tables that aren't
// in the auto-generated `database.types.ts` (e.g., ai_settings before the
// migration runs). Call sites cast .from() result rows to AiSettingsRow.
let _admin: SupabaseClient | null = null

export function createSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) {
    throw new Error('Supabase admin client requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY')
  }
  _admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return _admin
}
