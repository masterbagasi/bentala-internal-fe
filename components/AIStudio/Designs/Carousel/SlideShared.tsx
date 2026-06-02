// Shared primitives for the carousel: container, header bar, footer, etc.
// The carousel uses the Bentala visual concept (light bg, blue accent).
// Some dark-theme exports remain for legacy callers and the closing slide.

import { COLOR, FONT_STACK } from '../designConstants'
import { BentalaLogo } from '../BentalaLogo'

export const SLIDE_W = 1080
export const SLIDE_H = 1350
export const SLIDE_MARGIN = 56

// Bentala body-slide layout grid (matches cover spec margins).
export const BENTALA_LEFT = 100      // content x start
export const BENTALA_TOP = 61        // header y
export const BENTALA_CONTENT_W = 880 // body content max width

export const LIGHT_BG = '#FFFFFF'
export const DARK_BG = '#0a0a0a'
export const DARK_SURFACE = '#161616'
export const ACCENT_BLUE = '#0B3DE7'

// Wordmark used across carousel slides — flat, single-line, lowercase wordmark
// styled with Open Sauce 800. The reference uses small caps in top-left ("MALAKA"),
// we use lowercase wordmark "bentala project" with explicit kerning.
export function CarouselBrandMark({ color = 'white' }: { color?: 'white' | 'black' }) {
  return (
    <div style={{
      fontFamily: FONT_STACK,
      fontWeight: 800,
      fontSize: 32,
      lineHeight: 0.94,
      letterSpacing: '-0.022em',
      color,
      textTransform: 'lowercase',
      userSelect: 'none',
    }}>
      <div>bentala</div>
      <div>project</div>
    </div>
  )
}

// Bentala-style top header for body slides: BentalaLogo top-left at the
// canonical (100, 61) position + source attribution top-right with the same
// y-margin, mirroring the cover spec so the header line is consistent
// across the carousel.
export function BentalaSlideHeader({
  sourceCredit, color = 'black',
}: {
  sourceCredit: string
  color?: 'white' | 'black'
}) {
  return (
    <>
      {/* Logo top-left — width 153.3 × height 70 area */}
      <div style={{
        position: 'absolute',
        top: BENTALA_TOP,
        left: BENTALA_LEFT,
        width: 153.3,
        height: 70,
        zIndex: 60,
        display: 'flex',
        alignItems: 'flex-start',
      }}>
        <BentalaLogo color={color} fontSize={37} />
      </div>

      {/* Source attribution top-right — aligned to logo y */}
      <div style={{
        position: 'absolute',
        top: BENTALA_TOP,
        right: BENTALA_LEFT,
        maxWidth: 380,
        textAlign: 'right',
        fontFamily: FONT_STACK,
        fontSize: 18,
        fontWeight: 600,
        lineHeight: 1.2,
        color: color === 'white' ? 'rgba(255,255,255,0.92)' : 'rgba(0,0,0,0.78)',
        zIndex: 60,
      }}>
        {sourceCredit}
      </div>
    </>
  )
}

// Top header bar: brand mark left, slide counter right (e.g., "2/5").
// Legacy header used by slides that haven't migrated to BentalaSlideHeader.
export function SlideHeader({
  index, total, color = 'white',
}: {
  index?: number
  total?: number
  color?: 'white' | 'black'
}) {
  const counterText = (typeof index === 'number' && typeof total === 'number')
    ? `${index + 1}/${total}`
    : null

  return (
    <>
      <div style={{
        position: 'absolute',
        top: SLIDE_MARGIN,
        left: SLIDE_MARGIN,
        zIndex: 60,
      }}>
        <CarouselBrandMark color={color} />
      </div>
      {counterText && (
        <div style={{
          position: 'absolute',
          top: SLIDE_MARGIN,
          right: SLIDE_MARGIN,
          background: 'rgba(255,255,255,0.08)',
          border: '1px solid rgba(255,255,255,0.14)',
          borderRadius: 18,
          padding: '8px 16px',
          fontFamily: FONT_STACK,
          fontSize: 18,
          fontWeight: 700,
          color: color === 'white' ? 'rgba(255,255,255,0.85)' : 'rgba(0,0,0,0.85)',
          letterSpacing: '0.02em',
          zIndex: 60,
        }}>
          {counterText}
        </div>
      )}
    </>
  )
}

// Footer source citation — appears at the very bottom of body slides.
// Uses Bentala canonical 100px horizontal margin to align with header.
export function SlideFooter({ citation, color = 'black' }: { citation?: string; color?: 'white' | 'black' }) {
  if (!citation) return null
  return (
    <div style={{
      position: 'absolute',
      bottom: 56,
      left: BENTALA_LEFT,
      right: BENTALA_LEFT,
      fontFamily: FONT_STACK,
      fontSize: 15,
      fontWeight: 400,
      lineHeight: 1.4,
      color: color === 'white' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)',
      zIndex: 50,
    }}>
      {citation}
    </div>
  )
}

// Build citation string from source data and current date.
export function buildCitation(opts: {
  publisher?: string | null
  articleTitle?: string | null
}): string {
  const today = new Date()
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']
  const dateStr = `${today.getDate()} ${months[today.getMonth()]} ${today.getFullYear()}`
  const publisher = opts.publisher?.trim() || 'Sumber Berita'
  const titlePart = opts.articleTitle ? ` ${opts.articleTitle.trim().slice(0, 80)}.` : ''
  return `Sumber: ${publisher}. (${today.getFullYear()}).${titlePart} Diakses pada ${dateStr}.`
}

// Inline highlight: blue rectangle wrapping a key phrase within a longer title.
export function HighlightedTitle({
  text, highlight, color, highlightFg, highlightBg, fontSize, fontWeight, lineHeight,
}: {
  text: string
  highlight?: string | null
  color: string
  highlightFg: string
  highlightBg: string
  fontSize: number
  fontWeight: number
  lineHeight: number
}) {
  if (!highlight || !text.toLowerCase().includes(highlight.toLowerCase())) {
    return (
      <span style={{ color, fontSize, fontWeight, lineHeight, letterSpacing: '-0.018em', fontFamily: FONT_STACK }}>
        {text}
      </span>
    )
  }
  const idx = text.toLowerCase().indexOf(highlight.toLowerCase())
  const before = text.slice(0, idx)
  const matched = text.slice(idx, idx + highlight.length)
  const after = text.slice(idx + highlight.length)

  return (
    <span style={{ color, fontSize, fontWeight, lineHeight, letterSpacing: '-0.018em', fontFamily: FONT_STACK }}>
      {before}
      <span style={{
        background: highlightBg,
        color: highlightFg,
        padding: '0.06em 0.32em 0.16em',
        boxDecorationBreak: 'clone',
        WebkitBoxDecorationBreak: 'clone',
        borderRadius: 4,
      }}>
        {matched}
      </span>
      {after}
    </span>
  )
}

// Parse simple **bold** markdown into <strong> spans (without using regex .exec()).
export function renderBoldMarkdown(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const segments = text.split(/(\*\*[^*]+\*\*)/g)
  segments.forEach((seg, i) => {
    if (!seg) return
    const m = seg.match(/^\*\*([^*]+)\*\*$/)
    if (m) {
      parts.push(<strong key={i} style={{ fontWeight: 700 }}>{m[1]}</strong>)
    } else {
      parts.push(<span key={i}>{seg}</span>)
    }
  })
  return parts
}

export function ImageSourceCaption({
  text, position = 'bottom-right', color = 'white',
}: {
  text: string
  position?: 'bottom-right' | 'bottom-left' | 'top-right'
  color?: 'white' | 'black'
}) {
  const pos: React.CSSProperties = position === 'bottom-right'
    ? { bottom: 14, right: 18 }
    : position === 'bottom-left'
    ? { bottom: 14, left: 18 }
    : { top: 14, right: 18 }

  return (
    <div
      style={{
        position: 'absolute',
        ...pos,
        fontFamily: FONT_STACK,
        fontSize: 13,
        fontWeight: 700,
        color,
        textShadow: color === 'white' ? '0 1px 6px rgba(0,0,0,0.6)' : 'none',
        zIndex: 4,
        pointerEvents: 'none',
      }}
    >
      {text}
    </div>
  )
}

export const slideRoot = (bg: string): React.CSSProperties => ({
  position: 'relative',
  width: SLIDE_W,
  height: SLIDE_H,
  background: bg,
  fontFamily: FONT_STACK,
  overflow: 'hidden',
  color: COLOR.black,
})

// Backwards-compat: old code used CarouselLogo. Keep alias to SlideHeader's brand mark.
export function CarouselLogo({ color = 'black', top = SLIDE_MARGIN, left = SLIDE_MARGIN }: { color?: 'white' | 'black'; top?: number; left?: number; fontSize?: number }) {
  return (
    <div style={{ position: 'absolute', top, left, zIndex: 60 }}>
      <CarouselBrandMark color={color} />
    </div>
  )
}
