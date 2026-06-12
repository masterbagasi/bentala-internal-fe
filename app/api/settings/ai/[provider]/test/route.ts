import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { isValidProvider, getProviderConfig, type AIProvider } from '@/lib/ai-config'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { requireSectionOrSuper } from '@/lib/api-auth'

// POST /api/settings/ai/[provider]/test
// Pings the provider with a minimal request to validate the API key + reachability.
// Persists the result to ai_settings.last_test_* so the UI can show status badges.
export async function POST(
  _req: Request,
  { params }: { params: { provider: string } },
) {
  const auth = await requireSectionOrSuper('settings.ai')
  if (auth instanceof NextResponse) return auth
  const provider = params.provider
  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  const cfg = await getProviderConfig(provider)
  if (!cfg.apiKey) {
    return await persistAndReturn(provider, 'failed', 'No API key set in DB or env')
  }

  try {
    const message = await runTest(provider, cfg.apiKey)
    return await persistAndReturn(provider, 'ok', message)
  } catch (err) {
    const msg = extractErrorMessage(err)
    return await persistAndReturn(provider, 'failed', msg)
  }
}

async function runTest(provider: AIProvider, apiKey: string): Promise<string> {
  switch (provider) {
    case 'anthropic': {
      const client = new Anthropic({ apiKey })
      // Cheapest possible ping — 1 token output, smallest model.
      const res = await client.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'hi' }],
      })
      return `OK — connected. Model: ${res.model}`
    }
    case 'openai': {
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`)
      }
      const data = await res.json() as { data?: Array<{ id: string }> }
      return `OK — ${data.data?.length ?? 0} models accessible`
    }
    case 'youtube': {
      const res = await fetch(
        `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=dQw4w9WgXcQ&key=${apiKey}`,
        { signal: AbortSignal.timeout(10000) },
      )
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`YouTube ${res.status}: ${txt.slice(0, 200)}`)
      }
      return 'OK — YouTube Data API responding'
    }
    case 'leonardo': {
      const res = await fetch('https://cloud.leonardo.ai/api/rest/v1/me', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Leonardo ${res.status}: ${txt.slice(0, 200)}`)
      }
      return 'OK — Leonardo authenticated'
    }
    case 'stability': {
      const res = await fetch('https://api.stability.ai/v1/user/account', {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(`Stability ${res.status}: ${txt.slice(0, 200)}`)
      }
      return 'OK — Stability authenticated'
    }
    case 'higgsfield': {
      // Higgsfield auth (per https://docs.higgsfield.ai/how-to/introduction):
      //   Authorization: Key <api_key>:<api_secret>
      // The key value stored in our settings MUST already be the colon-joined
      // form ("abc123:xyz789"). We surface a clear error if the format looks
      // wrong so the user knows to re-enter both halves.
      if (!apiKey.includes(':')) {
        throw new Error('Format key salah. Higgsfield butuh "api_key:api_secret" (dua value digabung dengan titik dua). Ambil keduanya dari https://cloud.higgsfield.ai/')
      }
      // Probe a status endpoint for a non-existent request — returns 404 if
      // auth is valid (request not found), 401/403 if auth is rejected.
      const fakeId = '00000000-0000-0000-0000-000000000000'
      const res = await fetch(`https://platform.higgsfield.ai/requests/${fakeId}/status`, {
        headers: { Authorization: `Key ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      })
      if (res.status === 401) {
        const txt = await res.text()
        throw new Error(`Higgsfield 401 Invalid credentials. Pastikan key+secret benar dari https://cloud.higgsfield.ai/. Detail: ${txt.slice(0, 150)}`)
      }
      if (res.status === 403) {
        throw new Error('Higgsfield 403 — auth valid tapi akses ke API ditolak. Cek plan akun di cloud.higgsfield.ai')
      }
      // 404 = auth diterima, request_id tidak ada (expected). Anything else is fine too.
      return `OK — Higgsfield authenticated (probe HTTP ${res.status})`
    }
  }
}

function extractErrorMessage(err: unknown): string {
  // Anthropic SDK error: { error: { error: { message } } }
  if (err && typeof err === 'object') {
    const e = err as { error?: { error?: { message?: string } }; message?: string }
    if (typeof e.error?.error?.message === 'string') return e.error.error.message
    if (typeof e.message === 'string') return e.message
  }
  return String(err)
}

async function persistAndReturn(provider: string, status: 'ok' | 'failed', message: string) {
  try {
    const sb = createSupabaseAdmin()
    await sb
      .from('ai_settings')
      .upsert({
        provider,
        last_tested_at: new Date().toISOString(),
        last_test_status: status,
        last_test_message: message,
      }, { onConflict: 'provider' })
  } catch {
    // Don't fail the response just because we couldn't persist.
  }
  return NextResponse.json({ status, message })
}
