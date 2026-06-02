'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { uploadFile, uploadFileWithProgress, captureVideoFrame } from '@/lib/storage'
import type { BsiPortfolio } from '@/lib/website-types'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { PrimaryActionButton } from '@/components/website/PageActions'
import { FormField, inputStyle } from '@/components/website/FormField'
import { ListEmpty, ListError, ModalShell } from '@/components/website/SimpleList'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import { VideoPosterPicker } from '@/components/website/VideoPosterPicker'
import { FileUploader } from '@/components/website/FileUploader'
import { Section } from '@/components/website/Section'

const CATEGORIES: BsiPortfolio['category'][] = ['video', 'photo', 'design', 'intl']
const CATEGORY_LABELS: Record<BsiPortfolio['category'], string> = {
  video: 'Video',
  photo: 'Photo',
  design: 'Design',
  intl: 'International',
}

/** Resolve the effective category list for a row. Legacy rows that
 *  haven't been migrated to the multi-category column will have
 *  `categories` null/empty — fall back to [category] so they still
 *  appear under their original filter. */
function resolveCategories(item: Pick<BsiPortfolio, 'category' | 'categories'>): BsiPortfolio['category'][] {
  if (item.categories && item.categories.length > 0) return item.categories
  return [item.category]
}

type FormState = Omit<BsiPortfolio, 'id' | 'created_at'>

const EMPTY_FORM: FormState = {
  title: '',
  category: 'video',
  categories: ['video'],
  tag: '',
  media_url: '',
  media_type: 'image',
  thumbnail_url: null,
  aspect_ratio: '16:9',
  is_published: true,
  sort_order: 0,
}

/** Fixed preview-box height. Keeps the modal a stable size regardless of
 *  whether the user picks 16:9, 9:16, 1:1, etc — the actual media sits
 *  inside via object-fit:contain. */
const PREVIEW_BOX_HEIGHT = 320

const ASPECT_PRESETS: { ratio: string; value: number }[] = [
  { ratio: '16:9', value: 16 / 9 },
  { ratio: '9:16', value: 9 / 16 },
  { ratio: '1:1', value: 1 },
  { ratio: '4:5', value: 4 / 5 },
  { ratio: '3:4', value: 3 / 4 },
]

/** Convert a ratio string like "16:9" into a numeric width/height ratio. */
function aspectRatioValue(ratio: string): number {
  const [w, h] = ratio.split(':').map(Number)
  if (!w || !h) return 1
  return w / h
}

/** Snap the natural width/height to the closest preset string (e.g. "16:9"). */
function snapAspectRatio(width: number, height: number): string {
  if (!width || !height) return '16:9'
  const value = width / height
  let bestRatio = ASPECT_PRESETS[0].ratio
  let bestDiff = Infinity
  for (const p of ASPECT_PRESETS) {
    const diff = Math.abs(p.value - value)
    if (diff < bestDiff) {
      bestDiff = diff
      bestRatio = p.ratio
    }
  }
  return bestRatio
}

const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v|ogv|m3u8)(\?|#|$)/i

function detectMediaTypeFromUrl(url: string): 'image' | 'video' {
  return VIDEO_EXT_RE.test(url) ? 'video' : 'image'
}

async function probeImageUrl(url: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
    img.onerror = () => reject(new Error('image-probe'))
    img.src = url
  })
}

async function probeVideoUrl(url: string): Promise<{ width: number; height: number }> {
  return await new Promise((resolve, reject) => {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.preload = 'metadata'
    video.onloadedmetadata = () => resolve({ width: video.videoWidth, height: video.videoHeight })
    video.onerror = () => reject(new Error('video-probe'))
  })
}

/**
 * Pull an external image (e.g. an Instagram/TikTok OpenGraph image) through
 * our image-proxy and store it in the Supabase bucket. Returns a stable
 * public URL on `**.supabase.co` so `next/image` will render it on the
 * public site without needing an allowlist entry per CDN.
 */
async function mirrorOgImageToStorage(ogImageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/image-proxy?url=${encodeURIComponent(ogImageUrl)}`)
    if (!res.ok) return null
    const blob = await res.blob()
    const mime = blob.type || 'image/jpeg'
    const ext = mime.split('/')[1]?.split('+')[0] || 'jpg'
    const file = new File([blob], `og-cover-${Date.now()}.${ext}`, { type: mime })
    const result = await uploadFile(file, 'portfolio')
    return result.url
  } catch {
    return null
  }
}

const VIDEO_UPLOAD_MIMES = ['video/mp4', 'video/webm', 'video/quicktime']

/**
 * Pull a video URL through our media-proxy and store it in Supabase so the
 * public site can render it via `<video src>`. Returns the Supabase public
 * URL on success, or `null` if the file is too large, an unsupported MIME,
 * or the proxy rejects it (private posts, gated CDN, etc).
 */
async function mirrorVideoToStorage(videoUrl: string): Promise<string | null> {
  try {
    const res = await fetch(
      `/api/media-proxy?url=${encodeURIComponent(videoUrl)}`,
    )
    if (!res.ok) return null
    const blob = await res.blob()
    if (blob.size === 0 || blob.size > 200 * 1024 * 1024) return null
    const declared = (blob.type || 'video/mp4').split(';')[0]
    const safeMime = VIDEO_UPLOAD_MIMES.includes(declared)
      ? declared
      : 'video/mp4'
    const ext = safeMime === 'video/quicktime' ? 'mov' : safeMime.split('/')[1]
    const file = new File([blob], `og-video-${Date.now()}.${ext}`, {
      type: safeMime,
    })
    const result = await uploadFile(file, 'portfolio')
    return result.url
  } catch {
    return null
  }
}

interface VideoFrameCapture {
  thumbnailUrl: string
  width: number
  height: number
}

/**
 * Load a video URL through our media-proxy (so the browser treats it as
 * same-origin and the canvas isn't tainted by CORS), seek to ~1s, capture
 * a frame, and upload it to Supabase as a cover. Returns the thumbnail URL
 * and the video's native dimensions so we can also snap the aspect ratio.
 */
async function captureCoverFromVideoUrl(
  videoUrl: string,
): Promise<VideoFrameCapture | null> {
  const proxyUrl = `/api/media-proxy?url=${encodeURIComponent(videoUrl)}`
  const video = document.createElement('video')
  video.src = proxyUrl
  video.muted = true
  video.crossOrigin = 'anonymous'
  video.playsInline = true
  video.preload = 'auto'

  try {
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('loadedmetadata', onMeta)
        video.removeEventListener('error', onErr)
      }
      const onMeta = () => {
        cleanup()
        resolve()
      }
      const onErr = () => {
        cleanup()
        reject(new Error('video-load'))
      }
      video.addEventListener('loadedmetadata', onMeta)
      video.addEventListener('error', onErr)
    })

    const target = Math.min(1, Math.max(0, video.duration / 4))
    await new Promise<void>((resolve, reject) => {
      const cleanup = () => {
        video.removeEventListener('seeked', onSeeked)
        video.removeEventListener('error', onErr)
      }
      const onSeeked = () => {
        cleanup()
        resolve()
      }
      const onErr = () => {
        cleanup()
        reject(new Error('video-seek'))
      }
      video.addEventListener('seeked', onSeeked)
      video.addEventListener('error', onErr)
      video.currentTime = target
    })

    const width = video.videoWidth
    const height = video.videoHeight
    if (!width || !height) return null

    const result = await captureVideoFrame(video, 'portfolio', 0.85)
    return { thumbnailUrl: result.url, width, height }
  } catch {
    return null
  } finally {
    video.removeAttribute('src')
    video.load()
  }
}

/** Read an image file's natural dimensions in the browser. */
async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file)
  try {
    return await new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => reject(new Error('Gagal membaca dimensi gambar'))
      img.src = url
    })
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Load the video file in a hidden <video> element, seek to ~1s, and grab
 * both the video dimensions and a single rendered frame so we can capture
 * a poster (thumbnail) without leaving the browser.
 */
async function probeVideoElement(file: File): Promise<{ video: HTMLVideoElement; cleanup: () => void }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.src = url
  video.muted = true
  video.crossOrigin = 'anonymous'
  video.playsInline = true

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve()
    video.onerror = () => reject(new Error('Gagal memuat video'))
  })

  // Seek to a frame that's likely to have content (1s in, or first frame for short clips).
  const target = Math.min(1, Math.max(0, video.duration / 4))
  await new Promise<void>((resolve) => {
    video.onseeked = () => resolve()
    video.currentTime = target
  })

  return {
    video,
    cleanup: () => {
      URL.revokeObjectURL(url)
      video.remove()
    },
  }
}

type CategoryFilter = 'all' | BsiPortfolio['category']

export default function PortfolioAdminPage() {
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiPortfolio[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BsiPortfolio | null>(null)
  const [creating, setCreating] = useState(false)
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  // Multi-select state — opt-in via the "Pilih" toggle. When
  // selectMode is false, cards render without checkboxes and the
  // selection bar is hidden; the page reads as a normal grid.
  // Toggling OFF clears any selection so stale IDs never linger.
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState<ConfirmRequest | null>(null)

  function exitSelectMode() {
    setSelectMode(false)
    setSelectedIds(new Set())
  }

  async function load() {
    const { data, error } = await supabase
      .from('bsi_portfolio')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) setError(error.message)
    else setItems(data ?? [])
    setSelectedIds(new Set())
    setLoading(false)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBulkDelete(ids: string[]) {
    setBulkDeleting(true)
    const { error } = await supabase
      .from('bsi_portfolio')
      .delete()
      .in('id', ids)
    setBulkDeleting(false)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) => xs.filter((x) => !ids.includes(x.id)))
    setSelectedIds(new Set())
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('Hapus item ini?')) return
    const { error } = await supabase.from('bsi_portfolio').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) => xs.filter((x) => x.id !== id))
  }

  async function togglePublish(item: BsiPortfolio) {
    const { error } = await supabase
      .from('bsi_portfolio')
      .update({ is_published: !item.is_published })
      .eq('id', item.id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, is_published: !x.is_published } : x)))
  }

  useRegisterPageAction(
    <PrimaryActionButton onClick={() => setCreating(true)}>+ Tambah Karya</PrimaryActionButton>,
  )

  // Per-category counts. 'all' is the total length so the "Semua" pill
  // always reflects the unfiltered set even when a filter is active.
  // An item may belong to multiple categories — increment every bucket
  // it lands in (sum across all category counts can exceed total).
  const counts: Record<CategoryFilter, number> = {
    all: items.length,
    video: 0,
    photo: 0,
    design: 0,
    intl: 0,
  }
  for (const item of items) {
    for (const cat of resolveCategories(item)) counts[cat]++
  }

  const filteredItems =
    categoryFilter === 'all'
      ? items
      : items.filter((x) => resolveCategories(x).includes(categoryFilter))

  // "Select all" applies to the CURRENT filtered view — selecting
  // while filtering by Video should only pick video items. Items
  // already selected from other filters stay selected.
  const filteredIds = filteredItems.map((x) => x.id)
  const selectedInFiltered = filteredIds.filter((id) => selectedIds.has(id))
  const allFilteredSelected =
    filteredIds.length > 0 && selectedInFiltered.length === filteredIds.length

  function toggleSelectAllFiltered() {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (allFilteredSelected) {
        // Currently all-selected → deselect just the filtered set,
        // preserving any selections from other filters.
        filteredIds.forEach((id) => next.delete(id))
      } else {
        filteredIds.forEach((id) => next.add(id))
      }
      return next
    })
  }

  function requestBulkDelete() {
    const ids = Array.from(selectedIds)
    if (ids.length === 0) return
    setBulkConfirm({
      title: `Hapus ${ids.length} karya?`,
      message:
        'Karya yang terpilih akan dihapus dari database. File media di storage tetap tersimpan dan harus dihapus manual jika tidak terpakai.',
      confirmLabel: `Hapus ${ids.length} karya`,
      tone: 'danger',
      onConfirm: async () => {
        setBulkConfirm(null)
        await handleBulkDelete(ids)
      },
    })
  }

  return (
    <>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {/* Combined sticky slab — Banner card + Karya filter pills
            both pinned at top:0 as ONE element, so neither moves
            even slightly. Only the grid card below this slab scrolls. */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 10,
            background: 'var(--bg2)',
            // Negative margins cancel the page wrapper's 24px padding
            // so the slab anchors flush with the scroll container's
            // top + horizontal edges; positive paddings restore the
            // inner spacing.
            marginTop: -24,
            marginLeft: -24,
            marginRight: -24,
            paddingTop: 24,
            paddingLeft: 24,
            paddingRight: 24,
            paddingBottom: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          <Section title="Banner Portofolio">
            <BannerUploader />
          </Section>

          {/* Standalone Karya title-row + filter (Section's header
              shape, but rendered manually here so the filter pins
              together with Banner inside the same slab). */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
            }}
          >
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: '0.12em',
                color: 'var(--text2)',
                textTransform: 'uppercase',
              }}
            >
              Karya Portofolio
            </div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {!loading && items.length > 0 && (
                <>
                  <CategoryFilterBar
                    value={categoryFilter}
                    onChange={setCategoryFilter}
                    counts={counts}
                  />
                  <button
                    type="button"
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    title={selectMode ? 'Keluar mode pilih' : 'Pilih beberapa karya untuk hapus massal'}
                    style={{
                      height: 32,
                      padding: '0 12px',
                      background: selectMode ? 'var(--accent)' : 'var(--bg3)',
                      color: selectMode ? '#fff' : 'var(--text)',
                      border: `1px solid ${selectMode ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 8,
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                    }}
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      {selectMode ? (
                        <>
                          <line x1="18" y1="6" x2="6" y2="18" />
                          <line x1="6" y1="6" x2="18" y2="18" />
                        </>
                      ) : (
                        <>
                          <polyline points="9 11 12 14 22 4" />
                          <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </>
                      )}
                    </svg>
                    {selectMode ? 'Selesai' : 'Pilih'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Grid card — the only thing that scrolls. Same visual
            treatment as Section's card (bg-bg2 border radius padding)
            but rendered standalone since the title-row already lives
            in the sticky slab above. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            padding: 20,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 12,
          }}
        >
          {error && <ListError message={error} />}

          {selectMode && !loading && filteredItems.length > 0 && (
            <SelectionBar
              totalFiltered={filteredItems.length}
              selectedCount={selectedIds.size}
              selectedInFilteredCount={selectedInFiltered.length}
              allFilteredSelected={allFilteredSelected}
              onToggleAll={toggleSelectAllFiltered}
              onClear={() => setSelectedIds(new Set())}
              onBulkDelete={requestBulkDelete}
              bulkDeleting={bulkDeleting}
            />
          )}

          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>Memuat…</div>
          ) : items.length === 0 ? (
            <ListEmpty message="Belum ada karya. Klik Tambah Karya untuk mulai." />
          ) : filteredItems.length === 0 ? (
            <ListEmpty
              message={`Belum ada karya di kategori ${CATEGORY_LABELS[categoryFilter as BsiPortfolio['category']]}.`}
            />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
                gap: 16,
              }}
            >
              {filteredItems.map((item) => (
                <PortfolioCard
                  key={item.id}
                  item={item}
                  selectMode={selectMode}
                  selected={selectedIds.has(item.id)}
                  onToggleSelect={() => toggleSelect(item.id)}
                  onEdit={() => setEditing(item)}
                  onDelete={() => handleDelete(item.id)}
                  onTogglePublish={() => togglePublish(item)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {bulkConfirm && (
        <ConfirmDialog request={bulkConfirm} onCancel={() => setBulkConfirm(null)} />
      )}

      {(editing || creating) && (
        <PortfolioModal
          initial={editing ?? null}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={() => {
            setEditing(null)
            setCreating(false)
            load()
          }}
        />
      )}
    </>
  )
}

function CategoryFilterBar({
  value,
  onChange,
  counts,
}: {
  value: CategoryFilter
  onChange: (v: CategoryFilter) => void
  counts: Record<CategoryFilter, number>
}) {
  const options: { key: CategoryFilter; label: string }[] = [
    { key: 'all', label: 'Semua' },
    ...CATEGORIES.map((c) => ({ key: c, label: CATEGORY_LABELS[c] })),
  ]

  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        flexWrap: 'wrap',
        padding: 6,
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 10,
      }}
    >
      {options.map((opt) => {
        const active = opt.key === value
        const count = counts[opt.key]
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '6px 12px',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? '#fff' : 'var(--text2)',
              border: 'none',
              borderRadius: 6,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={(e) => {
              if (active) return
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
            }}
            onMouseLeave={(e) => {
              if (active) return
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text2)'
            }}
          >
            {opt.label}
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 18,
                padding: '0 6px',
                borderRadius: 9,
                fontSize: 10,
                fontWeight: 600,
                background: active ? 'rgba(255,255,255,0.22)' : 'var(--bg3)',
                color: active ? '#fff' : 'var(--text2)',
              }}
            >
              {count}
            </span>
          </button>
        )
      })}
    </div>
  )
}

function SelectionBar({
  totalFiltered,
  selectedCount,
  selectedInFilteredCount,
  allFilteredSelected,
  onToggleAll,
  onClear,
  onBulkDelete,
  bulkDeleting,
}: {
  totalFiltered: number
  selectedCount: number
  selectedInFilteredCount: number
  allFilteredSelected: boolean
  onToggleAll: () => void
  onClear: () => void
  onBulkDelete: () => void
  bulkDeleting: boolean
}) {
  const hasSelection = selectedCount > 0
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        padding: '10px 14px',
        background: hasSelection ? 'rgba(11,61,231,0.10)' : 'var(--bg3)',
        border: `1px solid ${hasSelection ? 'rgba(11,61,231,0.35)' : 'var(--border)'}`,
        borderRadius: 10,
        flexWrap: 'wrap',
        transition: 'background 0.15s, border-color 0.15s',
      }}
    >
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 10,
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: 12,
          color: 'var(--text)',
          fontWeight: 500,
        }}
      >
        <button
          type="button"
          onClick={onToggleAll}
          aria-label={allFilteredSelected ? 'Unselect semua' : 'Select semua'}
          style={{
            width: 22,
            height: 22,
            padding: 0,
            background: allFilteredSelected ? 'var(--accent)' : 'transparent',
            border: `1.5px solid ${allFilteredSelected ? 'var(--accent)' : 'var(--text2)'}`,
            borderRadius: 5,
            color: '#fff',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s, border-color 0.15s',
            flexShrink: 0,
          }}
        >
          {allFilteredSelected && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
          {!allFilteredSelected && selectedInFilteredCount > 0 && (
            <span
              style={{
                width: 10,
                height: 2,
                background: 'var(--text2)',
                borderRadius: 1,
              }}
            />
          )}
        </button>
        <span onClick={onToggleAll}>
          {hasSelection
            ? `${selectedCount} terpilih`
            : `Pilih semua (${totalFiltered})`}
        </span>
      </label>

      <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
        {hasSelection && (
          <>
            <button
              type="button"
              onClick={onClear}
              style={{
                height: 32,
                padding: '0 12px',
                background: 'transparent',
                color: 'var(--text2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={bulkDeleting}
              style={{
                height: 32,
                padding: '0 14px',
                background: 'rgba(255,107,107,0.15)',
                color: '#ff6b6b',
                border: '1px solid rgba(255,107,107,0.4)',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: bulkDeleting ? 'wait' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                opacity: bulkDeleting ? 0.6 : 1,
              }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
              {bulkDeleting ? 'Menghapus…' : `Hapus ${selectedCount}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}

function PortfolioCard({
  item,
  selectMode,
  selected,
  onToggleSelect,
  onEdit,
  onDelete,
  onTogglePublish,
}: {
  item: BsiPortfolio
  selectMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onEdit: () => void
  onDelete: () => void
  onTogglePublish: () => void
}) {
  const thumb = item.thumbnail_url || (item.media_type === 'image' ? item.media_url : null)
  // Highlight only meaningful while in select mode — otherwise the
  // card reads as a regular grid tile with no selection chrome.
  const showSelectedChrome = selectMode && selected
  return (
    <div
      onClick={selectMode ? onToggleSelect : undefined}
      style={{
        background: 'var(--bg2)',
        border: `1px solid ${showSelectedChrome ? 'var(--accent)' : 'var(--border)'}`,
        borderRadius: 12,
        overflow: 'hidden',
        opacity: item.is_published ? 1 : 0.55,
        boxShadow: showSelectedChrome ? '0 0 0 1px var(--accent)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: selectMode ? 'pointer' : 'default',
      }}
    >
      <div
        style={{
          aspectRatio: '16 / 10',
          background: 'var(--bg3)',
          backgroundImage: thumb ? `url(${thumb})` : 'none',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
        }}
      >
        {!thumb && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text2)',
              fontSize: 11,
            }}
          >
            (no preview)
          </div>
        )}
        {selectMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onToggleSelect()
            }}
            aria-label={selected ? 'Unselect karya' : 'Select karya'}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 28,
              height: 28,
              padding: 0,
              background: selected ? 'var(--accent)' : 'rgba(0,0,0,0.55)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${selected ? 'var(--accent)' : 'rgba(255,255,255,0.25)'}`,
              borderRadius: 6,
              color: '#fff',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
              zIndex: 2,
            }}
          >
            {selected && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </button>
        )}
        <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 4, flexWrap: 'wrap', maxWidth: selectMode ? 'calc(100% - 56px)' : 'calc(100% - 16px)' }}>
          {resolveCategories(item).map((cat) => (
            <span
              key={cat}
              style={{
                padding: '3px 8px',
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                borderRadius: 4,
              }}
            >
              {CATEGORY_LABELS[cat]}
            </span>
          ))}
        </div>
      </div>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.3 }}>{item.title}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{item.tag}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onEdit()
            }}
            disabled={selectMode}
            style={{
              flex: 1,
              height: 28,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 11,
              cursor: selectMode ? 'not-allowed' : 'pointer',
              opacity: selectMode ? 0.4 : 1,
            }}
          >
            Edit
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onTogglePublish()
            }}
            disabled={selectMode}
            title={item.is_published ? 'Sembunyikan' : 'Publikasikan'}
            style={{
              width: 28,
              height: 28,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: item.is_published ? 'var(--accent3)' : 'var(--text2)',
              fontSize: 12,
              cursor: selectMode ? 'not-allowed' : 'pointer',
              opacity: selectMode ? 0.4 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.is_published ? '●' : '○'}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            disabled={selectMode}
            title="Hapus"
            style={{
              width: 28,
              height: 28,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: '#ff6b6b',
              fontSize: 14,
              cursor: selectMode ? 'not-allowed' : 'pointer',
              opacity: selectMode ? 0.4 : 1,
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

function PortfolioModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: BsiPortfolio | null
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = getSupabase()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const thumbnailInputRef = useRef<HTMLInputElement>(null)
  const [posterPickerOpen, setPosterPickerOpen] = useState(false)
  const [thumbnailUploading, setThumbnailUploading] = useState(false)
  const [thumbnailProgress, setThumbnailProgress] = useState(0)
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          title: initial.title,
          category: initial.category,
          // Legacy rows have `categories` null until the migration
          // runs; resolve through resolveCategories so the form
          // opens with the correct multi-select state regardless.
          categories: resolveCategories(initial),
          tag: initial.tag,
          media_url: initial.media_url,
          media_type: initial.media_type,
          thumbnail_url: initial.thumbnail_url,
          aspect_ratio: initial.aspect_ratio,
          is_published: initial.is_published,
          sort_order: initial.sort_order,
        }
      : EMPTY_FORM,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStage, setUploadStage] = useState<'media' | 'thumbnail' | null>(null)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const [mediaSource, setMediaSource] = useState<'file' | 'link'>(
    initial && initial.media_url && !initial.media_url.includes('/storage/v1/')
      ? 'link'
      : 'file',
  )
  const [linkInput, setLinkInput] = useState('')
  const [linkApplying, setLinkApplying] = useState(false)
  const [linkStatus, setLinkStatus] = useState<string | null>(null)
  const [mediaPreviewError, setMediaPreviewError] = useState(false)

  useEffect(() => {
    setMediaPreviewError(false)
  }, [form.media_url])

  const hasMedia = !!form.media_url

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleFileSelected(file: File) {
    setError(null)
    const isImage = file.type.startsWith('image/')
    const isVideo = file.type.startsWith('video/')

    if (!isImage && !isVideo) {
      setError('Format file tidak didukung. Gunakan gambar atau video.')
      return
    }

    setUploading(true)
    setUploadStage('media')
    setUploadProgress(0)

    try {
      // Upload the media file first so we have a public URL to work with.
      const { promise } = uploadFileWithProgress(file, 'portfolio', (p) => {
        setUploadProgress(p.percent)
      })
      const result = await promise

      // Probe the file in-browser for its native size, then snap to a preset.
      let aspect = form.aspect_ratio
      let thumbUrl: string | null = form.thumbnail_url
      let mediaType: 'image' | 'video' = isImage ? 'image' : 'video'

      if (isImage) {
        const { width, height } = await readImageDimensions(file)
        aspect = snapAspectRatio(width, height)
        // Image media is its own cover on the public site (the masonry
        // falls back to media_url when thumbnail_url is null), so we
        // null out any stale thumbnail left over from a previous video
        // upload — guarantees the freshly-uploaded image actually wins.
        thumbUrl = null
      } else {
        // Video: load metadata to read dimensions, capture a poster frame.
        const probe = await probeVideoElement(file)
        try {
          aspect = snapAspectRatio(probe.video.videoWidth, probe.video.videoHeight)
          setUploadStage('thumbnail')
          setUploadProgress(0)
          const poster = await captureVideoFrame(probe.video, 'portfolio', 0.85)
          thumbUrl = poster.url
        } finally {
          probe.cleanup()
        }
      }

      setForm((f) => ({
        ...f,
        media_url: result.url,
        media_type: mediaType,
        aspect_ratio: aspect,
        thumbnail_url: thumbUrl,
      }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setUploading(false)
      setUploadStage(null)
      setUploadProgress(0)
    }
  }

  async function handleLinkApply() {
    const url = linkInput.trim()
    if (!url) {
      setError('Paste a media URL first.')
      return
    }
    if (!/^https?:\/\//i.test(url)) {
      setError('URL must start with http:// or https://.')
      return
    }
    setError(null)
    setLinkApplying(true)
    setLinkStatus('Detecting media…')
    let mediaType: 'image' | 'video' = detectMediaTypeFromUrl(url)
    let aspect = form.aspect_ratio
    let thumbnail: string | null = null
    let directMediaLoaded = false
    let coverFetchInfo: string | null = null
    let finalMediaUrl: string = url

    try {
      const dims =
        mediaType === 'image' ? await probeImageUrl(url) : await probeVideoUrl(url)
      aspect = snapAspectRatio(dims.width, dims.height)
      directMediaLoaded = true
    } catch {
      // Direct probe failed — fall through to OG fetch.
    }

    let ogVideoUrl: string | null = null

    if (!directMediaLoaded) {
      setLinkStatus('Fetching cover from post…')
      try {
        const res = await fetch(
          `/api/og-preview?url=${encodeURIComponent(url)}`,
        )
        const og = (await res.json()) as {
          thumbnail_url?: string | null
          video_url?: string | null
          og_type?: string | null
          error?: string
        }
        if (og.thumbnail_url) {
          setLinkStatus('Saving cover…')
          const mirrored = await mirrorOgImageToStorage(og.thumbnail_url)
          if (!mirrored) {
            coverFetchInfo =
              'Cover found, but could not be saved to storage. Upload a cover manually below.'
          }
          const finalCover = mirrored ?? og.thumbnail_url
          thumbnail = finalCover
          try {
            const dims = await probeImageUrl(finalCover)
            aspect = snapAspectRatio(dims.width, dims.height)
          } catch {
            // ignore — cover still loaded into the form
          }
        }
        if (og.video_url) {
          mediaType = 'video'
          ogVideoUrl = og.video_url
        } else if (og.og_type && /video/i.test(og.og_type)) {
          mediaType = 'video'
        }
      } catch {
        // OG fetch failed entirely — fall through to video-frame capture.
      }
    }

    // Last-ditch effort: treat the URL (or the og:video the post advertised)
    // as a raw video. The media-proxy lets us load cross-origin videos
    // without canvas taint, so this catches direct .mp4 CDN links and any
    // post whose og:video is a playable file.
    if (!thumbnail) {
      const videoCandidate = ogVideoUrl || url
      setLinkStatus('Generating cover from video frame…')
      const frame = await captureCoverFromVideoUrl(videoCandidate)
      if (frame) {
        thumbnail = frame.thumbnailUrl
        aspect = snapAspectRatio(frame.width, frame.height)
        mediaType = 'video'
        coverFetchInfo = null
      } else if (!coverFetchInfo) {
        coverFetchInfo =
          'No cover image found on this URL and the video frame could not be captured. Upload a cover manually below.'
      }
    }

    // The public site's lightbox plays media_url directly via <video src>.
    // Social-post URLs aren't playable that way, so download the actual
    // video bytes (og:video or the URL itself) to Supabase and swap
    // media_url to the stored copy. The captured frame stays as cover.
    if (mediaType === 'video' && !directMediaLoaded) {
      const videoCandidate = ogVideoUrl || url
      setLinkStatus('Saving video to storage…')
      const mirroredVideo = await mirrorVideoToStorage(videoCandidate)
      if (mirroredVideo) {
        finalMediaUrl = mirroredVideo
      } else {
        coverFetchInfo =
          'Cover saved, but the video file itself could not be downloaded (it may be too large or gated by the platform). The public site may not be able to play this URL — consider downloading and uploading the video manually.'
      }
    }

    setForm((f) => ({
      ...f,
      media_url: finalMediaUrl,
      media_type: mediaType,
      aspect_ratio: aspect,
      thumbnail_url:
        thumbnail ?? (mediaType === 'image' && directMediaLoaded ? null : f.thumbnail_url),
    }))
    if (coverFetchInfo) setError(coverFetchInfo)
    setLinkInput('')
    setLinkApplying(false)
    setLinkStatus(null)
  }

  async function handleThumbnailUpload(file: File) {
    setError(null)
    if (!file.type.startsWith('image/')) {
      setError('Cover harus berupa gambar (JPG / PNG / WebP).')
      return
    }
    setThumbnailUploading(true)
    setThumbnailProgress(0)
    try {
      const { promise } = uploadFileWithProgress(file, 'portfolio', (p) => {
        setThumbnailProgress(p.percent)
      })
      const result = await promise
      update('thumbnail_url', result.url)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setThumbnailUploading(false)
      setThumbnailProgress(0)
    }
  }

  function requestReplace() {
    setConfirm({
      title: 'Replace media?',
      message: 'The current media will be replaced. The previous file stays in storage.',
      confirmLabel: 'Replace',
      tone: 'warning',
      onConfirm: () => {
        setConfirm(null)
        if (mediaSource === 'link') {
          setForm((f) => ({ ...f, media_url: '' }))
        } else {
          fileInputRef.current?.click()
        }
      },
    })
  }

  function requestRemove() {
    setConfirm({
      title: 'Hapus media?',
      message: 'Media akan dilepas dari karya ini. File asli tetap aman di storage.',
      confirmLabel: 'Hapus',
      tone: 'danger',
      onConfirm: () => {
        setConfirm(null)
        setForm((f) => ({ ...f, media_url: '', thumbnail_url: null }))
      },
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const op = initial
      ? supabase.from('bsi_portfolio').update(form).eq('id', initial.id)
      : supabase.from('bsi_portfolio').insert(form)
    const { error } = await op
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    onSaved()
  }

  const headerStatus = (
    <ActiveToggleButton
      active={form.is_published}
      onClick={() => update('is_published', !form.is_published)}
    />
  )

  const uploadingLabel = uploadStage === 'thumbnail'
    ? 'Mengambil thumbnail…'
    : `Mengupload ${uploadProgress.toFixed(0)}%`

  const needsCoverPanel =
    !!form.media_url &&
    (form.media_type === 'video' || mediaSource === 'link' || mediaPreviewError)

  const coverPanel = needsCoverPanel ? (
    <FormField label="Cover">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: 120,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            backgroundImage: form.thumbnail_url ? `url(${form.thumbnail_url})` : undefined,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        >
          {!form.thumbnail_url && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--text2)',
                fontSize: 11,
              }}
            >
              Belum ada cover
            </div>
          )}
          {thumbnailUploading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.6)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: '#fff',
                fontSize: 11,
              }}
            >
              <div
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: 9,
                  border: '2px solid rgba(255,255,255,0.25)',
                  borderTopColor: '#fff',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              Mengupload {thumbnailProgress.toFixed(0)}%
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button
            type="button"
            onClick={() => thumbnailInputRef.current?.click()}
            disabled={thumbnailUploading}
            style={coverActionBtn(false)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            Upload Gambar
          </button>
          <button
            type="button"
            onClick={() => setPosterPickerOpen(true)}
            disabled={thumbnailUploading}
            style={coverActionBtn(true)}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Dari Video
          </button>
          {form.thumbnail_url && (
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: 'Hapus cover?',
                  message: 'Cover akan dilepas. File asli tetap aman di storage.',
                  confirmLabel: 'Hapus',
                  tone: 'danger',
                  onConfirm: () => {
                    setConfirm(null)
                    update('thumbnail_url', null)
                  },
                })
              }
              disabled={thumbnailUploading}
              style={coverActionBtn(false, true)}
            >
              Hapus
            </button>
          )}
        </div>
        <input
          ref={thumbnailInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void handleThumbnailUpload(f)
            e.target.value = ''
          }}
        />
      </div>
    </FormField>
  ) : null

  const mediaPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
    <FormField label="Media" required>
      {!hasMedia && (
        <div
          role="tablist"
          aria-label="Media source"
          style={{
            display: 'inline-flex',
            padding: 3,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            marginBottom: 10,
            alignSelf: 'flex-start',
          }}
        >
          <button
            type="button"
            role="tab"
            aria-selected={mediaSource === 'file'}
            onClick={() => setMediaSource('file')}
            style={mediaTabStyle(mediaSource === 'file')}
          >
            Upload File
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mediaSource === 'link'}
            onClick={() => setMediaSource('link')}
            style={mediaTabStyle(mediaSource === 'link')}
          >
            Paste URL
          </button>
        </div>
      )}
      {hasMedia ? (
        <div
          style={{
            // Outer wrapper has a fixed height so the modal does NOT resize
            // when the aspect ratio changes. The inner child takes the
            // chosen aspect ratio and sits letterboxed inside.
            position: 'relative',
            width: '100%',
            height: PREVIEW_BOX_HEIGHT,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              position: 'relative',
              // width = min(column width, height × ratio) so wide ratios
              // hit the column edge first and tall ratios hit the height
              // ceiling first — the inner box stays inside the 320px outer.
              width: `min(100%, ${PREVIEW_BOX_HEIGHT * aspectRatioValue(form.aspect_ratio)}px)`,
              aspectRatio: form.aspect_ratio.replace(':', ' / '),
              maxHeight: '100%',
              overflow: 'hidden',
              borderRadius: 4,
            }}
          >
            {form.media_type === 'image' ? (
              mediaPreviewError && form.thumbnail_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.thumbnail_url}
                  alt={form.title || 'Preview media'}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                  }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.media_url}
                  alt={form.title || 'Preview media'}
                  onError={() => setMediaPreviewError(true)}
                  onLoad={() => setMediaPreviewError(false)}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    display: mediaPreviewError ? 'none' : 'block',
                  }}
                />
              )
            ) : (
              <video
                src={form.media_url}
                poster={form.thumbnail_url ?? undefined}
                controls
                muted
                playsInline
                onError={() => setMediaPreviewError(true)}
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
            {mediaPreviewError && !form.thumbnail_url && (
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 10,
                  padding: 24,
                  background: 'var(--bg3)',
                  color: 'var(--text2)',
                  textAlign: 'center',
                }}
              >
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                  Preview not available
                </div>
                <div style={{ fontSize: 11, lineHeight: 1.5, maxWidth: 280 }}>
                  This URL can&apos;t be embedded directly (common for Instagram /
                  TikTok / Twitter posts). Upload a Cover image below so the
                  portfolio card has something to show.
                </div>
                <a
                  href={form.media_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    fontSize: 11,
                    color: 'var(--accent)',
                    textDecoration: 'underline',
                    wordBreak: 'break-all',
                    maxWidth: '90%',
                  }}
                >
                  Open URL ↗
                </a>
              </div>
            )}
          </div>
          <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', gap: 6 }}>
            <span
              style={{
                padding: '3px 8px',
                background: 'rgba(0,0,0,0.7)',
                backdropFilter: 'blur(8px)',
                color: '#fff',
                fontSize: 10,
                fontWeight: 600,
                textTransform: 'uppercase',
                borderRadius: 4,
              }}
            >
              {form.media_type} · {form.aspect_ratio}
            </span>
          </div>
          <div
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              display: 'flex',
              gap: 6,
              zIndex: 2,
            }}
          >
            <OverlayIconButton
              onClick={requestReplace}
              disabled={uploading}
              title={uploading ? uploadingLabel : 'Ganti file'}
              ariaLabel="Ganti file"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </OverlayIconButton>
            <OverlayIconButton
              onClick={requestRemove}
              disabled={uploading}
              tone="danger"
              title="Hapus file"
              ariaLabel="Hapus file"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                <path d="M10 11v6" />
                <path d="M14 11v6" />
              </svg>
            </OverlayIconButton>
          </div>
          {uploading && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.55)',
                backdropFilter: 'blur(2px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                color: '#fff',
                fontSize: 12,
                zIndex: 1,
              }}
            >
              <div
                style={{
                  width: 26,
                  height: 26,
                  borderRadius: 13,
                  border: '2px solid rgba(255,255,255,0.25)',
                  borderTopColor: '#fff',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span>{uploadingLabel}</span>
            </div>
          )}
        </div>
      ) : mediaSource === 'file' ? (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          style={{
            // Match the filled-state preview box so toggling between empty
            // and filled doesn't reflow the modal.
            height: PREVIEW_BOX_HEIGHT,
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
            gap: 10,
            padding: 16,
          }}
        >
          {uploading ? (
            <>
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 15,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <span>{uploadingLabel}</span>
            </>
          ) : (
            <>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span style={{ color: 'var(--text)', fontWeight: 500, fontSize: 13 }}>
                Click to upload
              </span>
              <span style={{ fontSize: 11, textAlign: 'center' }}>
                Image or video — max 200 MB
              </span>
            </>
          )}
        </button>
      ) : (
        <div
          style={{
            height: PREVIEW_BOX_HEIGHT,
            border: '1px solid var(--border)',
            borderRadius: 8,
            background: 'var(--bg3)',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
            justifyContent: 'center',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
              Media URL
            </label>
            <input
              type="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void handleLinkApply()
                }
              }}
              placeholder="https://example.com/photo.jpg"
              style={{ ...inputStyle, width: '100%' }}
              disabled={linkApplying}
            />
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>
              Paste a direct image/video URL or a public media link (Instagram,
              TikTok, YouTube, etc). The cover image is fetched automatically
              from the post when possible.
            </span>
            {linkStatus && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  fontSize: 11,
                  color: 'var(--accent)',
                }}
              >
                <div
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 6,
                    border: '2px solid var(--border)',
                    borderTopColor: 'var(--accent)',
                    animation: 'spin 0.8s linear infinite',
                  }}
                />
                {linkStatus}
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleLinkApply()}
            disabled={linkApplying || !linkInput.trim()}
            style={{
              alignSelf: 'flex-start',
              padding: '10px 18px',
              fontSize: 13,
              fontWeight: 600,
              color: '#fff',
              background:
                linkApplying || !linkInput.trim() ? 'var(--bg-hover)' : 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              cursor: linkApplying || !linkInput.trim() ? 'not-allowed' : 'pointer',
            }}
          >
            {linkApplying ? 'Applying…' : 'Apply URL'}
          </button>
        </div>
      )}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFileSelected(f)
          e.target.value = ''
        }}
      />
    </FormField>
    {coverPanel}
    </div>
  )

  const settingsPanel = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <FormField label="Judul" required>
        <input style={inputStyle} value={form.title} onChange={(e) => update('title', e.target.value)} />
      </FormField>

      <FormField label="Kategori" required>
        <CategoryMultiSelect
          selected={resolveCategories(form)}
          onToggle={(cat) => {
            const current = resolveCategories(form)
            // Toggle: remove if present, append if not. Always keep at
            // least one selected — clicking the only-active pill is a
            // no-op so the form never saves with an empty array.
            const next = current.includes(cat)
              ? current.filter((c) => c !== cat)
              : [...current, cat]
            if (next.length === 0) return
            setForm((f) => ({
              ...f,
              categories: next,
              // Keep legacy `category` in sync with the first selected
              // so any reader that hasn't moved to `categories` yet
              // still resolves to a sensible value.
              category: next[0],
            }))
          }}
        />
      </FormField>

      <FormField label="Tag" required>
        <input style={inputStyle} value={form.tag} onChange={(e) => update('tag', e.target.value)} />
      </FormField>

      {/* Aspect ratio and sort order are now derived automatically by the
          public site (auto-balanced masonry + newest-first order), so they
          are no longer editable here. The values still flow through `form`
          with their defaults to keep the row populated. */}
    </div>
  )

  return (
    <ModalShell
      title={initial ? 'Edit Karya' : 'Tambah Karya'}
      onClose={onClose}
      headerExtra={headerStatus}
      maxWidth={920}
      minHeight="auto"
      footer={
        <>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              height: 36,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            Batal
          </button>
          {(() => {
            // Disable save when: a request is in-flight (saving),
            // an upload hasn't finished (uploading), media URL is
            // missing, or the required Judul is blank/whitespace.
            const titleMissing = !form.title.trim()
            const disabled = saving || uploading || !form.media_url || titleMissing
            const reason = titleMissing
              ? 'Isi judul karya dulu'
              : !form.media_url
              ? 'Upload media dulu'
              : uploading
              ? 'Tunggu upload selesai'
              : undefined
            return (
              <button
                onClick={handleSave}
                disabled={disabled}
                title={reason}
                style={{
                  flex: 1,
                  height: 36,
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: saving ? 'wait' : disabled ? 'not-allowed' : 'pointer',
                  opacity: disabled ? 0.5 : 1,
                }}
              >
                {saving ? 'Menyimpan…' : initial ? 'Simpan Perubahan' : 'Tambah'}
              </button>
            )
          })()}
        </>
      }
    >
      {error && <ListError message={error} />}

      <div className="portfolio-modal-grid">
        <div style={{ minWidth: 0 }}>{mediaPanel}</div>
        <div style={{ minWidth: 0 }}>{settingsPanel}</div>
      </div>

      {confirm && <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />}

      {posterPickerOpen && form.media_type === 'video' && form.media_url && (
        <VideoPosterPicker
          videoUrls={[form.media_url]}
          prefix="portfolio"
          currentPoster={form.thumbnail_url}
          onPosterChange={(url) => update('thumbnail_url', url)}
          onClose={() => setPosterPickerOpen(false)}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .portfolio-modal-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
          gap: 24px;
          align-items: start;
        }
        @media (max-width: 720px) {
          .portfolio-modal-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 16px;
          }
        }
      `}</style>
    </ModalShell>
  )
}

function CategoryMultiSelect({
  selected,
  onToggle,
}: {
  selected: BsiPortfolio['category'][]
  onToggle: (cat: BsiPortfolio['category']) => void
}) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {CATEGORIES.map((cat) => {
        const active = selected.includes(cat)
        return (
          <button
            key={cat}
            type="button"
            onClick={() => onToggle(cat)}
            style={{
              padding: '8px 14px',
              background: active ? 'var(--accent)' : 'var(--bg3)',
              color: active ? '#fff' : 'var(--text2)',
              border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 999,
              fontSize: 12,
              fontWeight: active ? 600 : 500,
              cursor: 'pointer',
              transition: 'background 0.15s, color 0.15s, border-color 0.15s',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
            }}
            onMouseEnter={(e) => {
              if (active) return
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
            }}
            onMouseLeave={(e) => {
              if (active) return
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text2)'
            }}
          >
            {active && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
            {CATEGORY_LABELS[cat]}
          </button>
        )
      })}
    </div>
  )
}

function mediaTabStyle(active: boolean): React.CSSProperties {
  return {
    padding: '7px 16px',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: active ? '#fff' : 'var(--text2)',
    background: active ? 'var(--accent)' : 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  }
}

function coverActionBtn(highlight: boolean, danger = false): React.CSSProperties {
  return {
    height: 30,
    padding: '0 12px',
    background: danger
      ? 'rgba(255,107,107,0.12)'
      : highlight
      ? 'var(--accent)'
      : 'var(--bg3)',
    color: danger ? '#ff6b6b' : highlight ? '#fff' : 'var(--text)',
    border: danger
      ? '1px solid rgba(255,107,107,0.35)'
      : highlight
      ? 'none'
      : '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
  }
}

function OverlayIconButton({
  onClick,
  disabled,
  title,
  ariaLabel,
  tone = 'default',
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title?: string
  ariaLabel?: string
  tone?: 'default' | 'danger'
  children: React.ReactNode
}) {
  const isDanger = tone === 'danger'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      style={{
        width: 30,
        height: 30,
        padding: 0,
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(8px)',
        border: `1px solid ${isDanger ? 'rgba(255,107,107,0.45)' : 'rgba(255,255,255,0.18)'}`,
        borderRadius: 6,
        color: isDanger ? '#ff6b6b' : '#fff',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        const el = e.currentTarget as HTMLElement
        el.style.background = isDanger ? 'rgba(255,107,107,0.2)' : 'rgba(255,255,255,0.14)'
        el.style.transform = 'scale(1.05)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.background = 'rgba(0,0,0,0.65)'
        el.style.transform = 'scale(1)'
      }}
    >
      {children}
    </button>
  )
}

function ActiveToggleButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={active ? 'Klik untuk men-non-aktifkan' : 'Klik untuk mengaktifkan'}
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
      {active ? 'Active' : 'Non Active'}
    </button>
  )
}

/**
 * Banner panel for the Portfolio section. Team uploads a landscape
 * banner image that replaces the plain "Portfolio" text heading on
 * the public site. The URL is stored on
 * `bsi_hero.portfolio_header_image_url` (single-row hero table) so
 * we don't need a new table for one column.
 */
/**
 * Inner content of the "Banner Portofolio" Section. The Section
 * wrapper provides the card chrome (title, padding, border,
 * radius), so this component renders only the description copy +
 * the FileUploader + status messages.
 */
function BannerUploader() {
  const supabase = getSupabase()
  const [heroId, setHeroId] = useState<string | null>(null)
  const [headerUrl, setHeaderUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { data, error } = await supabase
        .from('bsi_hero')
        .select('id, portfolio_header_image_url')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      if (data) {
        setHeroId(data.id)
        setHeaderUrl(data.portfolio_header_image_url ?? null)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [supabase])

  async function persistHeaderUrl(url: string | null) {
    if (!heroId) return
    setSaving(true)
    setError(null)
    const { error } = await supabase
      .from('bsi_hero')
      .update({ portfolio_header_image_url: url })
      .eq('id', heroId)
    if (error) setError(error.message)
    setSaving(false)
  }

  return (
    <>
      {error && (
        <ListError
          message={
            error.includes('portfolio_header_image_url') ||
            (error.includes('column') && error.includes('does not exist'))
              ? 'Database column does not exist. Run the migration in Supabase SQL Editor: ' +
                'ALTER TABLE bsi_hero ADD COLUMN IF NOT EXISTS portfolio_header_image_url TEXT;'
              : error
          }
        />
      )}

      {loading ? (
        <div style={{ color: 'var(--text2)', fontSize: 12 }}>Loading…</div>
      ) : !heroId ? (
        <div style={{ color: 'var(--text2)', fontSize: 12 }}>
          Hero hasn't been created yet. Open the Hero page first to initialise.
        </div>
      ) : (
        <FileUploader
          label="Banner Image (Landscape)"
          value={headerUrl}
          onChange={(url) => {
            setHeaderUrl(url)
            void persistHeaderUrl(url)
          }}
          prefix="hero"
          accept="image"
          previewHeight={200}
          hint="16:3 ratio · 4800×900 px · PNG transparent"
        />
      )}

      {saving && (
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>Saving…</div>
      )}
    </>
  )
}
