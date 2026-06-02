import { NextRequest, NextResponse } from 'next/server'
import { isValidFeatureId, getFeatureDef } from '@/lib/ai-features'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { writeFeatureSetting } from '@/lib/feature-settings-file'

// PUT /api/settings/features/[id]
// Body: { provider?: string, model?: string | null }
// Validates that provider is in feature.supportedProviders before writing.
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const id = params.id
  if (!isValidFeatureId(id)) {
    return NextResponse.json({ error: 'Unknown feature' }, { status: 400 })
  }
  const def = getFeatureDef(id)!

  let body: { provider?: string; model?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const update: Record<string, unknown> = { feature_id: id }

  if (typeof body.provider === 'string') {
    if (!(def.supportedProviders as readonly string[]).includes(body.provider)) {
      return NextResponse.json({
        error: `Provider "${body.provider}" tidak didukung untuk fitur ini. Pilihan: ${def.supportedProviders.join(', ')}`,
      }, { status: 400 })
    }
    update.provider = body.provider
  } else {
    update.provider = def.supportedProviders[0]
  }

  if ('model' in body) {
    const m = body.model?.trim?.() ?? ''
    update.model = m.length === 0 ? null : m
  }

  try {
    const sb = createSupabaseAdmin()
    const { error } = await sb
      .from('feature_settings')
      .upsert(update, { onConflict: 'feature_id' })
    if (error) throw error
    return NextResponse.json({ ok: true, persisted: 'database' })
  } catch (err) {
    const e = err as { code?: string; message?: string }
    // Fallback to file-based store when feature_settings table doesn't exist.
    // Same UX as the env.local fallback for ai_settings — UI keeps working
    // before user runs the SQL migration.
    if (e?.code === 'PGRST205') {
      try {
        await writeFeatureSetting(id, {
          provider: update.provider as string,
          model: (update.model as string | null | undefined) ?? null,
        })
        return NextResponse.json({
          ok: true,
          persisted: 'file',
          note: `Disimpan ke .ai-feature-settings.json (tabel feature_settings belum dibuat — jalankan docs/sql/ai-settings.sql untuk simpan ke DB).`,
        })
      } catch (fileErr) {
        console.error(`[/api/settings/features/${id}] PUT file fallback failed`, fileErr)
      }
    }
    console.error(`[/api/settings/features/${id}] PUT`, err)
    const msg = err instanceof Error ? err.message : 'Failed to save feature settings'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
