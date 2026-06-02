import { createSupabaseAdmin, type AiSettingsRow } from './supabase-admin'

// Providers the app integrates with. Add new entries here when wiring up a new AI vendor.
export const AI_PROVIDERS = ['anthropic', 'openai', 'youtube', 'leonardo', 'stability', 'higgsfield'] as const
export type AIProvider = typeof AI_PROVIDERS[number]

// Maps each provider to its env-var fallback name. Used both by the settings UI
// (to surface env-vs-DB source) and by getProviderApiKey() for the fallback path.
export const PROVIDER_ENV_VAR: Record<AIProvider, string> = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  youtube: 'YOUTUBE_API_KEY',
  leonardo: 'LEONARDO_API_KEY',
  stability: 'STABILITY_API_KEY',
  higgsfield: 'HIGGSFIELD_API_KEY',
}

// Human-readable labels for the UI.
export const PROVIDER_LABEL: Record<AIProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (DALL-E + GPT)',
  youtube: 'YouTube Data API',
  leonardo: 'Leonardo.ai',
  stability: 'Stability AI',
  higgsfield: 'Higgsfield AI',
}

// Maps each provider to the app features that use it. Drives the "used by" list
// on each settings card so operators know what breaks if a key is missing.
export const PROVIDER_FEATURES: Record<AIProvider, string[]> = {
  anthropic: [
    'BPI Intelligence — generate Konten (headline, caption, hashtag)',
    'BPI Intelligence — generate Carousel Design',
    'BPI Intelligence — Brief',
    'AI Studio — Chat AI',
    'AI Studio — Pencari Ide',
    'AI Studio — Generator Audio (script narasi)',
    'AI Studio — Script Video / Storyline',
    'AI Studio — Builder',
  ],
  openai: [
    'AI Studio — Generator Gambar (DALL-E provider)',
  ],
  youtube: [
    'BPI Intelligence — fetch metadata + transcript YouTube videos',
    'AI Studio — fetch YouTube video info',
  ],
  leonardo: [
    'AI Studio — Generator Gambar (Leonardo provider)',
  ],
  stability: [
    'AI Studio — Generator Gambar (Stability provider)',
  ],
  higgsfield: [
    'AI Studio — Video AI Generation (text/image-to-video)',
    'AI Studio — Generator Gambar (Soul model)',
  ],
}

export interface ProviderConfig {
  apiKey: string | null
  model: string | null
  enabled: boolean
  source: 'database' | 'env' | 'none'
}

export interface ProviderStatus {
  provider: AIProvider
  label: string
  enabled: boolean
  hasDbKey: boolean
  hasEnvKey: boolean
  source: 'database' | 'env' | 'none'
  model: string | null
  notes: string | null
  lastTestedAt: string | null
  lastTestStatus: 'ok' | 'failed' | null
  lastTestMessage: string | null
  features: string[]
  envVar: string
}

// Read provider config (DB first, env fallback). Returns null api_key if neither
// source has a value. Always async — call sites must await.
export async function getProviderConfig(provider: AIProvider): Promise<ProviderConfig> {
  let dbKey: string | null = null
  let dbModel: string | null = null
  let enabled = true

  try {
    const sb = createSupabaseAdmin()
    const { data } = await sb
      .from('ai_settings')
      .select('api_key, model, enabled')
      .eq('provider', provider)
      .maybeSingle()
    const row = data as Partial<AiSettingsRow> | null
    if (row) {
      dbKey = row.api_key ?? null
      dbModel = row.model ?? null
      enabled = row.enabled ?? true
    }
  } catch {
    // Table may not exist yet (migration not run). Silently fall back to env.
  }

  if (enabled && dbKey) {
    return { apiKey: dbKey, model: dbModel, enabled, source: 'database' }
  }

  const envKey = process.env[PROVIDER_ENV_VAR[provider]] ?? null
  if (envKey) {
    return { apiKey: envKey, model: dbModel, enabled, source: 'env' }
  }

  return { apiKey: null, model: dbModel, enabled, source: 'none' }
}

// Convenience for routes that just need the key string.
export async function getProviderApiKey(provider: AIProvider): Promise<string | null> {
  const cfg = await getProviderConfig(provider)
  return cfg.apiKey
}

// Status report for the settings UI. Does NOT return the raw key — only whether
// it's set in DB / env, so the UI can show a status badge without exposing secrets.
export async function getAllProviderStatus(): Promise<ProviderStatus[]> {
  const out: ProviderStatus[] = []

  // Pull all settings rows in one query (defensive — tolerates missing table).
  let rows: Record<string, {
    api_key: string | null
    model: string | null
    enabled: boolean | null
    notes: string | null
    last_tested_at: string | null
    last_test_status: 'ok' | 'failed' | null
    last_test_message: string | null
  }> = {}
  try {
    const sb = createSupabaseAdmin()
    const { data } = await sb
      .from('ai_settings')
      .select('provider, api_key, model, enabled, notes, last_tested_at, last_test_status, last_test_message')
    const list = (data as Partial<AiSettingsRow>[] | null) ?? []
    for (const r of list) {
      if (!r.provider) continue
      rows[r.provider] = {
        api_key: r.api_key ?? null,
        model: r.model ?? null,
        enabled: r.enabled ?? null,
        notes: r.notes ?? null,
        last_tested_at: r.last_tested_at ?? null,
        last_test_status: r.last_test_status ?? null,
        last_test_message: r.last_test_message ?? null,
      }
    }
  } catch {
    rows = {}
  }

  for (const provider of AI_PROVIDERS) {
    const row = rows[provider]
    const hasDbKey = Boolean(row?.api_key)
    const envKey = process.env[PROVIDER_ENV_VAR[provider]]
    const hasEnvKey = Boolean(envKey)
    const enabled = row?.enabled ?? true

    let source: 'database' | 'env' | 'none' = 'none'
    if (enabled && hasDbKey) source = 'database'
    else if (hasEnvKey) source = 'env'

    out.push({
      provider,
      label: PROVIDER_LABEL[provider],
      enabled,
      hasDbKey,
      hasEnvKey,
      source,
      model: row?.model ?? null,
      notes: row?.notes ?? null,
      lastTestedAt: row?.last_tested_at ?? null,
      lastTestStatus: row?.last_test_status ?? null,
      lastTestMessage: row?.last_test_message ?? null,
      features: PROVIDER_FEATURES[provider],
      envVar: PROVIDER_ENV_VAR[provider],
    })
  }

  return out
}

export function isValidProvider(p: string): p is AIProvider {
  return (AI_PROVIDERS as readonly string[]).includes(p)
}
