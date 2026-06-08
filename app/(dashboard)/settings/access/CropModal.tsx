'use client'

import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import 'react-easy-crop/react-easy-crop.css'
import { BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => res(img)
    img.onerror = rej
    img.src = src
  })
}

async function getCroppedFile(src: string, area: Area, name: string): Promise<File> {
  const img = await loadImage(src)
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, size, size)
  const blob: Blob = await new Promise(resolve => canvas.toBlob(b => resolve(b!), 'image/jpeg', 0.9))
  return new File([blob], name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
}

export function CropModal({ file, onCancel, onDone }: {
  file: File
  onCancel: () => void
  onDone: (cropped: File) => void
}) {
  const t = useT()
  const [src] = useState(() => URL.createObjectURL(file))
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [area, setArea] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)

  const onComplete = useCallback((_a: Area, px: Area) => setArea(px), [])

  async function done() {
    if (!area) return
    setBusy(true)
    try {
      const f = await getCroppedFile(src, area, file.name)
      onDone(f)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      onClick={onCancel}
      style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ width: 'min(440px, 95vw)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.55)' }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
          {t('Atur Foto Profil')}
        </div>

        {/* Cropper canvas */}
        <div style={{ position: 'relative', width: '100%', height: 340, background: '#0b0c11' }}>
          <Cropper
            image={src}
            crop={crop}
            zoom={zoom}
            aspect={1}
            cropShape="round"
            showGrid
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={onComplete}
          />
        </div>

        {/* Zoom control */}
        <div style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>Zoom</span>
          <input
            type="range" min={1} max={3} step={0.01} value={zoom}
            onChange={e => setZoom(Number(e.target.value))}
            style={{ flex: 1, accentColor: 'var(--accent)' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, padding: '12px 18px', borderTop: '1px solid var(--border)' }}>
          <BtnSecondary onClick={onCancel} disabled={busy}>{t('Batal')}</BtnSecondary>
          <BtnPrimary onClick={done} loading={busy}>{t('Gunakan Foto')}</BtnPrimary>
        </div>
      </div>
    </div>
  )
}
