'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { BsiAbroadService } from '@/lib/website-types'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { FileUploader } from '@/components/website/FileUploader'
import {
  ActionButton as ListActionButton,
  ListEmpty,
  ListError,
} from '@/components/website/SimpleList'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import { Section } from '@/components/website/Section'
import { StatusPill } from './StatusPill'
import { useT } from '@/lib/i18n/LanguageProvider'

// Defaults applied to a brand-new row so the admin sees sensible
// values instead of nulls. The public site already coalesces, but
// keeping defaults here makes the form less noisy on first save.
const DEFAULTS = {
  description: '',
  preview_url: null as string | null,
  preview_type: 'video' as 'image' | 'video',
  accent_color: null as string | null,
  card_bg_color: null as string | null,
}

/**
 * Detect whether a preview URL points to a video or an image based
 * on its extension. Falls back to the current value when the URL
 * doesn't carry a recognised extension (e.g. a signed S3 link
 * without one) so the admin can still flip the type manually if
 * needed in future. Used by both the file uploader and the
 * paste-a-link input so both paths stay in sync.
 */
function detectPreviewType(
  url: string | null,
  current: 'video' | 'image',
): 'video' | 'image' {
  if (!url) return current
  if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) return 'video'
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url)) return 'image'
  return current
}

type Draft = Pick<
  BsiAbroadService,
  | 'description'
  | 'preview_url'
  | 'preview_type'
  | 'accent_color'
  | 'card_bg_color'
> & { title: string }

/**
 * Section component for managing abroad-production services. Lives
 * inside the Abroad Production admin page directly below the Trips
 * list so editors only need one tab for the whole feature instead
 * of two side-by-side navigation entries. Behaves like a stand-alone
 * CRUD: grid of cards, click-to-edit modal, publish toggle, delete.
 */
export default function AbroadServicesSection() {
  const t = useT()
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiAbroadService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Partial<Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('bsi_abroad_services')
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

  function handleAdd() {
    setCreating(true)
    setEditingId(null)
    setDraft({})
  }

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus service ini?'))) return
    const { error } = await supabase
      .from('bsi_abroad_services')
      .delete()
      .eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) => xs.filter((x) => x.id !== id))
    if (editingId === id) closeEditor()
  }

  async function togglePublish(item: BsiAbroadService) {
    const { error } = await supabase
      .from('bsi_abroad_services')
      .update({ is_published: !item.is_published })
      .eq('id', item.id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) =>
      xs.map((x) =>
        x.id === item.id ? { ...x, is_published: !x.is_published } : x,
      ),
    )
  }

  function requestTogglePublish(item: BsiAbroadService) {
    const next = !item.is_published
    setConfirmReq({
      title: next ? t('Aktifkan service?') : t('Nonaktifkan service?'),
      message: next
        ? `${t('Service')} "${item.title}" ${t('akan ditampilkan kembali di halaman detail abroad production.')}`
        : `${t('Service')} "${item.title}" ${t('akan disembunyikan dari halaman detail. Data tetap aman dan bisa diaktifkan kembali kapan saja.')}`,
      confirmLabel: next ? t('Aktifkan') : t('Nonaktifkan'),
      tone: next ? 'info' : 'warning',
      onConfirm: () => {
        setConfirmReq(null)
        togglePublish(item)
      },
    })
  }

  function openEditor(item: BsiAbroadService) {
    setCreating(false)
    setEditingId(item.id)
    setDraft({})
  }

  function closeEditor() {
    setCreating(false)
    setEditingId(null)
    setDraft({})
  }

  function patchDraft(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }))
  }

  async function save(item: BsiAbroadService) {
    if (creating) {
      setSavingId('__create__')
      const draftTitle = (draft.title as string | undefined)?.trim()
      const payload = {
        ...DEFAULTS,
        ...draft,
        title: draftTitle && draftTitle.length > 0 ? draftTitle : 'Service Baru',
        is_published: false,
        sort_order: items.length + 1,
      }
      const { error, data } = await supabase
        .from('bsi_abroad_services')
        .insert(payload)
        .select()
        .single()
      setSavingId(null)
      if (error) {
        const isMissingColumn =
          error.code === '42703' || /column .* does not exist/i.test(error.message)
        alert(
          isMissingColumn
            ? `${t('Database belum diupdate:')} ${error.message}. ${t('Jalankan migration "migration_abroad_services.sql" di Supabase SQL Editor.')}`
            : error.message,
        )
        return
      }
      if (data) {
        setItems((xs) => [...xs, data as BsiAbroadService])
      }
      closeEditor()
      return
    }

    if (Object.keys(draft).length === 0) {
      closeEditor()
      return
    }
    setSavingId(item.id)
    const payload: Partial<BsiAbroadService> = { ...draft }
    if (typeof payload.title === 'string') payload.title = payload.title.trim()
    const { error, data } = await supabase
      .from('bsi_abroad_services')
      .update(payload)
      .eq('id', item.id)
      .select()
      .single()
    setSavingId(null)
    if (error) {
      alert(error.message)
      return
    }
    if (data) {
      setItems((xs) =>
        xs.map((x) => (x.id === item.id ? (data as BsiAbroadService) : x)),
      )
    }
    closeEditor()
  }

  function fieldValue<K extends keyof Draft>(
    item: BsiAbroadService,
    key: K,
  ): Draft[K] {
    if (key in draft) return draft[key] as Draft[K]
    return (item as unknown as Draft)[key]
  }

  const draftItem = useMemo<BsiAbroadService>(
    () =>
      ({
        id: '__draft__',
        sort_order: items.length + 1,
        title: 'Service Baru',
        description: DEFAULTS.description,
        preview_url: DEFAULTS.preview_url,
        preview_type: DEFAULTS.preview_type,
        accent_color: DEFAULTS.accent_color,
        card_bg_color: DEFAULTS.card_bg_color,
        is_published: false,
        created_at: '',
      }) as BsiAbroadService,
    [items.length],
  )

  const editingItem = creating
    ? draftItem
    : items.find((x) => x.id === editingId) ?? null
  const isDirty = creating ? true : Object.keys(draft).length > 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {error && <ListError message={error} />}

      <Section
        title={t('Service Categories (halaman detail)')}
        action={
          <button
            type="button"
            onClick={handleAdd}
            style={{
              height: 32,
              padding: '0 14px',
              background: 'var(--accent, #0B3DE7)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {t('+ Tambah Service')}
          </button>
        }
      >
        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('Memuat…')}</div>
        ) : items.length === 0 ? (
          <ListEmpty message={t('Belum ada service. Klik + Tambah Service untuk membuat list pertama.')} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {items.map((s, i) => (
              <ServiceCard
                key={s.id}
                service={s}
                displayIndex={i + 1}
                onEdit={() => openEditor(s)}
                onTogglePublish={() => requestTogglePublish(s)}
                onDelete={() => handleDelete(s.id)}
              />
            ))}
          </div>
        )}
      </Section>

      {editingItem && (
        <EditModal
          item={editingItem}
          isCreating={creating}
          fieldValue={fieldValue}
          patchDraft={patchDraft}
          isDirty={isDirty}
          saving={
            creating ? savingId === '__create__' : savingId === editingItem.id
          }
          onClose={closeEditor}
          onSave={() => save(editingItem)}
          onTogglePublish={
            creating ? undefined : () => requestTogglePublish(editingItem)
          }
        />
      )}

      {confirmReq && (
        <ConfirmDialog request={confirmReq} onCancel={() => setConfirmReq(null)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// VideoCoverFrame — seeks to a deterministic mid-clip frame so the
// card thumbnail shows real content instead of the black opening
// frame. Hash-based seed makes the same clip pick the same frame
// across renders (no flicker on re-renders), but different clips
// get different frames so the grid feels varied.
// ─────────────────────────────────────────────────────────────────
function VideoCoverFrame({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null)
  const seed = useMemo(() => {
    let h = 0
    for (let i = 0; i < src.length; i++) {
      h = (h * 31 + src.charCodeAt(i)) >>> 0
    }
    return (h % 1000) / 1000
  }, [src])

  function handleLoadedMetadata() {
    const v = ref.current
    if (!v) return
    const d = v.duration
    if (!isFinite(d) || d <= 0) return
    const target = d * (0.15 + seed * 0.6)
    try {
      v.currentTime = Math.min(target, Math.max(0.1, d - 0.1))
    } catch {
      // Some browsers throw if the source isn't seekable yet — the
      // poster fallback (first frame) will be used in that case.
    }
  }

  return (
    <video
      ref={ref}
      src={src}
      muted
      playsInline
      preload="metadata"
      onLoadedMetadata={handleLoadedMetadata}
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  )
}

/**
 * ServiceCard — mirrors the visual language of the TripCard on this
 * same page (gradient body, hover lift + image zoom, floating chips,
 * eyebrow + title + meta stack, balanced action row) so the two
 * lists read as one consistent admin surface instead of two unrelated
 * card styles stacked on top of each other.
 */
function ServiceCard({
  service,
  displayIndex,
  onEdit,
  onTogglePublish,
  onDelete,
}: {
  service: BsiAbroadService
  displayIndex: number
  onEdit: () => void
  onTogglePublish: () => void
  onDelete: () => void
}) {
  const t = useT()
  const [hovered, setHovered] = useState(false)
  const isVideo = service.preview_type === 'video'

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, var(--bg2) 0%, var(--bg) 100%)',
        border: `1px solid ${
          hovered ? 'var(--border-strong)' : 'var(--border)'
        }`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: service.is_published ? 1 : 0.62,
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 18px 40px -14px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)'
          : '0 4px 12px -4px rgba(0,0,0,0.3)',
        transition:
          'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease, border-color 0.18s ease, opacity 0.2s ease',
      }}
    >
      {/* Preview area — 16:10 cinematic ratio matching the trip
          cards. Subtle zoom on hover for visual life. Floating chips
          for position number (Bentala blue) + hidden status. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 10',
          background: 'var(--bg3)',
          overflow: 'hidden',
        }}
      >
        {service.preview_url ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              transform: hovered ? 'scale(1.05)' : 'scale(1.0)',
              transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            {isVideo ? (
              <VideoCoverFrame src={service.preview_url} />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img loading="lazy" decoding="async"
                src={service.preview_url}
                alt=""
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            )}
          </div>
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--text3)',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: 11, letterSpacing: '0.06em' }}>
              No preview
            </span>
          </div>
        )}

        {/* Bottom feather so the preview's lower edge melts into the
            card body — mirrors the trip-card treatment. */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(180deg, rgba(8,9,13,0) 55%, rgba(8,9,13,0.55) 100%)',
          }}
        />

        {/* Position chip (Bentala blue) — the public-site equivalent
            of this card's giant numeral. Replaces the previous
            generic "#N" tag with the same chip language the trip
            "note" chip uses. */}
        <span
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            padding: '5px 11px',
            background: 'rgba(11, 61, 231, 0.94)',
            color: '#fff',
            fontSize: 10,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.16em',
            borderRadius: 999,
            boxShadow: '0 6px 18px rgba(11,61,231,0.45)',
          }}
        >
          {`Service · ${String(displayIndex).padStart(2, '0')}`}
        </span>

        {/* Status pill — ALWAYS visible (top-right of the preview)
            so editors see at-a-glance whether the service is live
            on the public site. Mirrors the TripCard pill so both
            grids share the same status vocabulary. */}
        <StatusPill isPublished={service.is_published} />
      </div>

      {/* Body — eyebrow + title + description, then a balanced row of
          three action buttons matching the trip-card vocabulary. */}
      <div
        style={{
          padding: '18px 18px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          flex: 1,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              color: 'var(--accent)',
            }}
          >
            Service
          </span>
          <h3
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.005em',
              lineHeight: 1.15,
            }}
          >
            {service.title || 'Untitled service'}
          </h3>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: 13,
            color: 'var(--text2)',
            lineHeight: 1.5,
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {service.description || t('Belum ada deskripsi untuk service ini.')}
        </p>

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 'auto',
            paddingTop: 4,
          }}
        >
          <SvcActionButton onClick={onEdit} variant="primary">
            Edit
          </SvcActionButton>
          <SvcActionButton onClick={onTogglePublish} variant="ghost">
            {service.is_published ? 'Hide' : 'Show'}
          </SvcActionButton>
          <SvcActionButton onClick={onDelete} variant="danger">
            Delete
          </SvcActionButton>
        </div>
      </div>
    </div>
  )
}

/**
 * Three-variant action button used in the service card row. Same
 * sizing + variant vocabulary as the trip card's `ActionButton` so
 * both rows read as the same control language — primary (Edit) is
 * the filled accent, ghost (Hide/Show) is a transparent bordered
 * pill, danger (Delete) is the destructive variant.
 */
function SvcActionButton({
  onClick,
  variant,
  children,
}: {
  onClick: () => void
  variant: 'primary' | 'ghost' | 'danger'
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)

  const baseStyle: React.CSSProperties = {
    flex: 1,
    height: 34,
    padding: '0 12px',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.02em',
    borderRadius: 8,
    cursor: 'pointer',
    transition:
      'background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
  }

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          background: hovered ? 'var(--accent-hover, #1849f0)' : 'var(--accent)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 4px 14px -4px rgba(11,61,231,0.5)',
        }
      : variant === 'danger'
        ? {
            background: hovered
              ? 'rgba(255, 107, 107, 0.14)'
              : 'rgba(255, 107, 107, 0.07)',
            color: '#ff6b6b',
            border: '1px solid rgba(255, 107, 107, 0.38)',
          }
        : {
            background: hovered ? 'var(--bg3)' : 'transparent',
            color: 'var(--text2)',
            border: '1px solid var(--border-strong)',
          }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...baseStyle, ...variantStyle }}
    >
      {children}
    </button>
  )
}

function EditModal({
  item,
  isCreating,
  fieldValue,
  patchDraft,
  isDirty,
  saving,
  onClose,
  onSave,
  onTogglePublish,
}: {
  item: BsiAbroadService
  isCreating?: boolean
  fieldValue: <K extends keyof Draft>(item: BsiAbroadService, key: K) => Draft[K]
  patchDraft: (patch: Partial<Draft>) => void
  isDirty: boolean
  saving: boolean
  onClose: () => void
  onSave: () => void
  onTogglePublish?: () => void
}) {
  const t = useT()
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 1100,
          maxHeight: '88vh',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '14px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {isCreating ? t('Tambah Service') : t('Edit Service')}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {onTogglePublish && (
              <button
                type="button"
                onClick={onTogglePublish}
                title={
                  item.is_published
                    ? t('Service aktif — klik untuk nonaktifkan')
                    : t('Service nonaktif — klik untuk aktifkan')
                }
                style={{
                  height: 28,
                  padding: '0 12px',
                  background: item.is_published
                    ? 'rgba(67, 217, 162, 0.12)'
                    : 'var(--bg3)',
                  border: `1px solid ${
                    item.is_published
                      ? 'rgba(67, 217, 162, 0.3)'
                      : 'var(--border)'
                  }`,
                  borderRadius: 6,
                  color: item.is_published ? 'var(--accent3)' : 'var(--text2)',
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: 4,
                    background: item.is_published
                      ? 'var(--accent3)'
                      : 'var(--text2)',
                    flexShrink: 0,
                  }}
                />
                {item.is_published ? t('Aktif') : t('Nonaktif')}
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              title={t('Tutup')}
              style={{
                width: 28,
                height: 28,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text2)',
                fontSize: 14,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ×
            </button>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(280px, 1fr) 1.15fr',
            gap: 0,
            overflow: 'hidden',
            flex: 1,
            minHeight: 0,
          }}
        >
          <div
            style={{
              padding: 22,
              borderRight: '1px solid var(--border)',
              background: 'var(--bg)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <FormField label={t('Preview (Video / Image)')}>
              <FileUploader
                value={fieldValue(item, 'preview_url')}
                onChange={(url) => {
                  const previewType = detectPreviewType(
                    url,
                    fieldValue(item, 'preview_type'),
                  )
                  patchDraft({ preview_url: url, preview_type: previewType })
                }}
                prefix="abroad-services"
                accept="image+video"
                previewHeight={320}
              />
            </FormField>

            {/* Or-paste-a-link escape hatch — admins can drop a URL
                here (Vimeo direct .mp4, S3, CDN-hosted reel, etc.)
                without going through the Supabase upload bucket.
                The FileUploader above reflects the same `preview_url`
                value, so the preview thumbnail + Ganti/Hapus controls
                stay in sync whichever way the URL was set. */}
            <FormField label={t('Atau paste URL')}>
              <input
                type="url"
                style={inputStyle}
                value={fieldValue(item, 'preview_url') ?? ''}
                onChange={(e) => {
                  const url = e.target.value.trim() || null
                  const previewType = detectPreviewType(
                    url,
                    fieldValue(item, 'preview_type'),
                  )
                  patchDraft({ preview_url: url, preview_type: previewType })
                }}
                placeholder="https://…/reel.mp4"
              />
            </FormField>
          </div>

          <div
            style={{
              padding: 22,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <FormField label={t('Judul Service')}>
              <input
                style={inputStyle}
                value={fieldValue(item, 'title')}
                onChange={(e) => patchDraft({ title: e.target.value })}
                placeholder="Video Production"
              />
            </FormField>

            <FormField label={t('Deskripsi')}>
              <textarea
                style={{ ...textareaStyle, minHeight: 110 }}
                value={fieldValue(item, 'description') ?? ''}
                onChange={(e) => patchDraft({ description: e.target.value })}
                placeholder={t('Body copy yang muncul di card sticker dan panel preview…')}
              />
            </FormField>
          </div>
        </div>

        <div
          style={{
            padding: '12px 18px',
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 8,
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              height: 34,
              padding: '0 14px',
              background: 'transparent',
              color: 'var(--text2)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t('Batal')}
          </button>
          <ListActionButton
            variant="primary"
            onClick={onSave}
            disabled={!isDirty || saving}
          >
            {saving
              ? t('Menyimpan…')
              : isCreating
                ? t('Tambah Service')
                : t('Simpan perubahan')}
          </ListActionButton>
        </div>
      </div>
    </div>
  )
}
