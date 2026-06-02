import { NextRequest, NextResponse } from 'next/server'
import { isValidProvider, PROVIDER_ENV_VAR } from '@/lib/ai-config'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { writeEnvVar } from '@/lib/env-local-writer'

// PUT /api/settings/ai/[provider]
// Upsert provider config: api_key, model, enabled, notes.
// Empty string api_key (or null) clears the DB row → falls back to env.
export async function PUT(
  req: NextRequest,
  { params }: { params: { provider: string } },
) {
  const provider = params.provider
  if (!isValidProvider(provider)) {
    return NextResponse.json({ error: 'Invalid provider' }, { status: 400 })
  }

  let body: { api_key?: string | null; model?: string | null; enabled?: boolean; notes?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const update: Record<string, unknown> = { provider }
  if ('api_key' in body) {
    const k = body.api_key?.trim() ?? ''
    update.api_key = k.length === 0 ? null : k
  }
  if ('model' in body) {
    const m = body.model?.trim() ?? ''
    update.model = m.length === 0 ? null : m
  }
  if (typeof body.enabled === 'boolean') update.enabled = body.enabled
  if ('notes' in body) update.notes = body.notes ?? null

  try {
    const sb = createSupabaseAdmin()
    const { error } = await sb
      .from('ai_settings')
      .upsert(update, { onConflict: 'provider' })
    if (error) throw error
    return NextResponse.json({ ok: true, persisted: 'database' })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    // PGRST205 = "Could not find the table" — the user hasn't run the SQL
    // migration yet. Don't fail; persist to .env.local so saves still work
    // out-of-the-box. process.env is mutated in-process so the change is
    // visible to other route handlers immediately (no dev-server restart).
    if (e?.code === 'PGRST205' && 'api_key' in update) {
      try {
        const envName = PROVIDER_ENV_VAR[provider]
        await writeEnvVar(envName, (update.api_key as string | null) ?? null)
        return NextResponse.json({
          ok: true,
          persisted: 'env',
          note: `Disimpan ke .env.local sebagai ${envName} (tabel ai_settings belum dibuat — jalankan docs/sql/ai-settings.sql untuk simpan ke DB).`,
        })
      } catch (envErr) {
        console.error(`[/api/settings/ai/${provider}] PUT env fallback failed`, envErr)
      }
    }
    console.error(`[/api/settings/ai/${provider}] PUT`, err)
    const msg = err instanceof Error ? err.message : 'Failed to save settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
