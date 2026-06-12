// Generate an Instagram connect (login) link for a brand via Composio.
// Run: node --env-file=.env.local scripts/ig-connect-link.mjs <brandSlug>
import { Composio } from '@composio/core'

const brand = process.argv[2] || 'bpi'
const composio = new Composio({ apiKey: process.env.COMPOSIO_API_KEY })
const authConfigId = process.env.COMPOSIO_IG_AUTH_CONFIG_ID
const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/smm/${brand}/social`

const conn = await composio.connectedAccounts.link(`socmed:${brand}`, authConfigId, { callbackUrl })
console.log('brand           :', brand)
console.log('connectedAccount:', conn.id)
console.log('status          :', conn.status)
console.log('\n>>> Buka link ini untuk login Instagram (email + password):\n')
console.log(conn.redirectUrl)
