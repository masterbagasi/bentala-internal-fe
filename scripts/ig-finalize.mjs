// Finalize a connected Instagram account: wait for ACTIVE, persist the
// social_connections row, run the sync (reads -> cache), print a validation
// summary. Run: node --env-file=.env.local scripts/ig-finalize.mjs <brand> <connectedAccountId>
import { Composio } from '@composio/core'
import { createClient } from '@supabase/supabase-js'

const brand = process.argv[2]
const connectedAccountId = process.argv[3]
if (!brand || !connectedAccountId) { console.error('usage: ig-finalize.mjs <brand> <connectedAccountId>'); process.exit(1) }

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY, toolkitVersions: { instagram: '20260523_00' } })
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
const userId = `socmed:${brand}`
const ctx = { userId, connectedAccountId }
const now = () => new Date().toISOString()
const exec = (slug, args) => composio.tools.execute(slug, { ...ctx, arguments: args })

// ── normalize helpers (mirror lib/social/normalize.ts) ──
const num = v => { const n = typeof v === 'string' ? parseFloat(v) : v; return Number.isFinite(n) ? n : null }
const metricRows = res => Array.isArray(res?.data?.data) ? res.data.data : (Array.isArray(res?.data) ? res.data : [])
const metricValue = m => { const tv = m?.total_value; if (tv && typeof tv === 'object' && 'value' in tv) return num(tv.value); if (tv != null && typeof tv !== 'object') return num(tv); const v = m?.values; return Array.isArray(v) && v.length ? num(v[v.length-1]?.value) : null }
const metricMap = res => { const o = {}; for (const m of metricRows(res)) if (m?.name) o[m.name] = metricValue(m); return o }
const mediaPage = res => { const d = res?.data ?? {}; const items = Array.isArray(d?.data) ? d.data : []; const after = d?.paging?.next ? (d?.paging?.cursors?.after ?? null) : null; return { items, after } }
const demoBuckets = res => { const out = []; for (const m of metricRows(res)) for (const b of (m?.total_value?.breakdowns ?? [])) for (const r of (b?.results ?? [])) { const k = Array.isArray(r?.dimension_values) ? r.dimension_values.join(' / ') : String(r?.dimension_values ?? ''); const v = num(r?.value); if (k && v != null) out.push({ bucket: k, value: v }) } return out }

// 1) Wait for ACTIVE
let acct, status
for (let i = 0; i < 40; i++) {
  acct = await composio.connectedAccounts.get(connectedAccountId)
  status = acct?.status
  if (status === 'ACTIVE') break
  console.log(`[${i}] status=${status} … waiting`)
  await new Promise(r => setTimeout(r, 3000))
}
if (status !== 'ACTIVE') { console.error('Not ACTIVE yet — finish the Instagram login first. Last status:', status); process.exit(2) }

// 2) Profile + persist connection
const info = await exec('INSTAGRAM_GET_USER_INFO', { ig_user_id: 'me', graph_api_version: 'v21.0' })
const username = info?.data?.username ?? null
const igUserId = info?.data?.id ?? null
console.log('CONNECTED:', { username, igUserId })
await sb.from('social_connections').upsert({
  brand, platform: 'instagram', composio_user_id: userId, connected_account_id: connectedAccountId,
  ig_user_id: igUserId, username, status: 'connected', connected_at: now(),
}, { onConflict: 'brand,platform,connected_account_id' })

// 3) Sync
const followersTotal = info?.data?.followers_count ?? null
const kpis = metricMap(await exec('INSTAGRAM_GET_USER_INSIGHTS', { metric: ['reach','views','total_interactions','accounts_engaged'], period: 'days_28', metric_type: 'total_value' }))
console.log('FOLLOWERS TOTAL:', followersTotal, 'KPIS:', kpis)
const insightRows = []
if (followersTotal != null) insightRows.push({ brand, ig_user_id: igUserId, metric: 'follower_count', period: 'day', day: now().slice(0,10), value: followersTotal, fetched_at: now() })
for (const k of ['reach','views','total_interactions','accounts_engaged']) if (kpis[k] != null) insightRows.push({ brand, ig_user_id: igUserId, metric: k, period: 'days_28', day: null, value: kpis[k], fetched_at: now() })
if (insightRows.length) await sb.from('ig_account_insights').upsert(insightRows, { onConflict: 'brand,metric,period,day' })

const media = []
let after
do { const p = mediaPage(await exec('INSTAGRAM_GET_IG_USER_MEDIA', { ig_user_id: 'me', limit: 100, ...(after?{after}:{}) , fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count' })); media.push(...p.items); after = p.after ?? undefined } while (after && media.length < 200)
console.log('MEDIA COUNT:', media.length, 'sample:', JSON.stringify(media[0])?.slice(0, 300))
if (media.length) {
  await sb.from('ig_media').upsert(media.map(m => ({ brand, media_id: m.id, caption: m.caption ?? null, permalink: m.permalink ?? null, media_type: m.media_type ?? null, media_product_type: m.media_product_type ?? null, timestamp: m.timestamp ?? null, like_count: m.like_count ?? null, comments_count: m.comments_count ?? null, fetched_at: now() })), { onConflict: 'brand,media_id' })
  let ok = 0
  for (const m of media) { try { const map = metricMap(await exec('INSTAGRAM_GET_IG_MEDIA_INSIGHTS', { ig_media_id: m.id, metric: ['reach','views','saved','likes','comments','shares'] })); const rows = Object.entries(map).filter(([,v])=>v!=null).map(([metric,value])=>({ media_id: m.id, metric, value, fetched_at: now() })); if (rows.length) { await sb.from('ig_media_insights').upsert(rows, { onConflict: 'media_id,metric' }); ok++ } } catch {} }
  console.log('MEDIA INSIGHTS upserted for', ok, 'posts')
}
for (const breakdown of ['age','gender','country']) {
  try { const res = await exec('INSTAGRAM_GET_USER_INSIGHTS', { metric: ['follower_demographics'], period: 'lifetime', metric_type: 'total_value', breakdown }); const buckets = demoBuckets(res); console.log(`DEMO ${breakdown}:`, buckets.length, 'buckets', JSON.stringify(buckets.slice(0,3))); if (buckets.length) await sb.from('ig_demographics').upsert(buckets.map(b => ({ brand, kind: 'follower', breakdown, bucket: b.bucket, value: b.value, fetched_at: now() })), { onConflict: 'brand,kind,breakdown,bucket' }) } catch (e) { console.log(`DEMO ${breakdown}: failed`, String(e).slice(0,120)) }
}
await sb.from('ig_sync_state').upsert({ brand, last_synced_at: now(), last_status: 'ok', last_error: null }, { onConflict: 'brand' })
console.log('\nDONE — brand', brand, 'synced.')
