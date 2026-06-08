'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import AIHistoryPanel from '@/components/AIStudio/AIHistoryPanel'
import { addHistoryItem, HistoryItem } from '@/lib/aiHistory'
import { PageShell } from '@/components/shared/PageShell'
import {
  STYLE_OPTIONS, RATIO_OPTIONS,
  type ProviderBadge, fetchAiImageProviderBadge,
} from '@/lib/image-page-shared'
import { useT } from '@/lib/i18n/LanguageProvider'

// Simple text-to-image generator. Templates moved to /ai/templates.

export default function ImagePage() {
  const t = useT()
  const [showHistory, setShowHistory] = useState(false)
  const [deskripsi, setDeskripsi] = useState('')
  const [style, setStyle] = useState('fashion editorial photography')
  const [ratio, setRatio] = useState('4:5')
  const [loading, setLoading] = useState(false)
  const [imageUrl, setImageUrl] = useState<string | null>(null)
  const [mjPrompt, setMjPrompt] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [providerBadge, setProviderBadge] = useState<ProviderBadge | null>(null)

  useEffect(() => { void fetchAiImageProviderBadge().then(setProviderBadge) }, [])

  const isConnected = !!providerBadge?.hasKey

  async function generate() {
    if (!deskripsi.trim() || !isConnected) return
    setLoading(true)
    setError(null)
    setImageUrl(null)
    setMjPrompt(null)
    setNotice(null)

    try {
      const selectedRatio = RATIO_OPTIONS.find(r => r.key === ratio) ?? RATIO_OPTIONS[1]

      // Step 1 (optional): Claude/GPT enhance Indonesian description into a
      // detailed English prompt. Falls back to raw description on failure.
      let imagePrompt = ''
      let mjString = ''
      try {
        const chatRes = await fetch('/api/ai/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `Buat prompt gambar AI yang sangat detail untuk konten berikut:

Deskripsi: ${deskripsi.trim()}
Style: ${style}
Rasio: ${selectedRatio.label}

Output HANYA JSON ini tanpa teks lain:
{
  "image_prompt": "detailed English prompt for AI image generation, hyper realistic, professional ${style}, highly detailed, 8k resolution",
  "midjourney": "full Midjourney prompt in English with ${selectedRatio.mj} --v 6 --style raw at the end"
}`,
            }],
          }),
        })
        const chatData = await chatRes.json()
        if (!chatRes.ok) throw new Error(chatData.error ?? 'chat enhancement gagal')
        const cleaned = chatData.content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
        const parsed = JSON.parse(cleaned) as { image_prompt: string; midjourney: string }
        imagePrompt = parsed.image_prompt
        mjString = parsed.midjourney
      } catch (chatErr) {
        const reason = chatErr instanceof Error ? chatErr.message : 'unknown'
        setNotice(`⚠ Prompt enhancement skip (${reason.slice(0, 100)}). ${t('Pakai deskripsi mentah.')}`)
        imagePrompt = `${deskripsi.trim()}, ${style}, hyper realistic, highly detailed, 8k resolution`
        mjString = `${deskripsi.trim()}, ${style} ${selectedRatio.mj} --v 6 --style raw`
      }
      setMjPrompt(mjString)

      // Step 2: actually generate the image. Backend resolves provider from
      // ai-image feature config (set in /settings/ai).
      const imgRes = await fetch('/api/ai/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: imagePrompt,
          size: selectedRatio.size,
          aspectRatio: selectedRatio.key,
        }),
      })
      const imgData = await imgRes.json()
      if (!imgRes.ok) throw new Error(imgData.error ?? 'Gagal generate gambar')
      setImageUrl(imgData.url)
      addHistoryItem({
        tool: 'image',
        title: deskripsi.trim().slice(0, 60),
        data: {
          deskripsi: deskripsi.trim(), style,
          provider: imgData.provider ?? providerBadge?.provider ?? '',
          imageUrl: imgData.url, mjPrompt: mjString ?? null,
        },
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Terjadi kesalahan'))
    } finally {
      setLoading(false)
    }
  }

  const chipStyle = (active: boolean, color = '#43d9a2'): React.CSSProperties => ({
    padding: '6px 12px', borderRadius: 20,
    border: '1px solid', borderColor: active ? color : 'var(--border)',
    background: active ? `${color}18` : 'var(--bg3)',
    color: active ? color : 'var(--text2)',
    fontSize: 12, cursor: 'pointer', fontWeight: active ? 600 : 400,
  })

  function handleRestore(item: HistoryItem) {
    const data = item.data as { deskripsi: string; style: string; imageUrl: string; mjPrompt: string | null }
    setDeskripsi(data.deskripsi ?? '')
    setStyle(data.style ?? 'fashion editorial photography')
    setImageUrl(data.imageUrl ?? null)
    setMjPrompt(data.mjPrompt ?? null)
    setError(null)
  }

  return (
    <>
      {showHistory && <AIHistoryPanel tool="image" onRestore={handleRestore} onClose={() => setShowHistory(false)} />}

      <PageShell
        title={t('Generator Gambar AI')}
        action={
          <>
            <Link href="/ai/templates" style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', textDecoration: 'none' }}>
              📚 {t('Template Gambar')}
            </Link>
            <button onClick={() => setShowHistory(true)} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg3)', color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>
              🕐 History
            </button>
          </>
        }
      >
      <div style={{ padding: '24px 28px', maxWidth: 760, margin: '0 auto' }}>
        {/* Provider status badge — read-only */}
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Description */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 8 }}>
              {t('Deskripsikan gambar yang kamu inginkan')}
            </label>
            <textarea
              value={deskripsi}
              onChange={e => setDeskripsi(e.target.value)}
              placeholder={t('contoh: foto model wanita Indonesia memakai batik modern di kafe estetik, pencahayaan natural dari jendela, suasana hangat...')}
              rows={5}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', fontSize: 14, lineHeight: 1.6 }}
            />
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, lineHeight: 1.5 }}>
              💡 {t('Mau pakai template yang sudah disiapkan? Buka')} <Link href="/ai/templates" style={{ color: 'var(--accent)', fontWeight: 600 }}>{t('Template Gambar →')}</Link>
            </div>
          </div>

          {/* Style */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 10 }}>Style</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STYLE_OPTIONS.map(s => (
                <button key={s.key} onClick={() => setStyle(s.key)} style={chipStyle(style === s.key)}>{s.label}</button>
              ))}
            </div>
          </div>

          {/* Ratio */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: 10 }}>{t('Rasio')}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {RATIO_OPTIONS.map(r => (
                <button key={r.key} onClick={() => setRatio(r.key)} style={chipStyle(ratio === r.key)}>{r.label}</button>
              ))}
            </div>
          </div>

          {/* Generate / not connected state */}
          {!isConnected ? (
            <div style={{
              padding: '16px 20px',
              background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)',
              borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap',
            }}>
              <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5 }}>
                {t('Provider')} <strong style={{ color: 'var(--text)' }}>{providerBadge?.label ?? t('gambar')}</strong> {t('belum punya API key. Atur di AI Integrations dulu.')}
              </div>
              <Link href="/settings/ai" style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', textDecoration: 'none' }}>
                {t('Buka AI Integrations →')}
              </Link>
            </div>
          ) : (
            <button
              onClick={generate}
              disabled={!deskripsi.trim() || loading}
              style={{
                padding: '12px 24px', borderRadius: 10, border: 'none',
                background: !deskripsi.trim() || loading ? 'var(--bg3)' : '#43d9a2',
                color: !deskripsi.trim() || loading ? 'var(--text2)' : '#000',
                fontSize: 14, fontWeight: 700, cursor: !deskripsi.trim() || loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? `Generating via ${providerBadge?.label ?? 'AI'}...` : `✦ ${t('Generate Gambar')}`}
            </button>
          )}

          {/* Error / notice / loading / result */}
          {error && (() => {
            const isCreditError = /credit|billing|insufficient|not_enough/i.test(error)
            const providerName = providerBadge?.label ?? 'Provider'
            const topupUrl = providerBadge?.provider === 'higgsfield' ? 'https://cloud.higgsfield.ai'
              : providerBadge?.provider === 'openai' ? 'https://platform.openai.com/settings/organization/billing/overview'
              : providerBadge?.provider === 'leonardo' ? 'https://app.leonardo.ai/settings/billing'
              : providerBadge?.provider === 'stability' ? 'https://platform.stability.ai/account/credits'
              : null
            return (
              <div style={{ padding: '12px 14px', background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.28)', borderRadius: 8, color: '#ff6b6b', fontSize: 12, lineHeight: 1.5 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>
                  {isCreditError ? `⚠ ${providerName} ${t('credit habis')}` : `✗ ${t('Generate gagal')}`}
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(255,107,107,0.8)', wordBreak: 'break-word' }}>{error}</div>
                <div style={{ marginTop: 10, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Link href="/settings/ai" style={{ padding: '6px 12px', borderRadius: 6, background: 'var(--accent)', color: '#fff', fontSize: 11, fontWeight: 700, textDecoration: 'none' }}>
                    {t('Ganti provider di AI Integrations →')}
                  </Link>
                  {isCreditError && topupUrl && (
                    <a href={topupUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>
                      {t('atau top-up credit')} {providerName} →
                    </a>
                  )}
                </div>
              </div>
            )
          })()}

          {notice && (
            <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.28)', borderRadius: 8, color: '#f59e0b', fontSize: 12, lineHeight: 1.5 }}>
              {notice}
            </div>
          )}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🎨</div>
                <div>{providerBadge?.label ?? 'AI'} {t('sedang menggambar...')}</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>{t('Biasanya 20–45 detik')}</div>
              </div>
            </div>
          )}

          {imageUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeIn 0.3s ease' }}>
              <div style={{ borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img src={imageUrl} alt="Generated" style={{ width: '100%', display: 'block' }} />
              </div>
              <a
                href={imageUrl}
                download="bentala-ai-image.jpg"
                target="_blank"
                rel="noopener noreferrer"
                style={{ padding: '10px 16px', borderRadius: 8, background: '#43d9a2', color: '#000', fontSize: 13, fontWeight: 700, textAlign: 'center', textDecoration: 'none', display: 'block' }}
              >
                ↓ {t('Download Gambar')}
              </a>
            </div>
          )}

          {mjPrompt && (
            <div style={{ background: 'var(--bg2)', border: '1px solid #43d9a233', borderRadius: 12, padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#43d9a2', letterSpacing: 1, textTransform: 'uppercase' }}>Midjourney Prompt</div>
                <button
                  onClick={() => { navigator.clipboard.writeText(mjPrompt).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                  style={{ padding: '4px 12px', borderRadius: 6, border: '1px solid #43d9a244', background: copied ? '#43d9a222' : 'transparent', color: '#43d9a2', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.7, fontStyle: 'italic', background: 'var(--bg3)', padding: '10px 14px', borderRadius: 8 }}>
                {mjPrompt}
              </div>
            </div>
          )}
        </div>
      </div>
      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      </PageShell>
    </>
  )
}
