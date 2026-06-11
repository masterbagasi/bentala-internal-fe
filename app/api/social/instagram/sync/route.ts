import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { ig } from '@/lib/composio'
import { metricMap, mediaPage, demographicBuckets } from '@/lib/social/normalize'
import type { SocialConnection } from '@/lib/social/types'

/* eslint-disable @typescript-eslint/no-explicit-any */

export const maxDuration = 60

// Cron path: shared secret header. UI path: super-admin session.
async function authorize(req: NextRequest): Promise<NextResponse | null> {
  const cron = req.headers.get('x-cron-secret')
  if (cron && cron === process.env.CRON_SECRET) return null
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

const now = () => new Date().toISOString()

export async function POST(req: NextRequest) {
  const forbidden = await authorize(req)
  if (forbidden) return forbidden

  const slug = new URL(req.url).searchParams.get('brand')
  const admin = createSupabaseAdmin()

  let q = (admin as any).from('social_connections').select('*').eq('platform', 'instagram').eq('status', 'connected')
  if (slug) q = q.eq('brand', slug)
  const { data: connections } = await q
  const list = (connections ?? []) as SocialConnection[]

  const results: Record<string, string> = {}
  for (const c of list) {
    const ctx = { userId: c.composio_user_id, connectedAccountId: c.connected_account_id }
    try {
      // 1) Followers (daily sample) + 28-day account KPIs
      const followers = metricMap(await ig.userInsights(ctx, ['follower_count'], 'day'))
      const kpis = metricMap(await ig.userInsights(ctx, ['reach', 'views', 'total_interactions', 'accounts_engaged'], 'days_28'))

      const insightRows: any[] = []
      if (followers.follower_count != null)
        insightRows.push({ brand: c.brand, ig_user_id: c.ig_user_id, metric: 'follower_count', period: 'day', day: now().slice(0, 10), value: followers.follower_count, fetched_at: now() })
      for (const k of ['reach', 'views', 'total_interactions', 'accounts_engaged'])
        if (kpis[k] != null) insightRows.push({ brand: c.brand, ig_user_id: c.ig_user_id, metric: k, period: 'days_28', day: null, value: kpis[k], fetched_at: now() })
      if (insightRows.length)
        await (admin as any).from('ig_account_insights').upsert(insightRows, { onConflict: 'brand,metric,period,day' })

      // 2) Media inventory (paginate, capped)
      const media: any[] = []
      let after: string | undefined
      do {
        const page = mediaPage(await ig.userMedia(ctx, after))
        media.push(...page.items)
        after = page.after ?? undefined
      } while (after && media.length < 200)

      if (media.length) {
        await (admin as any).from('ig_media').upsert(media.map(m => ({
          brand: c.brand, media_id: m.id, caption: m.caption ?? null, permalink: m.permalink ?? null,
          media_type: m.media_type ?? null, media_product_type: m.media_product_type ?? null,
          timestamp: m.timestamp ?? null, like_count: m.like_count ?? null, comments_count: m.comments_count ?? null,
          fetched_at: now(),
        })), { onConflict: 'brand,media_id' })

        // 3) Per-post insights (skip per-id failures)
        for (const m of media) {
          try {
            const map = metricMap(await ig.mediaInsights(ctx, m.id, ['reach', 'views', 'saved', 'likes', 'comments', 'shares']))
            const rows = Object.entries(map).filter(([, v]) => v != null)
              .map(([metric, value]) => ({ media_id: m.id, metric, value, fetched_at: now() }))
            if (rows.length) await (admin as any).from('ig_media_insights').upsert(rows, { onConflict: 'media_id,metric' })
          } catch { /* ineligible/old media — skip */ }
        }
      }

      // 4) Follower demographics (age, gender, country)
      for (const breakdown of ['age', 'gender', 'country']) {
        try {
          const res = await ig.userInsights(ctx, ['follower_demographics'], 'lifetime', { metric_type: 'total_value', breakdown })
          const buckets = demographicBuckets(res)
          if (buckets.length)
            await (admin as any).from('ig_demographics').upsert(
              buckets.map(b => ({ brand: c.brand, kind: 'follower', breakdown, bucket: b.bucket, value: b.value, fetched_at: now() })),
              { onConflict: 'brand,kind,breakdown,bucket' })
        } catch { /* demographics may be permission-limited — skip */ }
      }

      await (admin as any).from('ig_sync_state').upsert({ brand: c.brand, last_synced_at: now(), last_status: 'ok', last_error: null }, { onConflict: 'brand' })
      results[c.brand] = 'ok'
    } catch (e) {
      await (admin as any).from('ig_sync_state').upsert({ brand: c.brand, last_synced_at: now(), last_status: 'error', last_error: String(e) }, { onConflict: 'brand' })
      results[c.brand] = 'error'
    }
  }

  return NextResponse.json({ synced: results })
}
