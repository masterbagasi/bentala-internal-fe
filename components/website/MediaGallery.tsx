'use client'

import { useEffect, useState } from 'react'
import { deleteFilesBatch, formatBytes, listFiles, type StoredFile } from '@/lib/storage'
import { useT } from '@/lib/i18n/LanguageProvider'

type FilterKind = 'all' | 'image' | 'video'

interface Props {
  /** Folder in storage to browse, e.g. 'hero', 'portfolio'. */
  prefix: string
  /** Currently selected URL (highlighted in the grid). */
  currentUrl: string | null
  /** Restrict the grid to a specific media kind. */
  filter?: FilterKind
  /** Initial active tab when filter is 'all'. Defaults to 'image'. */
  initialTab?: 'image' | 'video'
  /** Called with the chosen URL when user clicks a thumbnail. Receives whether it's a video. */
  onSelect: (url: string, isVideo: boolean) => void
  /** Called to dismiss the gallery. */
  onClose: () => void
}

export function MediaGallery({
  prefix,
  currentUrl,
  filter = 'all',
  initialTab = 'image',
  onSelect,
  onClose,
}: Props) {
  const t = useT()
  const [files, setFiles] = useState<StoredFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null)
  // Selection mode is opt-in: user clicks "Pilih" to enable checkboxes.
  // Otherwise the gallery behaves like before (click thumbnail = use file).
  const [selectMode, setSelectMode] = useState(false)
  // Selected file paths for bulk delete.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // When non-null, custom confirm dialog is shown for the targeted files.
  const [pendingDelete, setPendingDelete] = useState<StoredFile[] | null>(null)
  const [deleting, setDeleting] = useState(false)

  function exitSelectMode() {
    setSelectMode(false)
    setSelected(new Set())
  }
  // When filter is 'all' the user can switch between Image / Video tabs.
  // When filter is fixed ('image' or 'video'), activeFilter mirrors that.
  const [activeFilter, setActiveFilter] = useState<FilterKind>(
    filter === 'all' ? initialTab : filter,
  )

  function showToast(kind: 'success' | 'error', message: string) {
    setToast({ kind, message })
    window.setTimeout(() => setToast(null), 3000)
  }

  function toggleSelected(path: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await listFiles(prefix)
      setFiles(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefix])

  function requestDelete(files: StoredFile[]) {
    if (files.length === 0) return
    setPendingDelete(files)
  }

  async function executeDelete() {
    if (!pendingDelete || pendingDelete.length === 0) return
    setDeleting(true)

    // Single batched API call instead of one-by-one. Much faster for bulk
    // operations — Supabase Storage handles N paths in one round-trip.
    const targets = pendingDelete
    const { removedPaths, error: batchError } = await deleteFilesBatch(targets.map((f) => f.path))
    const removedSet = new Set(removedPaths)

    if (removedSet.size > 0) {
      setFiles((xs) => xs.filter((x) => !removedSet.has(x.path)))
      setSelected((prev) => {
        const next = new Set(prev)
        removedSet.forEach((p) => next.delete(p))
        return next
      })
    }

    setDeleting(false)
    setPendingDelete(null)

    if (batchError) {
      showToast('error', `${t('Gagal hapus')}: ${batchError}`)
    } else if (removedSet.size === targets.length) {
      showToast(
        'success',
        targets.length === 1
          ? `${t('File')} "${targets[0].name}" ${t('berhasil dihapus')}`
          : `${targets.length} ${t('file berhasil dihapus')}`,
      )
    } else {
      showToast(
        'error',
        `${removedSet.size} ${t('dari')} ${targets.length} ${t('terhapus, sebagian gagal')}`,
      )
    }
    // Modal stays open intentionally.
  }

  const filtered = files.filter((f) => {
    if (activeFilter === 'all') return true
    if (activeFilter === 'image') return !f.isVideo
    if (activeFilter === 'video') return f.isVideo
    return true
  })

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 880,
          // Fixed height so the popup is the same size regardless of how
          // many files are shown — image tab and video tab look identical.
          height: '80vh',
          overflow: 'hidden',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <style>{`
          @keyframes mg-toast-in {
            from { opacity: 0; transform: translate(-50%, -8px); }
            to   { opacity: 1; transform: translate(-50%, 0); }
          }
        `}</style>
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
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>
              {filter === 'image' ? t('Riwayat Gambar') : filter === 'video' ? t('Riwayat Video') : t('Riwayat Media')}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {filter === 'image'
                ? t('Hanya gambar yang pernah Anda upload · klik untuk pilih ulang')
                : filter === 'video'
                ? t('Hanya video yang pernah Anda upload · klik untuk pilih ulang')
                : t('File yang pernah Anda upload · klik untuk pilih ulang')}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              width: 28,
              height: 28,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text2)',
              fontSize: 14,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>

        {filter === 'all' && (
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {(['image', 'video'] as Array<Exclude<FilterKind, 'all'>>).map((f) => {
              const count = files.filter((file) => (f === 'image' ? !file.isVideo : file.isVideo)).length
              const isActive = activeFilter === f
              return (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFilter(f)}
                  style={{
                    flex: 1,
                    height: 44,
                    background: isActive ? 'var(--bg2)' : 'transparent',
                    border: 'none',
                    borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    color: isActive ? 'var(--accent)' : 'var(--text2)',
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    transition: 'all 0.15s',
                  }}
                >
                  {f === 'image' ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2" />
                      <circle cx="8.5" cy="8.5" r="1.5" />
                      <polyline points="21 15 16 10 5 21" />
                    </svg>
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polygon points="23 7 16 12 23 17 23 7" />
                      <rect x="1" y="5" width="15" height="14" rx="2" />
                    </svg>
                  )}
                  {f === 'image' ? 'Image' : 'Video'}
                  <span
                    style={{
                      padding: '1px 6px',
                      background: isActive ? 'var(--accent)' : 'var(--bg3)',
                      color: isActive ? '#fff' : 'var(--text2)',
                      borderRadius: 8,
                      fontSize: 10,
                      fontWeight: 600,
                      minWidth: 18,
                    }}
                  >
                    {count}
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {toast && (
          <div
            style={{
              position: 'absolute',
              top: 70,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 110,
              padding: '10px 16px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              animation: 'mg-toast-in 220ms ease',
              background: toast.kind === 'success' ? 'rgba(67,217,162,0.16)' : 'rgba(255,107,107,0.16)',
              border: `1px solid ${toast.kind === 'success' ? 'rgba(67,217,162,0.5)' : 'rgba(255,107,107,0.5)'}`,
              color: toast.kind === 'success' ? '#43d9a2' : '#ff6b6b',
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              maxWidth: '90%',
            }}
          >
            {toast.kind === 'success' ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            )}
            {toast.message}
          </div>
        )}

        <div style={{ padding: 18, overflow: 'auto', flex: 1 }}>
          {error && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(255,107,107,0.1)',
                border: '1px solid rgba(255,107,107,0.3)',
                color: '#ff6b6b',
                fontSize: 12,
                marginBottom: 12,
              }}
            >
              {error}
            </div>
          )}

          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13, textAlign: 'center', padding: 24 }}>{t('Memuat…')}</div>
          ) : filtered.length === 0 ? (
            <div
              style={{
                padding: 48,
                textAlign: 'center',
                border: '1px dashed var(--border)',
                borderRadius: 12,
                color: 'var(--text2)',
                fontSize: 13,
              }}
            >
              {filter === 'image'
                ? t('Belum ada gambar yang pernah di-upload.')
                : filter === 'video'
                ? t('Belum ada video yang pernah di-upload.')
                : t('Belum ada file yang pernah di-upload di section ini.')}
            </div>
          ) : (
            <>
              {/* Toolbar — same button toggles "Pilih" ↔ "Batalkan" by mode. */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 12,
                  gap: 12,
                  minHeight: 32,
                }}
              >
                {selectMode ? (
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      fontSize: 12,
                      color: 'var(--text)',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        filtered.length > 0 && filtered.every((f) => selected.has(f.path))
                      }
                      ref={(el) => {
                        if (el) {
                          const someSelected = filtered.some((f) => selected.has(f.path))
                          const allSelected = filtered.every((f) => selected.has(f.path))
                          el.indeterminate = someSelected && !allSelected
                        }
                      }}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelected((prev) => {
                            const next = new Set(prev)
                            filtered.forEach((f) => next.add(f.path))
                            return next
                          })
                        } else {
                          setSelected((prev) => {
                            const next = new Set(prev)
                            filtered.forEach((f) => next.delete(f.path))
                            return next
                          })
                        }
                      }}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                    {t('Pilih Semua')}{' '}
                    <span style={{ color: 'var(--text2)' }}>
                      ({selected.size}/{filtered.length})
                    </span>
                  </label>
                ) : (
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>
                    {filtered.length} {t('file')}
                  </span>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {selectMode && selected.size > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        requestDelete(filtered.filter((f) => selected.has(f.path)))
                      }
                      style={{
                        height: 30,
                        padding: '0 14px',
                        background: '#ff6b6b',
                        border: 'none',
                        borderRadius: 6,
                        color: '#fff',
                        fontSize: 12,
                        fontWeight: 500,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                      {t('Hapus')} ({selected.size})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => (selectMode ? exitSelectMode() : setSelectMode(true))}
                    style={{
                      width: 100,
                      height: 30,
                      padding: 0,
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      color: selectMode ? 'var(--text2)' : 'var(--text)',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {selectMode ? t('Batalkan') : t('Pilih')}
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))',
                  gap: 10,
                }}
              >
              {filtered.map((file) => {
                const isCurrent = file.url === currentUrl
                const isSelected = selected.has(file.path)
                return (
                  <div
                    key={file.path}
                    style={{
                      position: 'relative',
                      borderRadius: 8,
                      overflow: 'hidden',
                      border: `2px solid ${isSelected ? '#ff6b6b' : isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                      background: 'var(--bg3)',
                      cursor: 'pointer',
                      transition: 'border-color 0.15s',
                    }}
                    onClick={(e) => {
                      if (selectMode) {
                        e.stopPropagation()
                        toggleSelected(file.path)
                      } else {
                        onSelect(file.url, file.isVideo)
                      }
                    }}
                  >
                    {/* Selection checkbox — only visible in select mode */}
                    {selectMode && (
                      <label
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 6,
                          width: 22,
                          height: 22,
                          background: 'rgba(0,0,0,0.7)',
                          backdropFilter: 'blur(8px)',
                          borderRadius: 4,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          zIndex: 2,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(file.path)}
                          style={{ width: 14, height: 14, cursor: 'pointer', margin: 0 }}
                        />
                      </label>
                    )}
                    <div style={{ aspectRatio: '4 / 3', background: '#000' }}>
                      {file.isVideo ? (
                        <video
                          src={file.url}
                          muted
                          playsInline
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img loading="lazy" decoding="async"
                          src={file.url}
                          alt={file.name}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                      )}
                    </div>

                    {isCurrent && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 6,
                          right: 6,
                          padding: '3px 8px',
                          background: 'var(--accent)',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 700,
                          borderRadius: 4,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {t('Sedang dipakai')}
                      </div>
                    )}

                    {file.isVideo && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 6,
                          left: 6,
                          padding: '2px 6px',
                          background: 'rgba(0,0,0,0.7)',
                          color: '#fff',
                          fontSize: 9,
                          fontWeight: 600,
                          borderRadius: 4,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        Video
                      </div>
                    )}

                    {!selectMode && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        requestDelete([file])
                      }}
                      title={t('Hapus dari storage')}
                      style={{
                        position: 'absolute',
                        bottom: 6,
                        right: 6,
                        width: 28,
                        height: 28,
                        background: 'rgba(255,107,107,0.92)',
                        backdropFilter: 'blur(8px)',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
                      }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background = '#ff5252'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,107,107,0.92)'
                      }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                    )}

                    <div
                      style={{
                        padding: '6px 8px',
                        background: 'var(--bg2)',
                        borderTop: '1px solid var(--border)',
                      }}
                    >
                      <div
                        style={{
                          fontSize: 10,
                          color: 'var(--text2)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                        title={file.name}
                      >
                        {file.name}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--text2)', opacity: 0.7, marginTop: 2 }}>
                        {formatBytes(file.size)}
                      </div>
                    </div>
                  </div>
                )
              })}
              </div>
            </>
          )}
        </div>

        {/* Custom confirm dialog — overlays the gallery without closing it. */}
        {pendingDelete && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(4px)',
              zIndex: 120,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
            onClick={() => !deleting && setPendingDelete(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: '100%',
                maxWidth: 400,
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
                boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 20,
                  background: 'rgba(255,107,107,0.15)',
                  color: '#ff6b6b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 12,
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                  <path d="M10 11v6" />
                  <path d="M14 11v6" />
                </svg>
              </div>
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>
                {t('Hapus')} {pendingDelete.length} {t('file?')}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 16 }}>
                {pendingDelete.length === 1 ? (
                  <>
                    {t('File')} <strong style={{ color: 'var(--text)' }}>{pendingDelete[0].name}</strong>{' '}
                    {t('akan dihapus permanen dari storage. Tidak bisa di-undo.')}
                  </>
                ) : (
                  <>
                    {pendingDelete.length} {t('file akan dihapus permanen dari storage. Tidak bisa di-undo.')}
                  </>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', width: '100%' }}>
                <button
                  type="button"
                  onClick={() => setPendingDelete(null)}
                  disabled={deleting}
                  style={{
                    height: 34,
                    padding: '0 14px',
                    background: 'var(--bg3)',
                    color: 'var(--text)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    fontSize: 12,
                    cursor: deleting ? 'wait' : 'pointer',
                    opacity: deleting ? 0.6 : 1,
                  }}
                >
                  {t('Batal')}
                </button>
                <button
                  type="button"
                  onClick={executeDelete}
                  disabled={deleting}
                  style={{
                    height: 34,
                    padding: '0 16px',
                    background: '#ff6b6b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: deleting ? 'wait' : 'pointer',
                    opacity: deleting ? 0.7 : 1,
                  }}
                >
                  {deleting ? t('Menghapus…') : t('Hapus')}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
