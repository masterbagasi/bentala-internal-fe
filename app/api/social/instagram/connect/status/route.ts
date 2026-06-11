import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { getConnection, ig } from '@/lib/composio'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Poll a Composio connection; when ACTIVE, fetch the IG profile and persist the
// social_connections row (status 'connected'). The UI polls this until ACTIVE.
export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const url = new URL(req.url)
  const brand = url.searchParams.get('brand')
  const connectedAccountId = url.searchParams.get('connectedAccountId')
  const userId = url.searchParams.get('userId')
  if (!brand || !connectedAccountId || !userId) {
    return NextResponse.json({ error: 'brand, connectedAccountId, userId required' }, { status: 400 })
  }

  const acct = (await getConnection(connectedAccountId)) as any
  const status = acct?.status ?? 'PENDING'
  if (status !== 'ACTIVE') return NextResponse.json({ status })

  // Connected — fetch IG profile, persist. Leave fields null on failure; sync backfills.
  let username: string | null = null
  let igUserId: string | null = null
  try {
    const info = (await ig.userInfo({ userId, connectedAccountId })) as any
    username = info?.data?.username ?? null
    igUserId = info?.data?.id ?? null
  } catch { /* sync will backfill */ }

  const admin = createSupabaseAdmin()
  await (admin as any).from('social_connections').upsert({
    brand, platform: 'instagram', composio_user_id: userId, connected_account_id: connectedAccountId,
    ig_user_id: igUserId, username, status: 'connected', connected_at: new Date().toISOString(),
  }, { onConflict: 'brand,platform,connected_account_id' })

  return NextResponse.json({ status: 'ACTIVE', username })
}
