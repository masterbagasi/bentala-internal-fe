import { Composio } from '@composio/core'
const c = new Composio({ apiKey: process.env.COMPOSIO_API_KEY, toolkitVersions: { instagram: '20260523_00' } })
const info = await c.tools.execute('INSTAGRAM_GET_USER_INFO', { userId: 'socmed:master-bagasi', connectedAccountId: process.argv[2], arguments: { ig_user_id: 'me', graph_api_version: 'v21.0' } })
const d = info?.data || {}
console.log('username       :', d.username)
console.log('account_type   :', d.account_type)
console.log('followers_count:', d.followers_count)
console.log('media_count    :', d.media_count)
