'use client'

import { useState } from 'react'
import type { AudioScript } from '@/lib/types'
import { useT } from '@/lib/i18n/LanguageProvider'

const DURASI_OPTIONS = [
  { key: '15 detik', label: '15 dtk' },
  { key: '30 detik', label: '30 dtk' },
  { key: '60 detik', label: '60 dtk' },
  { key: '90 detik', label: '90 dtk' },
  { key: '2 menit', label: '2 mnt' },
  { key: '5 menit', label: '5 mnt' },
]

const STYLE_OPTIONS = [
  { key: 'Natural & Conversational', label: 'Natural' },
  { key: 'Professional & Formal', label: 'Profesional' },
  { key: 'Energetic & Hype', label: 'Energetic' },
  { key: 'ASMR & Calm', label: 'ASMR / Calm' },
  { key: 'Storytelling & Dramatic', label: 'Storytelling' },
  { key: 'News & Informative', label: 'Berita' },
]

const BAHASA_OPTIONS = [
  { key: 'Bahasa Indonesia', label: 'Bahasa Indonesia' },
  { key: 'English', label: 'English' },
  { key: 'Bilingual (Indonesia + English)', label: 'Bilingual' },
]

const SECTION_COLORS: Record<string, string> = {
  INTRO: '#6c63ff',
  ISI: '#43d9a2',
  PENUTUP: '#f472b6',
  OUTRO: '#f472b6',
  HOOK: '#f59e0b',
  CTA: '#60a5fa',
}

function chip(active: boolean, color = 'var(--accent)'): React.CSSProperties {
  return {
    padding: '6px 12px', borderRadius: 20,
    border: '1px solid', borderColor: active ? color : 'var(--border)',
    background: active ? `${color}18` : 'var(--bg3)',
    color: active ? color : 'var(--text2)',
    fontSize: 12, cursor: 'pointer', fontWeight: active ? 600 : 400,
    transition: 'all 0.12s',
  }
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  function copy() {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }
  return (
    <button
      onClick={copy}
      style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: copied ? '#43d9a2' : 'var(--text2)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
    >
      {copied ? '✓ Copied' : 'Copy'}
    </button>
  )
}

export default function AudioStudio() {
  const t = useT()
  const [mode, setMode] = useState<'topic' | 'script'>('topic')
  const [topik, setTopik] = useState('')
  const [scriptRaw, setScriptRaw] = useState('')
  const [durasi, setDurasi] = useState('60 detik')
  const [styleNarasi, setStyleNarasi] = useState('Natural & Conversational')
  const [bahasa, setBahasa] = useState('Bahasa Indonesia')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<AudioScript | null>(null)
  const [expandedSection, setExpandedSection] = useState<number | null>(null)

  const input = mode === 'topic' ? topik : scriptRaw
  const canGenerate = input.trim().length > 0

  async function generate() {
    if (!canGenerate) return
    setLoading(true)
    setError(null)
    setResult(null)
    setExpandedSection(null)
    try {
      const res = await fetch('/api/ai/audio', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, topik, script: scriptRaw, durasi, styleNarasi, bahasa }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal generate script audio'))
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Terjadi kesalahan'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 20, height: 'calc(100vh - 180px)', minHeight: 500 }}>
      {/* Left — Form */}
      <div style={{ width: 320, flexShrink: 0, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 20, display: 'flex', flexDirection: 'column', gap: 18, overflowY: 'auto' }}>
        {/* Mode toggle */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>Mode</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
            {[
              { key: 'topic' as const, label: t('🎙 Dari Topik') },
              { key: 'script' as const, label: t('📝 Paste Script') },
            ].map(m => (
              <button key={m.key} onClick={() => setMode(m.key)}
                style={{
                  padding: '8px 0', borderRadius: 8, border: '1px solid',
                  borderColor: mode === m.key ? 'var(--accent)' : 'var(--border)',
                  background: mode === m.key ? 'rgba(108,99,255,0.1)' : 'var(--bg3)',
                  color: mode === m.key ? 'var(--accent)' : 'var(--text2)',
                  fontSize: 12, fontWeight: mode === m.key ? 700 : 400, cursor: 'pointer',
                }}
              >{m.label}</button>
            ))}
          </div>
        </div>

        {/* Input */}
        {mode === 'topic' ? (
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>{t('Topik')}</label>
            <input
              value={topik}
              onChange={e => setTopik(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && generate()}
              placeholder={t('contoh: tips perawatan kulit malam hari...')}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13 }}
            />
          </div>
        ) : (
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, display: 'block', marginBottom: 8 }}>{t('Script Mentah')}</label>
            <textarea
              value={scriptRaw}
              onChange={e => setScriptRaw(e.target.value)}
              placeholder={t('Paste script mentah kamu di sini, AI akan memolesnya menjadi narasi siap rekam...')}
              rows={5}
              style={{ width: '100%', boxSizing: 'border-box', fontSize: 13, resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5 }}
            />
          </div>
        )}

        {/* Durasi */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{t('Target Durasi')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DURASI_OPTIONS.map(d => (
              <button key={d.key} onClick={() => setDurasi(d.key)} style={chip(durasi === d.key)}>{d.label}</button>
            ))}
          </div>
        </div>

        {/* Style */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{t('Style Narasi')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {STYLE_OPTIONS.map(s => (
              <button key={s.key} onClick={() => setStyleNarasi(s.key)} style={chip(styleNarasi === s.key, '#43d9a2')}>{s.label}</button>
            ))}
          </div>
        </div>

        {/* Bahasa */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 }}>{t('Bahasa')}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {BAHASA_OPTIONS.map(b => (
              <button key={b.key} onClick={() => setBahasa(b.key)} style={chip(bahasa === b.key, '#f59e0b')}>{b.label}</button>
            ))}
          </div>
        </div>

        <button
          onClick={generate}
          disabled={!canGenerate || loading}
          style={{
            marginTop: 'auto', padding: '12px', borderRadius: 10, border: 'none',
            background: !canGenerate || loading ? 'var(--bg3)' : 'linear-gradient(135deg, #6c63ff, #43d9a2)',
            color: !canGenerate || loading ? 'var(--text2)' : '#fff',
            fontSize: 13, fontWeight: 700,
            cursor: !canGenerate || loading ? 'not-allowed' : 'pointer',
            transition: 'opacity 0.15s',
          }}
        >
          {loading ? '⏳ Generating...' : '🎙 Generate Script Audio'}
        </button>
      </div>

      {/* Right — Output */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 16, overflowY: 'auto' }}>
        {error && (
          <div style={{ padding: '12px 16px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 10, color: '#ff6b6b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {loading && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text2)', fontSize: 13 }}>
            <div style={{ width: 32, height: 32, border: '3px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            {t('Membuat script narasi...')}
          </div>
        )}

        {!loading && !result && !error && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, color: 'var(--text2)' }}>
            <div style={{ fontSize: 40, opacity: 0.3 }}>🎙</div>
            <div style={{ fontSize: 14, textAlign: 'center', lineHeight: 1.6 }}>
              {t('Masukkan topik atau paste script mentahmu')}<br />
              <span style={{ fontSize: 12 }}>{t('AI akan membuat narasi siap rekam + panduan timing')}</span>
            </div>
          </div>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, animation: 'slideUp 0.3s ease' }}>
            {/* Header card */}
            <div style={{ background: 'linear-gradient(135deg, rgba(108,99,255,0.12), rgba(67,217,162,0.12))', border: '1px solid rgba(108,99,255,0.25)', borderRadius: 12, padding: '20px 22px' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text)', marginBottom: 12, lineHeight: 1.3 }}>{result.judul}</div>
              <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {[
                  { icon: '⏱', label: t('Estimasi'), val: result.estimated_duration },
                  { icon: '🎭', label: t('Karakter Suara'), val: result.voice_character },
                  { icon: '🎵', label: 'BGM', val: result.recommended_bgm },
                ].map(x => (
                  <div key={x.label}>
                    <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{x.icon} {x.label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 600, marginTop: 2 }}>{x.val}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Full script narasi */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>{t('Script Narasi Lengkap')}</div>
                <CopyButton text={result.script_narasi} />
              </div>
              <pre style={{ margin: 0, fontSize: 13, color: 'var(--text)', lineHeight: 1.8, whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>
                {result.script_narasi}
              </pre>
            </div>

            {/* Timing guide */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>{t('Panduan Timing')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.timing_guide.map((section, i) => {
                  const color = SECTION_COLORS[section.section] ?? '#8b8fa8'
                  const isOpen = expandedSection === i
                  return (
                    <div key={i} style={{ borderRadius: 10, border: '1px solid var(--border)', overflow: 'hidden' }}>
                      <button
                        onClick={() => setExpandedSection(isOpen ? null : i)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg3)', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ padding: '2px 8px', borderRadius: 4, background: `${color}22`, border: `1px solid ${color}44`, color, fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{section.section}</span>
                        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>{section.duration}</span>
                        <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{section.text.slice(0, 60)}...</span>
                        <span style={{ color: 'var(--text2)', fontSize: 10, flexShrink: 0, transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>▼</span>
                      </button>
                      {isOpen && (
                        <div style={{ padding: '12px 14px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{section.text}</div>
                          <div style={{ padding: '8px 12px', background: `${color}10`, borderRadius: 6, border: `1px solid ${color}22`, fontSize: 12, color, lineHeight: 1.5 }}>
                            🎭 {section.tone_guidance}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Recording tips */}
            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>{t('Tips Rekaman')}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {result.recording_tips.map((tip, i) => (
                  <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>
                    <span style={{ flexShrink: 0, width: 20, height: 20, borderRadius: '50%', background: 'rgba(108,99,255,0.15)', border: '1px solid rgba(108,99,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: 'var(--accent)' }}>{i + 1}</span>
                    {tip}
                  </div>
                ))}
              </div>
            </div>

            {/* ElevenLabs panel */}
            <div style={{ background: 'var(--bg2)', border: '1px dashed var(--border)', borderRadius: 12, padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>🔊 Generate Audio (ElevenLabs)</div>
                <span style={{ padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.3)', color: '#f59e0b', fontSize: 10, fontWeight: 700 }}>COMING SOON</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 12 }}>
                {t('Hubungkan ElevenLabs API key kamu untuk generate audio langsung dari script ini. BYOK (Bring Your Own Key) — token tidak disimpan di server.')}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  disabled
                  placeholder="ElevenLabs API Key (BYOK)"
                  style={{ flex: 1, fontSize: 12, opacity: 0.5, cursor: 'not-allowed' }}
                />
                <button disabled style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 12, cursor: 'not-allowed', opacity: 0.5 }}>
                  Generate Audio
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}
