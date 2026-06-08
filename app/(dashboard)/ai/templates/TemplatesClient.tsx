'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import UploadTemplateModal from '../image/UploadTemplateModal'
import { PageShell } from '@/components/shared/PageShell'
import BentalaCoverEditor from './BentalaCoverEditor'
import { TemplateIGFeed } from '@/components/AIStudio/Designs/TemplateIGFeed'
import { IG_FEED_COVER, IG_REELS_COVER } from '@/components/AIStudio/Designs/designConstants'
import {
  STYLE_OPTIONS, RATIO_OPTIONS, STARTER_TEMPLATES,
  type ServerTemplate, type StarterTemplate, type BrandKey, type ProviderBadge,
  fetchAiImageProviderBadge,
} from '@/lib/image-page-shared'
import { useT } from '@/lib/i18n/LanguageProvider'

// Templates page: browse / upload / use templates. Click a template → opens
// inline edit panel where user fills [PLACEHOLDERS] and generates.

interface ActiveTemplate {
  id: string
  name: string
  description: string
  ratio: string
  style: string
  prompt: string
  image_dataurl?: string | null
  isUser: boolean
}

function starterToActive(t: StarterTemplate): ActiveTemplate {
  return {
    id: t.id, name: t.label, description: t.description,
    ratio: t.ratio, style: t.style, prompt: t.prompt,
    image_dataurl: null, isUser: false,
  }
}

function userToActive(t: ServerTemplate): ActiveTemplate {
  return {
    id: t.id, name: t.name, description: t.description,
    ratio: t.ratio, style: t.style, prompt: t.prompt,
    image_dataurl: t.image_dataurl, isUser: true,
  }
}

export default function TemplatesClient() {
  const t = useT()
  const [brand, setBrand] = useState<BrandKey>('bpi')
  const [userTemplates, setUserTemplates] = useState<ServerTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  // Track which Bentala layout template is open (null = closed)
  const [bentalaCoverFormat, setBentalaCoverFormat] = useState<'feed' | 'reels' | null>(null)
  const [active, setActive] = useState<ActiveTemplate | null>(null)
  const [providerBadge, setProviderBadge] = useState<ProviderBadge | null>(null)

  // Generate state (driven by `active` template after edits)
  const [editedPrompt, setEditedPrompt] = useState('')
  const [editedStyle, setEditedStyle] = useState('cinematic portrait photography')
  const [editedRatio, setEditedRatio] = useState('4:5')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genResult, setGenResult] = useState<string | null>(null)

  const refreshTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/image-templates')
      if (!res.ok) return
      const data = await res.json() as { templates?: ServerTemplate[] }
      setUserTemplates(data.templates ?? [])
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refreshTemplates() }, [refreshTemplates])
  useEffect(() => { void fetchAiImageProviderBadge().then(setProviderBadge) }, [])

  function selectTemplate(t: ActiveTemplate) {
    setActive(t)
    setEditedPrompt(t.prompt)
    setEditedStyle(t.style)
    setEditedRatio(t.ratio)
    setGenError(null)
    setGenResult(null)
  }

  function clearActive() {
    setActive(null)
    setEditedPrompt('')
    setGenResult(null)
    setGenError(null)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus template ini?'))) return
    try {
      const res = await fetch(`/api/image-templates/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? t('Gagal hapus'))
      }
      if (active?.id === id) clearActive()
      await refreshTemplates()
    } catch (e) {
      alert(`${t('Gagal hapus')}: ${e instanceof Error ? e.message : 'unknown'}`)
    }
  }

  async function handleGenerate() {
    if (!active || !editedPrompt.trim()) return
    if (!providerBadge?.hasKey) {
      setGenError(t('Provider gambar belum terhubung. Atur dulu di Settings → AI Integrations.'))
      return
    }
    setGenerating(true)
    setGenError(null)
    setGenResult(null)
    try {
      const ratioOpt = RATIO_OPTIONS.find(r => r.key === editedRatio) ?? RATIO_OPTIONS[1]
      // Direct image gen — no Anthropic chat enhancement step here. Templates
      // are already detailed prompts written by user, so we pass them through.
      const res = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editedPrompt.trim(),
          size: ratioOpt.size,
          aspectRatio: ratioOpt.key,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal generate'))
      setGenResult(data.url)
    } catch (e) {
      setGenError(e instanceof Error ? e.message : t('Gagal generate'))
    } finally {
      setGenerating(false)
    }
  }

  // Combined list of templates to show (user + starter, filtered by brand)
  const filteredUser = useMemo(
    () => userTemplates.filter(t => brand === 'custom' ? t.brand === 'custom' : t.brand === brand),
    [userTemplates, brand],
  )
  const filteredStarter = useMemo(
    () => STARTER_TEMPLATES.filter(t => brand !== 'custom' && t.brand === brand),
    [brand],
  )

  return (
    <>
      {showUpload && (
        <UploadTemplateModal
          onClose={() => setShowUpload(false)}
          onCreated={() => { void refreshTemplates() }}
        />
      )}
      {bentalaCoverFormat && (
        <BentalaCoverEditor
          format={bentalaCoverFormat}
          onClose={() => setBentalaCoverFormat(null)}
        />
      )}

      <PageShell
        title={t('Template Gambar')}
        action={
          <>
            <Link href="/ai/image" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>
              🖼️ {t('Generator Manual')}
            </Link>
            <button
              onClick={() => setShowUpload(true)}
              style={{ padding: '7px 14px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
            >
              + {t('Upload Template')}
            </button>
          </>
        }
      >
      <div style={{ padding: '24px 28px', maxWidth: 1100, margin: '0 auto' }}>
        {/* Provider badge — same as image page */}
        <div style={{
          background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10,
          padding: '10px 14px', marginBottom: 20,
          display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Provider:</span>
          {providerBadge ? (
            <>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{providerBadge.label}</span>
              {providerBadge.hasKey ? (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#43d9a2', background: 'rgba(67,217,162,0.1)', border: '1px solid rgba(67,217,162,0.28)', padding: '2px 8px', borderRadius: 999 }}>✓ {t('TERHUBUNG')}</span>
              ) : (
                <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b', background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.28)', padding: '2px 8px', borderRadius: 999 }}>⚠ {t('KEY KOSONG')}</span>
              )}
            </>
          ) : (
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>{t('memuat konfigurasi...')}</span>
          )}
          <Link href="/settings/ai" style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: 'var(--accent)', textDecoration: 'none' }}>
            {t('Atur di AI Integrations →')}
          </Link>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: active ? '1fr 380px' : '1fr', gap: 20, alignItems: 'flex-start' }}>
          {/* ── Left: template grid ─────────────────────────────────── */}
          <div>
            {/* ── Design Template (structured layout, fill-in-fields) ── */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                Design Template · Layout
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
                {/* IG Feed Cover — 1080×1350 (4:5) */}
                <button
                  onClick={() => setBentalaCoverFormat('feed')}
                  style={{
                    padding: 0, borderRadius: 12, overflow: 'hidden',
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
                    transition: 'transform 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                >
                  {/* Mini preview — actual TemplateIGFeed scaled to fit */}
                  <div style={{
                    width: '100%', aspectRatio: `${IG_FEED_COVER.width} / ${IG_FEED_COVER.height}`,
                    background: '#0B3DE7',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div
                      ref={el => {
                        if (!el) return
                        const w = el.parentElement?.clientWidth || 260
                        el.style.transform = `scale(${w / IG_FEED_COVER.width})`
                      }}
                      style={{
                        width: IG_FEED_COVER.width,
                        height: IG_FEED_COVER.height,
                        transformOrigin: 'top left',
                        pointerEvents: 'none',
                      }}
                    >
                      <TemplateIGFeed
                        headline_lines={[
                          'Saking Enaknya! Warung',
                          "Padang Ini 'Dilarang Tutup'",
                          'oleh Pejabat Singapura',
                        ]}
                        contentCategory="local_go_global"
                        country="Singapura"
                        sourceImageUrl={null}
                        sourceData={{ primary: 'Bule Santun', platform: 'YouTube' }}
                        logoColor="white"
                        sourceColor="white"
                        shapeColor="#FFFFFF"
                        shapeTextColor="#000000"
                        format="feed"
                      />
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>📐</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Bentala IG Cover</span>
                      <span style={{
                        marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                        background: 'rgba(67,217,162,0.12)', border: '1px solid rgba(67,217,162,0.28)',
                        color: '#43d9a2', padding: '2px 7px', borderRadius: 999,
                        letterSpacing: 0.5,
                      }}>FEED · 4:5</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.45 }}>
                      {t('IG post format. Edit headline, kategori, negara, source, foto background. Output PNG 1080×1350.')}
                    </div>
                  </div>
                </button>

                {/* Reels Cover — 1080×1920 (9:16) */}
                <button
                  onClick={() => setBentalaCoverFormat('reels')}
                  style={{
                    padding: 0, borderRadius: 12, overflow: 'hidden',
                    background: 'var(--bg2)', border: '1px solid var(--border)',
                    cursor: 'pointer', textAlign: 'left', color: 'var(--text)',
                    transition: 'transform 0.12s, border-color 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                >
                  <div style={{
                    width: '100%', aspectRatio: `${IG_REELS_COVER.width} / ${IG_REELS_COVER.height}`,
                    background: '#0B3DE7',
                    position: 'relative', overflow: 'hidden',
                  }}>
                    <div
                      ref={el => {
                        if (!el) return
                        const w = el.parentElement?.clientWidth || 260
                        el.style.transform = `scale(${w / IG_REELS_COVER.width})`
                      }}
                      style={{
                        width: IG_REELS_COVER.width,
                        height: IG_REELS_COVER.height,
                        transformOrigin: 'top left',
                        pointerEvents: 'none',
                      }}
                    >
                      <TemplateIGFeed
                        headline_lines={[
                          'Saking Enaknya! Warung',
                          "Padang Ini 'Dilarang Tutup'",
                          'oleh Pejabat Singapura',
                        ]}
                        contentCategory="local_go_global"
                        country="Singapura"
                        sourceImageUrl={null}
                        sourceData={{ primary: 'Bule Santun', platform: 'YouTube' }}
                        logoColor="white"
                        sourceColor="white"
                        shapeColor="#FFFFFF"
                        shapeTextColor="#000000"
                        format="reels"
                      />
                    </div>
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                      <span style={{ fontSize: 16 }}>📱</span>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>Bentala Reels Cover</span>
                      <span style={{
                        marginLeft: 'auto', fontSize: 9, fontWeight: 700,
                        background: 'rgba(108,99,255,0.14)', border: '1px solid rgba(108,99,255,0.32)',
                        color: '#9994ff', padding: '2px 7px', borderRadius: 999,
                        letterSpacing: 0.5,
                      }}>REELS · 9:16</span>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.45 }}>
                      {t('IG Reels format. Sama dengan IG Cover, ditambah space atas + bawah. Output PNG 1080×1920.')}
                    </div>
                  </div>
                </button>
              </div>
            </div>

            {/* ── AI Prompt Templates (existing, brand tabs) ─────────── */}
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
              AI Prompt Template
            </div>

            {/* Brand tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 16, padding: 4, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10 }}>
              {([
                { key: 'bpi' as BrandKey, label: 'Bentala Project Indonesia', short: 'BPI', color: '#60a5fa' },
                { key: 'bsi' as BrandKey, label: 'Bentala Studio Indonesia', short: 'BSI', color: '#f472b6' },
                { key: 'custom' as BrandKey, label: t('Custom (manual)'), short: 'Custom', color: '#94a3b8' },
              ]).map(b => (
                <button
                  key={b.key}
                  onClick={() => setBrand(b.key)}
                  style={{
                    flex: 1, padding: '8px 12px', borderRadius: 7,
                    background: brand === b.key ? `${b.color}18` : 'transparent',
                    border: `1px solid ${brand === b.key ? b.color + '55' : 'transparent'}`,
                    color: brand === b.key ? b.color : 'var(--text2)',
                    fontSize: 12, fontWeight: brand === b.key ? 700 : 500, cursor: 'pointer', textAlign: 'center',
                  }}
                >
                  <span style={{ display: 'block' }}>{b.short}</span>
                  <span style={{ display: 'block', fontSize: 10, opacity: 0.75, fontWeight: 400, marginTop: 1 }}>{b.label}</span>
                </button>
              ))}
            </div>

            {/* User templates */}
            {filteredUser.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  {t('Template Kamu')} ({filteredUser.length})
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
                  {filteredUser.map(t => {
                    const isActive = active?.id === t.id
                    return (
                      <div
                        key={t.id}
                        style={{
                          position: 'relative', borderRadius: 10,
                          background: isActive ? 'rgba(67,217,162,0.08)' : 'var(--bg2)',
                          border: `1px solid ${isActive ? '#43d9a255' : 'var(--border)'}`,
                          overflow: 'hidden', transition: 'border-color 0.12s, transform 0.12s',
                        }}
                      >
                        <button
                          onClick={() => selectTemplate(userToActive(t))}
                          style={{ display: 'block', width: '100%', padding: 0, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}
                        >
                          {t.image_dataurl && (
                            <div style={{
                              width: '100%',
                              aspectRatio: t.ratio === '16:9' ? '16/9' : t.ratio === '9:16' ? '9/16' : t.ratio === '1:1' ? '1/1' : '4/5',
                              background: 'var(--bg3)',
                              backgroundImage: `url(${t.image_dataurl})`,
                              backgroundSize: 'cover', backgroundPosition: 'center',
                            }} />
                          )}
                          <div style={{ padding: '10px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <span style={{ fontSize: 12, fontWeight: 700, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</span>
                              {isActive && <span style={{ fontSize: 10, color: '#43d9a2', fontWeight: 700 }}>✓</span>}
                            </div>
                            {t.description && (
                              <div style={{ fontSize: 10.5, color: 'var(--text2)', lineHeight: 1.45, marginBottom: 6, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                                {t.description}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 4, fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                              <span style={{ padding: '2px 6px', background: 'var(--bg3)', borderRadius: 4 }}>{t.ratio}</span>
                              <span style={{ padding: '2px 6px', background: 'var(--bg3)', borderRadius: 4 }}>
                                {STYLE_OPTIONS.find(s => s.key === t.style)?.label ?? t.style}
                              </span>
                            </div>
                          </div>
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          title="Hapus template"
                          style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        >×</button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Starter templates */}
            {brand !== 'custom' && filteredStarter.length > 0 && (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>
                  {t('Template Bawaan')}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10 }}>
                  {filteredStarter.map(t => {
                    const isActive = active?.id === t.id
                    return (
                      <button
                        key={t.id}
                        onClick={() => selectTemplate(starterToActive(t))}
                        style={{
                          padding: '14px 14px', borderRadius: 10,
                          background: isActive ? 'rgba(67,217,162,0.08)' : 'var(--bg2)',
                          border: `1px solid ${isActive ? '#43d9a255' : 'var(--border)'}`,
                          color: 'var(--text)', textAlign: 'left', cursor: 'pointer',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 20 }}>{t.emoji}</span>
                          <span style={{ fontSize: 13, fontWeight: 700 }}>{t.label}</span>
                          {isActive && <span style={{ marginLeft: 'auto', fontSize: 10, color: '#43d9a2', fontWeight: 700 }}>✓</span>}
                        </div>
                        <div style={{ fontSize: 11.5, color: 'var(--text2)', lineHeight: 1.45, marginBottom: 8 }}>
                          {t.description}
                        </div>
                        <div style={{ display: 'flex', gap: 6, fontSize: 9, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, fontWeight: 700 }}>
                          <span style={{ padding: '2px 6px', background: 'var(--bg3)', borderRadius: 4 }}>{t.ratio}</span>
                          <span style={{ padding: '2px 6px', background: 'var(--bg3)', borderRadius: 4 }}>
                            {STYLE_OPTIONS.find(s => s.key === t.style)?.label ?? t.style}
                          </span>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Empty state for Custom tab */}
            {brand === 'custom' && filteredUser.length === 0 && !loading && (
              <div style={{ padding: '32px 16px', borderRadius: 10, background: 'var(--bg2)', border: '1px dashed var(--border)', fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, textAlign: 'center' }}>
                {t('Belum ada template Custom. Klik')} <strong style={{ color: 'var(--text)' }}>+ {t('Upload Template')}</strong> {t('untuk bikin template sendiri, atau pilih tab BPI / BSI untuk pakai template bawaan.')}
              </div>
            )}
          </div>

          {/* ── Right: edit + generate panel ───────────────────────── */}
          {active && (
            <aside style={{ position: 'sticky', top: 20, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 'calc(100vh - 100px)', overflowY: 'auto' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{active.name}</div>
                  {active.description && (
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 3, lineHeight: 1.5 }}>{active.description}</div>
                  )}
                </div>
                <button
                  onClick={clearActive}
                  style={{ width: 26, height: 26, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 12, flexShrink: 0 }}
                  title={t('Tutup')}
                >✕</button>
              </div>

              {active.image_dataurl && (
                <div style={{ borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <img src={active.image_dataurl} alt="reference" style={{ width: '100%', display: 'block', maxHeight: 200, objectFit: 'cover' }} />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Prompt</label>
                <textarea
                  value={editedPrompt}
                  onChange={e => setEditedPrompt(e.target.value)}
                  rows={6}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontFamily: 'inherit', resize: 'vertical', outline: 'none', lineHeight: 1.5 }}
                />
                <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
                  💡 {t('Edit teks dalam')} <code>[KURUNG SIKU]</code> {t('dengan info spesifik kamu.')}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{t('Rasio')}</label>
                  <select value={editedRatio} onChange={e => setEditedRatio(e.target.value)} style={selectStyle}>
                    {RATIO_OPTIONS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>Style</label>
                  <select value={editedStyle} onChange={e => setEditedStyle(e.target.value)} style={selectStyle}>
                    {STYLE_OPTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                  </select>
                </div>
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !editedPrompt.trim() || !providerBadge?.hasKey}
                style={{
                  padding: '12px 18px', borderRadius: 8, border: 'none',
                  background: generating || !editedPrompt.trim() || !providerBadge?.hasKey ? 'var(--bg3)' : '#43d9a2',
                  color: generating || !editedPrompt.trim() || !providerBadge?.hasKey ? 'var(--text2)' : '#000',
                  fontSize: 13, fontWeight: 700,
                  cursor: generating || !editedPrompt.trim() || !providerBadge?.hasKey ? 'not-allowed' : 'pointer',
                }}
              >
                {generating ? `Generating via ${providerBadge?.label ?? 'AI'}...` : `✦ ${t('Generate Gambar')}`}
              </button>

              {genError && (
                <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.28)', color: '#ff7575', fontSize: 11, lineHeight: 1.5 }}>
                  {genError}
                </div>
              )}

              {genResult && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <img src={genResult} alt="generated" style={{ width: '100%', display: 'block' }} />
                  </div>
                  <a
                    href={genResult}
                    download={`bentala-${active.id}.jpg`}
                    target="_blank" rel="noopener noreferrer"
                    style={{ padding: '8px 14px', borderRadius: 7, background: '#43d9a2', color: '#000', fontSize: 12, fontWeight: 700, textAlign: 'center', textDecoration: 'none' }}
                  >
                    ↓ {t('Download Gambar')}
                  </a>
                </div>
              )}
            </aside>
          )}
        </div>
      </div>
      </PageShell>
    </>
  )
}

const selectStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '7px 10px', height: 34, borderRadius: 7,
  background: 'var(--bg3)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 11, cursor: 'pointer', outline: 'none',
}
