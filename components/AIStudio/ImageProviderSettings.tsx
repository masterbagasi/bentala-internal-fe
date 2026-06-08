'use client'

import { useState, useEffect } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'

export interface Provider {
  key: 'leonardo' | 'dalle' | 'stability' | 'higgsfield'
  label: string
  icon: string
  color: string
  description: string
  freeInfo: string
  docsUrl: string
  keyPlaceholder: string
}

export const PROVIDERS: Provider[] = [
  {
    key: 'leonardo',
    label: 'Leonardo.ai',
    icon: '🎨',
    color: '#8b5cf6',
    description: 'High quality AI images. Free tier tersedia.',
    freeInfo: '150 token/hari gratis',
    docsUrl: 'https://app.leonardo.ai/settings/api-keys',
    keyPlaceholder: 'Paste Leonardo API key...',
  },
  {
    key: 'dalle',
    label: 'DALL-E 3',
    icon: '⚡',
    color: '#10a37f',
    description: 'OpenAI image generation. Kualitas terbaik.',
    freeInfo: 'Paid — mulai $0.04/gambar',
    docsUrl: 'https://platform.openai.com/api-keys',
    keyPlaceholder: 'sk-...',
  },
  {
    key: 'stability',
    label: 'Stability AI',
    icon: '🌟',
    color: '#f59e0b',
    description: 'Stable Diffusion. Free tier tersedia.',
    freeInfo: '25 kredit gratis/bulan',
    docsUrl: 'https://platform.stability.ai/account/keys',
    keyPlaceholder: 'sk-...',
  },
  {
    key: 'higgsfield',
    label: 'Higgsfield AI',
    icon: '🎬',
    color: '#0ea5e9',
    description: 'Cinematic AI gen — Soul (image) + DoP/animate (video).',
    freeInfo: 'Paid — credits dari cloud.higgsfield.ai',
    docsUrl: 'https://cloud.higgsfield.ai/',
    keyPlaceholder: 'api_key:api_secret',
  },
]

// Maps frontend provider keys → backend AI Integrations provider names.
// Frontend uses 'dalle' for historical reasons; backend uses 'openai'.
const FRONTEND_TO_BACKEND_PROVIDER: Record<string, string> = {
  leonardo: 'leonardo',
  dalle: 'openai',
  stability: 'stability',
  higgsfield: 'higgsfield',
}

const SERVER_KEY_MARKER = '__server_managed__'

export function useProviderSettings() {
  const [keys, setKeys] = useState<Record<string, string>>({})
  const [activeProvider, setActiveProviderState] = useState<string>('leonardo')

  useEffect(() => {
    try {
      const stored = localStorage.getItem('bentala_image_keys')
      if (stored) setKeys(JSON.parse(stored))
      const active = localStorage.getItem('bentala_image_provider')
      if (active) setActiveProviderState(active)
    } catch {}

    // Bridge to the AI Integrations system: ask the server which providers have
    // a key set (via DB or env). For each that's set but missing from local
    // storage, mark it as connected with a sentinel value so the rest of this
    // hook treats it as "ready". When generating, this sentinel makes the
    // backend resolve the actual key from getProviderApiKey() instead of
    // shipping it from the client.
    void fetch('/api/settings/features')
      .then(r => r.ok ? r.json() : null)
      .then((data: { providers?: Array<{ provider: string; hasDbKey: boolean; hasEnvKey: boolean }> } | null) => {
        if (!data?.providers) return
        const serverConnected: Record<string, boolean> = {}
        for (const p of data.providers) {
          if (p.hasDbKey || p.hasEnvKey) serverConnected[p.provider] = true
        }
        setKeys(prev => {
          const next = { ...prev }
          let changed = false
          for (const fe of PROVIDERS) {
            const beName = FRONTEND_TO_BACKEND_PROVIDER[fe.key]
            if (serverConnected[beName] && !next[fe.key]) {
              next[fe.key] = SERVER_KEY_MARKER
              changed = true
            }
          }
          return changed ? next : prev
        })
      })
      .catch(() => {})
  }, [])

  function saveKey(provider: string, key: string) {
    const next = { ...keys, [provider]: key }
    setKeys(next)
    localStorage.setItem('bentala_image_keys', JSON.stringify(next))
  }

  function removeKey(provider: string) {
    const next = { ...keys }
    delete next[provider]
    setKeys(next)
    localStorage.setItem('bentala_image_keys', JSON.stringify(next))
    if (activeProvider === provider) {
      const remaining = Object.keys(next)[0] ?? 'leonardo'
      setActiveProvider(remaining)
    }
  }

  function setActiveProvider(provider: string) {
    setActiveProviderState(provider)
    localStorage.setItem('bentala_image_provider', provider)
  }

  // For the active provider: if the key is the server-managed sentinel, return
  // '' so the caller doesn't ship it as an API key; the backend will resolve
  // the real key via getProviderApiKey() (DB → env). Otherwise return the
  // raw user-entered key from localStorage.
  const rawActive = keys[activeProvider] ?? ''
  const activeKey = rawActive === SERVER_KEY_MARKER ? '' : rawActive

  return {
    keys,
    activeProvider,
    setActiveProvider,
    saveKey,
    removeKey,
    activeKey,
    isServerManaged: rawActive === SERVER_KEY_MARKER,
  }
}

// Re-export so other components can detect server-managed keys.
export { SERVER_KEY_MARKER }

interface Props {
  onClose: () => void
}

export default function ImageProviderSettings({ onClose }: Props) {
  const t = useT()
  const { keys, saveKey, removeKey } = useProviderSettings()
  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [visible, setVisible] = useState<Record<string, boolean>>({})

  function connect(providerKey: string) {
    const val = inputs[providerKey]?.trim()
    if (!val) return
    saveKey(providerKey, val)
    setInputs(prev => ({ ...prev, [providerKey]: '' }))
  }

  function disconnect(providerKey: string) {
    removeKey(providerKey)
  }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 24, width: '100%', maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>{t('Pengaturan Provider Gambar')}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{t('API key disimpan di browser kamu, tidak dikirim ke server kami.')}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', padding: 4 }}>×</button>
        </div>

        {PROVIDERS.map(provider => {
          const rawKey = keys[provider.key]
          const connected = !!rawKey
          const serverManaged = rawKey === SERVER_KEY_MARKER
          const isVisible = visible[provider.key]

          return (
            <div key={provider.key} style={{ background: 'var(--bg3)', border: `1px solid ${connected ? provider.color + '44' : 'var(--border)'}`, borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: `${provider.color}18`, border: `1px solid ${provider.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>
                    {provider.icon}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{provider.label}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>{provider.freeInfo}</div>
                  </div>
                </div>
                {connected && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#43d9a2' }} />
                    <span style={{ fontSize: 11, color: '#43d9a2', fontWeight: 600 }}>
                      {serverManaged ? 'AI Integrations' : 'Connected'}
                    </span>
                  </div>
                )}
              </div>

              <div style={{ fontSize: 12, color: 'var(--text2)' }}>{provider.description}</div>

              {serverManaged ? (
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                  padding: '8px 10px', background: 'rgba(67,217,162,0.06)', border: '1px solid rgba(67,217,162,0.22)',
                  borderRadius: 6,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
                    {t('Key dikelola via')} <strong style={{ color: 'var(--text)' }}>Settings → AI Integrations</strong>. {t('Generate akan otomatis pakai key tsb.')}
                  </div>
                  <a href="/settings/ai" style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                    {t('Kelola')} →
                  </a>
                </div>
              ) : connected ? (
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ flex: 1, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--text2)', fontFamily: 'monospace' }}>
                    {isVisible ? keys[provider.key] : '••••••••••••••••••••'}
                  </div>
                  <button
                    onClick={() => setVisible(prev => ({ ...prev, [provider.key]: !prev[provider.key] }))}
                    style={{ padding: '6px 10px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text2)', fontSize: 11, cursor: 'pointer' }}
                  >
                    {isVisible ? t('Sembunyikan') : t('Lihat')}
                  </button>
                  <button
                    onClick={() => disconnect(provider.key)}
                    style={{ padding: '6px 10px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 6, color: '#ff6b6b', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                  >
                    Disconnect
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <input
                      type="password"
                      value={inputs[provider.key] ?? ''}
                      onChange={e => setInputs(prev => ({ ...prev, [provider.key]: e.target.value }))}
                      onKeyDown={e => e.key === 'Enter' && connect(provider.key)}
                      placeholder={provider.keyPlaceholder}
                      style={{ flex: 1, fontFamily: 'monospace', fontSize: 12 }}
                    />
                    <button
                      onClick={() => connect(provider.key)}
                      disabled={!inputs[provider.key]?.trim()}
                      style={{
                        padding: '8px 14px', borderRadius: 6, border: 'none',
                        background: inputs[provider.key]?.trim() ? provider.color : 'var(--bg2)',
                        color: inputs[provider.key]?.trim() ? '#fff' : 'var(--text2)',
                        fontSize: 12, fontWeight: 600, cursor: inputs[provider.key]?.trim() ? 'pointer' : 'not-allowed',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Connect
                    </button>
                  </div>
                  <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: provider.color, textDecoration: 'none', opacity: 0.8 }}>
                    → {t('Ambil API key di sini')}
                  </a>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
