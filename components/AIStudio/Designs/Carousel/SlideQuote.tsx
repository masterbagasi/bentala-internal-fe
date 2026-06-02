import { forwardRef } from 'react'
import { COLOR, FONT_STACK } from '../designConstants'
import {
  slideRoot, ACCENT_BLUE, LIGHT_BG,
  SLIDE_W,
  BENTALA_LEFT, BENTALA_CONTENT_W,
  BentalaSlideHeader, SlideFooter,
} from './SlideShared'
import type { QuoteSlideData, CarouselSharedProps } from './types'

type QuoteProps = { data: QuoteSlideData } & CarouselSharedProps

// ─── Variant A — Oversized blue quote mark + portrait card bottom ───────────
const SlideQuoteMark = forwardRef<HTMLDivElement, QuoteProps>(
  function SlideQuoteMark(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <BentalaSlideHeader sourceCredit={sourceCredit} color="black" />
        <div style={{
          position: 'absolute', top: 220, left: BENTALA_LEFT,
          fontFamily: FONT_STACK, fontSize: 220, fontWeight: 800,
          lineHeight: 0.8, color: ACCENT_BLUE, zIndex: 4,
        }}>“</div>
        <div style={{
          position: 'absolute', top: 360, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          fontFamily: FONT_STACK, fontSize: 36, lineHeight: 1.32, color: COLOR.black,
          fontWeight: 600, fontStyle: 'italic', letterSpacing: '-0.008em', zIndex: 5,
        }}>{data.quote}</div>
        <div style={{
          position: 'absolute', left: BENTALA_LEFT, right: BENTALA_LEFT, bottom: 240,
          display: 'flex', alignItems: 'center', gap: 28, zIndex: 5,
        }}>
          <div style={{
            width: 140, height: 140, background: ACCENT_BLUE, borderRadius: 20,
            overflow: 'hidden', flexShrink: 0,
          }}>
            {img && <img src={img} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: FONT_STACK, fontSize: 28, fontWeight: 800, lineHeight: 1.15, color: COLOR.black, letterSpacing: '-0.012em' }}>
              {data.speaker_name}
            </div>
            <div style={{ fontFamily: FONT_STACK, fontSize: 20, fontWeight: 500, lineHeight: 1.3, color: 'rgba(0,0,0,0.65)', marginTop: 6 }}>
              {data.speaker_role}
            </div>
          </div>
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

// ─── Variant B — Image full-bleed bg, quote overlay ─────────────────────────
const SlideQuoteOverlay = forwardRef<HTMLDivElement, QuoteProps>(
  function SlideQuoteOverlay(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    return (
      <div ref={ref} style={{ ...slideRoot('#0a0a0a'), color: COLOR.white }}>
        {img && (
          <img src={img} alt="" crossOrigin="anonymous" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 30%',
          }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(10,10,15,0.75) 0%, rgba(10,10,15,0.55) 50%, rgba(10,10,15,0.92) 100%)',
        }} />
        <BentalaSlideHeader sourceCredit={sourceCredit} color="white" />
        <div style={{
          position: 'absolute', top: 360, left: BENTALA_LEFT,
          fontFamily: FONT_STACK, fontSize: 160, fontWeight: 800, lineHeight: 0.8,
          color: ACCENT_BLUE, zIndex: 4,
        }}>“</div>
        <div style={{
          position: 'absolute', top: 480, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          fontFamily: FONT_STACK, fontSize: 38, lineHeight: 1.3, color: COLOR.white,
          fontWeight: 500, fontStyle: 'italic', letterSpacing: '-0.008em', zIndex: 5,
        }}>{data.quote}</div>
        <div style={{
          position: 'absolute', left: BENTALA_LEFT, right: BENTALA_LEFT, bottom: 220, zIndex: 5,
        }}>
          <div style={{ fontFamily: FONT_STACK, fontSize: 26, fontWeight: 800, color: COLOR.white, letterSpacing: '-0.012em' }}>
            — {data.speaker_name}
          </div>
          <div style={{ fontFamily: FONT_STACK, fontSize: 20, fontWeight: 500, color: 'rgba(255,255,255,0.7)', marginTop: 6 }}>
            {data.speaker_role}
          </div>
        </div>
        <SlideFooter citation={citation} color="white" />
      </div>
    )
  },
)

// ─── Variant C — Split: portrait left, quote right ──────────────────────────
const SlideQuoteSplit = forwardRef<HTMLDivElement, QuoteProps>(
  function SlideQuoteSplit(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    const PORTRAIT_W = 460
    const textLeft = PORTRAIT_W + 60
    const textW = SLIDE_W - textLeft - BENTALA_LEFT
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <BentalaSlideHeader sourceCredit={sourceCredit} color="black" />
        <div style={{
          position: 'absolute', top: 220, left: 0, width: PORTRAIT_W, bottom: 200,
          background: ACCENT_BLUE, overflow: 'hidden',
          borderTopRightRadius: 24, borderBottomRightRadius: 24, zIndex: 2,
        }}>
          {img && <img src={img} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }} />}
        </div>
        <div style={{
          position: 'absolute', top: 240, left: textLeft,
          fontFamily: FONT_STACK, fontSize: 120, fontWeight: 800, lineHeight: 0.8,
          color: ACCENT_BLUE, zIndex: 4,
        }}>“</div>
        <div style={{
          position: 'absolute', top: 360, left: textLeft, width: textW,
          fontFamily: FONT_STACK, fontSize: 28, lineHeight: 1.36, color: COLOR.black,
          fontWeight: 600, fontStyle: 'italic', letterSpacing: '-0.005em', zIndex: 5,
          paddingRight: 24,
        }}>{data.quote}</div>
        <div style={{
          position: 'absolute', left: textLeft, bottom: 240, width: textW, zIndex: 5,
        }}>
          <div style={{ fontFamily: FONT_STACK, fontSize: 22, fontWeight: 800, color: COLOR.black, letterSpacing: '-0.012em' }}>
            {data.speaker_name}
          </div>
          <div style={{ fontFamily: FONT_STACK, fontSize: 18, fontWeight: 500, color: 'rgba(0,0,0,0.65)', marginTop: 4 }}>
            {data.speaker_role}
          </div>
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

export const SlideQuote = SlideQuoteMark
export const QUOTE_VARIANTS = [
  { id: 'mark', label: 'Quote Mark', component: SlideQuoteMark },
  { id: 'overlay', label: 'Image Overlay', component: SlideQuoteOverlay },
  { id: 'split', label: 'Split', component: SlideQuoteSplit },
]
