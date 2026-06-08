'use client'

import { useEffect, useState, useCallback } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import JSZip from 'jszip'
import type { NewsItem } from '@/lib/types'
import type { ArticlePreview, BPIContent } from '@/lib/types-design'
import { TemplateIGFeed } from './TemplateIGFeed'
import { useDesignRenderer, useMultiSlideRenderer } from './useDesignRenderer'
import { detectImageRegionBrightness, pickContrastColor } from '@/lib/image-brightness'
import { IG_FEED_COVER, SAMPLE_REGION } from './designConstants'
import { buildSourceData } from './SourceAttribution'
import { CarouselSlide } from './Carousel/CarouselSlide'
import { SLIDE_W, SLIDE_H, buildCitation } from './Carousel/SlideShared'
import { SLIDE_VARIANTS } from './Carousel/variants'
import type { CarouselSlideData } from './Carousel/types'

// Validate that a proxied image URL actually returns a real image. Uses GET
// instead of HEAD so we get content-length too (some images are 1×1 pixel
// placeholders returned with 200 OK). Times out after 4 seconds per request.
async function validateProxiedImage(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return false
    const ct = res.headers.get('content-type') ?? ''
    if (!ct.startsWith('image/')) return false
    const len = Number(res.headers.get('content-length') ?? '0')
    // Filter trivially small responses (1×1 trackers, broken thumbnails)
    if (len > 0 && len < 2000) return false
    return true
  } catch {
    return false
  }
}

const SOURCE_LABEL_FALLBACK: Record<string, string> = {
  gnews_diaspora: 'Google News',
  gnews_mendunia: 'Google News',
  gnews_prestasi: 'Google News',
  gnews_budaya: 'Google News',
  gnews_kuliner: 'Google News',
  gnews_viral: 'Google News',
  youtube_creator: 'Google News',
  youtube_video_indo: 'Google News',
  youtube: 'YouTube',
  bbc_asia: 'BBC Asia',
  aljazeera: 'Al Jazeera',
  cna_asia: 'Channel News Asia',
  reuters_world: 'Reuters',
  gnews_intl: 'Google News',
}

interface FormatOption {
  key: 'ig_feed' | 'ig_story' | 'ig_carousel' | 'video_cover' | 'yt_thumb'
  label: string
  ratio: string
  size: string
  enabled: boolean
}

const FORMATS: FormatOption[] = [
  { key: 'ig_feed', label: 'IG Feed Cover', ratio: '4:5', size: '1080×1350', enabled: true },
  { key: 'ig_carousel', label: 'IG Carousel', ratio: '4:5', size: 'multi-slide', enabled: true },
  { key: 'ig_story', label: 'IG Story', ratio: '9:16', size: '1080×1920', enabled: false },
  { key: 'video_cover', label: 'Video Cover', ratio: '9:16', size: '1080×1920', enabled: false },
  { key: 'yt_thumb', label: 'YouTube Thumb', ratio: '16:9', size: '1280×720', enabled: false },
]

export function DesignGeneratorModal({
  open, onClose, item, article: articleProp, content,
}: {
  open: boolean
  onClose: () => void
  item: NewsItem
  article?: ArticlePreview | null
  content: BPIContent
}) {
  const t = useT()
  const [selectedFormat, setSelectedFormat] = useState<FormatOption['key'] | null>(null)
  const [logoColor, setLogoColor] = useState<'black' | 'white'>('black')
  const [sourceColor, setSourceColor] = useState<'black' | 'white'>('black')
  const [sourceImageUrl, setSourceImageUrl] = useState<string | null>(null)
  const [colorsResolved, setColorsResolved] = useState(false)
  const [article, setArticle] = useState<ArticlePreview | null>(articleProp ?? null)

  // Single-image renderer (IG Feed)
  const single = useDesignRenderer()
  const renderSingle = single.render
  // Multi-slide renderer (Carousel) — destructure stable functions for useEffect deps
  const multi = useMultiSlideRenderer()
  const renderAllSlides = multi.renderAll
  const renderSingleSlide = multi.renderSlide
  const setSlideRef = multi.setSlideRef
  const [refreshingIdx, setRefreshingIdx] = useState<number | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)
  // Per-slide layout variant index (slideIdx → variantIdx within its type's variants array)
  const [slideVariants, setSlideVariants] = useState<Record<number, number>>({})

  // Carousel-specific state
  const [carouselSlides, setCarouselSlides] = useState<CarouselSlideData[] | null>(null)
  const [carouselGenError, setCarouselGenError] = useState<string | null>(null)
  const [carouselGenLoading, setCarouselGenLoading] = useState(false)
  const [previewIdx, setPreviewIdx] = useState(0)
  // Per-slide image map: index → { proxiedUrl, sourceCredit }. Filled after
  // /api/ai/slide-image fetches based on each slide's image_query.
  const [slideImages, setSlideImages] = useState<Record<number, { url: string; credit: string }>>({})
  const [slideImagesReady, setSlideImagesReady] = useState(false)

  // ── Article preview fetch ───────────────────────────────────────
  useEffect(() => {
    if (!open) return
    if (articleProp) { setArticle(articleProp); return }
    if (item.video_id) return
    let cancelled = false
    fetch(`/api/ai/article-preview?url=${encodeURIComponent(item.url)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (!cancelled && data && !data.error) setArticle(data) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [open, item.url, item.video_id, articleProp])

  // ── Source image pool + adaptive color resolution ──────────────
  // We collect MULTIPLE images so each carousel slide can use a different one:
  // - For YouTube: maxres + hq + auto-frames 1.jpg/2.jpg/3.jpg (different moments)
  // - For articles: og:image + all images extracted from article body
  // - PLUS: related-images endpoint for variety from external news (article body cuma 1-2 images often)
  const [imagePool, setImagePool] = useState<string[]>([])  // proxied + validated URLs
  const [poolReady, setPoolReady] = useState(false)         // gate carousel capture

  useEffect(() => {
    if (!open) return
    let cancelled = false
    async function resolve() {
      const candidates: string[] = []
      if (item.video_id) {
        const id = item.video_id
        candidates.push(
          `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
          `https://img.youtube.com/vi/${id}/sddefault.jpg`,
          `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
          `https://img.youtube.com/vi/${id}/1.jpg`,
          `https://img.youtube.com/vi/${id}/2.jpg`,
          `https://img.youtube.com/vi/${id}/3.jpg`,
        )
      } else if (article) {
        if (article.image) candidates.push(article.image)
        if (Array.isArray(article.images)) candidates.push(...article.images)
      }

      // Dedupe primary candidates
      const seen = new Set<string>()
      const primaryProxied: string[] = []
      for (const c of candidates) {
        if (!c || seen.has(c)) continue
        seen.add(c)
        primaryProxied.push(`/api/image-proxy?url=${encodeURIComponent(c)}`)
      }

      // Validate each URL — filter broken (404, CORS errors, non-image content)
      console.log('[design] validating', primaryProxied.length, 'primary images')
      const validated = await Promise.all(primaryProxied.map(validateProxiedImage))
      const validPool = primaryProxied.filter((_, i) => validated[i])
      console.log('[design] valid primary pool:', validPool.length, '/', primaryProxied.length)

      if (cancelled) return
      // If everything failed but we had candidates, fall back to first proxied URL anyway
      const finalPool = validPool.length > 0 ? validPool : primaryProxied.slice(0, 1)
      setImagePool(finalPool)
      const url = finalPool[0] ?? null
      setSourceImageUrl(url)

      if (url) {
        try {
          const [logoLum, srcLum] = await Promise.all([
            detectImageRegionBrightness(url, SAMPLE_REGION.logo, IG_FEED_COVER.width, IG_FEED_COVER.height).catch(() => 0.5),
            detectImageRegionBrightness(url, SAMPLE_REGION.source, IG_FEED_COVER.width, IG_FEED_COVER.height).catch(() => 0.5),
          ])
          if (cancelled) return
          setLogoColor(pickContrastColor(logoLum))
          setSourceColor(pickContrastColor(srcLum))
        } catch {
          if (cancelled) return
          setLogoColor('black')
          setSourceColor('black')
        }
      } else {
        setLogoColor('white')
        setSourceColor('white')
      }
      setColorsResolved(true)
    }
    void resolve()
    return () => { cancelled = true }
  }, [open, item.video_id, article])

  // Mark pool ready as soon as primary validation completes — we no longer
  // attempt external image fetching since it's slow + unreliable. The primary
  // image is reused across slides with DIFFERENT visual treatments per slide
  // type for variety.
  useEffect(() => {
    if (!open) return
    if (!colorsResolved) return
    setPoolReady(true)
  }, [open, colorsResolved])

  // ── Auto-render IG Feed when picked ─────────────────────────────
  useEffect(() => {
    if (selectedFormat === 'ig_feed' && colorsResolved) {
      void renderSingle(IG_FEED_COVER.width, IG_FEED_COVER.height)
    }
  }, [selectedFormat, colorsResolved, renderSingle])

  // ── Generate carousel content when picked ───────────────────────
  const generateCarouselContent = useCallback(async () => {
    setCarouselGenLoading(true)
    setCarouselGenError(null)
    setCarouselSlides(null)
    try {
      const res = await fetch('/api/ai/bpi-carousel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: {
            title: article?.title || item.title,
            summary: item.summary,
            source: SOURCE_LABEL_FALLBACK[item.source] ?? item.source,
            category: content.content_category,
            site_name: article?.site_name ?? null,
            excerpt: article?.excerpt ?? null,
            is_video: Boolean(item.video_id),
            channel_title: item.channel_title ?? null,
            video_id: item.video_id ?? null,
            headline_lines: content.headline_lines,
            caption: content.caption,
            country: content.country,
          },
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal generate carousel'))
      if (!Array.isArray(data.slides) || data.slides.length === 0) {
        throw new Error('No slides returned')
      }
      setCarouselSlides(data.slides)
    } catch (e) {
      setCarouselGenError(e instanceof Error ? e.message : t('Gagal generate carousel'))
    } finally {
      setCarouselGenLoading(false)
    }
  }, [item, article, content])

  useEffect(() => {
    if (selectedFormat === 'ig_carousel' && colorsResolved && !carouselSlides && !carouselGenLoading && !carouselGenError) {
      void generateCarouselContent()
    }
  }, [selectedFormat, colorsResolved, carouselSlides, carouselGenLoading, carouselGenError, generateCarouselContent])

  // ── Fetch per-slide images based on image_query from AI ────────
  // Each slide gets its own image searched via Google News matching the
  // image_query. Excludes already-used images so each slide is unique.
  useEffect(() => {
    if (!carouselSlides) return
    let cancelled = false
    setSlideImages({})
    setSlideImagesReady(false)

    async function fetchAll() {
      const used = new Set<string>()
      const acc: Record<number, { url: string; credit: string }> = {}

      for (let i = 0; i < (carouselSlides?.length ?? 0); i++) {
        if (cancelled) return
        const slide = carouselSlides![i] as CarouselSlideData & { image_query?: string }
        const query = slide.image_query?.trim()
        if (!query) continue

        try {
          const exclude = Array.from(used).join(',')
          const res = await fetch(`/api/ai/slide-image?query=${encodeURIComponent(query)}&exclude=${encodeURIComponent(exclude)}`, {
            signal: AbortSignal.timeout(15000),
          })
          if (!res.ok) continue
          const data = await res.json()
          if (cancelled) return
          if (!data.image) continue
          used.add(data.image)
          acc[i] = {
            url: `/api/image-proxy?url=${encodeURIComponent(data.image)}`,
            credit: `Image Source: ${data.source ?? 'Web'}`,
          }
          // Update progressively so user sees incremental progress
          setSlideImages(prev => ({ ...prev, [i]: acc[i] }))
        } catch {
          // skip this slide, fallback to primary will handle
        }
      }

      if (!cancelled) setSlideImagesReady(true)
    }

    void fetchAll()
    return () => { cancelled = true }
  }, [carouselSlides])

  // ── Auto-capture all carousel slides once content + DOM + per-slide images ready ──
  // Skips capture if we already have rendered PNGs for every slide (cache hit
  // when the user re-picks ig_carousel after going back, or reopens the modal).
  useEffect(() => {
    if (selectedFormat !== 'ig_carousel') return
    if (!carouselSlides || !colorsResolved || !poolReady || !slideImagesReady) return
    const fullyCached = multi.dataUrls.length === carouselSlides.length
      && multi.dataUrls.every(Boolean)
      && multi.state !== 'rendering'
    if (fullyCached) return
    // Slight delay so the DOM nodes mount + images load before capture
    const t = setTimeout(() => {
      void renderAllSlides(carouselSlides.length, SLIDE_W, SLIDE_H)
    }, 600)
    return () => clearTimeout(t)
  }, [selectedFormat, carouselSlides, colorsResolved, poolReady, slideImagesReady, renderAllSlides, multi.dataUrls, multi.state])

  function handleFormatPick(format: FormatOption) {
    if (!format.enabled) return
    setSelectedFormat(format.key)
    setPreviewIdx(0)
  }

  // Closing the modal preserves all generated content so reopening shows the
  // previous design without regenerating. The parent unmounts this component
  // (via key=item.id) when a different article is selected.
  function handleClose() {
    onClose()
  }

  // Going back to the picker also preserves the carousel cache — re-picking
  // ig_carousel will skip regeneration thanks to the auto-render fullyCached guard.
  function handleBackToPicker() {
    setSelectedFormat(null)
    setPreviewIdx(0)
  }

  // Cycle to the next layout variant for the currently-viewed slide and re-render
  // just that slide. Cover stays single-variant (Bentala spec) so this is a no-op
  // for slide 0.
  async function handleCycleVariant(idx: number) {
    if (!carouselSlides) return
    const slide = carouselSlides[idx]
    const variants = SLIDE_VARIANTS[slide.type]
    if (variants.length <= 1) {
      setRefreshError(t('Slide ini hanya punya 1 design'))
      return
    }
    const current = slideVariants[idx] ?? 0
    const nextIdx = (current + 1) % variants.length
    setSlideVariants(prev => ({ ...prev, [idx]: nextIdx }))
    setRefreshError(null)
    setRefreshingIdx(idx)
    try {
      // Wait for the hidden DOM to re-render with the new variant component
      // (and any new <img> inside it to start loading)
      await new Promise(resolve => setTimeout(resolve, 250))
      await renderSingleSlide(idx, SLIDE_W, SLIDE_H)
    } catch (e) {
      setRefreshError(e instanceof Error ? e.message : t('Gagal render variant baru'))
    } finally {
      setRefreshingIdx(null)
    }
  }

  function handleDownloadSingle() {
    if (!single.dataUrl) return
    const a = document.createElement('a')
    a.href = single.dataUrl
    a.download = `bpi-cover-${item.id}-${Date.now()}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  async function handleDownloadCarouselZip() {
    if (multi.dataUrls.length === 0) return
    const zip = new JSZip()
    multi.dataUrls.forEach((url, i) => {
      const base64 = url.split(',')[1]
      if (base64) {
        zip.file(`slide-${String(i + 1).padStart(2, '0')}.png`, base64, { base64: true })
      }
    })
    const blob = await zip.generateAsync({ type: 'blob' })
    const blobUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = `bpi-carousel-${item.id}-${Date.now()}.zip`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 1000)
  }

  function handleDownloadCarouselSlide() {
    const url = multi.dataUrls[previewIdx]
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = `bpi-carousel-${item.id}-slide-${String(previewIdx + 1).padStart(2, '0')}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  if (!open) return null

  const sourceData = buildSourceData(item, article ?? null, SOURCE_LABEL_FALLBACK[item.source] ?? item.source)
  const sourceCreditText = sourceData.platform
    ? `Image Source: ${sourceData.primary} | ${sourceData.platform}`
    : `Image Source: ${sourceData.primary}`

  const carouselReady = multi.state === 'ready' && multi.dataUrls.length > 0

  return (
    <>
      {/* Modal overlay */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 1000,
          background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 24,
          animation: 'fadeIn 0.2s ease',
        }}
      >
        <div
          onClick={e => e.stopPropagation()}
          style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 16, width: '100%', maxWidth: 1100, maxHeight: '94vh',
            display: 'flex', flexDirection: 'column', overflow: 'hidden',
            animation: 'modalIn 0.25s cubic-bezier(0.2, 0.8, 0.2, 1)',
          }}
        >
          {/* Modal header */}
          <div style={{
            padding: '14px 20px', borderBottom: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', gap: 12,
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                ✦ Generate Design
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
                {selectedFormat ? t('Render preview · klik download saat siap') : t('Pilih format design untuk konten ini')}
              </div>
            </div>
            <button
              onClick={handleClose}
              style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'var(--bg3)', border: '1px solid var(--border)',
                color: 'var(--text2)', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>

          {/* Modal body */}
          <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
            {/* Format picker */}
            {!selectedFormat && (
              <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 14 }}>
                {FORMATS.map(fmt => (
                  <button
                    key={fmt.key}
                    onClick={() => handleFormatPick(fmt)}
                    disabled={!fmt.enabled}
                    style={{
                      padding: '20px 16px', borderRadius: 10,
                      background: fmt.enabled ? 'var(--bg3)' : 'rgba(255,255,255,0.02)',
                      border: `1px solid ${fmt.enabled ? 'var(--border)' : 'rgba(255,255,255,0.05)'}`,
                      cursor: fmt.enabled ? 'pointer' : 'not-allowed',
                      textAlign: 'left',
                      display: 'flex', flexDirection: 'column', gap: 6,
                      opacity: fmt.enabled ? 1 : 0.5,
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>
                      {fmt.label}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                      {fmt.ratio} · {fmt.size}
                    </div>
                    {!fmt.enabled && (
                      <span style={{
                        fontSize: 9, fontWeight: 700, color: 'var(--accent)',
                        background: 'rgba(108,99,255,0.12)', padding: '2px 8px',
                        borderRadius: 10, alignSelf: 'flex-start', marginTop: 4,
                      }}>
                        Coming soon
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* IG Feed Cover preview */}
            {selectedFormat === 'ig_feed' && (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{
                  position: 'relative',
                  width: '100%', maxWidth: 480,
                  aspectRatio: '4/5',
                  background: 'var(--bg3)', borderRadius: 8, overflow: 'hidden',
                  border: '1px solid var(--border)',
                  boxShadow: '0 16px 48px -16px rgba(0,0,0,0.6)',
                }}>
                  {single.state === 'rendering' && <SpinnerOverlay label={t('Rendering design...')} />}
                  {single.state === 'ready' && single.dataUrl && (
                    <img src={single.dataUrl} alt="Generated cover"
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  )}
                  {single.state === 'error' && (
                    <ErrorOverlay error={single.error} onRetry={() => renderSingle(IG_FEED_COVER.width, IG_FEED_COVER.height)} />
                  )}
                </div>

                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <SecondaryButton onClick={handleBackToPicker}>← {t('Pilih format lain')}</SecondaryButton>
                  <PrimaryButton disabled={single.state !== 'ready'} onClick={handleDownloadSingle}>
                    ⬇ Download PNG
                  </PrimaryButton>
                </div>
              </div>
            )}

            {/* IG Carousel preview */}
            {selectedFormat === 'ig_carousel' && (
              <div style={{ padding: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                <div style={{
                  position: 'relative',
                  width: '100%', maxWidth: 480,
                  aspectRatio: '4/5',
                  background: 'var(--bg3)', borderRadius: 8, overflow: 'hidden',
                  border: '1px solid var(--border)',
                  boxShadow: '0 16px 48px -16px rgba(0,0,0,0.6)',
                }}>
                  {carouselGenLoading && <SpinnerOverlay label="Generating carousel content..." />}
                  {carouselGenError && (
                    <ErrorOverlay error={carouselGenError} onRetry={generateCarouselContent} />
                  )}
                  {carouselSlides && !slideImagesReady && multi.state === 'idle' && (
                    <SpinnerOverlay label={`${t('Mencari gambar per slide...')} (${Object.keys(slideImages).length}/${carouselSlides.length})`} />
                  )}
                  {carouselSlides && multi.state === 'rendering' && (
                    <SpinnerOverlay label={`Rendering slide ${multi.progress.current}/${multi.progress.total}...`} />
                  )}
                  {carouselSlides && multi.state === 'error' && (
                    <ErrorOverlay error={multi.error} onRetry={() => renderAllSlides(carouselSlides.length, SLIDE_W, SLIDE_H)} />
                  )}
                  {carouselReady && multi.dataUrls[previewIdx] && (
                    <img src={multi.dataUrls[previewIdx]} alt={`Slide ${previewIdx + 1}`}
                      style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
                  )}
                </div>

                {/* Slide navigation */}
                {carouselReady && multi.dataUrls.length > 1 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                    <button
                      onClick={() => setPreviewIdx(i => Math.max(0, i - 1))}
                      disabled={previewIdx === 0}
                      style={navButtonStyle(previewIdx === 0)}
                    >
                      ←
                    </button>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {multi.dataUrls.map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setPreviewIdx(i)}
                          style={{
                            width: i === previewIdx ? 28 : 10,
                            height: 10, borderRadius: 5,
                            background: i === previewIdx ? 'var(--accent)' : 'var(--bg3)',
                            border: '1px solid var(--border)',
                            cursor: 'pointer', padding: 0,
                            transition: 'width 0.2s',
                          }}
                        />
                      ))}
                    </div>
                    <button
                      onClick={() => setPreviewIdx(i => Math.min(multi.dataUrls.length - 1, i + 1))}
                      disabled={previewIdx === multi.dataUrls.length - 1}
                      style={navButtonStyle(previewIdx === multi.dataUrls.length - 1)}
                    >
                      →
                    </button>
                    <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 8 }}>
                      {previewIdx + 1} / {multi.dataUrls.length}
                    </span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <SecondaryButton onClick={handleBackToPicker}>← {t('Pilih format lain')}</SecondaryButton>
                  {carouselReady && (() => {
                    const slide = carouselSlides?.[previewIdx]
                    const variantCount = slide ? SLIDE_VARIANTS[slide.type].length : 0
                    const currentVariant = slideVariants[previewIdx] ?? 0
                    const variantLabel = slide ? SLIDE_VARIANTS[slide.type][currentVariant]?.label : ''
                    return (
                      <>
                        <SecondaryButton
                          onClick={() => handleCycleVariant(previewIdx)}
                          disabled={refreshingIdx !== null || variantCount <= 1}
                        >
                          {refreshingIdx === previewIdx
                            ? `↻ ${t('Mengganti design...')}`
                            : variantCount > 1
                              ? `↻ ${t('Coba design lain')} (${currentVariant + 1}/${variantCount}: ${variantLabel})`
                              : `↻ ${t('Hanya 1 design')}`}
                        </SecondaryButton>
                        <SecondaryButton onClick={handleDownloadCarouselSlide}>
                          ⬇ {t('Download slide ini')}
                        </SecondaryButton>
                        <PrimaryButton onClick={handleDownloadCarouselZip}>
                          ⬇ {t('Download semua (ZIP)')}
                        </PrimaryButton>
                      </>
                    )
                  })()}
                </div>
                {refreshError && (
                  <div style={{
                    marginTop: 4, padding: '8px 12px', borderRadius: 8,
                    background: 'rgba(255,80,80,0.08)', border: '1px solid rgba(255,80,80,0.25)',
                    color: '#ff6b6b', fontSize: 12, maxWidth: 480, textAlign: 'center',
                  }}>
                    {refreshError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Hidden render nodes for IG Feed Cover */}
      <div
        style={{
          position: 'fixed', left: '-99999px', top: 0,
          width: IG_FEED_COVER.width, height: IG_FEED_COVER.height,
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      >
        {open && selectedFormat === 'ig_feed' && colorsResolved && (
          <TemplateIGFeed
            ref={single.nodeRef}
            headline_lines={content.headline_lines}
            contentCategory={content.content_category}
            country={content.country}
            sourceImageUrl={sourceImageUrl}
            sourceData={sourceData}
            logoColor={logoColor}
            sourceColor={sourceColor}
          />
        )}
      </div>

      {/* Hidden render nodes for Carousel — each slide is its own fixed-positioned
          element with explicit dimensions. Ref forwarded directly to the slide's
          outer div so html-to-image captures the actual sized node. */}
      {open && selectedFormat === 'ig_carousel' && colorsResolved && carouselSlides && (
        <>
          {carouselSlides.map((slide, i) => {
            const perSlide = slideImages[i]
            const slideImg = perSlide?.url
              ?? (imagePool.length > 0 ? imagePool[i % imagePool.length] : sourceImageUrl)
            const slideCredit = perSlide?.credit ?? sourceCreditText
            const citation = buildCitation({
              publisher: article?.site_name ?? sourceData.primary,
              articleTitle: article?.title ?? item.title,
            })
            return (
              <div
                key={i}
                style={{
                  position: 'fixed',
                  left: '-99999px',
                  top: i * (SLIDE_H + 40),
                  width: SLIDE_W,
                  height: SLIDE_H,
                  pointerEvents: 'none',
                }}
                aria-hidden="true"
              >
                <CarouselSlide
                  ref={el => setSlideRef(i, el)}
                  data={slide}
                  variantIndex={slideVariants[i] ?? 0}
                  sourceImageUrl={sourceImageUrl}
                  slideImageUrl={slideImg}
                  sourceCredit={slideCredit}
                  logoColor={logoColor}
                  slideIndex={i}
                  slideTotal={carouselSlides.length}
                  citation={citation}
                  contentCategory={content.content_category}
                  country={content.country}
                />
              </div>
            )
          })}
        </>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.97) } to { opacity: 1; transform: scale(1) } }
      `}</style>
    </>
  )
}

// ── Reusable UI primitives ────────────────────────────────────────

function SpinnerOverlay({ label }: { label: string }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 12, color: 'var(--text2)', fontSize: 12,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: '50%',
        border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
        animation: 'spin 0.8s linear infinite',
      }} />
      {label}
    </div>
  )
}

function ErrorOverlay({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  const t = useT()
  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      flexDirection: 'column', gap: 8, padding: 20, textAlign: 'center',
      color: '#ff6b6b', fontSize: 12,
    }}>
      <div style={{ fontSize: 20 }}>⚠</div>
      {t('Render gagal:')} {error}
      <button onClick={onRetry} style={{
        marginTop: 8, padding: '6px 12px',
        background: 'var(--accent)', color: '#fff',
        border: 'none', borderRadius: 6, cursor: 'pointer',
        fontSize: 11, fontWeight: 600,
      }}>
        {t('Coba lagi')}
      </button>
    </div>
  )
}

function PrimaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '10px 22px', borderRadius: 8,
      background: disabled ? 'var(--bg3)' : 'var(--accent)',
      border: `1px solid ${disabled ? 'var(--border)' : 'var(--accent)'}`,
      color: disabled ? 'var(--text2)' : '#fff',
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 12, fontWeight: 700,
      display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  )
}

function SecondaryButton({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      padding: '10px 18px', borderRadius: 8,
      background: 'var(--bg3)', border: '1px solid var(--border)',
      color: 'var(--text)', cursor: disabled ? 'not-allowed' : 'pointer',
      fontSize: 12, fontWeight: 600,
      opacity: disabled ? 0.5 : 1,
    }}>{children}</button>
  )
}

function navButtonStyle(disabled: boolean): React.CSSProperties {
  return {
    width: 36, height: 36, borderRadius: '50%',
    background: 'var(--bg3)', border: '1px solid var(--border)',
    color: disabled ? 'rgba(255,255,255,0.2)' : 'var(--text)',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontSize: 14, fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }
}
