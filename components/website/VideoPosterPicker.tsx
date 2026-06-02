'use client'

import { useEffect, useRef, useState } from 'react'
import { captureVideoFrame, deleteFile } from '@/lib/storage'

interface Props {
  /** Video URLs from which user can choose to capture a frame. */
  videoUrls: string[]
  /** Folder prefix for the uploaded poster. */
  prefix: string
  /** Existing poster URL — replaced when a new frame is captured. */
  currentPoster: string | null
  /** Called with the new poster URL after a successful capture+upload. */
  onPosterChange: (url: string) => void
  /** Called to close the modal. */
  onClose: () => void
}

export function VideoPosterPicker({
  videoUrls,
  prefix,
  currentPoster,
  onPosterChange,
  onClose,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [activeUrl, setActiveUrl] = useState(videoUrls[0] ?? '')
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isReady, setIsReady] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset ready state when active video changes — onLoadedMetadata fires again.
  useEffect(() => {
    setIsReady(false)
    setCurrentTime(0)
    setDuration(0)
  }, [activeUrl])

  function handleSeek(t: number) {
    const video = videoRef.current
    if (!video) return
    video.currentTime = Math.min(Math.max(t, 0), video.duration || 0)
  }

  async function handleCapture() {
    const video = videoRef.current
    if (!video) return
    setCapturing(true)
    setError(null)
    try {
      // Wait for any pending seek to settle so the captured frame matches the slider.
      if (video.seeking) {
        await new Promise<void>((resolve) => {
          const onSeeked = () => {
            video.removeEventListener('seeked', onSeeked)
            resolve()
          }
          video.addEventListener('seeked', onSeeked)
        })
      }

      const result = await captureVideoFrame(video, prefix)

      // Best-effort cleanup of previous poster, ignoring failure.
      if (currentPoster) void deleteFile(currentPoster)

      onPosterChange(result.url)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCapturing(false)
    }
  }

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
          width: '100%',
          maxWidth: 720,
          maxHeight: '90vh',
          overflow: 'hidden',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
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
          }}
        >
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)' }}>Pilih Frame untuk Poster</div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              Geser slider ke frame yang diinginkan, lalu klik &quot;Set sebagai Poster&quot;
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
            }}
          >
            ×
          </button>
        </div>

        <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
          {videoUrls.length > 1 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {videoUrls.map((url, idx) => (
                <button
                  key={url}
                  type="button"
                  onClick={() => setActiveUrl(url)}
                  style={{
                    height: 30,
                    padding: '0 12px',
                    borderRadius: 6,
                    background: activeUrl === url ? 'var(--accent)' : 'var(--bg3)',
                    color: activeUrl === url ? '#fff' : 'var(--text2)',
                    border: '1px solid var(--border)',
                    fontSize: 11,
                    fontWeight: 500,
                    cursor: 'pointer',
                  }}
                >
                  Video {idx + 1}
                </button>
              ))}
            </div>
          )}

          <div
            style={{
              width: '100%',
              aspectRatio: '16 / 9',
              background: '#000',
              borderRadius: 8,
              overflow: 'hidden',
            }}
          >
            <video
              ref={videoRef}
              key={activeUrl}
              src={activeUrl}
              crossOrigin="anonymous"
              muted
              playsInline
              preload="auto"
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              onLoadedMetadata={(e) => {
                const v = e.currentTarget
                setDuration(v.duration || 0)
                setIsReady(true)
              }}
              onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
              onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text2)' }}>
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
            <input
              type="range"
              min={0}
              max={duration || 0}
              step={0.01}
              value={currentTime}
              onChange={(e) => handleSeek(Number(e.target.value))}
              disabled={!isReady}
              style={{
                width: '100%',
                accentColor: 'var(--accent)',
                cursor: isReady ? 'pointer' : 'not-allowed',
              }}
            />
            <div style={{ display: 'flex', gap: 6 }}>
              <SkipButton onClick={() => handleSeek(currentTime - 1)} label="-1s" disabled={!isReady} />
              <SkipButton onClick={() => handleSeek(currentTime - 0.1)} label="-0.1s" disabled={!isReady} />
              <SkipButton onClick={() => handleSeek(currentTime + 0.1)} label="+0.1s" disabled={!isReady} />
              <SkipButton onClick={() => handleSeek(currentTime + 1)} label="+1s" disabled={!isReady} />
            </div>
          </div>

          {error && (
            <div
              style={{
                padding: 10,
                borderRadius: 6,
                background: 'rgba(255,107,107,0.1)',
                border: '1px solid rgba(255,107,107,0.3)',
                color: '#ff6b6b',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}
        </div>

        <div
          style={{
            padding: 14,
            borderTop: '1px solid var(--border)',
            display: 'flex',
            gap: 8,
          }}
        >
          <button
            type="button"
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
            type="button"
            onClick={handleCapture}
            disabled={!isReady || capturing}
            style={{
              flex: 1,
              height: 36,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: capturing ? 'wait' : !isReady ? 'not-allowed' : 'pointer',
              opacity: !isReady || capturing ? 0.6 : 1,
            }}
          >
            {capturing ? 'Mengcapture…' : 'Set sebagai Poster'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SkipButton({ onClick, label, disabled }: { onClick: () => void; label: string; disabled: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: 1,
        height: 28,
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 6,
        color: 'var(--text2)',
        fontSize: 11,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {label}
    </button>
  )
}

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00.0'
  const m = Math.floor(seconds / 60)
  const s = (seconds % 60).toFixed(1).padStart(4, '0')
  return `${m}:${s}`
}
