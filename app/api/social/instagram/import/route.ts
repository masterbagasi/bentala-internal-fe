import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { listActiveInstagram } from '@/lib/composio'

// One-off / re-runnable utility: seed `social_connections` from the Instagram
// accounts already connected in Composio. Maps IG username -> project slug.
const USERNAME_TO_SLUG: Record<string, string> = {
  bentalaprojectindonesia: 'bpi',
  bentalastudioindonesia: 'bsi',
}

export async function POST() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const accounts = (await listActiveInstagram()) as any
  const items: any[] = accounts?.items ?? accounts?.data ?? accounts ?? []

  const admin = createSupabaseAdmin()
  const rows: Record<string, unknown>[] = []
  for (const a of items) {
    // Defensive field access — exact shape confirmed against the live response
    // at runtime (this route prints `rows` so accessors can be adjusted).
    const username: string | undefined =
      a?.data?.username || a?.meta?.username || a?.toolkit?.meta?.username || a?.params?.username
    const igUserId: string | null =
      a?.data?.id || a?.meta?.id || a?.params?.id || null
    const slug = username ? USERNAME_TO_SLUG[username] : undefined
    if (!slug) continue
    rows.push({
      brand: slug,
      platform: 'instagram',
      composio_user_id: a?.userId ?? a?.user_id ?? `socmed:${slug}`,
      connected_account_id: a?.id,
      ig_user_id: igUserId,
      username,
      status: 'connected',
      connected_at: new Date().toISOString(),
    })
  }

  if (rows.length) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (admin as any)
      .from('social_connections')
      .upsert(rows, { onConflict: 'brand,platform,connected_account_id' })
    if (error) {
      console.error('[/api/social/instagram/import] POST', error)
      return NextResponse.json({ error: 'upsert failed' }, { status: 500 })
    }
  }

  return NextResponse.json({ imported: rows.length, rows })
}
