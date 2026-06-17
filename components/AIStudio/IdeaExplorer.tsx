'use client'

import { useState, useEffect } from 'react'
import type { IdeaItem, ContentBrief, Storyline } from '@/lib/types'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useIsMobile } from '@/hooks/useIsMobile'

const PLATFORMS = ['TikTok', 'Instagram Reels', 'Instagram Feed', 'YouTube Shorts', 'YouTube', 'LinkedIn']
const FORMATS = ['Short Video', 'Long Video', 'Carousel/Slide', 'Story', 'Talking Head', 'GRWM', 'Tutorial', 'Vlog']
const TONES = ['Fun & Energetic', 'Edukatif', 'Inspiratif', 'Viral/Hype', 'Cinematic', 'ASMR/Cozy', 'Profesional']

const SCENE_COLORS: Record<string, string> = {
  HOOK: '#f59e0b', INTRO: '#6c63ff', ISI: '#43d9a2',
  KLIMAKS: '#f472b6', CTA: '#60a5fa', OUTRO: '#8b8fa8',
}

type Tab = 'ideas' | 'brief' | 'storyline' | 'caption'

export default function IdeaExplorer() {
  const t = useT()
  const isMobile = useIsMobile()
  const [topik, setTopik] = useState('')
  const [platform, setPlatform] = useState('TikTok')
  const [format, setFormat] = useState('Short Video')
  const [tone, setTone] = useState('Fun & Energetic')
  const [targetAudiens, setTargetAudiens] = useState('')
  const [referensiInput, setReferensiInput] = useState('')
  const [referensiList, setReferensiList] = useState<string[]>([])

  const [ideas, setIdeas] = useState<IdeaItem[]>([])
  const [selectedIdea, setSelectedIdea] = useState<IdeaItem | null>(null)
  const [brief, setBrief] = useState<ContentBrief | null>(null)
  const [storyline, setStoryline] = useState<Storyline | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('ideas')

  const [loading, setLoading] = useState(false)
  const [briefLoading, setBriefLoading] = useState(false)
  const [storylineLoading, setStorylineLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [briefError, setBriefError] = useState<string | null>(null)
  const [storylineError, setStorylineError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)

  function addReferensi() {
    const val = referensiInput.trim().replace(/^@/, '')
    if (!val || referensiList.includes(val)) return
    setReferensiList(p => [...p, val])
    setReferensiInput('')
  }

  async function generateIdeas() {
    if (!topik.trim()) return
    setLoading(true)
    setError(null)
    setIdeas([])
    setSelectedIdea(null)
    setBrief(null)
    setStoryline(null)
    setActiveTab('ideas')
    try {
      const res = await fetch('/api/ai/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: topik, platform, format, tone, targetAudiens, referensiAkun: referensiList }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal generate ide'))
      setIdeas(data.ideas ?? [])
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Terjadi kesalahan'))
    } finally {
      setLoading(false)
    }
  }

  async function generateBrief(idea: IdeaItem) {
    setBriefLoading(true)
    setBriefError(null)
    setBrief(null)
    try {
      const res = await fetch('/api/ai/content-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, platform, format, tone, targetAudiens }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal generate brief'))
      setBrief(data)
    } catch (e) {
      setBriefError(e instanceof Error ? e.message : t('Terjadi kesalahan'))
    } finally {
      setBriefLoading(false)
    }
  }

  async function generateStoryline(idea: IdeaItem) {
    setStorylineLoading(true)
    setStorylineError(null)
    setStoryline(null)
    try {
      const res = await fetch('/api/ai/storyline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idea, platform, format, tone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal generate storyline'))
      setStoryline(data)
    } catch (e) {
      setStorylineError(e instanceof Error ? e.message : t('Terjadi kesalahan'))
    } finally {
      setStorylineLoading(false)
    }
  }

  function selectIdea(idea: IdeaItem) {
    setSelectedIdea(idea)
    setBrief(null)
    setStoryline(null)
    setBriefError(null)
    setStorylineError(null)
  }

  function switchTab(tab: Tab) {
    setActiveTab(tab)
    if (!selectedIdea) return
    if (tab === 'brief' && !brief && !briefLoading) generateBrief(selectedIdea)
    if (tab === 'storyline' && !storyline && !storylineLoading) generateStoryline(selectedIdea)
  }

  const chipStyle = (active: boolean, color = '#6c63ff'): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 20, border: '1px solid',
    borderColor: active ? color : 'var(--border)',
    background: active ? `${color}18` : 'var(--bg3)',
    color: active ? color : 'var(--text2)',
    fontSize: 12, cursor: 'pointer', fontWeight: active ? 600 : 400,
    transition: 'all 0.12s',
  })

  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding: '8px 16px', cursor: 'pointer', fontSize: 13, fontWeight: 500,
    color: active ? '#6c63ff' : 'var(--text2)',
    background: 'none', border: 'none',
    borderBottom: `2px solid ${active ? '#6c63ff' : 'transparent'}`,
    transition: 'all 0.15s', whiteSpace: 'nowrap', marginBottom: -1,
  })

  const captionText = selectedIdea
    ? `${selectedIdea.hook}\n\n${selectedIdea.concept}\n\n${selectedIdea.angle}`
    : ''

  return (
    <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', height: isMobile ? 'auto' : 'calc(100vh - 120px)', gap: 0, overflow: isMobile ? 'visible' : 'hidden' }}>

      {/* ── Left: Form Panel ─────────────────────── */}
      <div style={{
        width: isMobile ? '100%' : 340, flexShrink: 0,
        borderRight: isMobile ? 'none' : '1px solid var(--border)',
        borderBottom: isMobile ? '1px solid var(--border)' : 'none',
        overflowY: 'auto', padding: '20px 20px 32px',
        display: 'flex', flexDirection: 'column', gap: 18,
      }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
            {t('Topik / Niche *')}
          </label>
          <input
            value={topik}
            onChange={e => setTopik(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generateIdeas()}
            placeholder={t('contoh: fashion muslimah, healthy lifestyle, fintech...')}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 14 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
            Platform
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {PLATFORMS.map(p => (
              <button key={p} onClick={() => setPlatform(p)} style={chipStyle(platform === p)}>{p}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
            {t('Format Konten')}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {FORMATS.map(f => (
              <button key={f} onClick={() => setFormat(f)} style={chipStyle(format === f, '#43d9a2')}>{f}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
            {t('Tone / Gaya')}
          </label>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {TONES.map(t => (
              <button key={t} onClick={() => setTone(t)} style={chipStyle(tone === t, '#f59e0b')}>{t}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
            {t('Target Audiens')} <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400, textTransform: 'none' }}>{t('(opsional)')}</span>
          </label>
          <textarea
            value={targetAudiens}
            onChange={e => setTargetAudiens(e.target.value)}
            placeholder={t('Contoh: perempuan 18-25 tahun, tertarik fashion & lifestyle, tinggal di kota besar...')}
            rows={3}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>
            {t('Referensi Akun')} <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 400, textTransform: 'none' }}>{t('(opsional)')}</span>
          </label>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input
              value={referensiInput}
              onChange={e => setReferensiInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addReferensi() } }}
              placeholder={t('@username atau nama kreator')}
              style={{ flex: 1, fontSize: 13 }}
            />
            <button
              onClick={addReferensi}
              style={{ padding: '6px 12px', background: '#6c63ff', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600, flexShrink: 0 }}
            >
              +
            </button>
          </div>
          {referensiList.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {referensiList.map(r => (
                <span key={r} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '3px 9px', borderRadius: 20, background: '#6c63ff18', border: '1px solid #6c63ff33', color: '#a99fff' }}>
                  @{r}
                  <button onClick={() => setReferensiList(p => p.filter(x => x !== r))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#a99fff', fontSize: 13, padding: 0, lineHeight: 1, marginLeft: 2 }}>×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
            {error}
          </div>
        )}

        <button
          onClick={generateIdeas}
          disabled={loading || !topik.trim()}
          style={{
            padding: '12px', borderRadius: 10, border: 'none',
            background: loading || !topik.trim() ? 'var(--bg3)' : 'linear-gradient(135deg, #6c63ff, #a855f7)',
            color: loading || !topik.trim() ? 'var(--text2)' : '#fff',
            fontSize: 14, fontWeight: 700,
            cursor: loading || !topik.trim() ? 'not-allowed' : 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {loading ? '⟳ Generating...' : t('✦ Generate Ide')}
        </button>
      </div>

      {/* ── Right: Output Panel ─────────────────── */}
      <div style={{ flex: 1, minHeight: isMobile ? '60vh' : 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', padding: '0 20px', flexShrink: 0, gap: 0 }}>
          {[
            { key: 'ideas' as Tab, label: t('💡 Ide'), count: ideas.length },
            { key: 'brief' as Tab, label: '📋 Brief', locked: !selectedIdea },
            { key: 'storyline' as Tab, label: '🎬 Storyline', locked: !selectedIdea },
            { key: 'caption' as Tab, label: '📝 Caption', locked: !selectedIdea },
          ].map(t => (
            <button
              key={t.key}
              onClick={() => switchTab(t.key)}
              style={{
                ...tabStyle(activeTab === t.key),
                opacity: t.locked ? 0.4 : 1,
                cursor: t.locked ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 5,
              }}
              disabled={t.locked}
            >
              {t.label}
              {t.count ? <span style={{ fontSize: 10, background: '#6c63ff22', color: '#6c63ff', padding: '1px 6px', borderRadius: 10, fontWeight: 700 }}>{t.count}</span> : null}
            </button>
          ))}
          {selectedIdea && (
            <div style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text2)', padding: '0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#43d9a2', display: 'inline-block' }} />
              {selectedIdea.title.slice(0, 40)}{selectedIdea.title.length > 40 ? '...' : ''}
            </div>
          )}
        </div>

        {/* Tab Content */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>

          {/* ── IDEAS TAB ── */}
          {activeTab === 'ideas' && (
            <>
              {!loading && ideas.length === 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 14, color: 'var(--text2)' }}>
                  <div style={{ fontSize: 48, opacity: 0.3 }}>💡</div>
                  <div style={{ fontSize: 14, textAlign: 'center', maxWidth: 320, lineHeight: 1.6 }}>
                    {t('Isi form di kiri dan klik')} <strong style={{ color: 'var(--text)' }}>{t('Generate Ide')}</strong> {t('untuk mendapatkan 6 angle konten yang relevan')}
                  </div>
                </div>
              )}
              {loading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '60%', gap: 14, color: 'var(--text2)' }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid #6c63ff', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
                  <div style={{ fontSize: 13 }}>{t('Claude sedang brainstorm ide...')}</div>
                </div>
              )}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
                {ideas.map((idea, i) => {
                  const isSelected = selectedIdea?.id === idea.id
                  return (
                    <div
                      key={idea.id}
                      onClick={() => selectIdea(idea)}
                      style={{
                        background: isSelected ? 'rgba(108,99,255,0.08)' : 'var(--bg2)',
                        border: `1px solid ${isSelected ? '#6c63ff55' : 'var(--border)'}`,
                        borderRadius: 12, padding: '16px',
                        cursor: 'pointer', transition: 'all 0.15s',
                        display: 'flex', flexDirection: 'column', gap: 10,
                        animation: `slideUp 0.2s ease ${i * 0.05}s both`,
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6c63ff', background: '#6c63ff18', padding: '2px 8px', borderRadius: 10, flexShrink: 0 }}>
                          {t('Ide')} {i + 1}
                        </span>
                        {isSelected && <span style={{ fontSize: 10, color: '#43d9a2', fontWeight: 700 }}>{t('✓ Dipilih')}</span>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4 }}>{idea.title}</div>
                      <div style={{ fontSize: 12, color: '#f59e0b', lineHeight: 1.5, fontStyle: 'italic' }}>
                        <span style={{ fontWeight: 700, fontStyle: 'normal' }}>Hook: </span>{idea.hook}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5 }}>{idea.concept}</div>
                      {idea.angle && (
                        <div style={{ fontSize: 11, color: '#43d9a2', lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 700 }}>Angle: </span>{idea.angle}
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 2 }}>
                        {idea.format_saran && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)' }}>
                            {idea.format_saran}
                          </span>
                        )}
                        {idea.referensi_inspirasi && (
                          <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#f472b618', color: '#f472b6', border: '1px solid #f472b633' }}>
                            ref: {idea.referensi_inspirasi}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <div style={{ display: 'flex', gap: 6, paddingTop: 4, borderTop: '1px solid #6c63ff22' }}>
                          {(['brief', 'storyline', 'caption'] as Tab[]).map(t => (
                            <button
                              key={t}
                              onClick={e => { e.stopPropagation(); switchTab(t) }}
                              style={{ flex: 1, padding: '5px 8px', background: 'none', border: '1px solid #6c63ff44', borderRadius: 6, color: '#a99fff', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                            >
                              {t === 'brief' ? '📋 Brief' : t === 'storyline' ? '🎬 Storyline' : '📝 Caption'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* ── BRIEF TAB ── */}
          {activeTab === 'brief' && selectedIdea && (
            <>
              {briefLoading && <LoadingState label={t('Membuat content brief detail...')} />}
              {briefError && <ErrorBox msg={briefError} onRetry={() => generateBrief(selectedIdea)} />}
              {!briefLoading && !briefError && !brief && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 13 }}>{t('Memuat brief...')}</div>
              )}
              {brief && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 720, animation: 'slideUp 0.2s ease' }}>
                  <div style={{ background: 'linear-gradient(135deg, #6c63ff18, #a855f718)', border: '1px solid #6c63ff33', borderRadius: 12, padding: '16px 20px' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 6 }}>{brief.judul}</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{brief.objective}</div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    {[
                      { label: 'Platform', value: brief.platform },
                      { label: 'Format', value: brief.format },
                      { label: t('Target Audiens'), value: brief.target_audiens },
                      { label: 'Talent', value: brief.talent },
                    ].map(item => (
                      <BriefCard key={item.label} label={item.label} value={item.value} />
                    ))}
                  </div>

                  <BriefSection label="Mood Board" value={brief.mood_board} accent="#f472b6" />

                  <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Key Messages</div>
                    {brief.key_messages?.map((msg, i) => (
                      <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-start' }}>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', background: '#6c63ff22', color: '#6c63ff', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>{i + 1}</span>
                        <span style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{msg}</span>
                      </div>
                    ))}
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>{t('Properti')}</div>
                      {brief.properti?.map((p, i) => (
                        <div key={i} style={{ fontSize: 12, color: 'var(--text)', marginBottom: 4 }}>• {p}</div>
                      ))}
                    </div>
                    <BriefSection label="Call to Action" value={brief.cta} accent="#43d9a2" />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <BriefSection label={t('Referensi Gaya')} value={brief.referensi_gaya} accent="#f59e0b" />
                    <BriefSection label={t('Catatan Produksi')} value={brief.notes} accent="#8b8fa8" />
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── STORYLINE TAB ── */}
          {activeTab === 'storyline' && selectedIdea && (
            <>
              {storylineLoading && <LoadingState label={t('Membuat storyline scene-by-scene...')} />}
              {storylineError && <ErrorBox msg={storylineError} onRetry={() => generateStoryline(selectedIdea)} />}
              {!storylineLoading && !storylineError && !storyline && (
                <div style={{ textAlign: 'center', padding: 40, color: 'var(--text2)', fontSize: 13 }}>{t('Memuat storyline...')}</div>
              )}
              {storyline && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 760, animation: 'slideUp 0.2s ease' }}>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {[
                      { label: t('Total Durasi'), value: storyline.total_durasi },
                      { label: 'Format', value: storyline.format },
                      { label: t('Jumlah Scene'), value: `${storyline.scenes?.length} scene` },
                    ].map(item => (
                      <div key={item.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{item.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{item.value}</div>
                      </div>
                    ))}
                  </div>

                  {storyline.scenes?.map((scene, i) => {
                    const color = SCENE_COLORS[scene.label] ?? '#6c63ff'
                    return (
                      <div key={i} style={{ background: 'var(--bg2)', border: `1px solid ${color}33`, borderLeft: `3px solid ${color}`, borderRadius: 10, padding: '14px 18px', animation: `slideUp 0.2s ease ${i * 0.06}s both` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color, fontFamily: 'monospace' }}>{scene.timecode}</span>
                          <span style={{ padding: '2px 8px', borderRadius: 4, background: `${color}22`, color, fontSize: 10, fontWeight: 800 }}>{scene.label}</span>
                          <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>Scene {scene.no}</span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                          <div>
                            <SceneField label="📹 Visual / Shot" value={scene.visual} />
                            <SceneField label="🎵 BGM / Sound" value={scene.bgm} />
                          </div>
                          <div>
                            <SceneField label={t('🎤 Dialog / Narasi')} value={scene.dialog} highlight />
                            <SceneField label={t('🎭 Arahan')} value={scene.direction} />
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}

          {/* ── CAPTION TAB ── */}
          {activeTab === 'caption' && selectedIdea && (
            <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16, animation: 'slideUp 0.2s ease' }}>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>{t('Hook Pembuka')}</div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#f59e0b', lineHeight: 1.6, fontStyle: 'italic' }}>
                  "{selectedIdea.hook}"
                </div>
              </div>
              <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Draft Caption</div>
                <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-wrap', background: 'var(--bg3)', padding: '12px 14px', borderRadius: 8 }}>
                  {selectedIdea.hook}{'\n\n'}{selectedIdea.concept}{'\n\n'}{selectedIdea.angle}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(captionText).catch(() => {})
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                  style={{ flex: 1, padding: '10px', background: copied ? '#43d9a218' : 'var(--bg2)', border: `1px solid ${copied ? '#43d9a255' : 'var(--border)'}`, borderRadius: 8, color: copied ? '#43d9a2' : 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {copied ? '✓ Copied!' : '📋 Copy Caption'}
                </button>
                <button
                  onClick={() => {
                    const params = new URLSearchParams({ input_text: captionText, platform })
                    window.location.href = `/ai/builder?${params.toString()}`
                  }}
                  style={{ flex: 1, padding: '10px', background: '#6c63ff', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('✍️ Polish di Content Builder')}
                </button>
              </div>
              <div style={{ background: '#f472b618', border: '1px solid #f472b633', borderRadius: 10, padding: '14px 16px' }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#f472b6', marginBottom: 8 }}>{t('💡 Tips Caption')}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
                  {t('Gunakan hook di baris pertama untuk 3 baris awal yang terlihat sebelum "lihat selengkapnya". Tambahkan emoji sesuai tone, 5-10 hashtag campuran besar dan niche, dan CTA yang jelas di akhir.')}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function LoadingState({ label }: { label: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: 200, gap: 14, color: 'var(--text2)' }}>
      <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid #6c63ff', borderTopColor: 'transparent', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: 13 }}>{label}</div>
    </div>
  )
}

function ErrorBox({ msg, onRetry }: { msg: string; onRetry: () => void }) {
  const t = useT()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 480 }}>
      <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>{msg}</div>
      <button onClick={onRetry} style={{ padding: '8px 16px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 12, cursor: 'pointer', alignSelf: 'flex-start' }}>
        {t('Coba lagi')}
      </button>
    </div>
  )
}

function BriefCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{value}</div>
    </div>
  )
}

function BriefSection({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ background: 'var(--bg2)', border: `1px solid ${accent}33`, borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: accent, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{value}</div>
    </div>
  )
}

function SceneField({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  if (!value) return null
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 12, color: highlight ? 'var(--text)' : 'var(--text2)', lineHeight: 1.6, fontStyle: highlight ? 'italic' : 'normal', fontWeight: highlight ? 500 : 400 }}>{value}</div>
    </div>
  )
}
