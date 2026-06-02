'use client'

import { useState, useRef, useEffect } from 'react'
import { PipelineCard, DesignBrief, VideoBrief, ScriptScene } from '@/lib/types'

interface Props {
  card: PipelineCard
  onClose: () => void
  onDone: (updatedCard: PipelineCard) => void
}

type BriefTypeSelection = 'design' | 'video' | 'both'
type ActiveTab = 'design' | 'video'

export default function BriefGenerator({ card, onClose, onDone }: Props) {
  const [briefType, setBriefType] = useState<BriefTypeSelection>('both')
  const [step, setStep] = useState<'select' | 'generating' | 'result'>('select')
  const [designBrief, setDesignBrief] = useState<DesignBrief | null>(null)
  const [videoBrief, setVideoBrief] = useState<VideoBrief | null>(null)
  const [designImage, setDesignImage] = useState<string | null>(null)
  const [storyboardImages, setStoryboardImages] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<ActiveTab>('design')
  const [pushing, setPushing] = useState(false)
  const [pushed, setPushed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  const types = briefType === 'both' ? ['design', 'video'] : [briefType]

  async function generate() {
    setStep('generating')
    setError(null)
    try {
      // Step 1: Generate brief text via Claude
      const briefRes = await fetch('/api/ai/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: card.title, entity: card.entity, platform: card.platform, types, idea_text: card.idea_text }),
      })
      const briefData = await briefRes.json()
      if (!briefRes.ok) throw new Error(briefData.error ?? 'Gagal generate brief')

      const design: DesignBrief | null = briefData.design ?? null
      const video: VideoBrief | null = briefData.video ?? null
      setDesignBrief(design)
      setVideoBrief(video)
      if (design) setActiveTab('design')
      if (video && !design) setActiveTab('video')

      // Step 2: Generate images (non-blocking individually)
      if (design?.dalle_prompt) {
        fetch('/api/ai/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt: design.dalle_prompt, size: '1024x1024' }),
        })
          .then(r => r.json())
          .then(d => { if (mountedRef.current && d.url) setDesignImage(d.url) })
          .catch(() => {}) // non-blocking — DALL-E failure doesn't break brief
      }

      if (video?.storyboard_prompts?.length) {
        const first4 = video.storyboard_prompts.slice(0, 4)
        Promise.allSettled(first4.map(p =>
          fetch('/api/ai/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: p, size: '1024x1024' }),
          }).then(r => r.json()).then(d => d.url ?? null)
        )).then(results => {
          const urls = results.map(r => r.status === 'fulfilled' ? (r.value ?? '') : '')
          if (mountedRef.current) setStoryboardImages(urls)
        })
      }

      setStep('result')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan')
      setStep('select')
    }
  }

  async function pushToProduction() {
    setPushing(true)
    setError(null)
    try {
      // Save briefs to Supabase
      if (designBrief) {
        const res = await fetch('/api/pipeline/briefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_id: card.id,
            type: 'design',
            content: designBrief,
            images: designImage ? [designImage] : [],
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan brief design')
      }
      if (videoBrief) {
        const res = await fetch('/api/pipeline/briefs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pipeline_id: card.id,
            type: 'video',
            content: videoBrief,
            images: storyboardImages.filter(Boolean),
          }),
        })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? 'Gagal menyimpan brief video')
      }

      // Advance card to brief stage
      const stageRes = await fetch('/api/pipeline', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: card.id, stage: 'brief' }),
      })
      const stageData = await stageRes.json()
      if (!stageRes.ok) throw new Error(stageData.error ?? 'Gagal update stage')

      setPushed(true)
      onDone(stageData.card)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Gagal kirim ke produksi')
    } finally {
      setPushing(false)
    }
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 16px', borderRadius: 20, border: '1px solid',
    borderColor: active ? '#6c63ff' : 'var(--border)',
    background: active ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
    color: active ? '#6c63ff' : 'var(--text2)',
    fontSize: 13, cursor: 'pointer', fontWeight: active ? 600 : 400,
  })

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 20px', background: 'none', border: 'none',
    borderBottom: `2px solid ${active ? '#6c63ff' : 'transparent'}`,
    color: active ? '#6c63ff' : 'var(--text2)',
    fontSize: 13, fontWeight: active ? 600 : 400, cursor: 'pointer',
  })

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 860,
        maxHeight: '90vh', overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Brief Generator</div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>{card.title}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {/* Step: Select type */}
          {step === 'select' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>Buat brief untuk:</div>
                <div style={{ display: 'flex', gap: 10 }}>
                  {(['design', 'video', 'both'] as BriefTypeSelection[]).map(t => (
                    <button key={t} onClick={() => setBriefType(t)} style={chipStyle(briefType === t)}>
                      {t === 'design' ? '📐 Design' : t === 'video' ? '🎬 Video' : '📐🎬 Keduanya'}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
                  {error}
                </div>
              )}

              <button
                onClick={generate}
                style={{ padding: '12px 24px', background: '#6c63ff', border: 'none', borderRadius: 8, color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}
              >
                ⚡ Generate Brief
              </button>
            </div>
          )}

          {/* Step: Generating */}
          {step === 'generating' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, minHeight: 200 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid var(--border)', borderTopColor: '#6c63ff', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ color: 'var(--text2)', fontSize: 13 }}>AI sedang membuat brief...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Step: Result */}
          {step === 'result' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Tabs */}
              <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
                {designBrief && <button style={tabStyle(activeTab === 'design')} onClick={() => setActiveTab('design')}>📐 Design</button>}
                {videoBrief && <button style={tabStyle(activeTab === 'video')} onClick={() => setActiveTab('video')}>🎬 Video</button>}
              </div>

              {/* Design tab */}
              {activeTab === 'design' && designBrief && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {designImage ? (
                    <img src={designImage} alt="Design preview" style={{ width: '100%', maxHeight: 280, objectFit: 'cover', borderRadius: 8, border: '1px solid var(--border)' }} />
                  ) : (
                    <div style={{ height: 120, background: 'var(--bg3)', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, color: 'var(--text2)' }}>
                      Generating preview image...
                    </div>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Format & Tone</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{designBrief.format}</div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>{designBrief.tone}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Palette</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {designBrief.palette.map((c, i) => (
                          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <div style={{ width: 20, height: 20, borderRadius: 4, background: c.hex, border: '1px solid var(--border)' }} />
                            <div>
                              <div style={{ fontSize: 10, color: 'var(--text)', fontWeight: 600 }}>{c.name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text2)' }}>{c.hex}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Tipografi</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}><span style={{ color: '#6c63ff' }}>Headline:</span> {designBrief.typography.headline}</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}><span style={{ color: '#6c63ff' }}>Subtext:</span> {designBrief.typography.subtext}</div>
                      <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}><span style={{ color: '#6c63ff' }}>CTA:</span> {designBrief.typography.cta}</div>
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>Midjourney Prompt</div>
                      <button
                        onClick={() => navigator.clipboard.writeText(designBrief.midjourney_prompt)}
                        style={{ fontSize: 10, color: '#6c63ff', background: 'none', border: 'none', cursor: 'pointer' }}
                      >
                        📋 Copy
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#43d9a2', lineHeight: 1.6, fontStyle: 'italic', wordBreak: 'break-word' }}>
                      {designBrief.midjourney_prompt}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Komposisi</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.6 }}>{designBrief.composition}</div>
                  </div>
                </div>
              )}

              {/* Video tab */}
              {activeTab === 'video' && videoBrief && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Durasi</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{videoBrief.duration}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Format</div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{videoBrief.format}</div>
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 10, textAlign: 'center' }}>
                      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>Tone</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{videoBrief.tone}</div>
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Storyboard</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                      {Array.from({ length: Math.min(4, videoBrief.storyboard_prompts.length || 4) }).map((_, i) => {
                        const url = storyboardImages[i]
                        return (
                          <div key={i}>
                            {url ? (
                              <img src={url} alt={`Scene ${i + 1}`} style={{ width: '100%', aspectRatio: '1', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }} />
                            ) : (
                              <div style={{ width: '100%', aspectRatio: '1', background: 'var(--bg3)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, color: 'var(--text2)' }}>
                                {storyboardImages.length === 0 ? 'Generating...' : `Scene ${i + 1}`}
                              </div>
                            )}
                            <div style={{ fontSize: 9, color: 'var(--text2)', textAlign: 'center', marginTop: 4 }}>
                              {videoBrief.script[i]?.label ?? `Scene ${i + 1}`}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Script</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {videoBrief.script.map((scene: ScriptScene, i: number) => (
                        <div key={i} style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                          <div style={{ display: 'flex', gap: 10, marginBottom: 6 }}>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#f59e0b' }}>{scene.timecode}</span>
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#6c63ff', background: 'rgba(108,99,255,0.12)', padding: '1px 6px', borderRadius: 4 }}>{scene.label}</span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4, lineHeight: 1.5 }}>"{scene.dialog}"</div>
                          <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 6 }}>↳ {scene.direction}</div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {scene.talking_points.map((pt, j) => (
                              <span key={j} style={{ fontSize: 10, color: 'var(--text2)', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 6px' }}>
                                • {pt}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Editing Style</div>
                    <div style={{ fontSize: 12, color: 'var(--text)' }}>{videoBrief.editing_style}</div>
                  </div>
                </div>
              )}

              {error && (
                <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
                  {error}
                </div>
              )}

              {pushed ? (
                <div style={{ padding: '12px 16px', background: 'rgba(67,217,162,0.1)', border: '1px solid #43d9a2', borderRadius: 8, color: '#43d9a2', fontSize: 13, fontWeight: 600 }}>
                  ✓ Brief berhasil dikirim ke tim produksi!
                </div>
              ) : (
                <button
                  onClick={pushToProduction}
                  disabled={pushing}
                  style={{
                    padding: '12px 24px',
                    background: pushing ? 'var(--bg3)' : '#43d9a2',
                    border: 'none', borderRadius: 8,
                    color: pushing ? 'var(--text2)' : '#000',
                    fontSize: 14, fontWeight: 700,
                    cursor: pushing ? 'not-allowed' : 'pointer',
                    alignSelf: 'flex-start',
                  }}
                >
                  {pushing ? 'Mengirim...' : '🚀 Kirim ke Produksi'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
