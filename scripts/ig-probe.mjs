// Throwaway probe: validate the Composio SDK surface + Instagram response
// shapes against the live (already-connected) accounts. READ-ONLY.
// Run: node --env-file=.env.local scripts/ig-probe.mjs
import { Composio } from '@composio/core'

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })

function pp(label, v) {
  console.log(`\n===== ${label} =====`)
  console.log(JSON.stringify(v, null, 2)?.slice(0, 2500))
}

const list = await composio.connectedAccounts.list({ statuses: ['ACTIVE'] })
const items = list?.items ?? list?.data ?? list ?? []
console.log('ACTIVE connected accounts:', items.length)
for (const a of items) {
  console.log(' -', { id: a?.id, userId: a?.userId, toolkit: a?.toolkit?.slug ?? a?.toolkitSlug, status: a?.status })
}
// Print the full shape of the first item so we can fix import accessors.
pp('connectedAccounts.list[0] full shape', items[0])

// Pick an Instagram account (prefer bentalaprojectindonesia).
const ig = items.find(a => JSON.stringify(a).toLowerCase().includes('bentalaprojectindonesia')) || items[0]
if (!ig) { console.log('No connected account found.'); process.exit(0) }
const ctx = { userId: ig.userId, connectedAccountId: ig.id }
console.log('\nUsing ctx:', ctx)

const exec = (slug, args) => composio.tools.execute(slug, { ...ctx, arguments: args })

pp('USER_INFO', await exec('INSTAGRAM_GET_USER_INFO', { ig_user_id: 'me', graph_api_version: 'v21.0' }))
pp('USER_INSIGHTS follower_count day', await exec('INSTAGRAM_GET_USER_INSIGHTS', { metric: ['follower_count'], period: 'day' }))
pp('USER_INSIGHTS kpis days_28', await exec('INSTAGRAM_GET_USER_INSIGHTS', { metric: ['reach', 'views', 'total_interactions', 'accounts_engaged'], period: 'days_28' }))
const mediaRes = await exec('INSTAGRAM_GET_IG_USER_MEDIA', { ig_user_id: 'me', limit: 3, fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count' })
pp('USER_MEDIA (limit 3)', mediaRes)
const firstId = mediaRes?.data?.data?.[0]?.id ?? mediaRes?.data?.[0]?.id
if (firstId) pp('MEDIA_INSIGHTS first', await exec('INSTAGRAM_GET_IG_MEDIA_INSIGHTS', { ig_media_id: firstId, metric: ['reach', 'views', 'saved', 'likes', 'comments', 'shares'] }))
pp('DEMOGRAPHICS follower gender', await exec('INSTAGRAM_GET_USER_INSIGHTS', { metric: ['follower_demographics'], period: 'lifetime', metric_type: 'total_value', breakdown: 'gender' }))
console.log('\nDONE')
