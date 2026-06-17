'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { getSupabase } from '@/lib/supabase'
import { uploadFileWithProgress } from '@/lib/storage'
import type { BsiCollaboration } from '@/lib/website-types'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { PrimaryActionButton } from '@/components/website/PageActions'
import { FormField, inputStyle } from '@/components/website/FormField'
import { IconBtn, ListEmpty, ListError, ModalShell } from '@/components/website/SimpleList'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import { Section } from '@/components/website/Section'
import { useIsMobile } from '@/hooks/useIsMobile'

type FormState = Omit<BsiCollaboration, 'id' | 'created_at'>

const EMPTY: FormState = {
  brand_name: '',
  logo_svg: '',
  tint_color: '#00d4ff',
  is_published: true,
  sort_order: 0,
}

/**
 * Detect raster logos uploaded via the PNG/JPG flow. Those are stored as
 * <svg><image href="..."/></svg> wrappers; pull the URL out so the admin
 * preview can render an <img> with object-cover that fills the full
 * preview cell, matching the public site rendering.
 */
function extractRasterUrl(svg: string): string | null {
  if (!svg) return null
  const m = svg.match(/<image\b[^>]*\shref=["']([^"']+)["']/i)
  return m ? m[1] : null
}

/**
 * Pick a representative "tint" colour from a logo image by sampling the
 * centre region and ignoring the background.
 *
 * Strategy:
 *   1. Probe the four corners → "background candidate" colours.
 *   2. Walk only the centre 60% of the image (most logos sit centred).
 *   3. Skip pixels that are transparent, near-white / near-black,
 *      desaturated grey, or close to any background candidate.
 *   4. Average what's left → that's the logo's dominant hue.
 *
 * Falls back to the supplied colour if cross-origin canvas tainting or
 * a fully empty mask leaves nothing usable.
 */
async function extractDominantColor(url: string, fallback = '#00d4ff'): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        const w = 64
        const h = 64
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        const ctx = canvas.getContext('2d')
        if (!ctx) return resolve(fallback)
        ctx.drawImage(img, 0, 0, w, h)
        const { data } = ctx.getImageData(0, 0, w, h)

        const pixelAt = (x: number, y: number) => {
          const i = (y * w + x) * 4
          return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const
        }

        // Sample the 4 corners (a few px in from each edge to avoid stray
        // anti-aliased pixels on the border).
        const inset = 2
        const cornerSamples = [
          pixelAt(inset, inset),
          pixelAt(w - 1 - inset, inset),
          pixelAt(inset, h - 1 - inset),
          pixelAt(w - 1 - inset, h - 1 - inset),
        ]

        // Crop to the centre 60% × 60% — that's where the actual logo
        // mark almost always lives.
        const cropPad = Math.round(w * 0.2)
        const xMin = cropPad
        const xMax = w - cropPad
        const yMin = cropPad
        const yMax = h - cropPad

        const BG_TOLERANCE_SQ = 60 * 60 // squared RGB distance

        let rSum = 0
        let gSum = 0
        let bSum = 0
        let count = 0

        for (let y = yMin; y < yMax; y++) {
          for (let x = xMin; x < xMax; x++) {
            const i = (y * w + x) * 4
            const r = data[i]
            const g = data[i + 1]
            const b = data[i + 2]
            const a = data[i + 3]
            if (a < 100) continue

            const sum = r + g + b
            if (sum > 720) continue // near-white
            if (sum < 30) continue // near-black

            const maxC = Math.max(r, g, b)
            const minC = Math.min(r, g, b)
            if (maxC - minC < 20) continue // desaturated grey

            // Skip if this pixel is close to any of the corner background
            // colours — that filters out flat brand backgrounds.
            let isBg = false
            for (const [cr, cg, cb] of cornerSamples) {
              const dr = r - cr
              const dg = g - cg
              const db = b - cb
              if (dr * dr + dg * dg + db * db < BG_TOLERANCE_SQ) {
                isBg = true
                break
              }
            }
            if (isBg) continue

            rSum += r
            gSum += g
            bSum += b
            count++
          }
        }

        if (count === 0) return resolve(fallback)
        const avg = (n: number) => Math.round(n / count).toString(16).padStart(2, '0')
        resolve(`#${avg(rSum)}${avg(gSum)}${avg(bSum)}`)
      } catch {
        // Canvas tainted or any other failure — keep current colour.
        resolve(fallback)
      }
    }
    img.onerror = () => resolve(fallback)
    img.src = url
  })
}

function sanitizeSvg(svg: string): string {
  if (!svg) return ''
  return DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, svgFilters: true },
  })
}

export default function CollaborationsAdminPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiCollaboration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BsiCollaboration | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('bsi_collaborations')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus brand ini?'))) return
    const { error } = await supabase.from('bsi_collaborations').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setItems((xs) => xs.filter((x) => x.id !== id))
  }

  async function togglePublish(item: BsiCollaboration) {
    const { error } = await supabase
      .from('bsi_collaborations')
      .update({ is_published: !item.is_published })
      .eq('id', item.id)
    if (error) { alert(error.message); return }
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, is_published: !x.is_published } : x)))
  }

  useRegisterPageAction(
    <PrimaryActionButton onClick={() => setCreating(true)}>{t('+ Tambah Brand')}</PrimaryActionButton>,
  )

  return (
    <>
      <div style={{ padding: isMobile ? '24px 14px' : 24 }}>
        {error && <ListError message={error} />}
        <Section title="Brand Partners">
          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('Memuat…')}</div>
          ) : items.length === 0 ? (
            <ListEmpty message={t('Belum ada brand partner.')} />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                gap: 12,
                width: '100%',
              }}
            >
              {items.map((c) => (
                <BrandCard
                  key={c.id}
                  item={c}
                  onEdit={() => setEditing(c)}
                  onTogglePublish={() => togglePublish(c)}
                  onDelete={() => handleDelete(c.id)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {(editing || creating) && (
        <CollaborationModal
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={() => { setEditing(null); setCreating(false); load() }}
        />
      )}
    </>
  )
}

function BrandCard({
  item,
  onEdit,
  onTogglePublish,
  onDelete,
}: {
  item: BsiCollaboration
  onEdit: () => void
  onTogglePublish: () => void
  onDelete: () => void
}) {
  const t = useT()
  const safeSvg = useMemo(() => sanitizeSvg(item.logo_svg), [item.logo_svg])
  const rasterUrl = useMemo(() => extractRasterUrl(item.logo_svg), [item.logo_svg])
  return (
    <div
      style={{
        padding: 16,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        opacity: item.is_published ? 1 : 0.5,
      }}
    >
      <div
        style={{
          position: 'relative',
          height: 80,
          background: 'var(--bg3)',
          borderRadius: 6,
          overflow: 'hidden',
          color: item.tint_color,
        }}
      >
        {rasterUrl ? (
          // Uploaded photo: fill the preview, mirroring how the public site
          // shows it. Tint color does not apply to raster.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={rasterUrl}
            alt={item.brand_name}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 12,
            }}
            dangerouslySetInnerHTML={{
              __html: safeSvg || '<span style="color:#666;font-size:11px">no logo</span>',
            }}
          />
        )}
      </div>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', textAlign: 'center' }}>{item.brand_name}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button
          onClick={onEdit}
          style={{ flex: 1, height: 28, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 11, cursor: 'pointer' }}
        >
          Edit
        </button>
        <IconBtn onClick={onTogglePublish} title={item.is_published ? t('Sembunyikan') : t('Tampilkan')} color={item.is_published ? 'var(--accent3)' : 'var(--text2)'}>
          {item.is_published ? '●' : '○'}
        </IconBtn>
        <IconBtn onClick={onDelete} title={t('Hapus')} color="#ff6b6b">×</IconBtn>
      </div>
    </div>
  )
}

/**
 * Wrap a raster image URL in an SVG <image> element so the existing rendering
 * pipeline (which sanitises with DOMPurify's SVG profile and renders via
 * dangerouslySetInnerHTML) keeps working. Storing as SVG markup means we
 * don't need a separate raster URL column on bsi_collaborations.
 *
 * Tint color won't apply to raster images — that's expected; users keep
 * SVG sources for tinting.
 */
function rasterUrlToSvgMarkup(url: string): string {
  const safeUrl = url.replace(/"/g, '&quot;')
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56" preserveAspectRatio="xMidYMid meet">',
    `<image href="${safeUrl}" x="0" y="0" width="56" height="56" preserveAspectRatio="xMidYMid meet" />`,
    '</svg>',
  ].join('')
}

function CollaborationModal({ initial, onClose, onSaved }: { initial: BsiCollaboration | null; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const supabase = getSupabase()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          brand_name: initial.brand_name,
          logo_svg: initial.logo_svg,
          tint_color: initial.tint_color,
          is_published: initial.is_published,
          sort_order: initial.sort_order,
        }
      : EMPTY,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  const previewSvg = useMemo(() => sanitizeSvg(form.logo_svg), [form.logo_svg])
  const rasterUrl = useMemo(() => extractRasterUrl(form.logo_svg), [form.logo_svg])
  const hasLogo = !!form.logo_svg

  function update<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleFileSelected(file: File) {
    setError(null)
    const isRaster =
      file.type === 'image/png' ||
      file.type === 'image/jpeg' ||
      /\.(png|jpe?g)$/i.test(file.name)

    if (!isRaster) {
      setError(t('Format file tidak didukung. Gunakan PNG atau JPG.'))
      return
    }

    setUploading(true)
    setUploadProgress(0)
    try {
      const { promise } = uploadFileWithProgress(file, 'collaborations', (p) => {
        setUploadProgress(p.percent)
      })
      const result = await promise
      update('logo_svg', sanitizeSvg(rasterUrlToSvgMarkup(result.url)))
      // Auto-pick a tint colour from the just-uploaded logo. Fire-and-forget;
      // any error inside falls back to the existing colour.
      void extractDominantColor(result.url, form.tint_color).then((color) => {
        update('tint_color', color)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  function requestReplaceLogo() {
    setConfirm({
      title: t('Ganti logo?'),
      message: t('Logo yang sekarang akan diganti dengan file baru. File lama tetap di storage.'),
      confirmLabel: t('Ganti'),
      tone: 'warning',
      onConfirm: () => {
        setConfirm(null)
        fileInputRef.current?.click()
      },
    })
  }

  function requestRemoveLogo() {
    setConfirm({
      title: t('Hapus logo?'),
      message: t('Logo akan dilepas dari brand ini. File asli tetap aman di storage.'),
      confirmLabel: t('Hapus'),
      tone: 'danger',
      onConfirm: () => {
        setConfirm(null)
        update('logo_svg', '')
      },
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const payload = { ...form, logo_svg: sanitizeSvg(form.logo_svg) }
    const op = initial
      ? supabase.from('bsi_collaborations').update(payload).eq('id', initial.id)
      : supabase.from('bsi_collaborations').insert(payload)
    const { error } = await op
    if (error) { setError(error.message); setSaving(false); return }
    onSaved()
  }

  const headerStatus = (
    <ActiveToggleButton
      active={form.is_published}
      onClick={() => update('is_published', !form.is_published)}
    />
  )

  return (
    <ModalShell
      title={initial ? t('Edit Brand') : t('Tambah Brand')}
      onClose={onClose}
      headerExtra={headerStatus}
      footer={
        <>
          <button onClick={onClose} style={{ flex: 1, height: 36, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>{t('Batal')}</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, height: 36, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? t('Menyimpan…') : initial ? t('Simpan') : t('Tambah')}</button>
        </>
      }
    >
      {error && <ListError message={error} />}

      <FormField label={t('Nama Brand')} required>
        <input style={inputStyle} value={form.brand_name} onChange={(e) => update('brand_name', e.target.value)} />
      </FormField>

      <FormField label="Logo" required hint="PNG / JPG (max 200 MB)">
        {hasLogo ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div
              style={{
                position: 'relative',
                height: 200,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              {rasterUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={rasterUrl}
                  alt="Preview logo"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'contain',
                    padding: 16,
                  }}
                />
              ) : (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: form.tint_color,
                    padding: 16,
                  }}
                  dangerouslySetInnerHTML={{ __html: previewSvg }}
                />
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={requestReplaceLogo}
                disabled={uploading}
                style={{
                  height: 32,
                  padding: '0 14px',
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: uploading ? 'wait' : 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                {uploading ? `${t('Mengupload')} ${uploadProgress.toFixed(0)}%` : t('Ganti')}
              </button>
              <button
                type="button"
                onClick={requestRemoveLogo}
                disabled={uploading}
                style={{
                  height: 32,
                  padding: '0 14px',
                  background: 'rgba(255,107,107,0.12)',
                  border: '1px solid rgba(255,107,107,0.35)',
                  borderRadius: 8,
                  color: '#ff6b6b',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: uploading ? 'wait' : 'pointer',
                }}
              >
                {t('Hapus')}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{
              height: 140,
              border: `2px dashed ${uploading ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              background: 'var(--bg3)',
              color: 'var(--text2)',
              fontSize: 12,
              cursor: uploading ? 'wait' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {uploading ? (
              <>
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    border: '2px solid var(--border)',
                    borderTopColor: 'var(--accent)',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                <span>{t('Mengupload')} {uploadProgress.toFixed(0)}%</span>
              </>
            ) : (
              <>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span style={{ color: 'var(--text)', fontWeight: 500 }}>{t('Klik untuk upload')}</span>
                <span style={{ fontSize: 11 }}>PNG · JPG (max 200 MB)</span>
              </>
            )}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleFileSelected(f)
            e.target.value = ''
          }}
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Tint Color" hint={t('Otomatis dari warna dominan logo. Bisa diubah manual.')}>
          <input
            type="color"
            style={{ ...inputStyle, padding: 4, height: 36 }}
            value={form.tint_color}
            onChange={(e) => update('tint_color', e.target.value)}
          />
        </FormField>
        <FormField label={t('Urutan')}>
          <input
            type="number"
            style={inputStyle}
            value={form.sort_order}
            onChange={(e) => update('sort_order', Number(e.target.value) || 0)}
          />
        </FormField>
      </div>

      {confirm && <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </ModalShell>
  )
}

function ActiveToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  const t = useT()
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? t('Klik untuk men-non-aktifkan') : t('Klik untuk mengaktifkan')}
      style={{
        width: 110,
        height: 28,
        padding: 0,
        background: active ? 'rgba(67,217,162,0.15)' : 'var(--bg3)',
        color: active ? '#43d9a2' : 'var(--text2)',
        border: `1px solid ${active ? 'rgba(67,217,162,0.5)' : 'var(--border)'}`,
        borderRadius: 6,
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 4,
          background: active ? '#43d9a2' : 'var(--text2)',
          flexShrink: 0,
          boxShadow: active ? '0 0 6px rgba(67,217,162,0.7)' : 'none',
          transition: 'background 0.15s',
        }}
      />
      {active ? 'Active' : t('Non Active')}
    </button>
  )
}
