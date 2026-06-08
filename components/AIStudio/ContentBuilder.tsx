'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { AI_PLATFORMS } from '@/lib/constants'
import { useT } from '@/lib/i18n/LanguageProvider'
import GeneratedOutput from './GeneratedOutput'

interface GeneratedData {
  caption: string
  hashtags: string
  script: string
  posting_time: string
}

export default function ContentBuilder() {
  const t = useT()
  const params = useSearchParams()
  const [inputText, setInputText] = useState('')
  const [platform, setPlatform] = useState('ig')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<GeneratedData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fromIdea = params.get('input_text')
    const fromPlatform = params.get('platform')
    if (fromIdea) setInputText(fromIdea)
    if (fromPlatform) setPlatform(fromPlatform)
  }, [params])

  async function generate() {
    if (!inputText.trim()) return
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/ai/builder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input_text: inputText, platform }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Gagal generate konten')
      setResult(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '5px 12px',
    borderRadius: 20,
    border: '1px solid',
    borderColor: active ? 'var(--accent)' : 'var(--border)',
    background: active ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
    color: active ? 'var(--accent)' : 'var(--text2)',
    fontSize: 12,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
            {t('Ide / Konsep Konten')}
          </label>
          <textarea
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            placeholder={t('Ketik ide konten atau paste dari Pencari Ide...')}
            rows={4}
            style={{ width: '100%' }}
          />
        </div>

        <div>
          <label style={{ fontSize: 12, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>
            Platform
          </label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {AI_PLATFORMS.map(p => (
              <button key={p.key} onClick={() => setPlatform(p.key)} style={chipStyle(platform === p.key)}>
                {p.label}
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
          disabled={loading || !inputText.trim()}
          style={{
            padding: '10px 24px',
            background: loading || !inputText.trim() ? 'var(--bg3)' : 'var(--accent)',
            border: 'none',
            borderRadius: 8,
            color: loading || !inputText.trim() ? 'var(--text2)' : '#fff',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading || !inputText.trim() ? 'not-allowed' : 'pointer',
            alignSelf: 'flex-start',
          }}
        >
          {loading ? 'Generating...' : t('Generate Konten →')}
        </button>
      </div>

      {result && (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>{t('Hasil Generate')}</div>
          <GeneratedOutput data={result} platform={platform} inputText={inputText} />
        </div>
      )}
    </div>
  )
}
