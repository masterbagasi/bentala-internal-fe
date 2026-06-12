import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { ig } from '@/lib/composio'
import { metricMap, mediaPage, demographicBuckets, dailySeries, reconstructFollowerSeries } from '@/lib/social/normalize'
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

// Vercel cron issues a GET with `Authorization: Bearer $CRON_SECRET`. Re-dispatch
// to POST (all brands) with the internal cron-secret header.
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  const proxied = new NextRequest(new URL('/api/social/instagram/sync', req.url), {
    method: 'POST', headers: { 'x-cron-secret': process.env.CRON_SECRET },
  })
  return POST(proxied)
}

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
      // 1) Total followers + 28-day account KPIs.
      // The total lives on GET_USER_INFO.followers_count. For the growth trend we
      // bootstrap real history from the insights `follower_count` series (per-day
      // GAINS over ~30 days) reconstructed into an absolute curve anchored to the
      // current total — so the chart is populated on the very first sync. Each
      // day upserts on (brand,metric,period,day), so later syncs refine it.
      const info = (await ig.userInfo(ctx)) as any
      const followersTotal: number | null = info?.data?.followers_count ?? null
      // total_value aggregates uniquely over the window (correct for reach etc.);
      // without it several metrics are silently omitted.
      const kpis = metricMap(await ig.userInsights(ctx, ['reach', 'views', 'total_interactions', 'accounts_engaged'], 'days_28', { metric_type: 'total_value' }))

      const insightRows: any[] = []
      if (followersTotal != null) {
        const today = now().slice(0, 10)
        let followerDays: { day: string; value: number }[] = []
        try {
          // period='day' (no total_value) → a daily time series of follower gains.
          const gains = dailySeries(await ig.userInsights(ctx, ['follower_count'], 'day'))
          followerDays = reconstructFollowerSeries(gains, followersTotal, today)
        } catch { /* <100 followers / ineligible — fall back to a single point */ }
        if (!followerDays.length) followerDays = [{ day: today, value: followersTotal }]
        for (const p of followerDays)
          insightRows.push({ brand: c.brand, ig_user_id: c.ig_user_id, metric: 'follower_count', period: 'day', day: p.day, value: p.value, fetched_at: now() })
      }
      for (const k of ['reach', 'views', 'total_interactions', 'accounts_engaged'])
        if (kpis[k] != null) insightRows.push({ brand: c.brand, ig_user_id: c.ig_user_id, metric: k, period: 'days_28', day: null, value: kpis[k], fetched_at: now() })
      if (insightRows.length)
        await (admin as any).from('ig_account_insights').upsert(insightRows, { onConflict: 'brand,metric,period,day' })

      // 2) Media inventory — fetch the FULL catalogue (paginate all) so the post
      // count, likes/comments and covers reflect the real account. Metadata is
      // cheap (~100/page); the safety cap just bounds pathological accounts.
      const media: any[] = []
      let after: string | undefined
      do {
        const page = mediaPage(await ig.userMedia(ctx, after))
        media.push(...page.items)
        after = page.after ?? undefined
      } while (after && media.length < 2000)

      if (media.length) {
        const mediaRows = media.map(m => ({
          brand: c.brand, media_id: m.id, caption: m.caption ?? null, permalink: m.permalink ?? null,
          media_type: m.media_type ?? null, media_product_type: m.media_product_type ?? null,
          timestamp: m.timestamp ?? null, like_count: m.like_count ?? null, comments_count: m.comments_count ?? null,
          // Cover image. IG CDN URLs are temporary (expire in hours/days) — they
          // refresh on every sync. thumbnail_url is the cover for Reels/video;
          // media_url is the image itself for photo posts.
          media_url: m.media_url ?? null, thumbnail_url: m.thumbnail_url ?? null,
          fetched_at: now(),
        }))
        const { error: mediaErr } = await (admin as any).from('ig_media').upsert(mediaRows, { onConflict: 'brand,media_id' })
        if (mediaErr) {
          // The cover columns (media_url/thumbnail_url) may not exist yet — retry
          // without them so media sync never breaks pre-migration. Covers start
          // populating automatically once the columns are added.
          const stripped = mediaRows.map(({ media_url: _mu, thumbnail_url: _tu, ...rest }) => rest)
          await (admin as any).from('ig_media').upsert(stripped, { onConflict: 'brand,media_id' })
        }

        // 3) Per-post insights (reach/views/saves/shares) require one IG call
        // each — bounded to the most recent posts to respect rate limits and the
        // 60s budget. Each row upserts immediately, so progress survives a
        // timeout and later syncs extend coverage. Likes/comments for ALL posts
        // already came free with the media metadata above.
        const INSIGHT_LIMIT = 200
        for (const m of media.slice(0, INSIGHT_LIMIT)) {
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
