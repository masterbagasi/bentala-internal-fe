import { getProviderApiKey } from './ai-config'

// Thin client for the Higgsfield API. Implements the async submit/poll pattern
// described in https://docs.higgsfield.ai/how-to/introduction — POST to a
// model_id endpoint, then poll /requests/{id}/status until completed.

const BASE = 'https://platform.higgsfield.ai'

export type HiggsfieldStatus = 'queued' | 'in_progress' | 'completed' | 'failed' | 'nsfw'

export interface HiggsfieldRequest {
  status: HiggsfieldStatus
  request_id: string
  status_url: string
  cancel_url: string
  images?: { url: string }[]
  video?: { url: string }
  error?: string
}

export interface HiggsfieldClient {
  submit: (modelId: string, args: Record<string, unknown>) => Promise<HiggsfieldRequest>
  status: (requestId: string) => Promise<HiggsfieldRequest>
  cancel: (requestId: string) => Promise<boolean>
  /** Submit then poll until terminal status (completed/failed/nsfw) or timeout. */
  subscribe: (modelId: string, args: Record<string, unknown>, opts?: SubscribeOpts) => Promise<HiggsfieldRequest>
}

interface SubscribeOpts {
  /** Polling interval in ms. Default 2500. */
  pollEveryMs?: number
  /** Total timeout in ms before giving up. Default 5min. */
  timeoutMs?: number
  /** Optional progress callback fired on each poll. */
  onProgress?: (req: HiggsfieldRequest) => void
}

export async function getHiggsfieldClient(): Promise<HiggsfieldClient> {
  const key = await getProviderApiKey('higgsfield')
  if (!key) {
    throw new Error('Higgsfield API key tidak terkonfigurasi. Atur di Settings → AI Integrations → Video.')
  }
  if (!key.includes(':')) {
    throw new Error('Format Higgsfield key salah. Harus "api_key:api_secret" (dua value digabung dengan titik dua). Ambil di https://cloud.higgsfield.ai/')
  }
  return buildClient(key)
}

function buildClient(authValue: string): HiggsfieldClient {
  const headers = {
    Authorization: `Key ${authValue}`,
    'Content-Type': 'application/json',
  }

  async function submit(modelId: string, args: Record<string, unknown>): Promise<HiggsfieldRequest> {
    const res = await fetch(`${BASE}/${modelId}`, {
      method: 'POST', headers, body: JSON.stringify(args),
    })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Higgsfield submit ${res.status}: ${txt.slice(0, 300)}`)
    }
    return res.json() as Promise<HiggsfieldRequest>
  }

  async function status(requestId: string): Promise<HiggsfieldRequest> {
    const res = await fetch(`${BASE}/requests/${requestId}/status`, { headers })
    if (!res.ok) {
      const txt = await res.text()
      throw new Error(`Higgsfield status ${res.status}: ${txt.slice(0, 300)}`)
    }
    return res.json() as Promise<HiggsfieldRequest>
  }

  async function cancel(requestId: string): Promise<boolean> {
    const res = await fetch(`${BASE}/requests/${requestId}/cancel`, { method: 'POST', headers })
    return res.status === 202
  }

  async function subscribe(
    modelId: string,
    args: Record<string, unknown>,
    opts: SubscribeOpts = {},
  ): Promise<HiggsfieldRequest> {
    const pollEvery = opts.pollEveryMs ?? 2500
    const timeout = opts.timeoutMs ?? 5 * 60_000
    const start = Date.now()
    let req = await submit(modelId, args)
    opts.onProgress?.(req)
    while (req.status === 'queued' || req.status === 'in_progress') {
      if (Date.now() - start > timeout) {
        throw new Error(`Higgsfield subscribe timeout setelah ${Math.round(timeout / 1000)}s. Last status: ${req.status}`)
      }
      await new Promise(r => setTimeout(r, pollEvery))
      req = await status(req.request_id)
      opts.onProgress?.(req)
    }
    if (req.status === 'failed') throw new Error(`Higgsfield gagal: ${req.error ?? 'unknown error'}`)
    if (req.status === 'nsfw') throw new Error('Higgsfield: prompt/output gagal moderasi NSFW (credits di-refund)')
    return req
  }

  return { submit, status, cancel, subscribe }
}
