import { createSupabaseAdmin } from './supabase-admin'
import { getProviderApiKey, type AIProvider } from './ai-config'
import { readFeatureSetting, readAllFeatureSettings } from './feature-settings-file'

// All AI-using menus/features in the app. Each declares which providers it can
// use (first = default) and the default model per provider. The Settings UI
// renders these grouped by `group`; users can change provider/model per feature.

export interface FeatureDef {
  id: string
  group: string
  label: string
  description: string
  supportedProviders: readonly AIProvider[]
  defaultModel: Partial<Record<AIProvider, string>>
}

export const FEATURES: readonly FeatureDef[] = [
  // ── BPI Intelligence ──
  {
    id: 'bpi-content',
    group: 'BPI Intelligence',
    label: 'Buat Konten',
    description: 'Generate headline, caption, dan hashtag dari berita/video sumber',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'bpi-carousel',
    group: 'BPI Intelligence',
    label: 'Generate Carousel',
    description: 'Generate struktur 5-7 slide carousel Instagram dari berita',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'bpi-brief',
    group: 'BPI Intelligence',
    label: 'Brief',
    description: 'Generate brief produksi dari item BPI',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'bpi-news',
    group: 'BPI Intelligence',
    label: 'Tarik Berita YouTube',
    description: 'Fetch metadata + transcript video YouTube untuk sumber konten',
    supportedProviders: ['youtube'],
    defaultModel: {},
  },
  {
    id: 'bpi-carousel-images',
    group: 'BPI Intelligence',
    label: 'Gambar per Slide Carousel',
    description: 'Sumber gambar untuk tiap slide carousel. Default kosong = pencarian Google News (gratis). Pilih provider AI gen di sini untuk pakai gambar yang di-generate (berbayar).',
    supportedProviders: ['leonardo', 'openai', 'stability', 'higgsfield'],
    defaultModel: {
      leonardo: 'kreon-flux-1',
      openai: 'dall-e-3',
      stability: 'stable-diffusion-xl-1024-v1-0',
      higgsfield: 'higgsfield-ai/soul/standard',
    },
  },
  // ── AI Studio ──
  {
    id: 'ai-chat',
    group: 'AI Studio',
    label: 'Chat AI',
    description: 'Conversational AI untuk eksplorasi ide & brainstorming',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'ai-ideas',
    group: 'AI Studio',
    label: 'Pencari Ide',
    description: 'Generate ide konten dari prompt/brief',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'ai-audio',
    group: 'AI Studio',
    label: 'Generator Audio',
    description: 'Generate script narasi audio dengan timing & tone guidance',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'ai-video',
    group: 'AI Studio',
    label: 'Script Video / Storyline',
    description: 'Generate storyline / script video dari brief',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'ai-builder',
    group: 'AI Studio',
    label: 'Builder',
    description: 'AI assistant untuk konten builder',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'ai-content-brief',
    group: 'AI Studio',
    label: 'Content Brief',
    description: 'Generate brief konten siap pakai',
    supportedProviders: ['anthropic', 'openai'],
    defaultModel: { anthropic: 'claude-opus-4-7', openai: 'gpt-4o' },
  },
  {
    id: 'ai-image',
    group: 'AI Studio',
    label: 'Generator Gambar',
    description: 'Generate image dari text prompt — pilih provider sesuai kebutuhan',
    supportedProviders: ['leonardo', 'openai', 'stability', 'higgsfield'],
    defaultModel: {
      leonardo: 'kreon-flux-1',
      openai: 'dall-e-3',
      stability: 'stable-diffusion-xl-1024-v1-0',
      higgsfield: 'soul',
    },
  },
  {
    id: 'ai-video-gen',
    group: 'AI Studio',
    label: 'Video AI Generation',
    description: 'Generate video AI cinematic dari text/image (Higgsfield)',
    supportedProviders: ['higgsfield'],
    defaultModel: { higgsfield: 'higgsfield-1' },
  },
] as const

export interface FeatureConfig {
  featureId: string
  provider: AIProvider
  apiKey: string | null
  model: string | null
  source: 'database' | 'env' | 'none'
}

export interface FeatureRow {
  feature_id: string
  provider: string
  model: string | null
}

// Read feature routing from DB. If row missing or invalid, uses the feature
// definition's default provider + model.
export async function getFeatureConfig(featureId: string): Promise<FeatureConfig> {
  const def = FEATURES.find(f => f.id === featureId)
  if (!def) {
    throw new Error(`Unknown feature: ${featureId}`)
  }

  let provider: AIProvider = def.supportedProviders[0]
  let modelOverride: string | null = null
  let foundInDb = false

  try {
    const sb = createSupabaseAdmin()
    const { data } = await sb
      .from('feature_settings')
      .select('provider, model')
      .eq('feature_id', featureId)
      .maybeSingle()
    const row = data as Partial<FeatureRow> | null
    if (row?.provider && def.supportedProviders.includes(row.provider as AIProvider)) {
      provider = row.provider as AIProvider
      foundInDb = true
    }
    if (row?.model) {
      modelOverride = row.model
      foundInDb = true
    }
  } catch {
    // Table may not exist yet — fall back to file below.
  }

  // File fallback when DB has no row (or table missing).
  if (!foundInDb) {
    const fileRow = await readFeatureSetting(featureId)
    if (fileRow?.provider && def.supportedProviders.includes(fileRow.provider as AIProvider)) {
      provider = fileRow.provider as AIProvider
    }
    if (fileRow?.model) {
      modelOverride = fileRow.model
    }
  }

  const apiKey = await getProviderApiKey(provider)
  const model = modelOverride ?? def.defaultModel[provider] ?? null

  let source: 'database' | 'env' | 'none' = 'none'
  if (apiKey) {
    // Re-read provider source for clarity (cheap because admin client is cached).
    const { getProviderConfig } = await import('./ai-config')
    const cfg = await getProviderConfig(provider)
    source = cfg.source
  }

  return { featureId, provider, apiKey, model, source }
}

// Feature status for the Settings UI — same as FeatureConfig but doesn't expose
// the raw API key, only whether it's set + which source.
export interface FeatureStatus {
  id: string
  group: string
  label: string
  description: string
  supportedProviders: AIProvider[]
  provider: AIProvider
  defaultProvider: AIProvider
  model: string | null
  defaultModel: string | null
  apiKeySet: boolean
  source: 'database' | 'env' | 'none'
}

export async function getAllFeatureStatus(): Promise<FeatureStatus[]> {
  const out: FeatureStatus[] = []

  // Bulk read feature_settings rows once
  let routings: Record<string, FeatureRow> = {}
  try {
    const sb = createSupabaseAdmin()
    const { data } = await sb
      .from('feature_settings')
      .select('feature_id, provider, model')
    const list = (data as Partial<FeatureRow>[] | null) ?? []
    for (const r of list) {
      if (!r.feature_id) continue
      routings[r.feature_id] = {
        feature_id: r.feature_id,
        provider: r.provider ?? '',
        model: r.model ?? null,
      }
    }
  } catch {
    routings = {}
  }

  // File fallback — merge under DB rows so DB takes precedence when both exist.
  const fileRoutings = await readAllFeatureSettings()
  for (const [featureId, fr] of Object.entries(fileRoutings)) {
    if (!routings[featureId]) {
      routings[featureId] = { feature_id: featureId, provider: fr.provider, model: fr.model }
    }
  }

  // For provider source, do a single bulk lookup
  const { getAllProviderStatus } = await import('./ai-config')
  const providerStatuses = await getAllProviderStatus()
  const providerIndex = Object.fromEntries(providerStatuses.map(p => [p.provider, p]))

  for (const def of FEATURES) {
    const row = routings[def.id]
    const defaultProvider = def.supportedProviders[0]
    const provider = (row?.provider && def.supportedProviders.includes(row.provider as AIProvider))
      ? (row.provider as AIProvider)
      : defaultProvider
    const model = row?.model ?? def.defaultModel[provider] ?? null
    const defaultModel = def.defaultModel[provider] ?? null

    const ps = providerIndex[provider]
    const apiKeySet = ps ? (ps.hasDbKey || ps.hasEnvKey) : false
    const source = ps?.source ?? 'none'

    out.push({
      id: def.id,
      group: def.group,
      label: def.label,
      description: def.description,
      supportedProviders: [...def.supportedProviders],
      provider,
      defaultProvider,
      model,
      defaultModel,
      apiKeySet,
      source,
    })
  }

  return out
}

export function isValidFeatureId(id: string): boolean {
  return FEATURES.some(f => f.id === id)
}

export function getFeatureDef(id: string): FeatureDef | undefined {
  return FEATURES.find(f => f.id === id)
}

// Check whether the user has explicitly configured a feature (vs. falling back
// to the first supported provider as default). Used by features where the
// "no config" state means "skip AI / use cheaper alternative" — e.g.,
// bpi-carousel-images where unset = Google News search instead of paid AI gen.
export async function hasUserConfiguredFeature(featureId: string): Promise<boolean> {
  // Try DB first
  try {
    const sb = createSupabaseAdmin()
    const { data } = await sb
      .from('feature_settings')
      .select('feature_id')
      .eq('feature_id', featureId)
      .maybeSingle()
    if (data) return true
  } catch {
    // ignore — fall through to file
  }
  // File fallback
  const fileRow = await readFeatureSetting(featureId)
  return fileRow !== null
}
