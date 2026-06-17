'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { BsiService } from '@/lib/website-types'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { FileUploader } from '@/components/website/FileUploader'
import { ActionButton, IconBtn, ListEmpty, ListError } from '@/components/website/SimpleList'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import { Section } from '@/components/website/Section'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { PrimaryActionButton } from '@/components/website/PageActions'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useIsMobile } from '@/hooks/useIsMobile'

// Default values for newly-inserted rows so the admin doesn't see
// a wall of nulls in the form. Public site already coalesces nulls
// to safe placeholders, but a sane default keeps the UI cleaner.
const DEFAULTS = {
  description: '',
  cta_text: 'Start Collaboration',
  cta_url: '',
  learn_more_text: 'Recent work',
  learn_more_url: '#portfolio',
  media_url: null as string | null,
  media_type: 'image' as 'image' | 'video',
}

type Draft = Pick<
  BsiService,
  | 'description'
  | 'cta_text'
  | 'cta_url'
  | 'learn_more_text'
  | 'learn_more_url'
  | 'media_url'
  | 'media_type'
> & { name: string }

export default function ServicesAdminPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiService[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Which row's modal is open. Null = grid view only.
  const [editingId, setEditingId] = useState<string | null>(null)
  // Create-mode flag. When true the modal renders a fresh draft
  // (no DB row exists yet); the row is INSERTed only when the user
  // clicks Save. Cancel/close throws the draft away cleanly.
  const [creating, setCreating] = useState(false)
  // Per-row dirty draft so the modal can hold edits before commit.
  const [draft, setDraft] = useState<Partial<Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  // Confirm dialog state — used by both publish-toggle and delete
  // so the user always gets a "are you sure?" prompt instead of
  // an action firing on a single click.
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('bsi_services')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function handleAdd() {
    // No DB write here — just open the modal in create mode. The
    // INSERT happens in save() only when the user clicks Save.
    // Closing/canceling the modal leaves the table untouched.
    setCreating(true)
    setEditingId(null)
    setDraft({})
  }

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus layanan ini?'))) return
    const { error } = await supabase.from('bsi_services').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) => xs.filter((x) => x.id !== id))
    if (editingId === id) closeEditor()
  }

  async function togglePublish(item: BsiService) {
    const { error } = await supabase
      .from('bsi_services')
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

  // Wrap togglePublish in a confirm step so a stray click never
  // accidentally hides / republishes a service.
  function requestTogglePublish(item: BsiService) {
    const next = !item.is_published
    setConfirmReq({
      title: next ? t('Aktifkan service?') : t('Nonaktifkan service?'),
      message: next
        ? `${t('Service')} "${item.name}" ${t('akan ditampilkan kembali di halaman utama.')}`
        : `${t('Service')} "${item.name}" ${t('akan disembunyikan dari halaman utama. Data tetap aman dan bisa diaktifkan kembali kapan saja.')}`,
      confirmLabel: next ? t('Aktifkan') : t('Nonaktifkan'),
      tone: next ? 'info' : 'warning',
      onConfirm: () => {
        setConfirmReq(null)
        togglePublish(item)
      },
    })
  }

  function openEditor(item: BsiService) {
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

  async function save(item: BsiService) {
    // Create mode — INSERT a fresh row from draft + defaults.
    if (creating) {
      setSavingId('__create__')
      const draftName = (draft.name as string | undefined)?.trim()
      const payload = {
        ...DEFAULTS,
        ...draft,
        name: draftName && draftName.length > 0 ? draftName : 'Layanan Baru',
        is_published: false,
        sort_order: items.length,
      }
      const { error, data } = await supabase
        .from('bsi_services')
        .insert(payload)
        .select()
        .single()
      setSavingId(null)
      if (error) {
        const isMissingColumn =
          error.code === '42703' || /column .* does not exist/i.test(error.message)
        alert(
          isMissingColumn
            ? `${t('Database belum diupdate:')} ${error.message}. ${t('Jalankan migration "schema_services_richer.sql" di Supabase SQL Editor.')}`
            : error.message,
        )
        return
      }
      if (data) {
        setItems((xs) => [...xs, data as BsiService])
      }
      closeEditor()
      return
    }

    // Edit mode — no draft → close. Otherwise UPDATE the existing row.
    if (Object.keys(draft).length === 0) {
      closeEditor()
      return
    }
    setSavingId(item.id)
    const payload: Partial<BsiService> = { ...draft }
    if (typeof payload.name === 'string') payload.name = payload.name.trim()
    const { error, data } = await supabase
      .from('bsi_services')
      .update(payload)
      .eq('id', item.id)
      .select()
      .single()
    setSavingId(null)
    if (error) {
      const isMissingColumn =
        error.code === '42703' || /column .* does not exist/i.test(error.message)
      alert(
        isMissingColumn
          ? `Database belum diupdate: ${error.message}. Jalankan migration "schema_services_richer.sql" di Supabase SQL Editor.`
          : error.message,
      )
      return
    }
    if (data) {
      setItems((xs) => xs.map((x) => (x.id === item.id ? (data as BsiService) : x)))
    }
    closeEditor()
  }

  function fieldValue<K extends keyof Draft>(item: BsiService, key: K): Draft[K] {
    if (key in draft) return draft[key] as Draft[K]
    return (item as unknown as Draft)[key]
  }

  // Synthesized draft item shown in the modal during create mode.
  // Keeps a stable identity across renders (memoized on items.length
  // so sort_order tracks the current count) so the modal's input
  // refs don't churn while the user types.
  const draftItem = useMemo<BsiService>(
    () => ({
      id: '__draft__',
      name: 'Layanan Baru',
      description: DEFAULTS.description,
      cta_text: DEFAULTS.cta_text,
      cta_url: DEFAULTS.cta_url,
      learn_more_text: DEFAULTS.learn_more_text,
      learn_more_url: DEFAULTS.learn_more_url,
      media_url: DEFAULTS.media_url,
      media_type: DEFAULTS.media_type,
      is_published: false,
      sort_order: items.length,
      created_at: '',
    }) as unknown as BsiService,
    [items.length],
  )

  const editingItem = creating
    ? draftItem
    : items.find((x) => x.id === editingId) ?? null
  // In create mode the modal is always actionable — Save inserts the
  // fresh row even if the user keeps the placeholder name. In edit
  // mode we still require a real change.
  const isDirty = creating ? true : Object.keys(draft).length > 0

  // Top-right action — same pattern as Portfolio / Collaborations /
  // Social Links. Click opens the edit modal in create mode WITHOUT
  // touching the database; the row is only inserted on Save.
  useRegisterPageAction(
    <PrimaryActionButton onClick={handleAdd}>{t('+ Tambah Layanan')}</PrimaryActionButton>,
  )

  return (
    <div style={{ padding: isMobile ? '24px 14px' : 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
      {error && <ListError message={error} />}

      <Section title={t('Daftar Layanan')}>
        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('Memuat…')}</div>
        ) : items.length === 0 ? (
          <ListEmpty message={t('Belum ada layanan.')} />
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 16,
            }}
          >
            {items.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                onClick={() => openEditor(s)}
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
          saving={creating ? savingId === '__create__' : savingId === editingItem.id}
          onClose={closeEditor}
          onSave={() => save(editingItem)}
          onTogglePublish={
            creating
              ? undefined
              : () => requestTogglePublish(editingItem)
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
// Video cover thumbnail — seeks to a stable "random" frame in the
// middle 60% of the clip so the card preview shows real content
// instead of the black opening frame most encoders produce. The
// seed is derived from the URL so the same service always shows
// the same frame across renders (no flicker on re-renders), but
// different services get different frames.
// ─────────────────────────────────────────────────────────────────
function VideoCoverFrame({ src }: { src: string }) {
  const ref = useRef<HTMLVideoElement | null>(null)

  // Stable 0..1 fraction derived from the URL so the chosen frame
  // is deterministic per service.
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
    // Pick within 15%–75% of duration — avoids both the typical
    // black opening frame and any trailing fade-out.
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

// ─────────────────────────────────────────────────────────────────
// Compact card — thumbnail (or placeholder) on top, body + actions
// below. Whole card is clickable to open the editor; the publish-
// toggle and delete buttons stop propagation so they don't open it.
// ─────────────────────────────────────────────────────────────────
function ServiceCard({
  service,
  onClick,
  onTogglePublish,
  onDelete,
}: {
  service: BsiService
  onClick: () => void
  onTogglePublish: () => void
  onDelete: () => void
}) {
  const t = useT()
  const isVideo = service.media_type === 'video'
  return (
    <div
      onClick={onClick}
      style={{
        cursor: 'pointer',
        border: '1px solid var(--border)',
        borderRadius: 10,
        overflow: 'hidden',
        background: 'var(--bg2)',
        opacity: service.is_published ? 1 : 0.55,
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.15s, transform 0.15s',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
      }}
    >
      {/* Media thumbnail */}
      <div
        style={{
          aspectRatio: '16 / 9',
          background: 'var(--bg3)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {service.media_url ? (
          isVideo ? (
            <VideoCoverFrame src={service.media_url} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={service.media_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text2)',
              fontSize: 11,
              letterSpacing: '0.04em',
            }}
          >
            {t('Belum ada media')}
          </div>
        )}
        {service.media_url && isVideo && (
          <span
            aria-hidden
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              padding: '3px 6px',
              fontSize: 9,
              fontWeight: 600,
              letterSpacing: '0.06em',
              color: '#fff',
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              borderRadius: 4,
            }}
          >
            VIDEO
          </span>
        )}
      </div>

      {/* Body */}
      <div
        style={{
          flex: 1,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          minHeight: 0,
        }}
      >
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={service.name}
        >
          {service.name || t('(Tanpa nama)')}
        </div>
        {service.description ? (
          <div
            style={{
              fontSize: 12,
              color: 'var(--text2)',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {service.description}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: 'var(--text2)', fontStyle: 'italic' }}>
            {t('Belum ada deskripsi')}
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        style={{
          padding: '8px 10px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          borderTop: '1px solid var(--border)',
          background: 'var(--bg3)',
        }}
      >
        <span
          style={{
            fontSize: 11,
            color: service.is_published ? 'var(--accent3)' : 'var(--text2)',
            fontWeight: 500,
          }}
        >
          {service.is_published ? t('● Aktif') : t('○ Tersembunyi')}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <IconBtn
            onClick={(e) => {
              e.stopPropagation()
              onTogglePublish()
            }}
            title={service.is_published ? t('Sembunyikan') : t('Tampilkan')}
            color={service.is_published ? 'var(--accent3)' : 'var(--text2)'}
          >
            {service.is_published ? '●' : '○'}
          </IconBtn>
          <IconBtn
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            title={t('Hapus')}
            color="#ff6b6b"
          >
            ×
          </IconBtn>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Edit modal — full per-service form (name, description, media,
// CTA, learn-more) inside a centred overlay. Media uploader sits
// in its own left column for a roomy preview / change / delete
// surface; the right column carries the rest of the form fields.
// ─────────────────────────────────────────────────────────────────
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
  item: BsiService
  /** True when the modal opens as a fresh-create form. Drives
   *  the title ("Tambah" vs "Edit") and hides the publish toggle
   *  (no DB row exists yet to publish). */
  isCreating?: boolean
  fieldValue: <K extends keyof Draft>(item: BsiService, key: K) => Draft[K]
  patchDraft: (patch: Partial<Draft>) => void
  isDirty: boolean
  saving: boolean
  onClose: () => void
  onSave: () => void
  /** Optional — omitted in create mode where there's no row yet. */
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
        {/* Header */}
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
            {/* Active / inactive toggle — only meaningful for an
                existing row. In create mode the row doesn't exist
                yet, so we hide the toggle. The newly-inserted row
                lands as `is_published: false` and the user can
                toggle it from the card after Save. */}
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
                  item.is_published ? 'rgba(67, 217, 162, 0.3)' : 'var(--border)'
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
                  background: item.is_published ? 'var(--accent3)' : 'var(--text2)',
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

        {/* Body — split into two columns: live preview (left) and
            form fields (right). The preview re-renders on every
            keystroke so the admin sees exactly how the row will
            look on the public site. */}
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
          {/* MEDIA — left column. Full-size FileUploader so the
              admin gets a big preview + Ganti / Hapus buttons or a
              dropzone when empty. */}
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
            <FormField label="Media (Image / Video)">
              <FileUploader
                value={fieldValue(item, 'media_url')}
                onChange={(url) => {
                  let mediaType = fieldValue(item, 'media_type')
                  if (url) {
                    if (/\.(mp4|webm|mov)(\?|$)/i.test(url)) mediaType = 'video'
                    else if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/i.test(url))
                      mediaType = 'image'
                  }
                  patchDraft({ media_url: url, media_type: mediaType })
                }}
                prefix="services"
                accept="image+video"
                previewHeight={320}
              />
            </FormField>
          </div>

          {/* FORM — right column */}
          <div
            style={{
              padding: 22,
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: 14,
            }}
          >
            <FormField label={t('Nama Service')}>
              <input
                style={inputStyle}
                value={fieldValue(item, 'name')}
                onChange={(e) => patchDraft({ name: e.target.value })}
              />
            </FormField>

            <FormField label={t('Deskripsi')}>
              <textarea
                style={{ ...textareaStyle, minHeight: 100 }}
                value={fieldValue(item, 'description') ?? ''}
                onChange={(e) => patchDraft({ description: e.target.value })}
                placeholder={t('Deskripsi panjang yang muncul di bawah nama service…')}
              />
            </FormField>

            {/* CTA button always opens the same Start Collaboration
                popup (managed by the public site) — no URL needed
                from the admin. We only ask for the label. */}
            <FormField
              label={t('CTA — Label (otomatis buka popup Start Collaboration)')}
            >
              <input
                style={inputStyle}
                value={fieldValue(item, 'cta_text') ?? ''}
                onChange={(e) => patchDraft({ cta_text: e.target.value })}
                placeholder="Start Collaboration"
              />
            </FormField>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 12,
              }}
            >
              <FormField label="Learn More — Label">
                <input
                  style={inputStyle}
                  value={fieldValue(item, 'learn_more_text') ?? ''}
                  onChange={(e) => patchDraft({ learn_more_text: e.target.value })}
                  placeholder="Recent work"
                />
              </FormField>
              <FormField label="Learn More — URL">
                <input
                  style={inputStyle}
                  value={fieldValue(item, 'learn_more_url') ?? ''}
                  onChange={(e) => patchDraft({ learn_more_url: e.target.value })}
                  placeholder="#portfolio"
                />
              </FormField>
            </div>
          </div>
        </div>

        {/* Footer */}
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
          <ActionButton variant="primary" onClick={onSave} disabled={!isDirty || saving}>
            {saving
              ? t('Menyimpan…')
              : isCreating
                ? t('Tambah Service')
                : t('Simpan perubahan')}
          </ActionButton>
        </div>
      </div>
    </div>
  )
}
