'use client'

import { useState } from 'react'
import AIHistoryPanel from '@/components/AIStudio/AIHistoryPanel'
import { addHistoryItem, HistoryItem } from '@/lib/aiHistory'
import { PageShell } from '@/components/shared/PageShell'
import { useT } from '@/lib/i18n/LanguageProvider'

const PLATFORM_OPTIONS = [
  { key: 'tiktok', label: 'TikTok' },
  { key: 'reels', label: 'Instagram Reels' },
  { key: 'youtube', label: 'YouTube Shorts' },
]

const DURATION_OPTIONS = [
  { key: '15 detik', label: '15 detik' },
  { key: '30 detik', label: '30 detik' },
  { key: '45 detik', label: '45 detik' },
  { key: '60 detik', label: '60 detik' },
]

const TONE_OPTIONS = [
  { key: 'fun dan energetic', label: 'Fun & Energetic' },
  { key: 'educational dan informative', label: 'Edukatif' },
  { key: 'cinematic dan aesthetic', label: 'Cinematic' },
  { key: 'ASMR dan cozy', label: 'ASMR / Cozy' },
  { key: 'hype dan viral', label: 'Hype / Viral' },
]

interface ScriptScene {
  timecode: string
  label: string
  dialog: string
  direction: string
  talking_points: string[]
}

interface VideoScript {
  duration: string
  format: string
  tone: string
  editing_style: string
  hook: string
  script: ScriptScene[]
}

export default function VideoPage() {
  const t = useT()
  const [judul, setJudul] = useState('')
  const [platform, setPlatform] = useState('tiktok')
  const [duration, setDuration] = useState('30 detik')
  const [tone, setTone] = useState('fun dan energetic')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VideoScript | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showHistory, setShowHistory] = useState(false)

  async function generate() {
    if (!judul.trim()) return
    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `Buatkan script video pendek yang lengkap untuk konten berikut:

Judul / Topik: ${judul.trim()}
Platform: ${platform}
Durasi target: ${duration}
Tone: ${tone}

Output HANYA JSON berikut tanpa teks lain:
{
  "duration": "durasi",
  "format": "format video (contoh: TikTok 9:16)",
  "tone": "tone video",
  "editing_style": "gaya editing spesifik (CapCut template, jump cut, dll)",
  "hook": "hook opening yang paling catchy (1 kalimat kuat)",
  "script": [
    {
      "timecode": "00:00–00:05",
      "label": "HOOK",
      "dialog": "teks dialog/narasi yang diucapkan",
      "direction": "arahan visual dan kamera",
      "talking_points": ["poin 1", "poin 2"]
    }
  ]
}

Buat 4-6 scene sesuai durasi. Dialog harus natural dan engaging dalam Bahasa Indonesia.`,
          }],
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal generate script'))

      const cleaned = data.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
      const parsed = JSON.parse(cleaned)
      setResult(parsed)
      addHistoryItem({ tool: 'video', title: judul.trim().slice(0, 60), data: { judul: judul.trim(), platform, duration, tone, result: parsed } })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Terjadi kesalahan'))
    } finally {
      setLoading(false)
    }
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 20,
    border: '1px solid', borderColor: active ? '#f59e0b' : 'var(--border)',
    background: active ? 'rgba(245,158,11,0.1)' : 'var(--bg3)',
    color: active ? '#f59e0b' : 'var(--text2)',
    fontSize: 12, cursor: 'pointer', fontWeight: active ? 600 : 400,
  })

  const LABEL_COLORS: Record<string, string> = {
    HOOK: '#f59e0b', ISI: '#6c63ff', KONTEN: '#43d9a2', CTA: '#60a5fa',
  }

  function handleRestore(item: HistoryItem) {
    const data = item.data as { judul: string; platform: string; duration: string; tone: string; result: VideoScript }
    setJudul(data.judul ?? '')
    setPlatform(data.platform ?? 'tiktok')
    setDuration(data.duration ?? '30 detik')
    setTone(data.tone ?? 'fun dan energetic')
    setResult(data.result ?? null)
    setError(null)
  }

  return (
    <>
    {showHistory && <AIHistoryPanel tool="video" onRestore={handleRestore} onClose={() => setShowHistory(false)} />}
    <PageShell
      title={t('Generator Script Video')}
      action={
        <button onClick={() => setShowHistory(true)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
          🕐 History
        </button>
      }
    >
    <div style={{ padding: '24px 28px', maxWidth: 800, margin: '0 auto' }}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>{t('Judul / Topik Konten')}</label>
          <input
            value={judul}
            onChange={e => setJudul(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && generate()}
            placeholder={t('contoh: 3 tren fashion Indonesia 2025 yang wajib dicoba')}
            style={{ width: '100%', boxSizing: 'border-box', fontSize: 14 }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 10 }}>Platform</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {PLATFORM_OPTIONS.map(p => (
              <button key={p.key} onClick={() => setPlatform(p.key)} style={chipStyle(platform === p.key)}>{p.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 10 }}>{t('Durasi')}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {DURATION_OPTIONS.map(d => (
              <button key={d.key} onClick={() => setDuration(d.key)} style={chipStyle(duration === d.key)}>{d.label}</button>
            ))}
          </div>
        </div>

        <div>
          <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 10 }}>Tone</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {TONE_OPTIONS.map(t => (
              <button key={t.key} onClick={() => setTone(t.key)} style={chipStyle(tone === t.key)}>{t.label}</button>
            ))}
          </div>
        </div>

        <button
          onClick={generate}
          disabled={!judul.trim() || loading}
          style={{
            padding: '12px 24px', borderRadius: 10, border: 'none',
            background: !judul.trim() || loading ? 'var(--bg3)' : '#f59e0b',
            color: !judul.trim() || loading ? 'var(--text2)' : '#000',
            fontSize: 14, fontWeight: 700, cursor: !judul.trim() || loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Generating script...' : '🎬 Generate Script'}
        </button>

        {error && (
          <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
            {error}
          </div>
        )}

        {result && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'fadeIn 0.3s ease' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              {[
                { label: t('Durasi'), value: result.duration },
                { label: 'Format', value: result.format },
                { label: 'Tone', value: result.tone },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600 }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div style={{ background: '#f59e0b11', border: '1px solid #f59e0b33', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Hook Opening</div>
              <div style={{ fontSize: 15, color: 'var(--text)', fontWeight: 600, lineHeight: 1.5 }}>"{result.hook}"</div>
            </div>

            <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>{t('Gaya Editing')}</div>
              <div style={{ fontSize: 13, color: 'var(--text)' }}>{result.editing_style}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>Script</div>
              {result.script.map((scene, i) => {
                const color = LABEL_COLORS[scene.label] ?? '#6c63ff'
                return (
                  <div key={i} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: color }}>{scene.timecode}</span>
                      <span style={{ padding: '2px 8px', borderRadius: 4, background: `${color}22`, border: `1px solid ${color}44`, color, fontSize: 10, fontWeight: 700 }}>{scene.label}</span>
                    </div>
                    <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500, lineHeight: 1.6, marginBottom: 8 }}>
                      "{scene.dialog}"
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: scene.talking_points.length > 0 ? 10 : 0 }}>
                      ↳ {scene.direction}
                    </div>
                    {scene.talking_points.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {scene.talking_points.map((pt, j) => (
                          <div key={j} style={{ fontSize: 11, color: color, opacity: 0.8 }}>• {pt}</div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
    </PageShell>
    </>
  )
}
