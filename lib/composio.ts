// Server-only Composio access layer. Only import this from API routes — it
// reads COMPOSIO_API_KEY (a server secret) and must never reach the client.
import { Composio } from '@composio/core'

let _client: Composio | null = null
export function composio(): Composio {
  if (_client) return _client
  const apiKey = process.env.COMPOSIO_API_KEY
  if (!apiKey) throw new Error('COMPOSIO_API_KEY is not set')
  _client = new Composio({ apiKey })
  return _client
}

function igAuthConfigId(): string {
  const id = process.env.COMPOSIO_IG_AUTH_CONFIG_ID
  if (!id) throw new Error('COMPOSIO_IG_AUTH_CONFIG_ID is not set')
  return id
}

// userId convention for app-created brand connections.
export const brandUserId = (slug: string) => `socmed:${slug}`

interface ExecCtx { userId: string; connectedAccountId?: string }

interface ExecResult { data?: unknown; successful?: boolean; error?: string | null }

async function exec(slug: string, ctx: ExecCtx, args: Record<string, unknown>): Promise<ExecResult> {
  const res = await composio().tools.execute(slug, {
    userId: ctx.userId,
    connectedAccountId: ctx.connectedAccountId,
    arguments: args,
  })
  return res as ExecResult
}

// ── Instagram reads. Response shapes are handled defensively in
//    lib/social/normalize.ts (values may be double-wrapped, etc.). ──
export const ig = {
  userInfo: (ctx: ExecCtx) =>
    exec('INSTAGRAM_GET_USER_INFO', ctx, { ig_user_id: 'me', graph_api_version: 'v21.0' }),

  userInsights: (ctx: ExecCtx, metric: string[], period: string, extra: Record<string, unknown> = {}) =>
    exec('INSTAGRAM_GET_USER_INSIGHTS', ctx, { metric, period, ...extra }),

  userMedia: (ctx: ExecCtx, after?: string) =>
    exec('INSTAGRAM_GET_IG_USER_MEDIA', ctx, {
      ig_user_id: 'me', limit: 100, ...(after ? { after } : {}),
      fields: 'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count',
    }),

  mediaInsights: (ctx: ExecCtx, mediaId: string, metric: string[]) =>
    exec('INSTAGRAM_GET_IG_MEDIA_INSIGHTS', ctx, { ig_media_id: mediaId, metric }),
}

// ── Connections ──
export async function startInstagramLink(slug: string, callbackUrl: string) {
  // Returns ConnectionRequest: { id, redirectUrl, status, waitForConnection() }
  return composio().connectedAccounts.link(brandUserId(slug), igAuthConfigId(), { callbackUrl })
}

export async function getConnection(connectedAccountId: string) {
  return composio().connectedAccounts.get(connectedAccountId)
}

export async function listActiveInstagram() {
  return composio().connectedAccounts.list({ statuses: ['ACTIVE'] })
}
