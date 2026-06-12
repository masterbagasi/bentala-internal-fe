import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { startInstagramLink, brandUserId } from '@/lib/composio'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Start an Instagram OAuth connection via Composio. Returns a redirect URL the
// user authorizes in a popup; the status route persists the connection on ACTIVE.
export async function POST(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const { brand } = await req.json()
  if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 })

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/smm/${brand}/social`
  try {
    const conn = (await startInstagramLink(brand, callbackUrl)) as any
    return NextResponse.json({
      redirectUrl: conn?.redirectUrl ?? null,
      connectedAccountId: conn?.id ?? null,
      userId: brandUserId(brand),
    })
  } catch (e: any) {
    // Surface the real Composio error instead of a bare 500 — the message and
    // code are what you need to diagnose (auth config, toolkit version, etc.).
    console.error('[ig/connect] startInstagramLink failed:', e)
    return NextResponse.json(
      { error: e?.message || 'Composio link failed', code: e?.code ?? null },
      { status: 502 },
    )
  }
}
