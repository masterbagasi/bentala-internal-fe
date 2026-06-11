import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { deleteConnection } from '@/lib/composio'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Disconnect an Instagram account: remove the Composio connection, the
// social_connections row, and this brand's cached analytics. Super-admin only.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { brand, connectedAccountId } = await req.json()
  if (!brand || !connectedAccountId) {
    return NextResponse.json({ error: 'brand and connectedAccountId required' }, { status: 400 })
  }

  // Best-effort: drop the Composio connection (ignore if already gone).
  try { await deleteConnection(connectedAccountId) } catch (e) { console.error('[disconnect] composio', e) }

  const admin = createSupabaseAdmin() as any
  await admin.from('social_connections').delete().eq('brand', brand).eq('connected_account_id', connectedAccountId)

  // Clear this brand's cached analytics (one account per brand for now).
  const { data: media } = await admin.from('ig_media').select('media_id').eq('brand', brand)
  const mediaIds = (media ?? []).map((m: any) => m.media_id)
  if (mediaIds.length) await admin.from('ig_media_insights').delete().in('media_id', mediaIds)
  await admin.from('ig_media').delete().eq('brand', brand)
  await admin.from('ig_account_insights').delete().eq('brand', brand)
  await admin.from('ig_demographics').delete().eq('brand', brand)
  await admin.from('ig_sync_state').delete().eq('brand', brand)

  return NextResponse.json({ ok: true })
}
