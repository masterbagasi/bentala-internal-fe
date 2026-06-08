'use client'

import { useState, useEffect, useCallback } from 'react'
import { ProductionBrief, DesignBrief, VideoBrief, ScriptScene } from '@/lib/types'
import { useT } from '@/lib/i18n/LanguageProvider'

interface Props {
  type: 'design' | 'video'
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  in_progress: '#6c63ff',
  done: '#43d9a2',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  in_progress: 'In Progress',
  done: 'Selesai',
}

const PLATFORM_LABELS: Record<string, string> = {
  ig: 'Instagram',
  tiktok: 'TikTok',
  keduanya: 'IG + TikTok',
}

export default function BriefInbox({ type }: Props) {
  const t = useT()
  const [briefs, setBriefs] = useState<ProductionBrief[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [updating, setUpdating] = useState<string | null>(null)

  const loadBriefs = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch(`/api/pipeline/briefs?type=${type}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal memuat brief'))
      setBriefs(data.briefs ?? [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('Gagal memuat brief'))
    } finally {
      setLoading(false)
    }
  }, [type, t])

  useEffect(() => { loadBriefs() }, [loadBriefs])

  async function markDone(brief: ProductionBrief) {
    setUpdating(brief.id)
    try {
      const res = await fetch(`/api/pipeline/briefs/${brief.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'done' }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Gagal memperbarui status')
      }
      setBriefs(prev => prev.map(b => b.id === brief.id ? { ...b, status: 'done' } : b))
    } catch (e) {
      // Error is non-blocking — brief stays in current state
      console.error('[markDone]', e)
    } finally {
      setUpdating(null)
    }
  }

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text2)', fontSize: 13 }}>{t('Memuat brief...')}</div>
  }

  if (loadError) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ padding: '12px 16px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
          {loadError}
        </div>
      </div>
    )
  }

  if (briefs.length === 0) {
    return (
      <div style={{ padding: 48, textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
        {type === 'design' ? t('Belum ada brief design masuk') : t('Belum ada brief video masuk')}
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 24 }}>
      {briefs.map(brief => {
        const isExpanded = expanded === brief.id
        const designContent = type === 'design' ? (brief.content as DesignBrief) : null
        const videoContent = type === 'video' ? (brief.content as VideoBrief) : null

        return (
          <div key={brief.id} style={{
            background: 'var(--bg2)',
            border: `1px solid ${brief.status === 'done' ? 'var(--border)' : (STATUS_COLORS[brief.status] ?? 'var(--border)') + '55'}`,
            borderRadius: 10,
            overflow: 'hidden',
          }}>
            {/* Brief header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: brief.status === 'done' ? 'var(--text2)' : 'var(--text)' }}>
                  {brief.pipeline?.title ?? 'Untitled'}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', fontWeight: 700 }}>
                    {brief.pipeline?.entity}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text2)' }}>·</span>
                  <span style={{ fontSize: 10, color: 'var(--text2)' }}>
                    {PLATFORM_LABELS[brief.pipeline?.platform ?? ''] ?? brief.pipeline?.platform}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <span style={{
                  fontSize: 11, fontWeight: 600,
                  color: STATUS_COLORS[brief.status] ?? 'var(--text2)',
                  background: `${STATUS_COLORS[brief.status] ?? 'var(--border)'}22`,
                  padding: '3px 8px', borderRadius: 6,
                }}>
                  {STATUS_LABELS[brief.status] ?? brief.status}
                </span>
                <button
                  onClick={() => setExpanded(isExpanded ? null : brief.id)}
                  style={{ fontSize: 11, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer' }}
                >
                  {isExpanded ? t('Tutup') : t('Lihat Brief')}
                </button>
              </div>
            </div>

            {/* Expanded content */}
            {isExpanded && (
              <div style={{ borderTop: '1px solid var(--border)', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* Design content */}
                {designContent && (
                  <>
                    {brief.images?.[0] && (
                      <img src={brief.images[0]} alt="Design preview" style={{ width: '100%', maxHeight: 240, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                    )}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Format</div>
                        <div style={{ fontSize: 12, color: 'var(--text)' }}>{designContent.format}</div>
                        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{designContent.tone}</div>
                      </div>
                      <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Palette</div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          {designContent.palette.map((c, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                              <div style={{ width: 16, height: 16, borderRadius: 3, background: c.hex, border: '1px solid var(--border)' }} />
                              <span style={{ fontSize: 10, color: 'var(--text2)' }}>{c.hex}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t('Tipografi')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7 }}>
                        <span style={{ color: '#6c63ff' }}>Headline:</span> {designContent.typography.headline}<br />
                        <span style={{ color: '#6c63ff' }}>Subtext:</span> {designContent.typography.subtext}<br />
                        <span style={{ color: '#6c63ff' }}>CTA:</span> {designContent.typography.cta}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>Midjourney Prompt</div>
                        <button onClick={() => navigator.clipboard.writeText(designContent.midjourney_prompt).catch(() => {})} style={{ fontSize: 10, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer' }}>📋 Copy</button>
                      </div>
                      <div style={{ fontSize: 11, color: '#43d9a2', lineHeight: 1.6, fontStyle: 'italic', wordBreak: 'break-word' }}>{designContent.midjourney_prompt}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t('Komposisi')}</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{designContent.composition}</div>
                    </div>
                  </>
                )}

                {/* Video content */}
                {videoContent && (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                      {[
                        { label: t('Durasi'), value: videoContent.duration },
                        { label: 'Format', value: videoContent.format },
                        { label: 'Tone', value: videoContent.tone },
                      ].map(item => (
                        <div key={item.label} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>{item.label}</div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.value}</div>
                        </div>
                      ))}
                    </div>
                    {brief.images && brief.images.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Storyboard</div>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                          {brief.images.slice(0, 4).map((url, i) => (
                            <div key={i}>
                              {url ? <img src={url} alt={`Scene ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} /> : null}
                              <div style={{ fontSize: 9, color: 'var(--text2)', textAlign: 'center', marginTop: 3 }}>
                                {videoContent.script[i]?.label ?? `Scene ${i + 1}`}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Script</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {videoContent.script.map((scene: ScriptScene, i: number) => (
                          <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                            <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>{scene.timecode}</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: '#6c63ff', background: 'rgba(108,99,255,0.12)', padding: '1px 5px', borderRadius: 4 }}>{scene.label}</span>
                            </div>
                            <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4, lineHeight: 1.5 }}>&quot;{scene.dialog}&quot;</div>
                            <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>↳ {scene.direction}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {scene.talking_points.map((pt, j) => (
                                <span key={j} style={{ fontSize: 10, color: 'var(--text2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>• {pt}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10 }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Editing Style</div>
                      <div style={{ fontSize: 12, color: 'var(--text)' }}>{videoContent.editing_style}</div>
                    </div>
                  </>
                )}

                {brief.status !== 'done' && (
                  <button
                    onClick={() => markDone(brief)}
                    disabled={updating === brief.id}
                    style={{
                      padding: '10px 20px',
                      background: '#43d9a2',
                      border: 'none', borderRadius: 8,
                      color: '#000', fontSize: 13, fontWeight: 700,
                      cursor: updating === brief.id ? 'not-allowed' : 'pointer',
                      alignSelf: 'flex-start',
                    }}
                  >
                    {updating === brief.id ? t('Memperbarui...') : `✓ ${t('Tandai Selesai')}`}
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
