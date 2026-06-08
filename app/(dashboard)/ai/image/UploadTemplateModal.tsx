'use client'

import { useState, useRef } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'

const RATIOS = [
  { key: '1:1', label: '1:1 — Square' },
  { key: '4:5', label: '4:5 — Feed IG' },
  { key: '9:16', label: '9:16 — Story/Reels' },
  { key: '16:9', label: '16:9 — YouTube' },
]

const STYLES = [
  { key: 'fashion editorial photography', label: 'Fashion Editorial' },
  { key: 'flat lay product photography', label: 'Flat Lay Product' },
  { key: 'lifestyle photography', label: 'Lifestyle' },
  { key: 'cinematic portrait photography', label: 'Cinematic Portrait' },
  { key: 'minimalist graphic design', label: 'Minimalist Graphic' },
  { key: 'street photography', label: 'Street Style' },
]

const BRANDS = [
  { key: 'bpi', label: 'BPI — Bentala Project Indonesia', color: '#60a5fa' },
  { key: 'bsi', label: 'BSI — Bentala Studio Indonesia', color: '#f472b6' },
  { key: 'custom', label: 'Custom (untuk eksperimen)', color: '#94a3b8' },
] as const

const MAX_FILE_BYTES = 3.5 * 1024 * 1024 // 3.5MB raw → ~4.7MB base64

interface Props {
  onClose: () => void
  onCreated: () => void
}

export default function UploadTemplateModal({ onClose, onCreated }: Props) {
  const t = useT()
  const [brand, setBrand] = useState<'bpi' | 'bsi' | 'custom'>('bpi')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [prompt, setPrompt] = useState('')
  const [ratio, setRatio] = useState('4:5')
  const [style, setStyle] = useState('cinematic portrait photography')
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null)
  const [imageFileName, setImageFileName] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File | null | undefined) {
    setError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError(t('File harus image (jpg/png/webp)'))
      return
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`${t('File terlalu besar')} (${Math.round(file.size / 1024 / 1024 * 10) / 10} MB). ${t('Max 3.5 MB. Compress dulu.')}`)
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImageDataUrl(reader.result as string)
      setImageFileName(file.name)
    }
    reader.onerror = () => setError(t('Gagal baca file'))
    reader.readAsDataURL(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    const file = e.dataTransfer.files?.[0]
    handleFile(file)
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      if (!name.trim()) throw new Error(t('Nama template wajib diisi'))
      if (!prompt.trim()) throw new Error(t('Prompt wajib diisi'))
      const res = await fetch('/api/image-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          brand, name: name.trim(), description: description.trim(),
          prompt: prompt.trim(), ratio, style, image_dataurl: imageDataUrl,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal simpan'))
      onCreated()
      onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('Gagal simpan template'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      }}
    >
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 560, maxHeight: '92vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{t('+ Upload Template Baru')}</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {t('Save preset prompt + style + reference image untuk reuse')}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Brand */}
          <div>
            <label style={labelStyle}>Brand</label>
            <div style={{ display: 'flex', gap: 6 }}>
              {BRANDS.map(b => (
                <button
                  key={b.key}
                  onClick={() => setBrand(b.key)}
                  style={{
                    flex: 1, padding: '8px 10px', borderRadius: 7,
                    background: brand === b.key ? `${b.color}18` : 'var(--bg3)',
                    border: `1px solid ${brand === b.key ? b.color + '55' : 'var(--border)'}`,
                    color: brand === b.key ? b.color : 'var(--text)',
                    fontSize: 11, fontWeight: brand === b.key ? 700 : 500, cursor: 'pointer',
                  }}
                >
                  {b.label}
                </button>
              ))}
            </div>
          </div>

          {/* Reference image */}
          <div>
            <label style={labelStyle}>{t('Reference Image (opsional)')}</label>
            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileRef.current?.click()}
              style={{
                padding: imageDataUrl ? 0 : 24,
                borderRadius: 10,
                background: 'var(--bg3)',
                border: imageDataUrl ? '1px solid var(--border)' : '2px dashed var(--border)',
                textAlign: 'center',
                cursor: 'pointer',
                color: 'var(--text2)', fontSize: 12,
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {imageDataUrl ? (
                <>
                  <img src={imageDataUrl} alt="preview" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', display: 'block' }} />
                  <button
                    onClick={e => { e.stopPropagation(); setImageDataUrl(null); setImageFileName(null) }}
                    style={{
                      position: 'absolute', top: 8, right: 8,
                      width: 26, height: 26, borderRadius: '50%',
                      background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff',
                      fontSize: 13, cursor: 'pointer',
                    }}
                  >✕</button>
                  {imageFileName && (
                    <div style={{ position: 'absolute', bottom: 6, left: 6, padding: '3px 8px', borderRadius: 4, background: 'rgba(0,0,0,0.6)', fontSize: 10, color: '#fff', fontFamily: 'monospace' }}>
                      {imageFileName}
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div style={{ fontSize: 22, marginBottom: 6 }}>📷</div>
                  <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>{t('Klik atau drag image ke sini')}</div>
                  <div style={{ fontSize: 10 }}>jpg / png / webp · max 3.5 MB</div>
                </>
              )}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files?.[0])}
              />
            </div>
          </div>

          {/* Name + Description */}
          <div>
            <label style={labelStyle}>{t('Nama Template *')}</label>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder={t('mis. "Cover Berita Diaspora WNI"')}
              style={inputStyle}
            />
          </div>
          <div>
            <label style={labelStyle}>{t('Deskripsi (opsional)')}</label>
            <input
              type="text" value={description} onChange={e => setDescription(e.target.value)}
              placeholder={t('Gambaran singkat kapan template ini dipakai')}
              style={inputStyle}
            />
          </div>

          {/* Prompt */}
          <div>
            <label style={labelStyle}>{t('Prompt Template *')}</label>
            <textarea
              value={prompt} onChange={e => setPrompt(e.target.value)}
              placeholder={t(`Tulis prompt yang nanti dipakai. Bisa pakai placeholder dengan [KURUNG SIKU] supaya gampang di-edit:

Contoh:
"Cover BPI: WNI di [NEGARA], [DESKRIPSI EKSPRESI], natural lighting, news photography style, hyper realistic"`)}
              rows={5}
              style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical', lineHeight: 1.5 }}
            />
            <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4 }}>
              💡 {t('Pakai')} <code>[KURUNG SIKU]</code> {t('untuk bagian yang user perlu isi tiap kali pakai template.')}
            </div>
          </div>

          {/* Ratio + Style */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>{t('Rasio')}</label>
              <select value={ratio} onChange={e => setRatio(e.target.value)} style={selectStyle}>
                {RATIOS.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={labelStyle}>Style</label>
              <select value={style} onChange={e => setStyle(e.target.value)} style={selectStyle}>
                {STYLES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div style={{
              padding: '8px 10px', borderRadius: 8, fontSize: 12,
              background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.28)',
              color: '#ff7575',
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '14px 20px', borderTop: '1px solid var(--border)',
          display: 'flex', gap: 8, justifyContent: 'flex-end',
        }}>
          <button onClick={onClose} disabled={saving} style={btnSecondary(saving)}>{t('Batal')}</button>
          <button onClick={handleSave} disabled={saving} style={btnPrimary(saving)}>
            {saving ? t('Menyimpan...') : t('Simpan Template')}
          </button>
        </div>
      </div>
    </div>
  )
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', borderRadius: 8,
  background: 'var(--bg3)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 13, outline: 'none',
}

const selectStyle: React.CSSProperties = {
  ...inputStyle, height: 36, cursor: 'pointer',
}

function btnSecondary(disabled: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 14px', borderRadius: 8,
    background: 'var(--bg3)', border: '1px solid var(--border)',
    color: 'var(--text)', cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12, fontWeight: 600, opacity: disabled ? 0.5 : 1,
  }
}

function btnPrimary(disabled: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 18px', borderRadius: 8,
    background: 'var(--accent)', border: 'none', color: '#fff',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 12, fontWeight: 700, opacity: disabled ? 0.5 : 1,
  }
}
