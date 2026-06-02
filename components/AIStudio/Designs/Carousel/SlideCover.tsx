import { forwardRef } from 'react'
import { COLOR, FONT_STACK, CATEGORY_LABEL_FOR_DESIGN, formatCountry } from '../designConstants'
import { BentalaLogo } from '../BentalaLogo'
import { slideRoot, SLIDE_W, SLIDE_H, LIGHT_BG } from './SlideShared'
import type { CoverSlideData, CarouselSharedProps } from './types'

// Bentala IG cover spec (1080×1350) — refined per design ketentuan:
// - Logo top-left: 153.3 × 70 area at (100, 61)
// - Source top-right: aligned to logo y, margin-right 100, line-height 1.2
// - Image: full-width photo from top to top of bottom shape (hard cut)
// - Bottom black shape: 1080 × 506.4, top edge at y = 843.6
//   • Top padding: 77px (shape top → category text)
//   • Category | Country label, line-height 1.2
//   • Gap: 57px (category → headline)
//   • Headline: max width 842px, line-height 1.2
//   • Bottom padding: 146px (headline bottom → shape bottom)
const SHAPE_HEIGHT = 506.4
const SHAPE_TOP = SLIDE_H - SHAPE_HEIGHT // 843.6
const SHAPE_BG = '#000000'
const SHAPE_TOP_PADDING = 77
const CATEGORY_HEADLINE_GAP = 57
const SHAPE_BOTTOM_PADDING = 146
const HEADER_X = 100
const HEADER_Y = 61
const LOGO_W = 153.3
const LOGO_H = 70
const CONTENT_X = 100
const CONTENT_W = 842

const CATEGORY_FONT_SIZE = 29
const CATEGORY_LINE_HEIGHT = 1.2

// Computed Y positions:
// - Category top = SHAPE_TOP + 77 = 920.6
// - Category visual height ≈ 29 × 1.2 = 34.8
// - Headline top = 920.6 + 34.8 + 57 = 1012.4
// - Headline bottom limit = SLIDE_H - 146 = 1204
// - Available headline height = 191.6 (≈ 3 lines at fontSize 46, line-height 1.2 = 165.6)
const CATEGORY_Y = SHAPE_TOP + SHAPE_TOP_PADDING
const HEADLINE_Y = CATEGORY_Y + CATEGORY_FONT_SIZE * CATEGORY_LINE_HEIGHT + CATEGORY_HEADLINE_GAP
const HEADLINE_BOTTOM_LIMIT = SLIDE_H - SHAPE_BOTTOM_PADDING

export const SlideCover = forwardRef<HTMLDivElement, { data: CoverSlideData } & CarouselSharedProps>(
  function SlideCover(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, contentCategory, country },
    ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    const categoryLabel = contentCategory ? CATEGORY_LABEL_FOR_DESIGN[contentCategory] : ''
    const countryDisplay = country ? formatCountry(country) : ''

    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        {/* Image area — fills from canvas top to top of black shape */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: SLIDE_W,
          height: SHAPE_TOP,
          background: '#1a1a1a',
          overflow: 'hidden',
          zIndex: 1,
        }}>
          {img && (
            <img
              src={img}
              alt=""
              crossOrigin="anonymous"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                objectPosition: 'center 35%',
                display: 'block',
              }}
            />
          )}
          {/* Top scrim so logo + source remain legible on bright photos */}
          <div style={{
            position: 'absolute',
            top: 0, left: 0, right: 0,
            height: 220,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.18) 60%, transparent 100%)',
            pointerEvents: 'none',
          }} />
        </div>

        {/* Logo top-left — 153.3 × 70 at (100, 61) */}
        <div style={{
          position: 'absolute',
          top: HEADER_Y,
          left: HEADER_X,
          width: LOGO_W,
          height: LOGO_H,
          zIndex: 5,
          display: 'flex',
          alignItems: 'flex-start',
        }}>
          <BentalaLogo color="white" fontSize={37} />
        </div>

        {/* Source attribution top-right — aligned to logo y, line-height 1.2 */}
        <div style={{
          position: 'absolute',
          top: HEADER_Y,
          right: HEADER_X,
          maxWidth: 380,
          textAlign: 'right',
          fontFamily: FONT_STACK,
          fontSize: 18,
          fontWeight: 600,
          lineHeight: 1.2,
          color: 'rgba(255,255,255,0.96)',
          textShadow: '0 1px 6px rgba(0,0,0,0.45)',
          zIndex: 5,
        }}>
          {sourceCredit}
        </div>

        {/* Bottom shape — full-width 1080 × 506.4, hard cut */}
        <div style={{
          position: 'absolute',
          left: 0,
          top: SHAPE_TOP,
          width: SLIDE_W,
          height: SHAPE_HEIGHT,
          background: SHAPE_BG,
          zIndex: 4,
        }} />

        {/* Category | Country label — 77px from shape top */}
        {(categoryLabel || countryDisplay) && (
          <div style={{
            position: 'absolute',
            top: CATEGORY_Y,
            left: CONTENT_X,
            width: CONTENT_W,
            fontFamily: FONT_STACK,
            fontSize: CATEGORY_FONT_SIZE,
            lineHeight: CATEGORY_LINE_HEIGHT,
            color: COLOR.white,
            zIndex: 5,
            letterSpacing: '-0.005em',
          }}>
            {categoryLabel && <span style={{ fontWeight: 700 }}>{categoryLabel}</span>}
            {categoryLabel && countryDisplay && (
              <span style={{ fontWeight: 400, padding: '0 10px', opacity: 0.85 }}>|</span>
            )}
            {countryDisplay && <span style={{ fontWeight: 400 }}>{countryDisplay}</span>}
          </div>
        )}

        {/* Headline — exactly 3 lines from data.title_lines (AI guaranteed).
            Per spec: fontSize 46, line-height 1.2.
            3 × 46 × 1.2 = 165.6px (fits in 190.4px headline area). */}
        <div style={{
          position: 'absolute',
          top: HEADLINE_Y,
          left: CONTENT_X,
          width: CONTENT_W,
          maxHeight: HEADLINE_BOTTOM_LIMIT - HEADLINE_Y,
          overflow: 'hidden',
          fontFamily: FONT_STACK,
          fontSize: 46,
          fontWeight: 800,
          lineHeight: 1.2,
          letterSpacing: '-0.022em',
          color: COLOR.white,
          zIndex: 5,
        }}>
          {(data.title_lines && data.title_lines.length > 0
            ? data.title_lines.slice(0, 3)
            : [data.title]
          ).map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>
      </div>
    )
  }
)
