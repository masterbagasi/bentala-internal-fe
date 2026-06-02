import { forwardRef } from 'react'
import { COLOR, FONT_STACK } from '../designConstants'
import {
  HighlightedTitle, renderBoldMarkdown, slideRoot,
  SLIDE_W, SLIDE_H, ACCENT_BLUE, LIGHT_BG,
  BENTALA_LEFT, BENTALA_CONTENT_W,
  BentalaSlideHeader, SlideFooter,
} from './SlideShared'
import type { IntroSlideData, CarouselSharedProps } from './types'

type IntroProps = { data: IntroSlideData } & CarouselSharedProps

// ─── Variant A — Hero image top, text bottom ────────────────────────────────
const HERO_H = 620
const SlideIntroHeroTop = forwardRef<HTMLDivElement, IntroProps>(
  function SlideIntroHeroTop(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <div style={{
          position: 'absolute', top: 0, left: 0, width: SLIDE_W, height: HERO_H,
          background: '#1a1a1a', overflow: 'hidden', zIndex: 1,
        }}>
          {img && <img src={img} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }} />}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 200,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 60%, transparent 100%)',
          }} />
        </div>
        <BentalaSlideHeader sourceCredit={sourceCredit} color="white" />
        <div style={{
          position: 'absolute', top: HERO_H + 60, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          lineHeight: 1.12, zIndex: 5,
        }}>
          <HighlightedTitle text={data.title} highlight={data.highlight}
            color={COLOR.black} highlightFg={COLOR.white} highlightBg={ACCENT_BLUE}
            fontSize={50} fontWeight={800} lineHeight={1.14} />
        </div>
        <div style={{
          position: 'absolute', top: HERO_H + 240, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          fontFamily: FONT_STACK, fontSize: 26, lineHeight: 1.5, color: 'rgba(0,0,0,0.84)',
          fontWeight: 400, letterSpacing: '-0.003em', zIndex: 5,
        }}>
          {renderBoldMarkdown(data.body)}
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

// ─── Variant B — Split: image right column, text left ───────────────────────
const SPLIT_IMG_W = 480
const SlideIntroSplit = forwardRef<HTMLDivElement, IntroProps>(
  function SlideIntroSplit(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    const textW = SLIDE_W - BENTALA_LEFT - SPLIT_IMG_W - 60
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <BentalaSlideHeader sourceCredit={sourceCredit} color="black" />
        {/* Right-side image card */}
        <div style={{
          position: 'absolute', top: 200, right: 0, width: SPLIT_IMG_W, bottom: 200,
          background: ACCENT_BLUE, overflow: 'hidden', borderTopLeftRadius: 20, borderBottomLeftRadius: 20, zIndex: 2,
        }}>
          {img && <img src={img} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }} />}
        </div>
        <div style={{
          position: 'absolute', top: 240, left: BENTALA_LEFT, width: textW,
          lineHeight: 1.1, zIndex: 5,
        }}>
          <HighlightedTitle text={data.title} highlight={data.highlight}
            color={COLOR.black} highlightFg={COLOR.white} highlightBg={ACCENT_BLUE}
            fontSize={42} fontWeight={800} lineHeight={1.12} />
        </div>
        <div style={{
          position: 'absolute', top: 540, left: BENTALA_LEFT, width: textW,
          fontFamily: FONT_STACK, fontSize: 23, lineHeight: 1.45, color: 'rgba(0,0,0,0.84)',
          fontWeight: 400, letterSpacing: '-0.003em', zIndex: 5,
        }}>
          {renderBoldMarkdown(data.body)}
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

// ─── Variant C — Image full-bleed bg with overlay, text on top ──────────────
const SlideIntroOverlay = forwardRef<HTMLDivElement, IntroProps>(
  function SlideIntroOverlay(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    return (
      <div ref={ref} style={{ ...slideRoot('#0a0a0a'), color: COLOR.white }}>
        {img && (
          <img src={img} alt="" crossOrigin="anonymous" style={{
            position: 'absolute', inset: 0, width: '100%', height: '100%',
            objectFit: 'cover', objectPosition: 'center 35%',
          }} />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(180deg, rgba(10,10,15,0.65) 0%, rgba(10,10,15,0.45) 50%, rgba(10,10,15,0.92) 100%)',
        }} />
        <BentalaSlideHeader sourceCredit={sourceCredit} color="white" />
        <div style={{
          position: 'absolute', top: 280, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          lineHeight: 1.12, zIndex: 5,
        }}>
          <HighlightedTitle text={data.title} highlight={data.highlight}
            color={COLOR.white} highlightFg={COLOR.white} highlightBg={ACCENT_BLUE}
            fontSize={56} fontWeight={800} lineHeight={1.14} />
        </div>
        <div style={{
          position: 'absolute', bottom: 200, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          fontFamily: FONT_STACK, fontSize: 26, lineHeight: 1.5, color: 'rgba(255,255,255,0.92)',
          fontWeight: 400, letterSpacing: '-0.003em', zIndex: 5,
        }}>
          {renderBoldMarkdown(data.body)}
        </div>
        <SlideFooter citation={citation} color="white" />
      </div>
    )
  },
)

export const SlideIntro = SlideIntroHeroTop
export const INTRO_VARIANTS = [
  { id: 'hero-top', label: 'Image Top', component: SlideIntroHeroTop },
  { id: 'split', label: 'Split', component: SlideIntroSplit },
  { id: 'overlay', label: 'Overlay', component: SlideIntroOverlay },
]
