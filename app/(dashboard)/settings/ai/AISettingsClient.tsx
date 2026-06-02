'use client'

import { useEffect, useMemo, useState } from 'react'

interface ProviderStatus {
  provider: string
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

interface FeatureStatus {
  id: string
  group: string
  label: string
  description: string
  supportedProviders: string[]
  provider: string
  defaultProvider: string
  model: string | null
  defaultModel: string | null
  apiKeySet: boolean
  source: 'database' | 'env' | 'none'
}

// Top-level menu cards — styled to match the AI Studio Hub (subtle pastel tint
// on var(--bg) instead of bright gradients) for consistency with the Bentala
// design system.
interface MenuCard {
  id: string
  title: string
  description: string
  featureIds: string[]
  color: string
  bg: string
  border: string
  illustration: 'globe' | 'wave' | 'film' | 'sparkles' | 'lightbulb' | 'chat' | 'reel'
}

const MENU_CARDS: MenuCard[] = [
  {
    id: 'bpi',
    title: 'BPI Intelligence',
    description: 'Tarik berita, generate konten, carousel, dan brief BPI',
    featureIds: ['bpi-content', 'bpi-carousel', 'bpi-brief', 'bpi-news'],
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.2)',
    illustration: 'globe',
  },
  {
    id: 'audio',
    title: 'Generator Audio',
    description: 'Buat script narasi audio dengan timing & tone guidance',
    featureIds: ['ai-audio'],
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.2)',
    illustration: 'wave',
  },
  {
    id: 'video',
    title: 'Video',
    description: 'Generate script video, storyline, dan render AI cinematic',
    featureIds: ['ai-video', 'ai-video-gen'],
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.2)',
    illustration: 'film',
  },
  {
    id: 'image',
    title: 'Gambar',
    description: 'Generate gambar dari prompt — Leonardo, DALL-E, Stability',
    featureIds: ['ai-image'],
    color: '#43d9a2',
    bg: 'rgba(67,217,162,0.08)',
    border: 'rgba(67,217,162,0.2)',
    illustration: 'sparkles',
  },
  {
    id: 'ideas',
    title: 'Pencarian Ide',
    description: 'Generate ide konten dari brief atau topik',
    featureIds: ['ai-ideas'],
    color: '#f472b6',
    bg: 'rgba(244,114,182,0.08)',
    border: 'rgba(244,114,182,0.2)',
    illustration: 'lightbulb',
  },
  {
    id: 'chat',
    title: 'Chat AI',
    description: 'Conversational AI untuk eksplorasi & brainstorming',
    featureIds: ['ai-chat'],
    color: '#6c63ff',
    bg: 'rgba(108,99,255,0.08)',
    border: 'rgba(108,99,255,0.2)',
    illustration: 'chat',
  },
]

type Tab = 'features' | 'providers'

export default function AISettingsClient() {
  const [tab, setTab] = useState<Tab>('features')
  const [features, setFeatures] = useState<FeatureStatus[]>([])
  const [providers, setProviders] = useState<ProviderStatus[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  async function refetch() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/settings/features')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Gagal load settings')
      setFeatures(data.features ?? [])
      setProviders(data.providers ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal load settings')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refetch() }, [])

  const featureIndex = useMemo(
    () => Object.fromEntries(features.map(f => [f.id, f])),
    [features],
  )
  const providerIndex = useMemo(
    () => Object.fromEntries(providers.map(p => [p.provider, p])),
    [providers],
  )

  const openMenu = openMenuId ? MENU_CARDS.find(m => m.id === openMenuId) : null

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 20,
        borderBottom: '1px solid var(--border)',
      }}>
        <TabButton active={tab === 'features'} onClick={() => setTab('features')}>
          Fitur AI
        </TabButton>
        <TabButton active={tab === 'providers'} onClick={() => setTab('providers')}>
          API Keys
        </TabButton>
      </div>

      {/* Loading / error states */}
      {loading && (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
          Memuat settings...
        </div>
      )}

      {error && !loading && (
        <div style={{
          padding: 20, borderRadius: 12,
          background: 'rgba(255,80,80,0.06)', border: '1px solid rgba(255,80,80,0.22)',
        }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#ff7575', fontSize: 13 }}>Gagal load settings</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{error}</div>
          <div style={{ fontSize: 11, marginTop: 10, color: 'var(--text2)' }}>
            Pastikan tabel <code>ai_settings</code> + <code>feature_settings</code> sudah dibuat.
            Jalankan SQL di <code>docs/sql/ai-settings.sql</code> via Supabase SQL Editor.
          </div>
          <button onClick={refetch} style={{
            marginTop: 12, height: 30, padding: '0 14px', borderRadius: 8,
            background: 'var(--bg3)', border: '1px solid var(--border)',
            color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 600,
          }}>Coba lagi</button>
        </div>
      )}

      {!loading && !error && tab === 'features' && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 14,
        }}>
          {MENU_CARDS.map(card => (
            <MenuCardView
              key={card.id}
              card={card}
              features={card.featureIds.map(id => featureIndex[id]).filter(Boolean)}
              onOpen={() => setOpenMenuId(card.id)}
            />
          ))}
        </div>
      )}

      {!loading && !error && tab === 'providers' && (
        <ProvidersView providers={providers} onChange={refetch} />
      )}

      {openMenu && (
        <ConfigureModal
          menu={openMenu}
          features={openMenu.featureIds.map(id => featureIndex[id]).filter(Boolean)}
          providerIndex={providerIndex}
          onClose={() => setOpenMenuId(null)}
          onChange={refetch}
          onJumpToProviders={() => { setOpenMenuId(null); setTab('providers') }}
        />
      )}
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '10px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: active ? '2px solid var(--accent)' : '2px solid transparent',
        color: active ? 'var(--text)' : 'var(--text2)',
        fontSize: 13, fontWeight: 600, cursor: 'pointer',
        marginBottom: -1,
      }}
    >
      {children}
    </button>
  )
}

// ─── Menu card — Bentala system style (subtle tint, not bright gradient) ─────
function MenuCardView({
  card, features, onOpen,
}: {
  card: MenuCard
  features: FeatureStatus[]
  onOpen: () => void
}) {
  const allKeysSet = features.length > 0 && features.every(f => f.apiKeySet)
  const status: { label: string; color: string; bg: string; border: string } = features.length === 0
    ? { label: 'Belum siap', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' }
    : allKeysSet
      ? { label: '✓ Siap', color: '#43d9a2', bg: 'rgba(67,217,162,0.1)', border: 'rgba(67,217,162,0.28)' }
      : { label: '⚠ Key kosong', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.28)' }

  return (
    <button
      onClick={onOpen}
      style={{
        background: card.bg,
        border: `1px solid ${card.border}`,
        borderRadius: 14,
        padding: '20px 20px 18px',
        cursor: 'pointer',
        transition: 'transform 0.15s, border-color 0.15s',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        textAlign: 'left',
        height: '100%',
        boxSizing: 'border-box',
        color: 'inherit',
        fontFamily: 'inherit',
      }}
      onMouseEnter={e => {
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'
        ;(e.currentTarget as HTMLElement).style.borderColor = card.color + '55'
      }}
      onMouseLeave={e => {
        ;(e.currentTarget as HTMLElement).style.transform = 'translateY(0)'
        ;(e.currentTarget as HTMLElement).style.borderColor = card.border
      }}
    >
      {/* Top row: icon box + arrow */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{
          width: 40, height: 40, borderRadius: 10,
          background: card.bg, border: `1px solid ${card.color}33`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: card.color,
        }}>
          <CardIllustration kind={card.illustration} color={card.color} />
        </div>
        <div style={{ fontSize: 18, color: card.color, opacity: 0.5 }}>→</div>
      </div>

      {/* Title + description */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
          {card.title}
        </div>
        <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
          {card.description}
        </div>
      </div>

      {/* Footer: status pill */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 'auto' }}>
        <span style={{
          fontSize: 10, fontWeight: 700,
          color: status.color, background: status.bg,
          padding: '4px 9px', borderRadius: 999,
          border: `1px solid ${status.border}`,
          letterSpacing: '0.04em',
        }}>{status.label}</span>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>
          {features.length} {features.length === 1 ? 'fitur' : 'fitur'}
        </span>
      </div>
    </button>
  )
}

// SVG illustrations matching the system's flat-line iconography. Color is
// driven by the card's accent so each tile feels distinct without being loud.
function CardIllustration({ kind, color }: { kind: MenuCard['illustration']; color: string }) {
  const props = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 2 }
  if (kind === 'globe') {
    return (
      <svg {...props}>
        <circle cx="12" cy="12" r="10"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
    )
  }
  if (kind === 'wave') {
    return (
      <svg {...props}>
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="23"/>
        <line x1="8" y1="23" x2="16" y2="23"/>
      </svg>
    )
  }
  if (kind === 'film') {
    return (
      <svg {...props}>
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2"/>
      </svg>
    )
  }
  if (kind === 'sparkles') {
    return (
      <svg {...props}>
        <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/>
      </svg>
    )
  }
  if (kind === 'lightbulb') {
    return (
      <svg {...props}>
        <path d="M9 21h6"/>
        <path d="M10 18h4"/>
        <path d="M12 3a6 6 0 0 0-4 10.5c.4.4.7.9.9 1.5h6.2c.2-.6.5-1.1.9-1.5A6 6 0 0 0 12 3z"/>
      </svg>
    )
  }
  // chat
  return (
    <svg {...props}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
}

// ─── Configure modal ──────────────────────────────────────────────────────────
function ConfigureModal({
  menu, features, providerIndex, onClose, onChange, onJumpToProviders,
}: {
  menu: MenuCard
  features: FeatureStatus[]
  providerIndex: Record<string, ProviderStatus>
  onClose: () => void
  onChange: () => void
  onJumpToProviders: () => void
}) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, animation: 'fadeIn 0.15s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg2)', border: '1px solid var(--border)',
          borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '92vh',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
          animation: 'modalIn 0.22s cubic-bezier(0.2, 0.8, 0.2, 1)',
        }}
      >
        {/* Header — Bentala system style: var(--bg2) with subtle tint accent */}
        <div style={{
          padding: '16px 20px',
          background: menu.bg,
          borderBottom: `1px solid ${menu.border}`,
          display: 'flex', alignItems: 'center', gap: 12,
        }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: menu.bg, border: `1px solid ${menu.color}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: menu.color, flexShrink: 0,
          }}>
            <CardIllustration kind={menu.illustration} color={menu.color} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{menu.title}</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2, lineHeight: 1.4 }}>{menu.description}</div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'var(--bg3)', border: '1px solid var(--border)',
              color: 'var(--text2)', cursor: 'pointer', fontSize: 13,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}
          >✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: 'var(--text2)',
            textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 12,
          }}>
            Sub-fitur ({features.length})
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {features.length === 0 && (
              <div style={{ padding: 16, color: 'var(--text2)', fontSize: 12 }}>
                Tidak ada sub-fitur untuk menu ini.
              </div>
            )}
            {features.map(f => (
              <FeatureConfigBlock
                key={f.id}
                feature={f}
                providerIndex={providerIndex}
                onChange={onChange}
                onJumpToProviders={onJumpToProviders}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function FeatureConfigBlock({
  feature, providerIndex, onChange, onJumpToProviders,
}: {
  feature: FeatureStatus
  providerIndex: Record<string, ProviderStatus>
  onChange: () => void
  onJumpToProviders: () => void
}) {
  const [providerInput, setProviderInput] = useState(feature.provider)
  const [modelInput, setModelInput] = useState(feature.model ?? '')
  const [saving, setSaving] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)
  const [opNote, setOpNote] = useState<string | null>(null)
  const [savedFlash, setSavedFlash] = useState(false)

  const providerStatus = providerIndex[providerInput]
  const dirty = providerInput !== feature.provider || (modelInput.trim() || null) !== feature.model

  async function handleSave() {
    setSaving(true)
    setOpError(null)
    setOpNote(null)
    try {
      const res = await fetch(`/api/settings/features/${feature.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerInput, model: modelInput.trim() || null }),
      })
      const data = await res.json() as { ok?: boolean; error?: string; persisted?: 'database' | 'file'; note?: string }
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan')
      if (data.note) setOpNote(data.note)
      setSavedFlash(true)
      setTimeout(() => setSavedFlash(false), 2500)
      onChange()
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div style={{
      padding: 14, borderRadius: 10,
      background: 'var(--bg3)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{feature.label}</div>
          <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 3, lineHeight: 1.5 }}>
            {feature.description}
          </div>
        </div>
        {!feature.apiKeySet && (
          <span style={{
            fontSize: 9, fontWeight: 700, color: '#f59e0b',
            background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)',
            padding: '3px 8px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase',
            flexShrink: 0, whiteSpace: 'nowrap',
          }}>Key kosong</span>
        )}
      </div>

      {/* Provider dropdown */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Provider AI</label>
        <div style={{ position: 'relative' }}>
          <select
            value={providerInput}
            onChange={e => setProviderInput(e.target.value)}
            style={{
              width: '100%',
              height: 38,
              padding: '0 36px 0 12px',
              borderRadius: 8,
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
              fontSize: 13,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
              appearance: 'none',
              outline: 'none',
            }}
          >
            {/* Compatible providers — actually wired up to this feature's route. */}
            <optgroup label="✓ Cocok untuk fitur ini">
              {feature.supportedProviders.map(p => {
                const ps = providerIndex[p]
                const ready = ps && (ps.hasDbKey || ps.hasEnvKey)
                return (
                  <option key={p} value={p}>
                    {ps?.label ?? p} {ready ? '— ✓ siap' : '— key kosong'}
                  </option>
                )
              })}
            </optgroup>
            {/* Other connected providers — shown so users know they're configured,
                but disabled because the route doesn't know how to dispatch to them
                for this feature type (e.g., Higgsfield can't do text gen). */}
            {(() => {
              const others = Object.values(providerIndex).filter(
                p => !(feature.supportedProviders as readonly string[]).includes(p.provider)
              )
              if (others.length === 0) return null
              return (
                <optgroup label="✗ Tidak support fitur ini">
                  {others.map(p => {
                    const ready = p.hasDbKey || p.hasEnvKey
                    const capability = PROVIDER_CAPABILITY[p.provider] ?? 'specialized'
                    return (
                      <option key={p.provider} value={p.provider} disabled>
                        {p.label} — {capability}
                        {ready ? ' (terhubung)' : ' (belum terhubung)'}
                      </option>
                    )
                  })}
                </optgroup>
              )
            })()}
          </select>
          {/* Custom chevron */}
          <svg
            width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="var(--text2)" strokeWidth="2.5"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
          >
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        </div>
        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4, lineHeight: 1.45 }}>
          {feature.supportedProviders.length === 1
            ? 'Fitur ini hanya support 1 provider (provider lain disabled karena fungsinya beda).'
            : `Provider abu-abu = kapabilitasnya tidak match. Cek kanan tiap nama (mis. "image only") untuk tahu kenapa.`
          }
        </div>
      </div>

      {/* Model */}
      <div style={{ marginBottom: 10 }}>
        <label style={labelStyle}>Model (opsional)</label>
        <input
          type="text" value={modelInput}
          onChange={e => setModelInput(e.target.value)}
          placeholder={feature.defaultModel ?? 'kosongkan untuk default'}
          style={inputStyle}
        />
        <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>
          Default: <code>{feature.defaultModel ?? '(provider default)'}</code>
        </div>
      </div>

      {/* Provider key indicator */}
      {providerStatus && (
        <div style={{
          padding: '8px 10px', borderRadius: 8,
          background: 'var(--bg2)', border: '1px solid var(--border)',
          marginBottom: 10, fontSize: 11.5, color: 'var(--text2)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
        }}>
          <span>
            API key <strong style={{ color: 'var(--text)' }}>{providerStatus.label}</strong>:
            {' '}{providerStatus.hasDbKey ? '✓ DB' : providerStatus.hasEnvKey ? '✓ env' : '✗ kosong'}
          </span>
          <button onClick={onJumpToProviders} style={{
            background: 'transparent', border: 'none', color: 'var(--accent)',
            fontWeight: 700, fontSize: 11, cursor: 'pointer', padding: 0,
          }}>Kelola key →</button>
        </div>
      )}

      {opError && <div style={{ fontSize: 11.5, color: '#ff6b6b', marginBottom: 8 }}>{opError}</div>}

      {opNote && savedFlash && (
        <div style={{
          fontSize: 11, color: '#43d9a2', marginBottom: 8,
          padding: '6px 10px', borderRadius: 6,
          background: 'rgba(67,217,162,0.08)', border: '1px solid rgba(67,217,162,0.25)',
          lineHeight: 1.5,
        }}>
          ✓ Tersimpan. {opNote}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button onClick={handleSave} disabled={saving || !dirty} style={btnPrimaryStyle(saving || !dirty)}>
          {saving ? 'Menyimpan...' : 'Simpan'}
        </button>
        {savedFlash && !opNote && (
          <span style={{ fontSize: 11, color: '#43d9a2', fontWeight: 700 }}>✓ Tersimpan</span>
        )}
      </div>
    </div>
  )
}

// ─── Providers tab ────────────────────────────────────────────────────────────
function ProvidersView({ providers, onChange }: { providers: ProviderStatus[]; onChange: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{
        padding: 12, borderRadius: 10,
        background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.2)',
        fontSize: 12, color: 'var(--text2)', lineHeight: 1.5,
      }}>
        <strong style={{ color: 'var(--text)' }}>API Keys per Provider.</strong>{' '}
        Key disimpan sekali per provider — semua fitur yang pakai provider tersebut otomatis ikut. Kalau key DB kosong, fallback ke env var.
      </div>
      {providers.map(p => (
        <ProviderCard key={p.provider} status={p} onChange={onChange} />
      ))}
    </div>
  )
}

// Capability tag rendered next to provider names in the "incompatible" group
// of the feature config dropdown — explains *why* a provider can't be picked.
const PROVIDER_CAPABILITY: Record<string, string> = {
  anthropic: 'text/LLM',
  openai: 'text + image',
  youtube: 'fetch metadata YouTube',
  leonardo: 'image only',
  stability: 'image only',
  higgsfield: 'image/video only',
}

// Per-provider hints rendered inside the connect form so users know where to
// get the key and what format is expected. Keeps copy close to the input.
const PROVIDER_HINTS: Record<string, { dashboard: string; format: string; tip?: string }> = {
  anthropic: {
    dashboard: 'https://console.anthropic.com/settings/keys',
    format: 'sk-ant-api03-...',
    tip: 'Butuh credit balance di console.anthropic.com — Claude.ai subscription tidak otomatis include API.',
  },
  openai: {
    dashboard: 'https://platform.openai.com/api-keys',
    format: 'sk-proj-... atau sk-...',
    tip: 'Pakai project key (sk-proj-) untuk batas akses lebih ketat.',
  },
  youtube: {
    dashboard: 'https://console.cloud.google.com/apis/credentials',
    format: 'AIza...',
    tip: 'Enable "YouTube Data API v3" di Google Cloud Console dulu sebelum bikin key.',
  },
  leonardo: {
    dashboard: 'https://app.leonardo.ai/api-access',
    format: 'plain string',
  },
  stability: {
    dashboard: 'https://platform.stability.ai/account/keys',
    format: 'sk-...',
  },
  higgsfield: {
    dashboard: 'https://cloud.higgsfield.ai/',
    format: 'api_key:api_secret (dua nilai digabung titik dua)',
    tip: 'Higgsfield wajib dua nilai. Single UUID akan ditolak dengan 401 Invalid credentials.',
  },
}

function ProviderCard({ status, onChange }: { status: ProviderStatus; onChange: () => void }) {
  const [editing, setEditing] = useState(false)
  const [keyInput, setKeyInput] = useState('')
  const [modelInput, setModelInput] = useState(status.model ?? '')
  const [enabledInput, setEnabledInput] = useState(status.enabled)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [opError, setOpError] = useState<string | null>(null)
  const [opNote, setOpNote] = useState<string | null>(null)
  const [showKey, setShowKey] = useState(false)

  const hint = PROVIDER_HINTS[status.provider]
  const hasKey = status.source !== 'none'
  const isHealthy = status.lastTestStatus === 'ok'
  const isBroken = status.lastTestStatus === 'failed'

  async function handleSave() {
    setSaving(true)
    setOpError(null)
    setOpNote(null)
    try {
      const body: Record<string, unknown> = {
        enabled: enabledInput,
        model: modelInput.trim() || null,
      }
      const trimmedKey = keyInput.trim()
      const keyChanged = trimmedKey.length > 0
      if (keyChanged) {
        body.api_key = trimmedKey === '(remove)' ? null : trimmedKey
      }
      const res = await fetch(`/api/settings/ai/${status.provider}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json() as { ok?: boolean; error?: string; persisted?: 'database' | 'env'; note?: string }
      if (!res.ok) throw new Error(data.error || 'Gagal menyimpan')
      setEditing(false)
      setKeyInput('')
      if (data.note) setOpNote(data.note)
      onChange()

      // Auto-test connection right after save when a fresh key was provided —
      // gives instant ✓/✗ feedback without an extra click.
      if (keyChanged && trimmedKey !== '(remove)') {
        await runTest()
      }
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Gagal menyimpan')
    } finally {
      setSaving(false)
    }
  }

  async function runTest() {
    setTesting(true)
    setOpError(null)
    try {
      const res = await fetch(`/api/settings/ai/${status.provider}/test`, { method: 'POST' })
      const data = await res.json()
      if (data.status === 'failed') {
        setOpError(`Test gagal: ${data.message}`)
      }
      onChange()
    } catch (e) {
      setOpError(e instanceof Error ? e.message : 'Gagal melakukan test')
    } finally {
      setTesting(false)
    }
  }

  const handleTest = runTest

  // Connection status: combines source (key set anywhere?) + last test result.
  const connectionStatus: { label: string; color: string; bg: string; border: string } = (() => {
    if (!hasKey) return { label: '○ Belum terhubung', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)', border: 'rgba(148,163,184,0.25)' }
    if (isBroken) return { label: '✗ Test gagal', color: '#ff7575', bg: 'rgba(255,82,82,0.1)', border: 'rgba(255,82,82,0.28)' }
    if (isHealthy) return { label: '✓ Terhubung', color: '#43d9a2', bg: 'rgba(67,217,162,0.1)', border: 'rgba(67,217,162,0.28)' }
    return { label: '◐ Key set, belum di-test', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)', border: 'rgba(245,158,11,0.28)' }
  })()

  const sourceBadge: { label: string; color: string; bg: string } = (() => {
    if (status.source === 'database') return { label: 'DB', color: '#43d9a2', bg: 'rgba(67,217,162,0.1)' }
    if (status.source === 'env') return { label: '.env.local', color: '#f59e0b', bg: 'rgba(245,158,11,0.1)' }
    return { label: 'Kosong', color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' }
  })()

  const primaryLabel = editing ? 'Batal' : hasKey ? 'Update key' : '+ Connect'

  return (
    <div style={{
      borderRadius: 12, background: 'var(--bg2)',
      border: '1px solid var(--border)', padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              {status.label}
            </h3>
            {/* Connection status pill — primary signal */}
            <span style={{
              fontSize: 10, fontWeight: 700,
              color: connectionStatus.color, background: connectionStatus.bg,
              border: `1px solid ${connectionStatus.border}`,
              padding: '3px 9px', borderRadius: 999, letterSpacing: '0.02em',
            }}>{connectionStatus.label}</span>
            {/* Source pill — secondary, smaller */}
            {hasKey && (
              <span style={{
                fontSize: 9, fontWeight: 700, color: sourceBadge.color, background: sourceBadge.bg,
                padding: '2px 7px', borderRadius: 999, letterSpacing: '0.04em', textTransform: 'uppercase',
                opacity: 0.85,
              }}>{sourceBadge.label}</span>
            )}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4, fontFamily: 'monospace' }}>
            env fallback: {status.envVar}{status.hasEnvKey ? ' ✓' : ' (not set)'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {hasKey && (
            <button onClick={handleTest} disabled={testing} style={btnStyle(testing)}>
              {testing ? 'Testing...' : '↻ Test'}
            </button>
          )}
          <button onClick={() => { setEditing(e => !e); setOpError(null); setOpNote(null); setKeyInput('') }} style={btnStyle(false, true)}>
            {primaryLabel}
          </button>
        </div>
      </div>

      {status.lastTestStatus && !editing && (
        <div style={{
          padding: '7px 10px', borderRadius: 8, marginBottom: 10, fontSize: 11,
          background: status.lastTestStatus === 'ok' ? 'rgba(67,217,162,0.08)' : 'rgba(255,82,82,0.08)',
          border: `1px solid ${status.lastTestStatus === 'ok' ? 'rgba(67,217,162,0.25)' : 'rgba(255,82,82,0.25)'}`,
          color: status.lastTestStatus === 'ok' ? '#43d9a2' : '#ff7575',
        }}>
          <strong>{status.lastTestStatus === 'ok' ? '✓ Test OK' : '✗ Test gagal'}</strong>
          {status.lastTestedAt && <span style={{ opacity: 0.7, marginLeft: 6 }}>{new Date(status.lastTestedAt).toLocaleString('id-ID')}</span>}
          {status.lastTestMessage && <div style={{ fontFamily: 'monospace', fontSize: 10, marginTop: 2 }}>{status.lastTestMessage}</div>}
        </div>
      )}

      {editing && (
        <div style={{
          padding: 12, borderRadius: 10, background: 'var(--bg3)',
          border: '1px solid var(--border)', marginBottom: 10,
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {hint && (
            <div style={{
              padding: '8px 10px', borderRadius: 6,
              background: status.provider === 'higgsfield' ? 'rgba(245,158,11,0.08)' : 'rgba(108,99,255,0.06)',
              border: `1px solid ${status.provider === 'higgsfield' ? 'rgba(245,158,11,0.28)' : 'rgba(108,99,255,0.22)'}`,
              fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
            }}>
              <div style={{ marginBottom: 4 }}>
                <strong style={{ color: 'var(--text)' }}>Cara dapat key:</strong>{' '}
                <a href={hint.dashboard} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontWeight: 700 }}>
                  {hint.dashboard.replace(/^https?:\/\//, '')}
                </a>
              </div>
              <div>
                <strong style={{ color: 'var(--text)' }}>Format:</strong>{' '}
                <code style={{ fontSize: 10 }}>{hint.format}</code>
              </div>
              {hint.tip && (
                <div style={{ marginTop: 4, fontSize: 10, opacity: 0.85 }}>
                  💡 {hint.tip}
                </div>
              )}
            </div>
          )}
          <div>
            <label style={labelStyle}>API Key</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type={showKey ? 'text' : 'password'}
                value={keyInput}
                onChange={e => setKeyInput(e.target.value)}
                placeholder={hint?.format ?? (status.hasDbKey ? '••• key tersimpan — kosongkan untuk biarkan, isi untuk ganti' : 'Tempel API key')}
                style={inputStyle}
                autoComplete="off" spellCheck={false}
              />
              <button type="button" onClick={() => setShowKey(s => !s)} style={{ ...btnStyle(false), padding: '0 12px' }}>
                {showKey ? '🙈' : '👁'}
              </button>
            </div>
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 3 }}>
              Ketik <code>(remove)</code> untuk hapus key.
            </div>
          </div>

          <div>
            <label style={labelStyle}>Model default (opsional)</label>
            <input
              type="text" value={modelInput} onChange={e => setModelInput(e.target.value)}
              placeholder="kosongkan untuk default"
              style={inputStyle}
            />
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}>
            <input type="checkbox" checked={enabledInput} onChange={e => setEnabledInput(e.target.checked)} />
            Enabled
          </label>

          {opError && <div style={{ fontSize: 11, color: '#ff6b6b' }}>{opError}</div>}

          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <button onClick={handleSave} disabled={saving || testing} style={btnPrimaryStyle(saving || testing)}>
              {saving
                ? 'Menyimpan...'
                : testing
                  ? 'Testing...'
                  : keyInput.trim().length > 0
                    ? '⚡ Connect & Test'
                    : 'Simpan'}
            </button>
            <button onClick={() => { setEditing(false); setKeyInput(''); setOpError(null); setOpNote(null) }} style={btnStyle(saving || testing)}>Batal</button>
          </div>
        </div>
      )}

      {!editing && opError && <div style={{ fontSize: 11, color: '#ff6b6b', marginBottom: 10 }}>{opError}</div>}
      {opNote && !editing && (
        <div style={{
          fontSize: 11, color: '#43d9a2', marginBottom: 10,
          padding: '7px 10px', borderRadius: 6,
          background: 'rgba(67,217,162,0.08)', border: '1px solid rgba(67,217,162,0.25)',
        }}>
          ✓ Tersimpan. {opNote}
        </div>
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  borderRadius: 8,
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 12,
  fontFamily: 'monospace',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '1px',
  marginBottom: 5,
}

function btnStyle(disabled: boolean, accent = false): React.CSSProperties {
  return {
    height: 30, padding: '0 12px', borderRadius: 8,
    background: accent ? 'var(--accent)' : 'var(--bg3)',
    border: '1px solid var(--border)',
    color: accent ? '#fff' : 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11, fontWeight: 600,
    opacity: disabled ? 0.5 : 1,
    flexShrink: 0, whiteSpace: 'nowrap',
  }
}

function btnPrimaryStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 16px', borderRadius: 8,
    background: 'var(--accent)', border: 'none', color: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 11, fontWeight: 700,
    opacity: disabled ? 0.5 : 1,
  }
}
