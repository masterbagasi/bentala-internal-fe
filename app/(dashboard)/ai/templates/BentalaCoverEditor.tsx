'use client'

import { useState, useRef, useEffect } from 'react'
import { TemplateIGFeed } from '@/components/AIStudio/Designs/TemplateIGFeed'
import {
  CATEGORY_LABEL_FOR_DESIGN, IG_FEED_COVER, IG_REELS_COVER, IG_FEED_COVER_SPEC,
  COLOR, FONT_STACK,
  formatCountry, type ContentCategoryKey,
} from '@/components/AIStudio/Designs/designConstants'

// Direct-draw fallback using Canvas 2D — used by Download button to produce
// the final PNG without going through html-to-image. The visible preview still
// uses TemplateIGFeed (HTML/CSS) for live editing.
interface CanvasRenderArgs {
  imageDataUrl: string | null
  headlineLines: string[]
  category: string
  country: string
  sourcePrimary: string
  sourcePlatform: string
  logoColor: 'black' | 'white'
  sourceColor: 'black' | 'white'
  shapeColor: string
  shapeTextColor: string
  imagePositionX: number  // 0-100
  imagePositionY: number  // 0-100
  imageScale: number      // 1.0 = cover, >1 = zoom in
  format: 'feed' | 'reels'
}

// 3× pixel density — coordinates stay in 1080×1350 system, output PNG is
// 3240×4050 (~13 megapixel, beyond Full HD). Photos rendered at this density
// stay sharp at full size, and downscaling to 1080×1350 for IG upload still
// looks crisp because of the supersampled pixel data.
// All draw operations (text, drawImage, fillRect) are upscaled automatically
// because we apply ctx.scale(SCALE, SCALE) once after creating the canvas.
const RENDER_SCALE = 3

async function renderCoverToCanvas(args: CanvasRenderArgs): Promise<string> {
  const W = IG_FEED_COVER.width   // 1080
  const innerH = IG_FEED_COVER.height // 1350 — design area
  const isReels = args.format === 'reels'
  const totalH = isReels ? IG_REELS_COVER.height : IG_FEED_COVER.height
  const designTop = isReels ? IG_REELS_COVER.topPadding : 0
  const {
    logoTop, logoLeft, logoWidth, logoHeight, sourceRight,
    shapeHeight, shapePadTop, shapePadX,
    gapCategoryHeadline,
    categoryFontSize, categoryLineHeight,
    headlineFontSize, headlineLineHeight, headlineLetterSpacing,
  } = IG_FEED_COVER_SPEC

  const canvas = document.createElement('canvas')
  // Physical pixel dimensions = logical dimensions × scale factor.
  canvas.width = W * RENDER_SCALE
  canvas.height = totalH * RENDER_SCALE
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  // Scale the drawing context so subsequent draw calls work in 1080×totalH
  // coords while producing 3× pixel density. Also enables high-quality
  // bilinear/bicubic image resampling for the photo background and SVG logo.
  ctx.scale(RENDER_SCALE, RENDER_SCALE)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  // Layer 0: full-canvas blue. Acts as the fallback when no photo is uploaded
  // and as the bg behind the reels top/bottom padding strips.
  ctx.fillStyle = COLOR.blue
  ctx.fillRect(0, 0, W, totalH)

  // Layer 1: photo background.
  //   • reels → fills FULL 1080×1920 (photo bleeds into top/bottom padding).
  //   • feed + transparent/gradient shape → fills full design area 1080×1350
  //     so the see-through shape reveals it.
  //   • feed + solid shape → only above shape (height = innerH − shapeHeight
  //     = 843.6); photo never sits behind a solid wall.
  const isShapeSeeThrough =
    args.shapeColor === 'transparent' || args.shapeColor === SHAPE_BG_BLACK_GRADIENT
  const photoH = isReels
    ? totalH
    : isShapeSeeThrough
      ? innerH
      : innerH - IG_FEED_COVER_SPEC.shapeHeight
  if (args.imageDataUrl) {
    const img = await loadImage(args.imageDataUrl)
    drawImageCover(
      ctx, img, 0, 0, W, photoH,
      args.imagePositionX / 100,
      args.imagePositionY / 100,
      args.imageScale,
    )
  }

  // Translate so the rest of the rendering uses the design-area coordinate
  // system (logo at y=60.6 etc, exactly like the feed format). For feed
  // format designTop=0 so this is a no-op.
  ctx.save()
  ctx.translate(0, designTop)

  // Layer 3: bottom shape (full-bleed). Feed: fixed 506.4 strip at design
  // bottom. Reels: extends 285 below the design bottom to reach the outer
  // canvas bottom — shape's top stays at the same y, so kategori/headline
  // positions don't move. Gradient stops span the full extended shape too.
  //   • 'transparent' → skip fill (photo shows fully through)
  //   • 'black-gradient' → vertical fade (transparent top → black bottom)
  //   • any other color → solid fill
  const shapeY = innerH - shapeHeight
  const shapeFillH = isReels ? shapeHeight + IG_REELS_COVER.bottomPadding : shapeHeight
  if (args.shapeColor === SHAPE_BG_BLACK_GRADIENT) {
    const grad = ctx.createLinearGradient(0, shapeY, 0, shapeY + shapeFillH)
    for (const stop of BLACK_GRADIENT_STOPS) grad.addColorStop(stop.offset, stop.color)
    ctx.fillStyle = grad
    ctx.fillRect(0, shapeY, W, shapeFillH)
  } else if (args.shapeColor !== 'transparent') {
    ctx.fillStyle = args.shapeColor
    ctx.fillRect(0, shapeY, W, shapeFillH)
  }

  // Layer 2a: Logo top-left (Bentala spec box: 141×70 at top=60.6, left=100).
  // SVG natural aspect is 1.73:1 (viewBox 468:270). Render at natural aspect
  // inside the box (height-fit) and center horizontally — matches the
  // preview's `object-fit: contain` so PNG and HTML preview look identical.
  // ?v=3 cache-busts the older broken SVG (mask+base64). Keep in sync with
  // the version in BentalaLogo.tsx.
  const logoImg = await loadImage(`/logos/bentala-${args.logoColor}.svg?v=3`)
  const SVG_ASPECT = 468 / 270
  const drawH = logoHeight
  const drawW = drawH * SVG_ASPECT
  const drawX = logoLeft + (logoWidth - drawW) / 2
  ctx.drawImage(logoImg, drawX, logoTop, drawW, drawH)

  // Layer 2b: Source attribution — vertically centered on logo's center line
  const sourceCenterY = logoTop + logoHeight / 2
  drawSourceAttribution(ctx, W - sourceRight, sourceCenterY, args.sourcePrimary, args.sourcePlatform, args.sourceColor)

  // Layer 3a: Category | Country line (Canva spec: 29px, line-height 1.2)
  let cursorY = shapeY + shapePadTop
  if (args.category || args.country) {
    ctx.fillStyle = args.shapeTextColor
    ctx.textBaseline = 'top'
    ctx.fontKerning = 'none'
    ctx.letterSpacing = '0px'
    // Char-by-char (same reason as headline below — bypass any residual
    // kerning/contextual alternate that the font baked in).
    let x = shapePadX
    const drawCharByChar = (text: string) => {
      for (const ch of text) {
        ctx.fillText(ch, x, cursorY)
        x += ctx.measureText(ch).width
      }
    }
    if (args.category) {
      ctx.font = `700 ${categoryFontSize}px ${FONT_STACK}`
      drawCharByChar(args.category)
    }
    if (args.category && args.country) {
      ctx.font = `400 ${categoryFontSize}px ${FONT_STACK}`
      drawCharByChar(' | ')
    }
    if (args.country) {
      ctx.font = `400 ${categoryFontSize}px ${FONT_STACK}`
      drawCharByChar(args.country)
    }
    // Advance by category line-box height + spec gap (57) before headline
    cursorY += Math.round(categoryFontSize * categoryLineHeight) + gapCategoryHeadline
  }

  // Layer 3b: Headline (3 lines). Open Sauce Bold (700), Canva spec
  // 46pt → 61px, line-height 1.2.
  //
  // CHAR-BY-CHAR rendering: drawing the whole line via ctx.fillText() lets the
  // font's pair-positioning (kerning + contextual alternates) bring "Tu", "Tr",
  // "Ta" too tight, even with fontKerning='none' (some browsers / fonts ignore
  // the flag for shaping). Drawing each character separately and advancing by
  // ctx.measureText(char).width forces strict glyph-by-glyph layout — the
  // single-char measureText return value is the bare advance width with no
  // pair adjustments, so the same code path matches CSS 'font-kerning: none'
  // pixel-for-pixel.
  ctx.fillStyle = args.shapeTextColor
  ctx.font = `700 ${headlineFontSize}px ${FONT_STACK}`
  ctx.textBaseline = 'top'
  ctx.letterSpacing = `${headlineLetterSpacing}px`
  ctx.fontKerning = 'none'
  const lineHeight = headlineFontSize * headlineLineHeight
  for (const line of args.headlineLines) {
    let cursorX = shapePadX
    for (const ch of line) {
      ctx.fillText(ch, cursorX, cursorY)
      cursorX += ctx.measureText(ch).width + headlineLetterSpacing
    }
    cursorY += lineHeight
  }

  // Restore the design-area translate so the canvas dataURL captures the
  // full outer canvas including the reels top/bottom blue padding.
  ctx.restore()

  return canvas.toDataURL('image/png')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Image load failed'))
    img.src = src
  })
}

// Mimic CSS object-fit: cover with object-position (cx, cy in 0..1) and an
// optional zoom factor (scale=1 → exact cover, scale=2 → 2× zoom in / 25% area).
// Pixel-perfect equivalent of TemplateIGFeed's transform/object-position combo.
function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  dx: number, dy: number, dw: number, dh: number,
  cx = 0.5, cy = 0.5,
  scale = 1.0,
) {
  const imgRatio = img.naturalWidth / img.naturalHeight
  const dstRatio = dw / dh
  let sw: number, sh: number
  if (imgRatio > dstRatio) {
    // Image wider than destination → crop sides
    sh = img.naturalHeight
    sw = sh * dstRatio
  } else {
    // Image taller than destination → crop top/bottom
    sw = img.naturalWidth
    sh = sw / dstRatio
  }
  // Zoom by reducing the source crop window — same area, less of it shown.
  if (scale !== 1.0) {
    sw = sw / scale
    sh = sh / scale
  }
  // Position the crop so (cx, cy) of the IMAGE aligns with (cx, cy) of the crop.
  let sx = (img.naturalWidth - sw) * cx
  let sy = (img.naturalHeight - sh) * cy
  // Clamp to image bounds — prevents drawImage from sampling outside the image
  // (which can produce edge artifacts at extreme positions).
  sx = Math.max(0, Math.min(sx, img.naturalWidth - sw))
  sy = Math.max(0, Math.min(sy, img.naturalHeight - sh))
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
}

// Match SourceAttribution: right-aligned text with bold "Image Source: <primary>"
// and optional " | <platform>". `centerY` is the vertical midline (matches the
// preview's flex-centered container).
function drawSourceAttribution(
  ctx: CanvasRenderingContext2D,
  rightX: number, centerY: number,
  primary: string, platform: string,
  color: 'black' | 'white',
) {
  ctx.fillStyle = color === 'white' ? COLOR.white : COLOR.black
  ctx.font = `700 15px ${FONT_STACK}`
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'left'
  ctx.fontKerning = 'none'
  ctx.letterSpacing = '0px'
  // Right-align manually by measuring the full string width and offsetting.
  // Char-by-char draw avoids implicit kerning that the right-aligned native
  // path would re-introduce. measureText sums the per-glyph advance widths,
  // matching the layout produced by the loop below.
  const text = platform
    ? `Image Source: ${primary} | ${platform}`
    : `Image Source: ${primary}`
  let totalWidth = 0
  for (const ch of text) totalWidth += ctx.measureText(ch).width
  let x = rightX - totalWidth
  for (const ch of text) {
    ctx.fillText(ch, x, centerY)
    x += ctx.measureText(ch).width
  }
  ctx.textBaseline = 'top' // reset
}

// Structured editor for the Bentala IG Feed cover layout. User fills in
// source / category / country / headline (3 lines) and uploads an image; the
// preview renders live using the same TemplateIGFeed component as BPI Intelligence.

interface Props {
  onClose: () => void
  /** 'feed' = 1080×1350 IG post, 'reels' = 1080×1920 reels cover */
  format?: 'feed' | 'reels'
}

const COMMON_COUNTRIES = [
  'Indonesia', 'Singapura', 'Malaysia', 'Jepang', 'Korea Selatan', 'Australia',
  'Amerika Serikat', 'Belanda', 'Inggris', 'Jerman', 'Perancis', 'Italia',
  'China', 'Thailand', 'Filipina', 'Vietnam', 'Arab Saudi', 'Uni Eropa',
]

const SOURCE_PLATFORMS = ['', 'YouTube', 'Instagram', 'TikTok', 'Twitter / X', 'Website']

// Color presets for the bottom shape — 3 official Bentala palette colors plus
// a "no fill" option that lets the photo background show through. Each pairs
// background + text with sufficient contrast (transparent uses white text by
// default since photos tend to be mid/dark; user can flip via Source/Logo
// color toggles if needed).
// Sentinel value used to identify the black-gradient preset across both
// TemplateIGFeed (CSS gradient) and renderCoverToCanvas (Canvas 2D
// createLinearGradient). Both render the same vertical fade — transparent
// at the shape top, near-opaque black at the bottom — so a photo background
// stays partially visible while text remains readable.
const SHAPE_BG_BLACK_GRADIENT = 'black-gradient'

const SHAPE_PRESETS: { bg: string; text: string; label: string }[] = [
  { bg: '#FFFFFF', text: '#000000', label: 'Putih' },
  { bg: '#000000', text: '#FFFFFF', label: 'Hitam' },
  { bg: '#0B3DE7', text: '#FFFFFF', label: 'Biru' },
  { bg: 'transparent', text: '#FFFFFF', label: 'Tanpa Warna' },
  { bg: SHAPE_BG_BLACK_GRADIENT, text: '#FFFFFF', label: 'Hitam Gradasi' },
]

// Single source of truth for the gradient stops — used by both CSS and Canvas.
// Pure linear fade: 0% transparent at the shape top → 100% opaque black at
// the bottom. Lets the photo background bleed naturally through the upper
// half while text near the bottom of the shape sits on solid black.
const BLACK_GRADIENT_STOPS: { offset: number; color: string }[] = [
  { offset: 0, color: 'rgba(0,0,0,0)' },
  { offset: 1, color: 'rgba(0,0,0,1)' },
]
const BLACK_GRADIENT_CSS = `linear-gradient(to bottom, ${
  BLACK_GRADIENT_STOPS.map(s => `${s.color} ${s.offset * 100}%`).join(', ')
})`

// Independent text-color picker — same 3 Bentala palette colors. Picking a
// shape preset still pre-fills `shapeTextColor` (auto-contrast), but the
// user can override it freely from this list.
const TEXT_COLOR_PRESETS: { value: string; label: string }[] = [
  { value: '#FFFFFF', label: 'Putih' },
  { value: '#000000', label: 'Hitam' },
  { value: '#0B3DE7', label: 'Biru' },
]

export default function BentalaCoverEditor({ onClose, format = 'feed' }: Props) {
  // Active canvas dimensions based on format
  const isReels = format === 'reels'
  const canvasW = IG_FEED_COVER.width
  const canvasH = isReels ? IG_REELS_COVER.height : IG_FEED_COVER.height
  // Form state
  // Single textarea string; lines are split by newline when rendering.
  const [headline, setHeadline] = useState(
    "Saking Enaknya! Warung\nPadang Ini 'Dilarang Tutup'\noleh Pejabat Singapura"
  )
  // Memoized array of non-empty lines, used by both preview and canvas.
  const headlineLines = headline.split('\n').filter(line => line.trim().length > 0)
  const [category, setCategory] = useState<ContentCategoryKey>('local_go_global')
  const [country, setCountry] = useState('Singapura')
  const [sourcePrimary, setSourcePrimary] = useState('Bule Santun')
  const [sourcePlatform, setSourcePlatform] = useState('YouTube')
  const [imageFile, setImageFile] = useState<string | null>(null)
  // Mirror the image as a blob URL too — html-to-image handles blob URLs more
  // reliably than long base64 data URLs (which can cause SVG-foreignObject
  // capture to silently drop the <img>).
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null)
  const [logoColor, setLogoColor] = useState<'black' | 'white'>('white')
  const [sourceColor, setSourceColor] = useState<'black' | 'white'>('white')
  const [shapeColor, setShapeColor] = useState<string>('#FFFFFF')
  const [shapeTextColor, setShapeTextColor] = useState<string>('#000000')
  // Photo position + scale — defaults match TemplateIGFeed's BPI defaults.
  const [imagePosX, setImagePosX] = useState(50)  // 0-100
  const [imagePosY, setImagePosY] = useState(35)  // 0-100
  const [imageScale, setImageScale] = useState(1.0)  // 1.0-3.0
  // Drag-to-pan state — pointer down captures position, move updates pos%.
  const dragStateRef = useRef<{ x: number; y: number; posX: number; posY: number } | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  const [rendering, setRendering] = useState(false)
  const [renderError, setRenderError] = useState<string | null>(null)
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  // Scale for the large preview modal — recomputed on viewport resize so the
  // cover fits within ~85% of the visible area without scrollbars.
  const [previewScale, setPreviewScale] = useState(0.6)
  const fileRef = useRef<HTMLInputElement>(null)

  // Compute popup scale when it opens or viewport changes.
  useEffect(() => {
    if (!previewOpen) return
    const compute = () => {
      const maxH = window.innerHeight * 0.85
      const maxW = window.innerWidth * 0.85
      const sH = maxH / canvasH
      const sW = maxW / canvasW
      setPreviewScale(Math.min(sH, sW))
    }
    compute()
    window.addEventListener('resize', compute)
    // ESC key closes the popup
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setPreviewOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('resize', compute)
      window.removeEventListener('keydown', onKey)
    }
  }, [previewOpen])

  function handleFile(file: File | null | undefined) {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('File harus image (jpg/png/webp)')
      return
    }
    // Revoke previous blob URL to prevent memory leak
    if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl)
    // blob: URL is what TemplateIGFeed actually renders (and what html-to-image
    // captures). data URL is kept around as a stable serializable form if we
    // ever need to persist the upload.
    const blobUrl = URL.createObjectURL(file)
    setImageBlobUrl(blobUrl)
    const reader = new FileReader()
    reader.onload = () => setImageFile(reader.result as string)
    reader.readAsDataURL(file)
  }

  // Cleanup blob URL on unmount
  useEffect(() => {
    return () => {
      if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    handleFile(e.dataTransfer.files?.[0])
  }

  // ── Drag-to-pan + scroll-to-zoom handlers for the preview area ──
  // Only active when an image is loaded. Modifies imagePosX/Y/scale state.
  function handlePreviewMouseDown(e: React.MouseEvent) {
    if (!imageFile) return
    e.preventDefault()
    dragStateRef.current = { x: e.clientX, y: e.clientY, posX: imagePosX, posY: imagePosY }
    setIsDragging(true)
  }
  function handlePreviewMouseMove(e: React.MouseEvent) {
    const start = dragStateRef.current
    if (!start) return
    // Sensitivity: dividing by scale gives a constant feel — at 2× zoom each
    // pixel of drag should move the position by half (because the viewport
    // is showing half the image). 0.45 is tuned for the 340px scaled preview.
    const dx = (e.clientX - start.x) * (0.45 / imageScale)
    const dy = (e.clientY - start.y) * (0.45 / imageScale)
    // Drag right → image visually shifts right → showing more of the LEFT side
    // → object-position X should DECREASE. Same for Y.
    const newX = clamp(start.posX - dx, 0, 100)
    const newY = clamp(start.posY - dy, 0, 100)
    setImagePosX(newX)
    setImagePosY(newY)
  }
  function handlePreviewMouseUp() {
    dragStateRef.current = null
    setIsDragging(false)
  }
  function handlePreviewWheel(e: React.WheelEvent) {
    if (!imageFile) return
    e.preventDefault()
    // Negative deltaY = scroll up = zoom in, positive = zoom out.
    // 0.001 per wheel unit feels natural on most trackpads + mice.
    const delta = -e.deltaY * 0.002
    const newScale = clamp(imageScale + delta, 1.0, 3.0)
    setImageScale(newScale)
  }

  async function handleDownload() {
    setRendering(true)
    setRenderError(null)
    setDownloadUrl(null)
    try {
      // Wait for fonts to fully load before drawing text. `document.fonts.ready`
      // alone isn't enough — the browser only resolves a font for a given
      // weight+size combo once it's actually been requested. The CSS preview
      // requests sizes scaled by 0.315 (340/1080 zoom), so the canvas's
      // full-resolution sizes (61px headline, 39px category, etc.) might not
      // be in the font cache yet → canvas falls back to system sans-serif and
      // the downloaded PNG won't match the preview. Explicitly load every
      // weight × size combo we draw on canvas.
      if ('fonts' in document) {
        await Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 2000))])
        await Promise.all([
          // Headline (Bold 700, fontSize from spec)
          document.fonts.load(`700 ${IG_FEED_COVER_SPEC.headlineFontSize}px "Open Sauce One"`),
          document.fonts.load(`700 ${IG_FEED_COVER_SPEC.headlineFontSize}px "Open Sauce Sans"`),
          // Kategori (Bold 700)
          document.fonts.load(`700 ${IG_FEED_COVER_SPEC.categoryFontSize}px "Open Sauce One"`),
          document.fonts.load(`700 ${IG_FEED_COVER_SPEC.categoryFontSize}px "Open Sauce Sans"`),
          // Country (Regular 400)
          document.fonts.load(`400 ${IG_FEED_COVER_SPEC.categoryFontSize}px "Open Sauce One"`),
          document.fonts.load(`400 ${IG_FEED_COVER_SPEC.categoryFontSize}px "Open Sauce Sans"`),
          // Source attribution (15px Bold + Regular)
          document.fonts.load(`700 15px "Open Sauce One"`),
          document.fonts.load(`400 15px "Open Sauce One"`),
          document.fonts.load(`700 15px "Open Sauce Sans"`),
          document.fonts.load(`400 15px "Open Sauce Sans"`),
        ])
      }
      // Direct canvas drawing — bypass html-to-image entirely. Reliable
      // for embedding the uploaded photo without SVG-foreignObject quirks.
      const dataUrl = await renderCoverToCanvas({
        // Prefer blob URL when available (faster decode, no size limit). Fall
        // back to data URL if blob isn't ready (rare race after upload).
        imageDataUrl: imageBlobUrl || imageFile,
        headlineLines: headlineLines.map(smartQuotes),
        category: category ? CATEGORY_LABEL_FOR_DESIGN[category] : '',
        country: formatCountry(country),
        sourcePrimary, sourcePlatform,
        logoColor, sourceColor,
        shapeColor, shapeTextColor,
        imagePositionX: imagePosX,
        imagePositionY: imagePosY,
        imageScale,
        format,
      })
      setDownloadUrl(dataUrl)
      // Auto-trigger download
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = `bentala-${isReels ? 'reels' : 'cover'}-${canvasW * RENDER_SCALE}x${canvasH * RENDER_SCALE}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
    } catch (e) {
      setRenderError(e instanceof Error ? e.message : 'Gagal render')
    } finally {
      setRendering(false)
    }
  }

  // Auto-pick logo/source color based on whether image is provided. Image upload
  // = white text/logo (overlay on photo). No image = solid blue → white still ok.
  useEffect(() => {
    if (imageFile) {
      setLogoColor('white')
      setSourceColor('white')
    }
  }, [imageFile])

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
      }}
    >
      <div style={{
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 14, width: '100%', maxWidth: 1100, maxHeight: '95vh',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '14px 20px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
              📐 Bentala {isReels ? 'Reels Cover' : 'Cover Template'}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
              {isReels ? 'IG Reels 1080×1920 (9:16)' : 'IG Feed 1080×1350 (4:5)'}
              {' — '}isi field, preview live, klik download
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>✕</button>
        </div>

        {/* Body — split: form left, preview right */}
        <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 380px', gap: 0, overflow: 'hidden' }}>
          {/* Form */}
          <div style={{ padding: 20, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14, borderRight: '1px solid var(--border)' }}>
            {/* Image upload */}
            <div>
              <label style={labelStyle}>Foto Background</label>
              <div
                onDragOver={e => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileRef.current?.click()}
                style={{
                  padding: imageFile ? 0 : 24, borderRadius: 10,
                  background: 'var(--bg3)',
                  border: imageFile ? '1px solid var(--border)' : '2px dashed var(--border)',
                  textAlign: 'center', cursor: 'pointer', color: 'var(--text2)', fontSize: 12,
                  position: 'relative', overflow: 'hidden',
                }}
              >
                {imageFile ? (
                  <>
                    <img src={imageFile} alt="bg" style={{ width: '100%', maxHeight: 160, objectFit: 'cover', display: 'block' }} />
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        if (imageBlobUrl) URL.revokeObjectURL(imageBlobUrl)
                        setImageFile(null)
                        setImageBlobUrl(null)
                      }}
                      style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', border: 'none', color: '#fff', fontSize: 12, cursor: 'pointer' }}
                    >✕</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>📷</div>
                    <div style={{ fontWeight: 600, color: 'var(--text)' }}>Klik atau drag image</div>
                    <div style={{ fontSize: 10, marginTop: 2 }}>jpg / png / webp</div>
                  </>
                )}
                <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
              </div>
            </div>

            {/* Hint untuk user — drag/scroll dilakukan di preview kanan */}
            {imageFile && (
              <div style={{
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(67,217,162,0.06)', border: '1px solid rgba(67,217,162,0.22)',
                fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap',
              }}>
                <span>
                  💡 <strong style={{ color: 'var(--text)' }}>Drag</strong> foto di preview untuk geser, <strong style={{ color: 'var(--text)' }}>scroll</strong> untuk zoom.
                </span>
                <button
                  onClick={() => { setImagePosX(50); setImagePosY(35); setImageScale(1.0) }}
                  style={{
                    fontSize: 10, fontWeight: 700, color: 'var(--text)',
                    background: 'var(--bg3)', border: '1px solid var(--border)',
                    padding: '4px 10px', borderRadius: 6, cursor: 'pointer',
                  }}
                >Reset posisi</button>
              </div>
            )}

            {/* Source */}
            <div>
              <label style={labelStyle}>Source (Image Source)</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text" value={sourcePrimary} onChange={e => setSourcePrimary(e.target.value)}
                  placeholder="mis. Bule Santun"
                  style={{ ...inputStyle, flex: 2 }}
                />
                <select value={sourcePlatform} onChange={e => setSourcePlatform(e.target.value)} style={{ ...inputStyle, flex: 1, cursor: 'pointer' }}>
                  {SOURCE_PLATFORMS.map(p => <option key={p} value={p}>{p || '— Platform —'}</option>)}
                </select>
              </div>
            </div>

            {/* Category */}
            <div>
              <label style={labelStyle}>Kategori Konten</label>
              <select value={category} onChange={e => setCategory(e.target.value as ContentCategoryKey)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {(Object.keys(CATEGORY_LABEL_FOR_DESIGN) as ContentCategoryKey[]).map(k => (
                  <option key={k} value={k}>{CATEGORY_LABEL_FOR_DESIGN[k]}</option>
                ))}
              </select>
            </div>

            {/* Country */}
            <div>
              <label style={labelStyle}>Negara</label>
              <input
                type="text" value={country} onChange={e => setCountry(e.target.value)}
                list="bentala-country-list" placeholder="mis. Singapura"
                style={inputStyle}
              />
              <datalist id="bentala-country-list">
                {COMMON_COUNTRIES.map(c => <option key={c} value={c} />)}
              </datalist>
            </div>

            {/* Headline — single textarea, baris dipisah dengan Enter */}
            <div>
              <label style={labelStyle}>Headline</label>
              <textarea
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                placeholder={"Saking Enaknya! Warung\nPadang Ini 'Dilarang Tutup'\noleh Pejabat Singapura"}
                rows={3}
                style={{
                  ...inputStyle,
                  height: 'auto',
                  minHeight: 90,
                  padding: '10px 12px',
                  resize: 'vertical',
                  lineHeight: 1.5,
                  fontFamily: 'inherit',
                }}
              />
              <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 4, lineHeight: 1.5 }}>
                💡 Tekan Enter untuk pindah baris. Tiap baris max ~23 char. Total 55-70 char.
                {' · '}<span style={{ fontFamily: 'monospace' }}>{headlineLines.length} baris</span>
              </div>
            </div>

            {/* Logo + Source color */}
            <div style={{ display: 'flex', gap: 10 }}>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Logo Color</label>
                <select value={logoColor} onChange={e => setLogoColor(e.target.value as 'black' | 'white')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={labelStyle}>Source Color</label>
                <select value={sourceColor} onChange={e => setSourceColor(e.target.value as 'black' | 'white')} style={{ ...inputStyle, cursor: 'pointer' }}>
                  <option value="white">White</option>
                  <option value="black">Black</option>
                </select>
              </div>
            </div>

            {/* Shape color — 3 preset Bentala palette + transparent option */}
            <div>
              <label style={labelStyle}>Shape Color (kotak bawah)</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {SHAPE_PRESETS.map(p => {
                  const active = shapeColor.toLowerCase() === p.bg.toLowerCase()
                  const isTransparent = p.bg === 'transparent'
                  const isGradient = p.bg === SHAPE_BG_BLACK_GRADIENT
                  // Pick the right swatch background: solid color, checker
                  // for transparent, or the actual CSS gradient on top of a
                  // light checker so the fade is visible.
                  const swatchBg = isTransparent
                    ? 'repeating-conic-gradient(#3a3d52 0% 25%, #2a2d40 0% 50%) 50% / 8px 8px'
                    : isGradient
                      ? `${BLACK_GRADIENT_CSS}, repeating-conic-gradient(#bbb 0% 25%, #fff 0% 50%) 50% / 6px 6px`
                      : p.bg
                  return (
                    <button
                      key={p.bg}
                      onClick={() => { setShapeColor(p.bg); setShapeTextColor(p.text) }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px 6px 6px', borderRadius: 8,
                        background: active ? 'rgba(67,217,162,0.08)' : 'var(--bg3)',
                        border: `1px solid ${active ? '#43d9a255' : 'var(--border)'}`,
                        color: 'var(--text)', cursor: 'pointer',
                        fontSize: 12, fontWeight: active ? 700 : 500,
                      }}
                    >
                      <span style={{
                        width: 24, height: 24, borderRadius: 5,
                        background: swatchBg,
                        border: p.bg.toLowerCase() === '#ffffff' || isTransparent || isGradient
                          ? '1px solid var(--border)'
                          : 'none',
                        position: 'relative',
                        overflow: 'hidden',
                      }}>
                        {isTransparent && (
                          <span style={{
                            position: 'absolute', top: '50%', left: '-15%', right: '-15%',
                            height: 1.5, background: '#ff5555',
                            transform: 'rotate(-45deg)', transformOrigin: 'center',
                          }} />
                        )}
                      </span>
                      {p.label}
                    </button>
                  )
                })}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 6, fontFamily: 'monospace' }}>
                {shapeColor} bg · {shapeTextColor} text
              </div>
            </div>

            {/* Text color — overrides the auto-pick from shape preset. Useful
                when shapeColor is 'transparent' (foto background) and the
                user needs to flip text color for contrast. */}
            <div>
              <label style={labelStyle}>Text Color (kategori + headline)</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TEXT_COLOR_PRESETS.map(p => {
                  const active = shapeTextColor.toLowerCase() === p.value.toLowerCase()
                  return (
                    <button
                      key={p.value}
                      onClick={() => setShapeTextColor(p.value)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '6px 12px 6px 6px', borderRadius: 8,
                        background: active ? 'rgba(67,217,162,0.08)' : 'var(--bg3)',
                        border: `1px solid ${active ? '#43d9a255' : 'var(--border)'}`,
                        color: 'var(--text)', cursor: 'pointer',
                        fontSize: 12, fontWeight: active ? 700 : 500,
                      }}
                    >
                      <span style={{
                        width: 24, height: 24, borderRadius: 5,
                        background: p.value,
                        border: p.value.toLowerCase() === '#ffffff' ? '1px solid var(--border)' : 'none',
                      }} />
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {renderError && (
              <div style={{ padding: '8px 10px', borderRadius: 6, background: 'rgba(255,82,82,0.08)', border: '1px solid rgba(255,82,82,0.28)', color: '#ff7575', fontSize: 11 }}>
                {renderError}
              </div>
            )}

            <button
              onClick={handleDownload}
              disabled={rendering}
              style={{
                marginTop: 6, padding: '12px 18px', borderRadius: 8, border: 'none',
                background: rendering ? 'var(--bg3)' : '#43d9a2',
                color: rendering ? 'var(--text2)' : '#000',
                fontSize: 13, fontWeight: 700, cursor: rendering ? 'not-allowed' : 'pointer',
              }}
            >
              {rendering ? 'Rendering PNG HD...' : `↓ Download PNG HD (${canvasW * RENDER_SCALE}×${canvasH * RENDER_SCALE})`}
            </button>

            {downloadUrl && !rendering && (
              <a
                href={downloadUrl} download={`bentala-${isReels ? 'reels' : 'cover'}-${canvasW * RENDER_SCALE}x${canvasH * RENDER_SCALE}-${Date.now()}.png`}
                style={{ padding: '10px 14px', borderRadius: 7, background: 'rgba(67,217,162,0.08)', border: '1px solid rgba(67,217,162,0.28)', color: '#43d9a2', fontSize: 11, textAlign: 'center', textDecoration: 'none', fontWeight: 700 }}
              >
                ✓ PNG ready — klik untuk download lagi
              </a>
            )}
          </div>

          {/* Live Preview — visual only, scaled */}
          <div style={{ padding: 20, overflowY: 'auto', background: 'var(--bg)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>
                Live Preview · {canvasW}×{canvasH}
              </div>
              <button
                onClick={() => setPreviewOpen(true)}
                title="Preview besar"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  padding: '4px 10px', borderRadius: 6,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                  color: 'var(--text)', fontSize: 10, fontWeight: 700,
                  cursor: 'pointer', fontFamily: 'inherit',
                }}
              >
                ⛶ Preview
              </button>
            </div>
            <div
              onMouseDown={handlePreviewMouseDown}
              onMouseMove={handlePreviewMouseMove}
              onMouseUp={handlePreviewMouseUp}
              onMouseLeave={handlePreviewMouseUp}
              onWheel={handlePreviewWheel}
              style={{
                width: '100%', aspectRatio: `${canvasW} / ${canvasH}`,
                background: 'var(--bg3)', borderRadius: 10, overflow: 'hidden',
                border: '1px solid var(--border)',
                boxShadow: '0 12px 32px -12px rgba(0,0,0,0.6)',
                position: 'relative',
                cursor: imageFile ? (isDragging ? 'grabbing' : 'grab') : 'default',
                userSelect: 'none',
              }}
            >
              <div style={{
                width: canvasW, height: canvasH,
                transform: `scale(${340 / canvasW})`,
                transformOrigin: 'top left',
                pointerEvents: 'none', // events bubble to wrapper for drag/wheel
              }}>
                <TemplateIGFeed
                  headline_lines={headlineLines.map(smartQuotes)}
                  contentCategory={category}
                  country={country}
                  sourceImageUrl={imageBlobUrl}
                  sourceData={{ primary: sourcePrimary, platform: sourcePlatform }}
                  logoColor={logoColor}
                  sourceColor={sourceColor}
                  shapeColor={shapeColor === SHAPE_BG_BLACK_GRADIENT ? BLACK_GRADIENT_CSS : shapeColor}
                  shapeTextColor={shapeTextColor}
                  imagePositionX={imagePosX}
                  imagePositionY={imagePosY}
                  imageScale={imageScale}
                  format={format}
                />
              </div>

              {/* Position + zoom indicator overlay */}
              {imageFile && (
                <div style={{
                  position: 'absolute', top: 8, right: 8,
                  padding: '4px 10px', borderRadius: 999,
                  background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
                  fontSize: 10, fontFamily: 'monospace', color: '#fff', fontWeight: 600,
                  pointerEvents: 'none',
                }}>
                  {Math.round(imagePosX)}% · {Math.round(imagePosY)}% · {imageScale.toFixed(2)}×
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10, lineHeight: 1.5 }}>
              {imageFile
                ? `💡 Drag foto untuk geser, scroll untuk zoom. Hasil download HD ${canvasW * RENDER_SCALE}×${canvasH * RENDER_SCALE} (3× resolusi).`
                : `💡 Upload foto dulu untuk bisa geser/zoom. Hasil download HD ${canvasW * RENDER_SCALE}×${canvasH * RENDER_SCALE}.`}
            </div>
          </div>
        </div>
      </div>

      {/* Large preview popup — click backdrop or ✕ or ESC to close */}
      {previewOpen && (
        <div
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewOpen(false) }}
          style={{
            position: 'fixed', inset: 0, zIndex: 250,
            background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(10px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{ position: 'relative' }}>
            {/* Close button */}
            <button
              onClick={() => setPreviewOpen(false)}
              title="Close (ESC)"
              style={{
                position: 'absolute', top: -42, right: 0,
                width: 32, height: 32, borderRadius: '50%',
                background: 'rgba(255,255,255,0.12)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#fff', cursor: 'pointer', fontSize: 14,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >✕</button>

            {/* Scaled preview container */}
            <div
              style={{
                width: canvasW * previewScale,
                height: canvasH * previewScale,
                borderRadius: 12,
                overflow: 'hidden',
                boxShadow: '0 32px 100px -24px rgba(0,0,0,0.9)',
              }}
            >
              <div style={{
                width: canvasW,
                height: canvasH,
                transform: `scale(${previewScale})`,
                transformOrigin: 'top left',
              }}>
                <TemplateIGFeed
                  headline_lines={headlineLines.map(smartQuotes)}
                  contentCategory={category}
                  country={country}
                  sourceImageUrl={imageBlobUrl}
                  sourceData={{ primary: sourcePrimary, platform: sourcePlatform }}
                  logoColor={logoColor}
                  sourceColor={sourceColor}
                  shapeColor={shapeColor === SHAPE_BG_BLACK_GRADIENT ? BLACK_GRADIENT_CSS : shapeColor}
                  shapeTextColor={shapeTextColor}
                  imagePositionX={imagePosX}
                  imagePositionY={imagePosY}
                  imageScale={imageScale}
                  format={format}
                />
              </div>
            </div>

            {/* Footer info */}
            <div style={{
              marginTop: 14, textAlign: 'center',
              fontSize: 11, color: 'rgba(255,255,255,0.65)', fontFamily: 'monospace',
            }}>
              {canvasW} × {canvasH} ·
              {' '}render {Math.round(previewScale * 100)}% ·
              {' '}klik luar atau ESC untuk tutup
            </div>
          </div>
        </div>
      )}

    </div>
  )
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v))
}

// Convert straight quotes/apostrophes to typographic (curly) ones — matches
// Canva's behavior. Single quotes: opening '/closing '; double: "/".
// Opening = at string start, after whitespace, or after an opening bracket.
function smartQuotes(text: string): string {
  return text
    // Apostrophe inside a word (don't, it's): always closing curly '
    .replace(/(\w)'(\w)/g, '$1’$2')
    // Single quote opening: start, whitespace, or open-bracket before it
    .replace(/(^|[\s([{<])'/g, '$1‘')
    // Single quote closing: anywhere else (after a letter or punctuation)
    .replace(/'/g, '’')
    // Double quote opening
    .replace(/(^|[\s([{<])"/g, '$1“')
    // Double quote closing
    .replace(/"/g, '”')
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 10, fontWeight: 700,
  color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 5,
}

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '8px 10px', height: 36, borderRadius: 7,
  background: 'var(--bg3)', border: '1px solid var(--border)',
  color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'inherit',
}
