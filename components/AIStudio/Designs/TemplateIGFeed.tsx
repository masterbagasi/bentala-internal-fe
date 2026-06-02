import { forwardRef } from 'react'
import { BentalaLogo } from './BentalaLogo'
import { SourceAttribution, type SourceData } from './SourceAttribution'
import {
  COLOR, FONT_STACK, IG_FEED_COVER, IG_FEED_COVER_SPEC, IG_REELS_COVER,
  CATEGORY_LABEL_FOR_DESIGN,
  formatCountry, type ContentCategoryKey,
} from './designConstants'

export interface IGFeedTemplateProps {
  headline_lines: string[]
  contentCategory: ContentCategoryKey | null
  country: string
  sourceImageUrl: string | null
  sourceData: SourceData
  logoColor: 'black' | 'white'
  sourceColor: 'black' | 'white'
  /** Bottom shape fill color. Default white (matches BPI Intelligence). */
  shapeColor?: string
  /** Text color inside the bottom shape. Default black. */
  shapeTextColor?: string
  /** Photo horizontal position 0-100 (default 50). Like CSS object-position X%. */
  imagePositionX?: number
  /** Photo vertical position 0-100 (default 35). */
  imagePositionY?: number
  /** Photo zoom level — 1.0 = cover, 1.5 = 50% zoom in, etc. Default 1.0. */
  imageScale?: number
  /** 'feed' (1080×1350, default) or 'reels' (1080×1920 with vertical padding) */
  format?: 'feed' | 'reels'
}

export const TemplateIGFeed = forwardRef<HTMLDivElement, IGFeedTemplateProps>(
  function TemplateIGFeed(props, ref) {
    const {
      headline_lines, contentCategory, country,
      sourceImageUrl, sourceData, logoColor, sourceColor,
      shapeColor = COLOR.white,
      shapeTextColor = COLOR.black,
      imagePositionX = 50,
      imagePositionY = 35,
      imageScale = 1.0,
      format = 'feed',
    } = props

    // Outer canvas size depends on format. The internal 1080×1350 design area
    // is the same in both — for reels we just wrap it in a taller blue
    // canvas with topPadding/bottomPadding around it.
    const isReels = format === 'reels'
    const width = IG_FEED_COVER.width
    const outerHeight = isReels ? IG_REELS_COVER.height : IG_FEED_COVER.height
    const designTop = isReels ? IG_REELS_COVER.topPadding : 0
    const innerHeight = IG_FEED_COVER.height
    const {
      logoTop, logoLeft, logoWidth, logoHeight, sourceRight,
      shapeHeight, shapePadTop, shapePadBottom, shapePadX,
      gapCategoryHeadline,
      categoryFontSize, categoryLineHeight,
      headlineFontSize, headlineLineHeight, headlineLetterSpacing,
    } = IG_FEED_COVER_SPEC
    const categoryLabel = contentCategory ? CATEGORY_LABEL_FOR_DESIGN[contentCategory] : ''
    const countryDisplay = formatCountry(country)

    // Photo background layer (or blue fallback). Position differs by format
    // AND by shape color (since transparent / gradient shapes want the photo
    // to show through behind them):
    //   • reels → photo fills the FULL outer canvas (1080×1920).
    //   • feed + transparent/gradient shape → photo fills FULL design area
    //     (1080×1350) so the see-through shape reveals it.
    //   • feed + solid shape → photo only above shape (height = innerHeight
    //     − shapeHeight) so it never sits behind a wall it'd be hidden by.
    const isShapeSeeThrough = shapeColor === 'transparent' || shapeColor.startsWith?.('linear-gradient')
    const photoH = isReels
      ? outerHeight
      : isShapeSeeThrough
        ? innerHeight
        : innerHeight - shapeHeight
    const photoLayer = sourceImageUrl ? (
      <img
        src={sourceImageUrl}
        alt=""
        crossOrigin="anonymous"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height: photoH,
          objectFit: 'cover',
          objectPosition: `${imagePositionX}% ${imagePositionY}%`,
          transform: imageScale !== 1.0 ? `scale(${imageScale})` : undefined,
          transformOrigin: `${imagePositionX}% ${imagePositionY}%`,
          display: 'block',
          zIndex: 0,
        }}
      />
    ) : (
      <div style={{ position: 'absolute', top: 0, left: 0, width, height: photoH, background: COLOR.blue, zIndex: 0 }} />
    )

    // Inner design area (1080×1350) — all logo/source/shape/text positions
    // are relative to this. For reels, we wrap it in a taller outer canvas
    // with the design centered vertically AND the photo at the outer level
    // (so it spans the full 9:16 area, not just the 1350 design strip).
    const designContent = (
      <div
        style={{
          width, height: innerHeight,
          position: isReels ? 'absolute' : 'relative',
          top: isReels ? designTop : undefined,
          left: 0,
          // For reels we let the bottom shape overflow into the bottom blue
          // padding (so the shape reaches canvas bottom). For feed, hidden
          // matches the original behavior — nothing should overflow. Reels
          // doesn't need its own photo here — the outer wrapper renders it.
          overflow: isReels ? 'visible' : 'hidden',
          background: isReels ? 'transparent' : COLOR.blue,
        }}
      >
        {/* Photo only inside design for feed mode. For reels, photo lives in
            the outer wrapper so it fills the full 1920px height. */}
        {!isReels && photoLayer}

        {/* Layer 2: Logo top-left (Bentala spec: 153.3×70 at top=60.6, left=100) */}
        <div
          style={{
            position: 'absolute',
            top: logoTop,
            left: logoLeft,
            zIndex: 2,
          }}
        >
          <BentalaLogo color={logoColor} width={logoWidth} height={logoHeight} />
        </div>

        {/* Layer 2: Source attribution top-right — vertically centered on the
            logo's center line (container spans logoHeight, flex-centers content) */}
        <div
          style={{
            position: 'absolute',
            top: logoTop,
            right: sourceRight,
            height: logoHeight,
            display: 'flex',
            alignItems: 'center',
            zIndex: 2,
          }}
        >
          <SourceAttribution data={sourceData} color={sourceColor} />
        </div>

        {/* Layer 3: Bottom shape — full-bleed kiri/kanan/bawah. In feed mode
            it's a fixed 506.4 strip at the design area's bottom. In reels mode
            we extend it 285px below the design area so it reaches the outer
            canvas bottom (overlapping the bottom padding region). The shape's
            TOP stays at the same y, so kategori/headline positions don't move. */}
        <div
          style={{
            position: 'absolute',
            bottom: isReels ? -IG_REELS_COVER.bottomPadding : 0,
            left: 0,
            right: 0,
            height: isReels ? shapeHeight + IG_REELS_COVER.bottomPadding : shapeHeight,
            background: shapeColor,
            padding: `${shapePadTop}px ${shapePadX}px ${shapePadBottom}px`,
            zIndex: 3,
            boxSizing: 'border-box',
          }}
        >
          {/* Category | Country line — Canva-strict typography:
              fontSize 29, line-height 1.2, letter-spacing 0px. Font features
              reset so preview matches the Canvas-rendered PNG. */}
          {(categoryLabel || countryDisplay) && (
            <div
              style={{
                fontSize: categoryFontSize,
                lineHeight: categoryLineHeight,
                letterSpacing: '0px',
                fontKerning: 'none',
                fontFeatureSettings: 'normal',
                color: shapeTextColor,
                marginBottom: gapCategoryHeadline,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {categoryLabel && (
                <span style={{ fontWeight: 700 }}>{categoryLabel}</span>
              )}
              {categoryLabel && countryDisplay && (
                <span style={{ fontWeight: 400, padding: '0 8px' }}>|</span>
              )}
              {countryDisplay && (
                <span style={{ fontWeight: 400 }}>{countryDisplay}</span>
              )}
            </div>
          )}

          {/* Headline 3 lines — Open Sauce Bold (700). Kerning disabled +
              font-feature-settings reset to 'normal' so the headline doesn't
              inherit `kern` / `liga` / `cv11` from the body styles. This
              keeps the CSS preview pixel-identical to the Canvas-rendered PNG
              (which doesn't expose cv11 / liga via Canvas 2D anyway). */}
          <div
            style={{
              fontSize: headlineFontSize,
              fontWeight: 700,
              lineHeight: headlineLineHeight,
              letterSpacing: `${headlineLetterSpacing}px`,
              fontKerning: 'none',
              fontFeatureSettings: 'normal',
              color: shapeTextColor,
            }}
          >
            {headline_lines.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        </div>
      </div>
    )

    // For feed format, the design IS the canvas. For reels, wrap in a taller
    // outer canvas with the photo filling the full 1080×1920 area, the design
    // centered vertically over it, and the bottom shape extending past the
    // design area to the canvas bottom.
    return (
      <div
        ref={ref}
        style={{
          width, height: outerHeight,
          position: 'relative',
          overflow: 'hidden',
          background: COLOR.blue,
          fontFamily: FONT_STACK,
        }}
      >
        {/* Reels: photo fills the entire 1080×1920 outer canvas, behind the
            design content (which has transparent background in reels mode). */}
        {isReels && photoLayer}
        {designContent}
      </div>
    )
  }
)
