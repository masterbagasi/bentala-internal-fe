'use client'

import { useEffect, useRef, useState } from 'react'
import { uploadFileResumable, uploadFileWithProgress } from '@/lib/storage'
import { UploadProgressList, type UploadEntry } from './UploadProgressList'
import { ConfirmDialog, type ConfirmRequest } from './ConfirmDialog'
import { useT } from '@/lib/i18n/LanguageProvider'

type AcceptKind = 'image' | 'video' | 'image+video' | 'all'

interface Props {
  /** Current file URL — null/empty when no file uploaded yet. */
  value: string | null
  /** Called with the public URL after upload, or null after removal. */
  onChange: (url: string | null) => void
  /** Folder prefix in storage bucket — e.g. 'hero', 'portfolio'. */
  prefix: string
  /** What kind of file to accept. */
  accept?: AcceptKind
  /** Optional label shown above the dropzone. */
  label?: string
  /** Optional helper text shown below dropzone. */
  hint?: string
  /** Height of the preview area in px. Default 200. */
  previewHeight?: number
  /** Compact mode — when true, renders only a single row (file
      name + Ganti / Hapus) instead of the full image/video preview.
      Useful for fields where the full preview would crowd the UI. */
  compact?: boolean
  /** When true, the preview is rendered WITHOUT the inline
      Ganti / Hapus action buttons — the parent renders its own
      action affordances elsewhere (e.g. destinations card's
      bottom row alongside the remove button). The preview becomes
      clickable as a convenience: a click opens the file picker. */
  hideActions?: boolean
  /** Optional mutable ref that FileUploader populates with action
      handlers when `hideActions` is true. The parent can then call
      `actionsRef.current?.change()` / `.remove()` from its own
      buttons to trigger the same flows the inline buttons would
      have run (with the same confirm dialog). */
  actionsRef?: React.MutableRefObject<{
    change: () => void
    remove: () => void
  } | null>
}

const ACCEPT_MAP: Record<AcceptKind, string> = {
  image: 'image/jpeg,image/png,image/webp,image/gif',
  video: 'video/mp4,video/webm,video/quicktime',
  'image+video': 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime',
  all: '*/*',
}

const ACCEPT_LABEL: Record<AcceptKind, string> = {
  image: 'JPG, PNG, WebP, GIF — max 200 MB · 16:9 ratio',
  video: 'MP4, WebM, MOV — max 200 MB · 16:9 ratio',
  'image+video': 'Image or video — max 200 MB · 16:9 ratio',
  all: 'Semua jenis file (video, gambar, PDF, dll.) — max 200 MB',
}

export function FileUploader({
  value,
  onChange,
  prefix,
  accept = 'image',
  label,
  hint,
  previewHeight = 200,
  compact = false,
  hideActions = false,
  actionsRef,
}: Props) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragActive, setDragActive] = useState(false)
  // Compact mode: click on the row opens a centred modal with the
  // full-size file (image or video) so the user can verify the
  // current upload without scrolling back to the inline preview.
  const [preview, setPreview] = useState(false)
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const abortRefs = useRef<Map<string, () => void>>(new Map())
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  const isVideo = !!value && /\.(mp4|webm|mov)(\?|$)/i.test(value)

  async function uploadOne(file: File, existingId?: string) {
    const id = existingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

    if (!existingId) {
      const initial: UploadEntry = {
        id,
        name: file.name,
        size: file.size,
        type: file.type,
        loaded: 0,
        speed: 0,
        status: 'uploading',
        file,
      }
      setEntries((xs) => [...xs, initial])
    } else {
      // Retrying an existing entry — reset progress.
      setEntries((xs) =>
        xs.map((e) =>
          e.id === id ? { ...e, status: 'uploading', loaded: 0, speed: 0, error: undefined } : e,
        ),
      )
    }

    // Files larger than 40 MB go via the resumable (TUS) upload
    // pipeline — chunks of 6 MB each, sidestepping any single-POST
    // limits the server proxy might enforce. Smaller files use the
    // simpler XHR path which has better progress fidelity on tiny
    // uploads. Bucket-level file_size_limit still applies to both.
    const SIZE_THRESHOLD = 40 * 1024 * 1024
    const uploader =
      file.size > SIZE_THRESHOLD ? uploadFileResumable : uploadFileWithProgress

    const { promise, abort } = uploader(file, prefix, (p) => {
      setEntries((xs) =>
        xs.map((e) =>
          e.id === id ? { ...e, loaded: p.loaded, speed: p.speed, status: 'uploading' } : e,
        ),
      )
    })
    abortRefs.current.set(id, abort)

    try {
      const result = await promise
      // Stage 1: mark done — green check shows for 2 seconds.
      setEntries((xs) =>
        xs.map((e) => (e.id === id ? { ...e, loaded: e.size, status: 'done' } : e)),
      )
      // Stage 2: after 2s, trigger leaving animation (CSS transitions on opacity/height).
      setTimeout(() => {
        setEntries((xs) => xs.map((e) => (e.id === id ? { ...e, status: 'done-leaving' } : e)))
        // Stage 3: after CSS transition (~280ms), commit URL to value and remove entry.
        // The new file row uses .rt-file-row-enter to fade-in from the same position.
        setTimeout(() => {
          onChange(result.url)
          setEntries((xs) => xs.filter((e) => e.id !== id))
        }, 300)
      }, 2000)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setEntries((xs) =>
        xs.map((e) => (e.id === id ? { ...e, status: 'error', error: message } : e)),
      )
    } finally {
      abortRefs.current.delete(id)
    }
  }

  async function handleUpload(file: File) {
    setError(null)
    setUploading(true)
    await uploadOne(file)
    setUploading(false)
  }

  function cancelUpload(id: string) {
    abortRefs.current.get(id)?.()
    abortRefs.current.delete(id)
    setEntries((xs) => xs.filter((e) => e.id !== id))
  }

  function dismissEntry(id: string) {
    setEntries((xs) => xs.filter((e) => e.id !== id))
  }

  async function retryUpload(id: string, file: File) {
    setError(null)
    await uploadOne(file, id)
  }

  function handleRemove() {
    // Just clear the reference. The file stays in the gallery and can be
    // permanently deleted there.
    onChange(null)
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    void handleUpload(files[0])
  }

  // Expose change + remove handlers to the parent via `actionsRef`
  // when the inline buttons are hidden. Parent can render its own
  // Ganti / Hapus buttons that call these to trigger the SAME flows
  // the inline buttons would have run (with confirm dialog included).
  useEffect(() => {
    if (!actionsRef) return
    actionsRef.current = {
      change: () => {
        setConfirm({
          title: t('Ganti file?'),
          message:
            t('File yang sekarang akan diganti dengan file baru. File lama tetap di Riwayat.'),
          confirmLabel: t('Ganti'),
          tone: 'warning',
          onConfirm: () => {
            setConfirm(null)
            inputRef.current?.click()
          },
        })
      },
      remove: () => {
        setConfirm({
          title: t('Hapus file?'),
          message:
            t('File akan dilepas dari section ini. File asli tetap aman di Riwayat.'),
          confirmLabel: t('Hapus'),
          tone: 'danger',
          onConfirm: () => {
            setConfirm(null)
            handleRemove()
          },
        })
      },
    }
    return () => {
      if (actionsRef) actionsRef.current = null
    }
  }, [actionsRef])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text2)',
          }}
        >
          {label}
        </label>
      )}

      {value && compact ? (
        <div
          onClick={() => setPreview(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg3)',
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 12,
              color: 'var(--text2)',
            }}
          >
            {/* Inline 36×36 thumbnail of the actual file. For images
                we show the image cropped via object-fit: cover; for
                videos the video element with a poster preview gives
                a similar effect. */}
            <div
              aria-hidden
              style={{
                width: 36,
                height: 36,
                flexShrink: 0,
                borderRadius: 4,
                overflow: 'hidden',
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
              }}
            >
              {isVideo ? (
                <video
                  src={value}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  muted
                  preload="metadata"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={value}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              )}
            </div>
            <span
              title={value}
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {value.split('/').pop()?.split('?')[0] ?? value}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setConfirm({
                  title: t('Ganti file?'),
                  message: t('File yang sekarang akan diganti dengan file baru. File lama tetap di Riwayat.'),
                  confirmLabel: t('Ganti'),
                  tone: 'warning',
                  onConfirm: () => {
                    setConfirm(null)
                    inputRef.current?.click()
                  },
                })
              }}
              disabled={uploading}
              style={{
                padding: '6px 10px',
                background: 'transparent',
                color: 'var(--text)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? 0.6 : 1,
              }}
            >
              {uploading ? '…' : t('Ganti')}
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setConfirm({
                  title: t('Hapus file?'),
                  message: t('File akan dilepas dari section ini. File asli tetap aman di Riwayat.'),
                  confirmLabel: t('Hapus'),
                  tone: 'danger',
                  onConfirm: () => {
                    setConfirm(null)
                    handleRemove()
                  },
                })
              }}
              disabled={uploading}
              style={{
                padding: '6px 10px',
                background: 'transparent',
                color: '#ff6b6b',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 11,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              {t('Hapus')}
            </button>
          </div>
        </div>
      ) : value ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {/* Preview area — image / video only, no overlay buttons.
              Keeps the visual clean so the editor can see the full
              upload without chrome on top of it. When `hideActions`
              is true the preview itself becomes clickable, opening
              the file picker so re-upload still works without
              dedicated buttons. */}
          <div
            onClick={
              hideActions && !uploading
                ? () => inputRef.current?.click()
                : undefined
            }
            style={{
              borderRadius: 8,
              overflow: 'hidden',
              border: '1px solid var(--border)',
              background: 'var(--bg3)',
              height: previewHeight,
              cursor: hideActions && !uploading ? 'pointer' : 'default',
            }}
          >
            {isVideo ? (
              <video src={value} style={{ width: '100%', height: '100%', objectFit: 'cover' }} controls muted />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value} alt="Preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            )}
          </div>

          {/* Ratio hint — sits IMMEDIATELY below the preview (tight
              gap of 6px via the wrapper's gap-8 setting minus the
              negative marginTop here) so the editor visually
              associates the spec with the image they just uploaded.
              Hidden when an error is showing or the parent didn't
              supply a hint. The bottom-of-uploader hint is
              suppressed below for this same value-set state. */}
          {hint && !error && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--text2)',
                opacity: 0.7,
                marginTop: -4,
                lineHeight: 1.4,
              }}
            >
              {hint}
            </div>
          )}

          {/* Action row — Ganti + Hapus sit BELOW the preview as
              compact right-aligned buttons (mirrors the SmallBtn
              pattern used in destination cards so the modal has one
              consistent button language). Hidden entirely when
              `hideActions` is true (parent provides its own action
              affordances). */}
          {!hideActions && (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: t('Ganti file?'),
                  message: t('File yang sekarang akan diganti dengan file baru. File lama tetap di Riwayat.'),
                  confirmLabel: t('Ganti'),
                  tone: 'warning',
                  onConfirm: () => {
                    setConfirm(null)
                    inputRef.current?.click()
                  },
                })
              }
              disabled={uploading}
              style={{
                padding: '6px 12px',
                background: 'transparent',
                color: 'var(--text2)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: uploading ? 'wait' : 'pointer',
                opacity: uploading ? 0.6 : 1,
                transition: 'background 0.15s ease, border-color 0.15s ease, color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (uploading) return
                ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
                ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--text2)'
              }}
            >
              {uploading ? t('Mengganti…') : t('Ganti')}
            </button>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: t('Hapus file?'),
                  message: t('File akan dilepas dari section ini. File asli tetap aman di Riwayat.'),
                  confirmLabel: t('Hapus'),
                  tone: 'danger',
                  onConfirm: () => {
                    setConfirm(null)
                    handleRemove()
                  },
                })
              }
              disabled={uploading}
              style={{
                padding: '6px 12px',
                background: 'rgba(255, 107, 107, 0.08)',
                color: '#ff6b6b',
                border: '1px solid rgba(255, 107, 107, 0.35)',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'background 0.15s ease, border-color 0.15s ease',
              }}
              onMouseEnter={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 107, 107, 0.16)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255, 107, 107, 0.5)'
              }}
              onMouseLeave={(e) => {
                ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255, 107, 107, 0.08)'
                ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255, 107, 107, 0.35)'
              }}
            >
              {t('Hapus')}
            </button>
          </div>
          )}
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragOver={(e) => {
            e.preventDefault()
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragActive(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragActive(false)
            if (!uploading) handleFiles(e.dataTransfer.files)
          }}
          style={{
            height: compact ? 60 : previewHeight,
            display: 'flex',
            flexDirection: compact ? 'row' : 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            border: `${compact ? '1px' : '2px'} dashed ${dragActive ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            background: dragActive ? 'rgba(108,99,255,0.05)' : 'var(--bg3)',
            color: 'var(--text2)',
            cursor: uploading ? 'wait' : 'pointer',
            transition: 'all 0.15s',
            fontSize: compact ? 12 : undefined,
          }}
        >
          {uploading ? (
            <>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <div style={{ fontSize: 12 }}>{t('Mengupload…')}</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  // Cancel any in-flight uploads on this uploader.
                  entries.forEach((entry) => {
                    if (entry.status === 'uploading') cancelUpload(entry.id)
                  })
                }}
                style={{
                  marginTop: 4,
                  height: 26,
                  padding: '0 12px',
                  background: 'var(--bg2)',
                  color: '#ff6b6b',
                  border: '1px solid rgba(255,107,107,0.3)',
                  borderRadius: 6,
                  fontSize: 11,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {t('Batalkan')}
              </button>
            </>
          ) : (
            <>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>
                Click or drag a file here
              </div>
            </>
          )}
        </div>
      )}

      {/* Format / ratio / size hint — rendered BELOW the dropzone so
          it doesn't dominate the empty state, and stays visible after
          a file has been uploaded too. A custom `hint` prop overrides
          the generic ACCEPT_LABEL so the editor can spell out the
          actual spec for that specific uploader (e.g. 16:3 banner). */}
      {!hint && (
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
          {ACCEPT_LABEL[accept]}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MAP[accept]}
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = '' // allow uploading the same file again
        }}
      />

      {entries.length > 0 && (
        <UploadProgressList
          entries={entries}
          onCancel={cancelUpload}
          onDismiss={dismissEntry}
          onRetry={retryUpload}
        />
      )}

      {error && entries.length === 0 && (
        <div style={{ fontSize: 11, color: '#ff6b6b' }}>{error}</div>
      )}
      {/* Bottom hint — only rendered for the EMPTY state (no value
          yet). Once a file is uploaded, the hint moves to sit
          directly under the preview image instead (close visual
          association with the spec it refers to). */}
      {hint && !error && !value && (
        <div style={{ fontSize: 11, color: 'var(--text2)', opacity: 0.7 }}>{hint}</div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes rtFileRowEnter {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .rt-file-row-enter { animation: rtFileRowEnter 320ms ease both; }
      `}</style>

      {confirm && <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />}

      {/* Centred preview modal — only used in compact mode. Click
          on the row's thumbnail / filename opens this so the user
          can verify the current upload at full size. Layout mirrors
          the VideoPreviewModal in hero/page.tsx: header (title +
          close), full-size media in the middle, and Ganti / Hapus
          actions in the footer. */}
      {compact && preview && value && (
        <div
          onClick={() => setPreview(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1000,
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
              maxWidth: 720,
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
                padding: '12px 18px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
                Preview {isVideo ? 'Video' : 'Image'}
              </div>
              <button
                type="button"
                onClick={() => setPreview(false)}
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

            <div
              style={{
                background: '#000',
                maxHeight: '70vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {isVideo ? (
                <video
                  src={value}
                  controls
                  autoPlay
                  style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={value}
                  alt="Preview"
                  style={{ width: '100%', maxHeight: '70vh', objectFit: 'contain' }}
                />
              )}
            </div>

            <div
              style={{
                padding: 14,
                display: 'flex',
                gap: 6,
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    title: t('Ganti file?'),
                    message:
                      t('File yang sekarang akan diganti dengan file baru. File lama tetap di Riwayat.'),
                    confirmLabel: t('Ganti'),
                    tone: 'warning',
                    onConfirm: () => {
                      setConfirm(null)
                      setPreview(false)
                      inputRef.current?.click()
                    },
                  })
                }
                disabled={uploading}
                style={{
                  height: 34,
                  padding: '0 14px',
                  background: 'var(--bg3)',
                  color: 'var(--text)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: uploading ? 'wait' : 'pointer',
                  opacity: uploading ? 0.6 : 1,
                }}
              >
                {t('Ganti')}
              </button>
              <button
                type="button"
                onClick={() =>
                  setConfirm({
                    title: t('Hapus file?'),
                    message:
                      t('File akan dilepas dari section ini. File asli tetap aman di Riwayat.'),
                    confirmLabel: t('Hapus'),
                    tone: 'danger',
                    onConfirm: () => {
                      setConfirm(null)
                      setPreview(false)
                      handleRemove()
                    },
                  })
                }
                style={{
                  height: 34,
                  padding: '0 14px',
                  background: 'rgba(255,107,107,0.15)',
                  color: '#ff6b6b',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {t('Hapus')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

interface MultiProps {
  /** Array of public URLs. */
  value: string[]
  /** Replaces the entire array. */
  onChange: (urls: string[]) => void
  prefix: string
  accept?: AcceptKind
  label?: string
  hint?: string
}

/** Uploader for multiple files (e.g. video background list). */
export function MultiFileUploader({
  value,
  onChange,
  prefix,
  accept = 'video',
  label,
  hint,
}: MultiProps) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<UploadEntry[]>([])
  const abortRefs = useRef<Map<string, () => void>>(new Map())
  // Mirror of `value` so deferred timeouts always append to latest array,
  // even when several uploads finish in quick succession.
  const valueRef = useRef(value)
  valueRef.current = value

  async function uploadOne(file: File, existingId?: string): Promise<string | null> {
    const id = existingId ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${file.name}`

    if (!existingId) {
      setEntries((xs) => [
        ...xs,
        {
          id,
          name: file.name,
          size: file.size,
          type: file.type,
          loaded: 0,
          speed: 0,
          status: 'uploading',
          file,
        },
      ])
    } else {
      setEntries((xs) =>
        xs.map((e) =>
          e.id === id ? { ...e, status: 'uploading', loaded: 0, speed: 0, error: undefined } : e,
        ),
      )
    }

    // Files larger than 40 MB go via the resumable (TUS) upload
    // pipeline — chunks of 6 MB each, sidestepping any single-POST
    // limits the server proxy might enforce. Smaller files use the
    // simpler XHR path which has better progress fidelity on tiny
    // uploads. Bucket-level file_size_limit still applies to both.
    const SIZE_THRESHOLD = 40 * 1024 * 1024
    const uploader =
      file.size > SIZE_THRESHOLD ? uploadFileResumable : uploadFileWithProgress

    const { promise, abort } = uploader(file, prefix, (p) => {
      setEntries((xs) =>
        xs.map((e) =>
          e.id === id ? { ...e, loaded: p.loaded, speed: p.speed, status: 'uploading' } : e,
        ),
      )
    })
    abortRefs.current.set(id, abort)

    try {
      const result = await promise
      // Stage 1: mark done — green check shows for 2 seconds.
      setEntries((xs) =>
        xs.map((e) => (e.id === id ? { ...e, loaded: e.size, status: 'done' } : e)),
      )
      // Stage 2: after 2s, fade out the row.
      setTimeout(() => {
        setEntries((xs) => xs.map((e) => (e.id === id ? { ...e, status: 'done-leaving' } : e)))
        // Stage 3: after CSS transition, append URL to value list (with its
        // own entrance animation) and clear the entry.
        setTimeout(() => {
          if (!valueRef.current.includes(result.url)) {
            onChange([...valueRef.current, result.url])
          }
          setEntries((xs) => xs.filter((e) => e.id !== id))
        }, 300)
      }, 2000)
      return result.url
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      setEntries((xs) =>
        xs.map((e) => (e.id === id ? { ...e, status: 'error', error: message } : e)),
      )
      return null
    } finally {
      abortRefs.current.delete(id)
    }
  }

  async function handleAdd(files: FileList | null) {
    if (!files || files.length === 0) return
    setError(null)
    setUploading(true)

    // Each uploadOne handles appending to value (via valueRef) after the
    // 5-second hold + fade-out animation, so we don't push URLs here.
    for (let i = 0; i < files.length; i++) {
      await uploadOne(files[i])
    }

    setUploading(false)
  }

  function cancelUpload(id: string) {
    abortRefs.current.get(id)?.()
    abortRefs.current.delete(id)
    setEntries((xs) => xs.filter((e) => e.id !== id))
  }

  function dismissEntry(id: string) {
    setEntries((xs) => xs.filter((e) => e.id !== id))
  }

  async function retryUpload(id: string, file: File) {
    setError(null)
    // uploadOne handles appending to value internally after fade-out animation.
    await uploadOne(file, id)
  }

  function handleRemove(idx: number) {
    // Just remove from the list. The file stays in storage and can still be
    // picked again via the gallery.
    onChange(value.filter((_, i) => i !== idx))
  }

  function move(idx: number, delta: number) {
    const next = [...value]
    const target = idx + delta
    if (target < 0 || target >= next.length) return
    const tmp = next[idx]
    next[idx] = next[target]
    next[target] = tmp
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && (
        <label
          style={{
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            color: 'var(--text2)',
          }}
        >
          {label}
        </label>
      )}

      {entries.length > 0 && (
        <UploadProgressList
          entries={entries}
          onCancel={cancelUpload}
          onDismiss={dismissEntry}
          onRetry={retryUpload}
        />
      )}

      {value.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.map((url, idx) => {
            const isVideo = /\.(mp4|webm|mov)(\?|$)/i.test(url)
            return (
              <div
                key={url + idx}
                className="rt-file-row-enter"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: 8,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 40,
                    borderRadius: 4,
                    overflow: 'hidden',
                    background: 'var(--bg2)',
                    flexShrink: 0,
                  }}
                >
                  {isVideo ? (
                    <video src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {url.split('/').pop()}
                </div>
                <button
                  type="button"
                  onClick={() => move(idx, -1)}
                  disabled={idx === 0}
                  title={t('Naik')}
                  style={iconBtnStyle}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(idx, 1)}
                  disabled={idx === value.length - 1}
                  title={t('Turun')}
                  style={iconBtnStyle}
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  title={t('Hapus')}
                  style={{ ...iconBtnStyle, color: '#ff6b6b' }}
                >
                  ×
                </button>
              </div>
            )
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => !uploading && inputRef.current?.click()}
        disabled={uploading}
        style={{
          height: 36,
          padding: '0 14px',
          background: 'var(--bg3)',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          color: 'var(--text2)',
          fontSize: 12,
          cursor: uploading ? 'wait' : 'pointer',
        }}
      >
        {uploading ? t('Mengupload…') : t('+ Tambah File')}
      </button>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT_MAP[accept]}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          handleAdd(e.target.files)
          e.target.value = ''
        }}
      />

      {error && entries.length === 0 && (
        <div style={{ fontSize: 11, color: '#ff6b6b' }}>{error}</div>
      )}
      {hint && !error && <div style={{ fontSize: 11, color: 'var(--text2)', opacity: 0.7 }}>{hint}</div>}
    </div>
  )
}

const iconBtnStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  background: 'var(--bg2)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  color: 'var(--text2)',
  fontSize: 12,
  cursor: 'pointer',
  flexShrink: 0,
}
