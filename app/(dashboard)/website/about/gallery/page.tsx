'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { BsiTeamGallery, TeamGalleryRatio } from '@/lib/website-types'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { PrimaryActionButton } from '@/components/website/PageActions'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { FileUploader } from '@/components/website/FileUploader'
import { ListEmpty, ListError, ModalShell } from '@/components/website/SimpleList'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import { Section } from '@/components/website/Section'

type FormState = Omit<BsiTeamGallery, 'id' | 'created_at' | 'updated_at'>

const EMPTY_FORM: FormState = {
  image_url: '',
  caption: '',
  alt_text: '',
  sort_order: 0,
  is_published: true,
  display_ratio: '16:9',
  focal_x: 50,
  focal_y: 50,
  zoom: 1,
}

// ─────────────────────────────────────────────────────────────
// Bento packer — MIRROR of public/components/about/TeamGallery.tsx.
// Both sides must run the IDENTICAL packer so the admin's framing
// preview matches the public render exactly, including the
// trailing-row rebuild that may reshape the last few photos.
// ─────────────────────────────────────────────────────────────

type TileSize = 'wide' | 'tall' | 'square'

const RATIO_CYCLE: TeamGalleryRatio[] = [
  '16:9', '9:16', '4:5',
  '4:5',  '16:9', '4:5',
  '9:16', '4:5',  '4:5',
  '16:9',
]

function autoRatioForIndex(i: number): TeamGalleryRatio {
  const len = RATIO_CYCLE.length
  return RATIO_CYCLE[((i % len) + len) % len]
}

function autoRatioForSortOrder(sortOrder: number): TeamGalleryRatio {
  return autoRatioForIndex(Math.floor(sortOrder / 10))
}

function tileSizeFor(ratio: TeamGalleryRatio): TileSize {
  if (ratio === '16:9') return 'wide'
  if (ratio === '9:16') return 'tall'
  return 'square'
}

function effectiveTileSize(size: TileSize, colCount: number): TileSize {
  if (colCount <= 2 && size === 'wide') return 'square'
  return size
}

// Bento cell aspect — wide = 2:1, tall = 1:2, square = 1:1. The
// admin framing preview uses these so the editor frames into the
// EXACT shape visitors will see (including reshaped trailing tiles).
const TILE_ASPECT: Record<TileSize, string> = {
  wide:   '2 / 1',
  tall:   '1 / 2',
  square: '1 / 1',
}

interface PackedTile {
  photoId: string
  size: TileSize
}

function packBento(
  items: Array<{ id: string; sort_order: number }>,
  colCount: number,
): PackedTile[] {
  if (colCount <= 0) return []

  const grid: boolean[][] = []
  const isOccupied = (r: number, c: number) => grid[r]?.[c] === true
  const markOccupied = (r: number, c: number) => {
    while (grid.length <= r) grid.push(new Array(colCount).fill(false))
    grid[r][c] = true
  }

  const span = (size: TileSize) => {
    if (size === 'wide') return { cols: 2, rows: 1 }
    if (size === 'tall') return { cols: 1, rows: 2 }
    return { cols: 1, rows: 1 }
  }

  const fits = (r: number, c: number, s: { cols: number; rows: number }) => {
    if (c + s.cols > colCount) return false
    for (let dr = 0; dr < s.rows; dr++) {
      for (let dc = 0; dc < s.cols; dc++) {
        if (isOccupied(r + dr, c + dc)) return false
      }
    }
    return true
  }

  const place = (r: number, c: number, s: { cols: number; rows: number }) => {
    for (let dr = 0; dr < s.rows; dr++) {
      for (let dc = 0; dc < s.cols; dc++) markOccupied(r + dr, c + dc)
    }
  }

  type QueueEntry = { photoId: string; size: TileSize; row: number; col: number }
  const queueRaw: QueueEntry[] = items.map((it) => ({
    photoId: it.id,
    size: effectiveTileSize(tileSizeFor(autoRatioForSortOrder(it.sort_order)), colCount),
    row: 0,
    col: 0,
  }))
  const buckets: Record<TileSize, QueueEntry[]> = {
    wide: queueRaw.filter((q) => q.size === 'wide'),
    square: queueRaw.filter((q) => q.size === 'square'),
    tall: queueRaw.filter((q) => q.size === 'tall'),
  }
  const orderArr: TileSize[] = ['wide', 'square', 'tall']
  const queue: QueueEntry[] = []
  while (buckets.wide.length || buckets.square.length || buckets.tall.length) {
    for (const t of orderArr) {
      if (buckets[t].length > 0) queue.push(buckets[t].shift()!)
    }
  }

  const placed: QueueEntry[] = []
  let row = 0
  let col = 0

  const fillCell = (r: number, c: number): boolean => {
    for (let k = 0; k < queue.length; k++) {
      if (queue[k].size === 'tall') continue
      if (fits(r, c, span(queue[k].size))) {
        const partner = queue[k]
        place(r, c, span(partner.size))
        placed.push({ ...partner, col: c, row: r })
        queue.splice(k, 1)
        return true
      }
    }
    return false
  }

  while (queue.length > 0) {
    while (isOccupied(row, col)) {
      col++
      if (col >= colCount) {
        col = 0
        row++
      }
    }

    let pickedIdx = -1
    for (let i = 0; i < queue.length; i++) {
      if (fits(row, col, span(queue[i].size))) {
        pickedIdx = i
        break
      }
    }

    if (pickedIdx === -1) {
      col++
      if (col >= colCount) {
        col = 0
        row++
      }
      continue
    }

    const tile = queue[pickedIdx]
    place(row, col, span(tile.size))
    placed.push({ ...tile, col, row })
    queue.splice(pickedIdx, 1)

    if (tile.size === 'tall' && col + 1 < colCount) {
      let pairIdx = -1
      for (let k = 0; k < queue.length; k++) {
        if (queue[k].size === 'tall' && fits(row, col + 1, span('tall'))) {
          pairIdx = k
          break
        }
      }
      if (pairIdx >= 0) {
        const pair = queue[pairIdx]
        place(row, col + 1, span('tall'))
        placed.push({ ...pair, col: col + 1, row })
        queue.splice(pairIdx, 1)
      }
    }

    if (tile.size === 'tall') {
      const partnerRow = row + 1
      for (let j = 0; j < colCount; j++) {
        if (isOccupied(partnerRow, j)) continue
        fillCell(partnerRow, j)
      }
    }
  }

  // Trailing-row rebuild.
  if (placed.length > 0) {
    const rowSpan = (s: TileSize) => (s === 'tall' ? 2 : 1)
    const colSpan = (s: TileSize) => (s === 'wide' ? 2 : 1)

    const totalRows = placed.reduce(
      (max, t) => Math.max(max, t.row + rowSpan(t.size)),
      0,
    )

    let firstIncompleteRow = -1
    for (let r = 0; r < totalRows; r++) {
      let occupied = 0
      for (const t of placed) {
        if (t.row <= r && r < t.row + rowSpan(t.size)) {
          occupied += colSpan(t.size)
        }
      }
      if (occupied < colCount) {
        firstIncompleteRow = r
        break
      }
    }

    if (firstIncompleteRow >= 0) {
      for (const t of placed) {
        if (
          t.size === 'tall' &&
          t.row < firstIncompleteRow &&
          t.row + 2 > firstIncompleteRow
        ) {
          t.size = 'square'
        }
      }

      const trailing = placed
        .filter((t) => t.row >= firstIncompleteRow)
        .sort((a, b) => a.row - b.row || a.col - b.col)
      for (let i = placed.length - 1; i >= 0; i--) {
        if (placed[i].row >= firstIncompleteRow) placed.splice(i, 1)
      }

      const K = trailing.length
      if (K > 0) {
        const R = Math.max(1, Math.ceil(K / colCount))
        const base = Math.floor(K / R)
        const extra = K % R
        const itemsPerRow: number[] = []
        for (let i = 0; i < R; i++) {
          itemsPerRow.push(base + (i < extra ? 1 : 0))
        }
        const canTile = itemsPerRow.every(
          (k) => k * 2 >= colCount && k <= colCount,
        )

        let idx = 0
        if (canTile) {
          for (let r = 0; r < R; r++) {
            const k = itemsPerRow[r]
            const xWide = colCount - k
            let wideCount = 0
            let c = 0
            for (let i = 0; i < k; i++) {
              const target = Math.round(((i + 1) * xWide) / k)
              const t = trailing[idx++]
              if (wideCount < target) {
                t.size = 'wide'
                wideCount++
              } else {
                t.size = 'square'
              }
              t.row = firstIncompleteRow + r
              t.col = c
              c += colSpan(t.size)
              placed.push(t)
            }
          }
        } else {
          const startCol = Math.floor((colCount - K) / 2)
          for (let i = 0; i < K; i++) {
            const t = trailing[i]
            t.size = 'square'
            t.row = firstIncompleteRow
            t.col = startCol + i
            placed.push(t)
          }
        }
      }
    }
  }

  return placed.map((p) => ({ photoId: p.photoId, size: p.size }))
}

// Public-site grid constants — MUST match the values in
// public/components/about/TeamGallery.tsx so admin's per-viewport
// colCount computation matches the public's render at the same
// viewport. When the editor is on the same screen size as a
// visitor, the admin preview tile shape == the public render.
const MIN_COL_WIDTH = 380
const GAP = 12
const SECTION_PAD_MOBILE = 20
const SECTION_PAD_DESKTOP = 52
const MOBILE_BREAKPOINT = 768

function getPublicSectionPaddingX(): number {
  if (typeof window === 'undefined') return SECTION_PAD_DESKTOP
  return window.innerWidth < MOBILE_BREAKPOINT
    ? SECTION_PAD_MOBILE
    : SECTION_PAD_DESKTOP
}

function getPublicColCount(): number {
  if (typeof window === 'undefined') return 3
  const total = window.innerWidth - getPublicSectionPaddingX() * 2
  return Math.max(2, Math.floor((total + GAP) / (MIN_COL_WIDTH + GAP)))
}

export default function TeamGalleryAdminPage() {
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiTeamGallery[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BsiTeamGallery | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
  // Track the editor's window width so the packer's colCount
  // matches what visitors on the same-size viewport see. Recomputes
  // on resize so the framing preview stays in sync if the editor
  // resizes their window mid-edit.
  const [previewColCount, setPreviewColCount] = useState(3)
  useEffect(() => {
    const recalc = () => setPreviewColCount(getPublicColCount())
    recalc()
    window.addEventListener('resize', recalc)
    return () => window.removeEventListener('resize', recalc)
  }, [])

  async function load() {
    const { data, error } = await supabase
      .from('bsi_team_gallery')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(item: BsiTeamGallery) {
    setConfirmReq({
      title: 'Hapus foto?',
      message: `"${item.caption || 'No caption'}" will be removed from the gallery.`,
      confirmLabel: 'Hapus',
      tone: 'danger',
      onConfirm: async () => {
        setConfirmReq(null)
        const { error } = await supabase.from('bsi_team_gallery').delete().eq('id', item.id)
        if (error) {
          alert(error.message)
          return
        }
        setItems((xs) => xs.filter((x) => x.id !== item.id))
      },
    })
  }

  async function togglePublish(item: BsiTeamGallery) {
    const { error } = await supabase
      .from('bsi_team_gallery')
      .update({ is_published: !item.is_published })
      .eq('id', item.id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) =>
      xs.map((x) => (x.id === item.id ? { ...x, is_published: !x.is_published } : x)),
    )
  }

  useRegisterPageAction(
    <PrimaryActionButton onClick={() => setCreating(true)}>+ Tambah Foto</PrimaryActionButton>,
  )

  // Run the public packer locally so every PhotoCard previews the
  // FINAL tile shape (post-rebuild), not just the source slot.
  // Only published photos go through the packer — those are the
  // ones that actually land on the public bento.
  const publishedSorted = items
    .filter((it) => it.is_published)
    .sort((a, b) => a.sort_order - b.sort_order)
  const packed = packBento(publishedSorted, previewColCount)
  const tileSizeByPhotoId = new Map<string, TileSize>(
    packed.map((p) => [p.photoId, p.size]),
  )

  return (
    <>
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && <ListError message={error} />}

        <Section
          title="The People Gallery"
          height="calc(100vh - 200px)"
        >
          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>Memuat…</div>
          ) : items.length === 0 ? (
            <ListEmpty message="No photos yet. Click + Add Photo to start." />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: 14,
              }}
            >
              {items.map((item) => (
                <PhotoCard
                  key={item.id}
                  item={item}
                  tileSize={
                    tileSizeByPhotoId.get(item.id) ??
                    effectiveTileSize(
                      tileSizeFor(autoRatioForSortOrder(item.sort_order)),
                      previewColCount,
                    )
                  }
                  onEdit={() => setEditing(item)}
                  onDelete={() => handleDelete(item)}
                  onTogglePublish={() => togglePublish(item)}
                />
              ))}
            </div>
          )}
        </Section>
      </div>

      {(editing || creating) && (
        <PhotoModal
          initial={editing}
          defaultSort={editing ? editing.sort_order : items.length * 10}
          allItems={publishedSorted}
          previewColCount={previewColCount}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={() => {
            setEditing(null)
            setCreating(false)
            void load()
          }}
        />
      )}

      {confirmReq && (
        <ConfirmDialog request={confirmReq} onCancel={() => setConfirmReq(null)} />
      )}
    </>
  )
}

function PhotoCard({
  item,
  tileSize,
  onEdit,
  onDelete,
  onTogglePublish,
}: {
  item: BsiTeamGallery
  tileSize: TileSize
  onEdit: () => void
  onDelete: () => void
  onTogglePublish: () => void
}) {
  // Resolve the LABEL ratio from the post-packer tile size — that's
  // what visitors see, including any trailing-row reshape.
  const ratio: TeamGalleryRatio =
    tileSize === 'wide' ? '16:9' : tileSize === 'tall' ? '9:16' : '4:5'
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: item.is_published ? 1 : 0.55,
        transition: 'border-color 0.15s ease, transform 0.15s ease',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(11,61,231,0.45)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
      }}
    >
      <button
        type="button"
        onClick={onEdit}
        title="Click to edit photo"
        style={{
          position: 'relative',
          width: '100%',
          // Locked to a square so the admin list reads as a clean
          // uniform grid. The bento layout (wide/tall/square cells)
          // still drives the public site; in the editor modal the
          // framing preview uses each photo's actual TILE_ASPECT so
          // editors crop into the right shape for visitors.
          aspectRatio: '1 / 1',
          background: 'var(--bg3)',
          overflow: 'hidden',
          border: 'none',
          padding: 0,
          margin: 0,
          cursor: 'pointer',
          display: 'block',
        }}
      >
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.alt_text || item.caption || 'gallery'}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: `${item.focal_x ?? 50}% ${item.focal_y ?? 50}%`,
              transform: `scale(${item.zoom ?? 1})`,
              transformOrigin: `${item.focal_x ?? 50}% ${item.focal_y ?? 50}%`,
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
              color: 'var(--text2)',
              fontSize: 12,
              letterSpacing: '0.04em',
            }}
          >
            No photo
          </div>
        )}
        <span
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            padding: '3px 8px',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            color: 'var(--accent)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.04em',
            borderRadius: 4,
          }}
        >
          {ratio}
        </span>
      </button>

      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--text)',
            lineHeight: 1.3,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            minHeight: 18,
          }}
        >
          {item.caption || (
            <span style={{ color: 'var(--text2)', fontStyle: 'italic', fontWeight: 400 }}>
              No caption
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>Sort #{item.sort_order}</div>

        <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
          <button
            onClick={onEdit}
            style={{
              flex: 1,
              height: 28,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text)',
              fontSize: 11,
              cursor: 'pointer',
            }}
          >
            Edit
          </button>
          <button
            onClick={onTogglePublish}
            title={item.is_published ? 'Sembunyikan' : 'Publikasikan'}
            style={{
              width: 28,
              height: 28,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: item.is_published ? 'var(--accent3)' : 'var(--text2)',
              fontSize: 12,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {item.is_published ? '●' : '○'}
          </button>
          <button
            onClick={onDelete}
            title="Hapus"
            style={{
              width: 28,
              height: 28,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: '#ff6b6b',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      </div>
    </div>
  )
}

function PhotoModal({
  initial,
  defaultSort,
  allItems,
  previewColCount,
  onClose,
  onSaved,
}: {
  initial: BsiTeamGallery | null
  defaultSort: number
  allItems: BsiTeamGallery[]
  previewColCount: number
  onClose: () => void
  onSaved: () => void
}) {
  const supabase = getSupabase()
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          image_url: initial.image_url,
          caption: initial.caption,
          alt_text: initial.alt_text,
          sort_order: initial.sort_order,
          is_published: initial.is_published,
          display_ratio: autoRatioForSortOrder(initial.sort_order),
          focal_x: initial.focal_x ?? 50,
          focal_y: initial.focal_y ?? 50,
          zoom: initial.zoom ?? 1,
        }
      : {
          ...EMPTY_FORM,
          sort_order: defaultSort,
          display_ratio: autoRatioForSortOrder(defaultSort),
        },
  )
  // Live-derive the slot ratio from the current sort_order so the
  // framing preview updates the moment the editor changes the
  // sort order (lets them see "if I move this to slot N, here's
  // the shape I need to fit").
  const autoRatio = autoRatioForSortOrder(form.sort_order)

  // Run the public packer with the modal's current sort_order
  // applied to get the FINAL tile shape (including any reshape
  // from the trailing-row rebuild). That way the framing preview
  // matches what visitors actually see for this exact photo.
  const previewTileSize: TileSize = (() => {
    const id = initial?.id ?? '__new__'
    const withCurrent: Array<{ id: string; sort_order: number }> = allItems
      .filter((it) => it.id !== id)
      .map((it) => ({ id: it.id, sort_order: it.sort_order }))
    withCurrent.push({ id, sort_order: form.sort_order })
    withCurrent.sort((a, b) => a.sort_order - b.sort_order)
    const packedHere = packBento(withCurrent, previewColCount)
    const found = packedHere.find((p) => p.photoId === id)
    return (
      found?.size ??
      effectiveTileSize(tileSizeFor(autoRatio), previewColCount)
    )
  })()
  const previewRatio: TeamGalleryRatio =
    previewTileSize === 'wide'
      ? '16:9'
      : previewTileSize === 'tall'
      ? '9:16'
      : '4:5'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    if (!form.image_url) {
      setError('Upload foto dulu sebelum menyimpan.')
      return
    }
    setSaving(true)
    setError(null)
    const payload = {
      ...form,
      // Keep the saved ratio in lockstep with the live sort_order
      // slot so DB readers that haven't migrated to the position-
      // derived rule see the same shape the public bento uses.
      display_ratio: autoRatio,
      updated_at: new Date().toISOString(),
    }
    const op = initial
      ? supabase.from('bsi_team_gallery').update(payload).eq('id', initial.id)
      : supabase.from('bsi_team_gallery').insert(payload)
    const { error } = await op
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    onSaved()
  }

  return (
    <ModalShell
      title={initial ? 'Edit Foto' : 'Tambah Foto'}
      onClose={onClose}
      maxWidth={680}
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
          <button
            onClick={handleSave}
            disabled={saving || !form.image_url}
            style={{
              flex: 1,
              height: 36,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving || !form.image_url ? 0.5 : 1,
            }}
          >
            {saving ? 'Menyimpan…' : initial ? 'Simpan' : 'Tambah'}
          </button>
        </>
      }
    >
      {error && <ListError message={error} />}

      <FormField label="Photo" required>
        <FileUploader
          value={form.image_url || null}
          onChange={(url) => update('image_url', url ?? '')}
          prefix="team-gallery"
          accept="image"
          previewHeight={220}
        />
      </FormField>

      <FormField label="Caption">
        <input
          style={inputStyle}
          value={form.caption}
          onChange={(e) => update('caption', e.target.value)}
          placeholder="Strategy Session"
        />
      </FormField>

      <FormField label="Alt Text">
        <textarea
          style={textareaStyle}
          rows={2}
          value={form.alt_text}
          onChange={(e) => update('alt_text', e.target.value)}
          placeholder="Bentala team during a strategy session"
        />
      </FormField>

      {form.image_url && (
        <FormField
          label={
            autoRatio === previewRatio
              ? `Framing — slot ${previewRatio} · drag titik fokus + zoom`
              : `Framing — slot ${previewRatio} (auto-fit dari ${autoRatio}) · drag titik fokus + zoom`
          }
        >
          <ImagePositioner
            src={form.image_url}
            aspectRatio={TILE_ASPECT[previewTileSize]}
            focalX={form.focal_x ?? 50}
            focalY={form.focal_y ?? 50}
            zoom={form.zoom ?? 1}
            onChange={(next) => {
              if (next.focal_x !== undefined) update('focal_x', next.focal_x)
              if (next.focal_y !== undefined) update('focal_y', next.focal_y)
              if (next.zoom !== undefined) update('zoom', next.zoom)
            }}
          />
        </FormField>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <FormField label="Sort Order">
          <input
            type="number"
            style={inputStyle}
            value={form.sort_order}
            onChange={(e) => update('sort_order', Number(e.target.value) || 0)}
          />
        </FormField>
        <FormField label="Status">
          <button
            type="button"
            onClick={() => update('is_published', !form.is_published)}
            style={{
              height: 36,
              background: form.is_published ? 'rgba(67,217,162,0.15)' : 'var(--bg3)',
              color: form.is_published ? '#43d9a2' : 'var(--text2)',
              border: `1px solid ${form.is_published ? 'rgba(67,217,162,0.5)' : 'var(--border)'}`,
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                background: form.is_published ? '#43d9a2' : 'var(--text2)',
              }}
            />
            {form.is_published ? 'Aktif' : 'Tersembunyi'}
          </button>
        </FormField>
      </div>
    </ModalShell>
  )
}

function ImagePositioner({
  src,
  aspectRatio = '4 / 3',
  focalX,
  focalY,
  zoom,
  onChange,
}: {
  src: string
  aspectRatio?: string
  focalX: number
  focalY: number
  zoom: number
  onChange: (next: { focal_x?: number; focal_y?: number; zoom?: number }) => void
}) {
  const frameRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  const updateFromEvent = (clientX: number, clientY: number) => {
    const frame = frameRef.current
    if (!frame) return
    const rect = frame.getBoundingClientRect()
    const x = ((clientX - rect.left) / rect.width) * 100
    const y = ((clientY - rect.top) / rect.height) * 100
    onChange({
      focal_x: Math.max(0, Math.min(100, x)),
      focal_y: Math.max(0, Math.min(100, y)),
    })
  }

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
    updateFromEvent(e.clientX, e.clientY)
  }
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return
    updateFromEvent(e.clientX, e.clientY)
  }
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    setDragging(false)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      /* pointer capture may already be released */
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div
        ref={frameRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        style={{
          position: 'relative',
          aspectRatio,
          overflow: 'hidden',
          background: 'var(--bg3)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          cursor: dragging ? 'grabbing' : 'grab',
          touchAction: 'none',
          userSelect: 'none',
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt="Framing preview"
          draggable={false}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${focalX}% ${focalY}%`,
            transform: `scale(${zoom})`,
            transformOrigin: `${focalX}% ${focalY}%`,
            transition: dragging ? 'none' : 'transform 0.18s ease, object-position 0.18s ease',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: `${focalX}%`,
            top: `${focalY}%`,
            transform: 'translate(-50%, -50%)',
            width: 36,
            height: 36,
            pointerEvents: 'none',
          }}
        >
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: 0,
              bottom: 0,
              width: 1,
              background: 'rgba(255,255,255,0.7)',
              transform: 'translateX(-50%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              top: '50%',
              left: 0,
              right: 0,
              height: 1,
              background: 'rgba(255,255,255,0.7)',
              transform: 'translateY(-50%)',
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: 'rgba(11,61,231,0.9)',
              border: '2px solid #fff',
              boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            }}
          />
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '8px 12px',
        }}
      >
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text2)',
            whiteSpace: 'nowrap',
          }}
        >
          Zoom
        </label>
        <input
          type="range"
          min={1}
          max={3}
          step={0.05}
          value={zoom}
          onChange={(e) => onChange({ zoom: Number(e.target.value) })}
          style={{ flex: 1 }}
        />
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            minWidth: 44,
            textAlign: 'right',
          }}
        >
          {zoom.toFixed(2)}×
        </span>
        <button
          type="button"
          onClick={() => onChange({ focal_x: 50, focal_y: 50, zoom: 1 })}
          style={{
            padding: '4px 10px',
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            color: 'var(--text2)',
            fontSize: 11,
            cursor: 'pointer',
          }}
          title="Reset focal ke tengah dan zoom ke 1×"
        >
          Reset
        </button>
      </div>
    </div>
  )
}
