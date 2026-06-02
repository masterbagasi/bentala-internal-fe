import { forwardRef } from 'react'
import { COLOR, FONT_STACK } from '../designConstants'
import {
  HighlightedTitle, renderBoldMarkdown, slideRoot,
  SLIDE_W, ACCENT_BLUE, LIGHT_BG,
  BENTALA_LEFT, BENTALA_TOP, BENTALA_CONTENT_W,
  BentalaSlideHeader, SlideFooter,
} from './SlideShared'
import { BentalaLogo } from '../BentalaLogo'
import type { PointSlideData, CarouselSharedProps } from './types'

type PointProps = { data: PointSlideData } & CarouselSharedProps

// ─── Variant A — Right-edge vertical image strip ────────────────────────────
const RIGHT_W = 380
const SlidePointRightStrip = forwardRef<HTMLDivElement, PointProps>(
  function SlidePointRightStrip(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    const textW = SLIDE_W - BENTALA_LEFT - RIGHT_W - 40
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <BentalaSlideHeader sourceCredit={sourceCredit} color="black" />
        <div style={{
          position: 'absolute', top: 240, left: SLIDE_W - RIGHT_W, width: RIGHT_W, bottom: 0,
          background: ACCENT_BLUE, overflow: 'hidden', zIndex: 2,
        }}>
          {img && <img src={img} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }} />}
        </div>
        <div style={{
          position: 'absolute', top: 230, left: BENTALA_LEFT, width: textW, lineHeight: 1.1, zIndex: 5,
        }}>
          <HighlightedTitle text={data.title} highlight={data.highlight}
            color={COLOR.black} highlightFg={COLOR.white} highlightBg={ACCENT_BLUE}
            fontSize={48} fontWeight={800} lineHeight={1.12} />
        </div>
        <div style={{
          position: 'absolute', top: 480, left: BENTALA_LEFT, width: textW,
          fontFamily: FONT_STACK, fontSize: 25, lineHeight: 1.48, color: 'rgba(0,0,0,0.84)',
          fontWeight: 400, letterSpacing: '-0.003em', zIndex: 5, paddingRight: 16,
        }}>
          {renderBoldMarkdown(data.body)}
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

// ─── Variant B — Left-edge vertical image strip ─────────────────────────────
const SlidePointLeftStrip = forwardRef<HTMLDivElement, PointProps>(
  function SlidePointLeftStrip(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    const LEFT_W = 380
    const textLeft = LEFT_W + 60
    const textW = SLIDE_W - textLeft - BENTALA_LEFT
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        {/* Left image strip starts from top so logo can sit on top of it */}
        <div style={{
          position: 'absolute', top: 0, left: 0, width: LEFT_W, height: '100%',
          background: ACCENT_BLUE, overflow: 'hidden', zIndex: 2,
        }}>
          {img && <img src={img} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }} />}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 200,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, transparent 100%)',
          }} />
        </div>
        {/* Logo on image strip (white) + source on white side (black) */}
        <div style={{
          position: 'absolute', top: BENTALA_TOP, left: 60, width: 153.3, height: 70,
          zIndex: 60, display: 'flex', alignItems: 'flex-start',
        }}>
          <BentalaLogo color="white" fontSize={37} />
        </div>
        <div style={{
          position: 'absolute', top: BENTALA_TOP, right: BENTALA_LEFT, maxWidth: 380,
          textAlign: 'right', fontFamily: FONT_STACK, fontSize: 18, fontWeight: 600,
          lineHeight: 1.2, color: 'rgba(0,0,0,0.78)', zIndex: 60,
        }}>
          {sourceCredit}
        </div>
        <div style={{
          position: 'absolute', top: 240, left: textLeft, width: textW, lineHeight: 1.1, zIndex: 5,
        }}>
          <HighlightedTitle text={data.title} highlight={data.highlight}
            color={COLOR.black} highlightFg={COLOR.white} highlightBg={ACCENT_BLUE}
            fontSize={46} fontWeight={800} lineHeight={1.12} />
        </div>
        <div style={{
          position: 'absolute', top: 470, left: textLeft, width: textW,
          fontFamily: FONT_STACK, fontSize: 25, lineHeight: 1.48, color: 'rgba(0,0,0,0.84)',
          fontWeight: 400, letterSpacing: '-0.003em', zIndex: 5, paddingRight: 24,
        }}>
          {renderBoldMarkdown(data.body)}
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

// ─── Variant C — No image, big title + body, blue accent bar ────────────────
const SlidePointTextOnly = forwardRef<HTMLDivElement, PointProps>(
  function SlidePointTextOnly(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <BentalaSlideHeader sourceCredit={sourceCredit} color="black" />
        {/* Blue accent bar */}
        <div style={{
          position: 'absolute', left: BENTALA_LEFT, top: 240,
          width: 90, height: 8, background: ACCENT_BLUE, borderRadius: 4, zIndex: 4,
        }} />
        <div style={{
          position: 'absolute', top: 280, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          lineHeight: 1.08, zIndex: 5,
        }}>
          <HighlightedTitle text={data.title} highlight={data.highlight}
            color={COLOR.black} highlightFg={COLOR.white} highlightBg={ACCENT_BLUE}
            fontSize={62} fontWeight={800} lineHeight={1.1} />
        </div>
        <div style={{
          position: 'absolute', top: 660, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          fontFamily: FONT_STACK, fontSize: 28, lineHeight: 1.5, color: 'rgba(0,0,0,0.85)',
          fontWeight: 400, letterSpacing: '-0.003em', zIndex: 5,
        }}>
          {renderBoldMarkdown(data.body)}
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

export const SlidePoint = SlidePointRightStrip
export const POINT_VARIANTS = [
  { id: 'right-strip', label: 'Right Strip', component: SlidePointRightStrip },
  { id: 'left-strip', label: 'Left Strip', component: SlidePointLeftStrip },
  { id: 'text-only', label: 'Text Only', component: SlidePointTextOnly },
]
