import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin, normaliseSections } from '@/lib/access'
import type { IgAnalytics } from '@/lib/social/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

// Same gate as the /smm/<brand>/social route: super admin, or the user's
// menu_access grants the smm.<brand>.social section. Prevents reading another
// project's analytics by passing an arbitrary ?brand=.
async function canReadBrand(email: string, role: unknown, brand: string): Promise<boolean> {
  if (isEffectiveSuperAdmin(email, role)) return true
  const admin = createSupabaseAdmin()
  const { data } = await (admin as any)
    .from('menu_access').select('sections').ilike('email', email).maybeSingle()
  const sections = normaliseSections(data?.sections ?? [])
  return sections.includes(`smm.${brand}.social`)
}

// Reads the cached Instagram analytics for a brand and shapes it into the
// IgAnalytics payload the Social views consume. No Composio call here — that
// only happens in the sync route (cron + Refresh).
export async function GET(req: NextRequest) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const brand = new URL(req.url).searchParams.get('brand')
  if (!brand) return NextResponse.json({ error: 'brand required' }, { status: 400 })
  if (!(await canReadBrand(user.email!, user.app_metadata?.role, brand))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const db = supabase as any

  const [insights, media, mediaIns, demo, syncState] = await Promise.all([
    db.from('ig_account_insights').select('metric,period,day,value').eq('brand', brand),
    db.from('ig_media').select('*').eq('brand', brand).order('timestamp', { ascending: false }),
    db.from('ig_media_insights').select('media_id,metric,value'),
    db.from('ig_demographics').select('kind,breakdown,bucket,value').eq('brand', brand),
    db.from('ig_sync_state').select('last_synced_at').eq('brand', brand).maybeSingle(),
  ])

  const ins = (insights.data ?? []) as any[]
  const total = (m: string) => ins.find(r => r.metric === m && r.period === 'days_28')?.value ?? null

  const insByMedia = new Map<string, Record<string, number>>()
  for (const r of (mediaIns.data ?? []) as any[]) {
    const cur = insByMedia.get(r.media_id) ?? {}
    cur[r.metric] = Number(r.value)
    insByMedia.set(r.media_id, cur)
  }

  const followerSeries = ins
    .filter(r => r.metric === 'follower_count' && r.day)
    .map(r => ({ day: r.day as string, value: Number(r.value) }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))

  const payload: IgAnalytics = {
    followers: followerSeries.length ? followerSeries[followerSeries.length - 1].value : null,
    overview: { reach: total('reach'), views: total('views'), interactions: total('total_interactions'), engaged: total('accounts_engaged') },
    followersByDay: followerSeries,
    posts: ((media.data ?? []) as any[]).map(m => {
      const mi = insByMedia.get(m.media_id) ?? {}
      return {
        id: m.media_id, caption: m.caption, permalink: m.permalink,
        type: m.media_product_type ?? m.media_type, timestamp: m.timestamp,
        likes: m.like_count ?? 0, comments: m.comments_count ?? 0,
        reach: mi.reach ?? null, views: mi.views ?? null, saved: mi.saved ?? null, shares: mi.shares ?? null,
      }
    }),
    demographics: Object.values(((demo.data ?? []) as any[]).reduce((acc: Record<string, any>, r) => {
      const key = `${r.kind}:${r.breakdown}`
      ;(acc[key] ??= { kind: r.kind, breakdown: r.breakdown, buckets: [] }).buckets.push({ bucket: r.bucket, value: Number(r.value) })
      return acc
    }, {})),
    lastSyncedAt: syncState.data?.last_synced_at ?? null,
  }
  return NextResponse.json(payload, { headers: { 'Cache-Control': 'private, max-age=30' } })
}
