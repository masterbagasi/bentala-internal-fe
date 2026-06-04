import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

// GET /api/accounts — list the real login accounts (for tagging people on
// posts, etc.). Available to ANY authenticated user; it only exposes internal
// teammates' name/email/avatar, not anything sensitive. Listing users needs the
// service role, so this runs server-side.

export async function GET() {
  // Require a logged-in user (middleware already enforces auth, but re-check).
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const admin = createSupabaseAdmin()
    const accounts: { email: string; name: string; avatarUrl: string | null }[] = []
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
    return NextResponse.json({ accounts })
  } catch (err) {
    console.error('[/api/accounts] GET', err)
    return NextResponse.json({ error: 'Failed to load accounts' }, { status: 500 })
  }
}
