import Anthropic from '@anthropic-ai/sdk'
import OpenAI from 'openai'
import { getFeatureConfig, type FeatureConfig } from './ai-features'

// Generic text generation that dispatches to whichever provider the feature
// is configured to use. Each AI route should call generateText() instead of
// instantiating an SDK directly — that way switching provider in the Settings
// UI takes effect without code changes.

export interface GenerateTextOptions {
  /** Feature ID — looks up provider/key/model from feature_settings + ai_settings */
  featureId: string
  /** Single user prompt (gets sent as a `user` message) */
  prompt: string
  /** Max output tokens. Defaults to 2500. */
  maxTokens?: number
  /** Optional system instruction (Claude system prompt / OpenAI system message) */
  system?: string
}

export interface GenerateTextResult {
  text: string
  provider: string
  model: string
}

const DEFAULT_FALLBACK_MODEL: Record<string, string> = {
  anthropic: 'claude-opus-4-7',
  openai: 'gpt-4o',
}

export async function generateText(opts: GenerateTextOptions): Promise<GenerateTextResult> {
  const cfg = await getFeatureConfig(opts.featureId)
  if (!cfg.apiKey) {
    throw new Error(`API key untuk provider "${cfg.provider}" tidak terkonfigurasi. Atur di Settings → AI Integrations.`)
  }
  const model = cfg.model || DEFAULT_FALLBACK_MODEL[cfg.provider] || cfg.provider
  const text = await dispatch(cfg, model, opts)
  return { text, provider: cfg.provider, model }
}

async function dispatch(cfg: FeatureConfig, model: string, opts: GenerateTextOptions): Promise<string> {
  switch (cfg.provider) {
    case 'anthropic': {
      const client = new Anthropic({ apiKey: cfg.apiKey! })
      const message = await client.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 2500,
        system: opts.system,
        messages: [{ role: 'user', content: opts.prompt }],
      })
      const block = message.content[0]
      if (block && 'text' in block && typeof block.text === 'string') {
        return block.text
      }
      return ''
    }
    case 'openai': {
      const client = new OpenAI({ apiKey: cfg.apiKey! })
      const messages: { role: 'system' | 'user'; content: string }[] = []
      if (opts.system) messages.push({ role: 'system', content: opts.system })
      messages.push({ role: 'user', content: opts.prompt })
      const completion = await client.chat.completions.create({
        model,
        max_tokens: opts.maxTokens ?? 2500,
        messages,
      })
      return completion.choices[0]?.message?.content ?? ''
    }
    default:
      throw new Error(`Provider "${cfg.provider}" tidak support text generation. Gunakan anthropic atau openai.`)
  }
}

// Some routes today instantiate Anthropic directly (e.g., bpi-content has a
// retry loop calling `client.messages.create` multiple times). For those we
// expose a lower-level helper that returns the right SDK client + model, so
// they keep their existing structure.
export interface ResolvedTextProvider {
  provider: 'anthropic' | 'openai'
  model: string
  anthropic?: Anthropic
  openai?: OpenAI
}

export async function resolveTextProvider(featureId: string): Promise<ResolvedTextProvider> {
  const cfg = await getFeatureConfig(featureId)
  if (!cfg.apiKey) {
    throw new Error(`API key untuk provider "${cfg.provider}" tidak terkonfigurasi. Atur di Settings → AI Integrations.`)
  }
  const model = cfg.model || DEFAULT_FALLBACK_MODEL[cfg.provider] || cfg.provider
  if (cfg.provider === 'anthropic') {
    return { provider: 'anthropic', model, anthropic: new Anthropic({ apiKey: cfg.apiKey }) }
  }
  if (cfg.provider === 'openai') {
    return { provider: 'openai', model, openai: new OpenAI({ apiKey: cfg.apiKey }) }
  }
  throw new Error(`Provider "${cfg.provider}" tidak support text generation.`)
}

// Helper for the multi-attempt routes (bpi-content, bpi-carousel) — sends one
// message and returns the text. Wraps both providers behind a single call.
export async function callTextOnce(
  resolved: ResolvedTextProvider,
  prompt: string,
  maxTokens: number,
): Promise<string> {
  if (resolved.provider === 'anthropic' && resolved.anthropic) {
    const message = await resolved.anthropic.messages.create({
      model: resolved.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })
    const block = message.content[0]
    if (block && 'text' in block && typeof block.text === 'string') return block.text
    return ''
  }
  if (resolved.provider === 'openai' && resolved.openai) {
    const completion = await resolved.openai.chat.completions.create({
      model: resolved.model,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    })
    return completion.choices[0]?.message?.content ?? ''
  }
  throw new Error(`Cannot call text generation: missing client for provider "${resolved.provider}"`)
}
