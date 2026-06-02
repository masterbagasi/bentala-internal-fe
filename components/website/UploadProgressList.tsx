'use client'

import { formatBytes } from '@/lib/storage'

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'done-leaving' | 'error'

export interface UploadEntry {
  id: string
  name: string
  size: number
  type: string
  loaded: number
  speed: number
  status: UploadStatus
  error?: string
  /** Original File so we can retry if the upload fails. */
  file?: File
}

interface Props {
  entries: UploadEntry[]
  onCancel?: (id: string) => void
  onDismiss?: (id: string) => void
  onRetry?: (id: string, file: File) => void
}

export function UploadProgressList({ entries, onCancel, onDismiss, onRetry }: Props) {
  if (entries.length === 0) return null

  const activeCount = entries.filter((e) => e.status === 'uploading' || e.status === 'queued').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {activeCount > 0 && (
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--accent)',
            letterSpacing: '0.04em',
          }}
        >
          Uploading ({activeCount})
        </div>
      )}

      {entries.map((entry) => (
        <UploadRow
          key={entry.id}
          entry={entry}
          onCancel={onCancel}
          onDismiss={onDismiss}
          onRetry={onRetry}
        />
      ))}
    </div>
  )
}

function UploadRow({
  entry,
  onCancel,
  onDismiss,
  onRetry,
}: {
  entry: UploadEntry
  onCancel?: (id: string) => void
  onDismiss?: (id: string) => void
  onRetry?: (id: string, file: File) => void
}) {
  const isImage = entry.type.startsWith('image/')
  const isVideo = entry.type.startsWith('video/')
  const percent = entry.size > 0 ? Math.min(100, (entry.loaded / entry.size) * 100) : 0
  const isDone = entry.status === 'done' || entry.status === 'done-leaving'
  const isLeaving = entry.status === 'done-leaving'
  const isError = entry.status === 'error'
  const isActive = entry.status === 'uploading' || entry.status === 'queued'

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
        padding: 10,
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        opacity: isLeaving ? 0 : 1,
        transform: isLeaving ? 'translateY(-6px) scale(0.97)' : 'translateY(0) scale(1)',
        maxHeight: isLeaving ? 0 : 200,
        marginBottom: isLeaving ? -6 : 0,
        paddingTop: isLeaving ? 0 : 10,
        paddingBottom: isLeaving ? 0 : 10,
        overflow: 'hidden',
        transition:
          'opacity 280ms ease, transform 280ms ease, max-height 280ms ease, margin-bottom 280ms ease, padding 280ms ease',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 6,
          background: 'var(--bg2)',
          color: 'var(--text2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        {isImage ? <ImageIconSvg /> : isVideo ? <VideoIconSvg /> : <FileIconSvg />}
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span
            style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={entry.name}
          >
            {entry.name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>
            {formatBytes(entry.size)}
          </span>
        </div>

        <div
          style={{
            height: 4,
            background: 'var(--bg2)',
            borderRadius: 2,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              height: '100%',
              width: `${percent}%`,
              background: isError ? '#ff6b6b' : isDone ? '#43d9a2' : 'var(--accent)',
              borderRadius: 2,
              transition: 'width 0.15s',
            }}
          />
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: 11,
            color: 'var(--text2)',
          }}
        >
          {isError ? (
            <span style={{ color: '#ff6b6b' }}>{entry.error || 'Gagal upload'}</span>
          ) : isDone ? (
            <span style={{ color: '#43d9a2' }}>Selesai</span>
          ) : (
            <>
              <span>{percent.toFixed(0)}% done</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                {formatSpeed(entry.speed)}
              </span>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
        {isError && onRetry && entry.file && (
          <button
            type="button"
            onClick={() => onRetry(entry.id, entry.file!)}
            title="Coba upload lagi"
            style={{
              height: 26,
              padding: '0 10px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 4,
              fontSize: 11,
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Coba lagi
          </button>
        )}
        {(isActive && onCancel) || (isError && onDismiss) ? (
          <button
            type="button"
            onClick={() => {
              if (isActive && onCancel) onCancel(entry.id)
              else if (isError && onDismiss) onDismiss(entry.id)
            }}
            title={isActive ? 'Batalkan upload' : 'Hapus'}
            style={{
              width: 24,
              height: 24,
              background: 'transparent',
              border: 'none',
              color: 'var(--text2)',
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4,
            }}
          >
            ×
          </button>
        ) : null}
      </div>
    </div>
  )
}

function formatSpeed(bps: number): string {
  if (!Number.isFinite(bps) || bps <= 0) return ''
  if (bps < 1024) return `${bps.toFixed(0)} B/sec`
  if (bps < 1024 * 1024) return `${(bps / 1024).toFixed(0)} KB/sec`
  return `${(bps / 1024 / 1024).toFixed(1)} MB/sec`
}

function ImageIconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="8.5" cy="8.5" r="1.5" />
      <polyline points="21 15 16 10 5 21" />
    </svg>
  )
}

function VideoIconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polygon points="23 7 16 12 23 17 23 7" />
      <rect x="1" y="5" width="15" height="14" rx="2" />
    </svg>
  )
}

function FileIconSvg() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  )
}
