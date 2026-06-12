// One-off: create a Composio-managed Instagram auth config in this org and
// print its id. Run: node --env-file=.env.local scripts/ig-create-authconfig.mjs
import { Composio } from '@composio/core'

const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })

// Reuse an existing Instagram auth config if one already exists.
const existing = await composio.authConfigs.list({})
const items = existing?.items ?? existing?.data ?? []
const found = items.find(a => JSON.stringify(a).toLowerCase().includes('instagram'))
if (found) {
  console.log('EXISTING_AUTH_CONFIG_ID=', found.id ?? found.nanoid ?? found)
  process.exit(0)
}

const res = await composio.authConfigs.create('instagram', {
  type: 'use_composio_managed_auth',
  name: 'Instagram (Bentala Internal)',
})
console.log('CREATED:', JSON.stringify(res, null, 2))
