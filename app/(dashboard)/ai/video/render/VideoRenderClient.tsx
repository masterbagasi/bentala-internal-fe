'use client'

import { Player } from '@remotion/player'
import { useMemo, useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { StorylineVideo, defaultStoryline, type StorylineProps, type StorylineScene } from '@/remotion/compositions/StorylineVideo'

const FPS = 30

// Map an /api/ai/storyline output (scenes with `timecode` like "00:00–00:05")
// into the Remotion-friendly shape (durationInFrames). Approximates duration
// by parsing the end second from the timecode string.
function parseStorylineApiToProps(api: ApiStorylineResponse | null, title: string): StorylineProps | null {
  if (!api?.scenes?.length) return null
  const scenes: StorylineScene[] = []
  let prevEnd = 0
  for (const s of api.scenes) {
    const seconds = parseTimecodeDuration(s.timecode, prevEnd)
    prevEnd += seconds
    scenes.push({
      no: s.no,
      label: s.label,
      dialog: s.dialog,
      visual: s.visual,
      durationInFrames: Math.max(Math.round(seconds * FPS), 30),
      bgColor: s.label === 'HOOK' || s.label === 'CTA' ? '#0B3DE7' : '#0a0a0a',
    })
  }
  return { title, scenes, brandLabel: 'bentala project' }
}

interface ApiStorylineResponse {
  total_durasi?: string
  format?: string
  scenes: Array<{
    no: number
    timecode: string
    label: string
    visual: string
    dialog: string
    direction?: string
    bgm?: string
  }>
}

// "00:05-00:20" or "00:05–00:20" → 15 seconds
function parseTimecodeDuration(tc: string, fallbackPrevEnd: number): number {
  if (!tc) return 5
  const parts = tc.split(/[–\-—]/).map(s => s.trim())
  if (parts.length !== 2) return 5
  const [start, end] = parts.map(toSeconds)
  if (Number.isFinite(start) && Number.isFinite(end) && end > start) return end - start
  return Math.max(5, fallbackPrevEnd)
}

function toSeconds(t: string): number {
  const [m, s] = t.split(':').map(Number)
  if (!Number.isFinite(m) || !Number.isFinite(s)) return NaN
  return m * 60 + s
}

export default function VideoRenderClient() {
  const t = useT()
  const [props, setProps] = useState<StorylineProps>(defaultStoryline)
  const [importJson, setImportJson] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)

  const totalFrames = useMemo(
    () => props.scenes.reduce((sum, s) => sum + s.durationInFrames, 0),
    [props.scenes],
  )

  function handleImport() {
    setImportError(null)
    try {
      const parsed = JSON.parse(importJson) as ApiStorylineResponse
      const next = parseStorylineApiToProps(parsed, props.title || 'Storyline')
      if (!next) throw new Error(t('JSON tidak punya `scenes` array yang valid'))
      setProps(next)
    } catch (e) {
      setImportError(e instanceof Error ? e.message : t('Gagal parse JSON'))
    }
  }

  function handleResetDemo() {
    setProps(defaultStoryline)
    setImportJson('')
    setImportError(null)
    setDownloadUrl(null)
  }

  async function handleRender() {
    setRendering(true)
    setRenderError(null)
    setDownloadUrl(null)
    try {
      const res = await fetch('/api/render/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compositionId: 'StorylineVideo', inputProps: props }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? t('Render gagal ({status})').replace('{status}', String(res.status)))
      }
      const data = await res.json()
      if (!data.url) throw new Error(t('Render selesai tapi tidak ada URL output'))
      setDownloadUrl(data.url)
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : t('Render gagal'))
    } finally {
      setRendering(false)
    }
  }

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20 }}>
        {/* Player */}
        <div>
          <div style={{
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            overflow: 'hidden',
          }}>
            <Player
              component={StorylineVideo}
              inputProps={props}
              durationInFrames={Math.max(totalFrames, 30)}
              fps={FPS}
              compositionWidth={1080}
              compositionHeight={1920}
              style={{ width: '100%', aspectRatio: '9 / 16' }}
              controls
              loop
            />
          </div>

          <div style={{
            marginTop: 12, padding: 12, borderRadius: 10,
            background: 'var(--bg3)', border: '1px solid var(--border)',
            fontSize: 11, color: 'var(--text2)', lineHeight: 1.6,
          }}>
            <strong style={{ color: 'var(--text)' }}>Format:</strong> 1080×1920 (9:16) · {FPS}fps · {props.scenes.length} scene · {Math.round(totalFrames / FPS)}s total
            <br />
            <strong style={{ color: 'var(--text)' }}>{t('CLI alternatif:')}</strong> <code>npm run remotion:render</code> {t('untuk render lokal pakai default props.')}
          </div>
        </div>

        {/* Sidebar — controls */}
        <aside style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Title */}
          <div>
            <label style={labelStyle}>{t('Judul')}</label>
            <input
              type="text"
              value={props.title}
              onChange={e => setProps(p => ({ ...p, title: e.target.value }))}
              style={inputStyle}
            />
          </div>

          {/* Import storyline JSON */}
          <div>
            <label style={labelStyle}>{t('Import Storyline JSON')}</label>
            <textarea
              value={importJson}
              onChange={e => setImportJson(e.target.value)}
              placeholder={t('Tempel output dari /api/ai/storyline di sini')}
              rows={6}
              style={{ ...inputStyle, fontFamily: 'monospace', fontSize: 11, resize: 'vertical' }}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button onClick={handleImport} style={btnStyle(false, true)}>{t('Import')}</button>
              <button onClick={handleResetDemo} style={btnStyle(false)}>{t('Reset demo')}</button>
            </div>
            {importError && (
              <div style={{ marginTop: 6, fontSize: 11, color: '#ff7575' }}>{importError}</div>
            )}
          </div>

          {/* Render */}
          <div style={{
            padding: 12, borderRadius: 10,
            background: 'var(--bg2)', border: '1px solid var(--border)',
          }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
              {t('Render MP4')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 10 }}>
              {t('Server-side render pakai @remotion/renderer (headless Chrome). Bisa ambil 30-90 detik tergantung durasi.')}
            </div>
            <button
              onClick={handleRender}
              disabled={rendering}
              style={{
                width: '100%', height: 36, padding: '0 16px', borderRadius: 8,
                background: 'var(--accent)', border: 'none', color: '#fff',
                cursor: rendering ? 'not-allowed' : 'pointer',
                fontSize: 12, fontWeight: 700,
                opacity: rendering ? 0.6 : 1,
              }}
            >
              {rendering ? t('Rendering... (jangan close tab)') : t('⬇ Render & Download MP4')}
            </button>
            {renderError && (
              <div style={{ marginTop: 8, padding: '7px 10px', borderRadius: 6, background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.25)', color: '#ff7575', fontSize: 11 }}>
                {renderError}
              </div>
            )}
            {downloadUrl && (
              <a
                href={downloadUrl}
                download="storyline.mp4"
                style={{
                  display: 'block', marginTop: 8, padding: '7px 10px',
                  borderRadius: 6, background: 'rgba(67,217,162,0.08)', border: '1px solid rgba(67,217,162,0.28)',
                  color: '#43d9a2', fontSize: 11, textAlign: 'center', textDecoration: 'none', fontWeight: 700,
                }}
              >
                {t('✓ Selesai — klik untuk download')}
              </a>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '1px',
  marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '8px 10px',
  borderRadius: 8,
  background: 'var(--bg3)',
  border: '1px solid var(--border)',
  color: 'var(--text)',
  fontSize: 12,
  outline: 'none',
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
  }
}
