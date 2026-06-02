import { forwardRef } from 'react'
import { COLOR, FONT_STACK } from '../designConstants'
import {
  slideRoot, ACCENT_BLUE, LIGHT_BG,
  BENTALA_LEFT, BENTALA_CONTENT_W,
  BentalaSlideHeader, SlideFooter,
} from './SlideShared'
import type { ListSlideData, CarouselSharedProps } from './types'

type ListProps = { data: ListSlideData } & CarouselSharedProps

function NumberedItem({ index, text }: { index: number; text: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
      <div style={{
        flexShrink: 0, width: 56, height: 56, borderRadius: '50%',
        background: ACCENT_BLUE, color: COLOR.white,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: FONT_STACK, fontSize: 28, fontWeight: 800,
        fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.012em', marginTop: 4,
      }}>{index}</div>
      <div style={{
        flex: 1, fontFamily: FONT_STACK, fontSize: 26, lineHeight: 1.42,
        fontWeight: 500, color: 'rgba(0,0,0,0.86)', letterSpacing: '-0.003em',
      }}>{text}</div>
    </div>
  )
}

// ─── Variant A — Title + accent image card top-right + numbered items ───────
const ACCENT_IMG_SIZE = 240
const SlideListAccentCard = forwardRef<HTMLDivElement, ListProps>(
  function SlideListAccentCard(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    const items = data.items.slice(0, 4)
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <BentalaSlideHeader sourceCredit={sourceCredit} color="black" />
        <div style={{
          position: 'absolute', top: 220, left: BENTALA_LEFT,
          width: BENTALA_CONTENT_W - ACCENT_IMG_SIZE - 40,
          fontFamily: FONT_STACK, fontSize: 56, fontWeight: 800, lineHeight: 1.1,
          color: COLOR.black, letterSpacing: '-0.02em', zIndex: 5,
        }}>{data.title}</div>
        <div style={{
          position: 'absolute', top: 220, right: BENTALA_LEFT,
          width: ACCENT_IMG_SIZE, height: ACCENT_IMG_SIZE,
          background: ACCENT_BLUE, borderRadius: 20, overflow: 'hidden', zIndex: 4,
        }}>
          {img && <img src={img} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }} />}
        </div>
        <div style={{
          position: 'absolute', top: 540, left: BENTALA_LEFT, right: BENTALA_LEFT, bottom: 140,
          display: 'flex', flexDirection: 'column', gap: 24, zIndex: 5,
        }}>
          {items.map((item, i) => <NumberedItem key={i} index={i + 1} text={item} />)}
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

// ─── Variant B — No image, bigger title + items ─────────────────────────────
const SlideListTextOnly = forwardRef<HTMLDivElement, ListProps>(
  function SlideListTextOnly(
    { data, sourceCredit, citation }, ref,
  ) {
    const items = data.items.slice(0, 4)
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <BentalaSlideHeader sourceCredit={sourceCredit} color="black" />
        <div style={{
          position: 'absolute', left: BENTALA_LEFT, top: 220,
          width: 90, height: 8, background: ACCENT_BLUE, borderRadius: 4, zIndex: 4,
        }} />
        <div style={{
          position: 'absolute', top: 260, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          fontFamily: FONT_STACK, fontSize: 68, fontWeight: 800, lineHeight: 1.05,
          color: COLOR.black, letterSpacing: '-0.022em', zIndex: 5,
        }}>{data.title}</div>
        <div style={{
          position: 'absolute', top: 510, left: BENTALA_LEFT, right: BENTALA_LEFT, bottom: 140,
          display: 'flex', flexDirection: 'column', gap: 28, zIndex: 5,
        }}>
          {items.map((item, i) => <NumberedItem key={i} index={i + 1} text={item} />)}
        </div>
        <SlideFooter citation={citation} color="black" />
      </div>
    )
  },
)

// ─── Variant C — Image full-bleed with dark scrim, list overlay (white) ─────
const SlideListImageBg = forwardRef<HTMLDivElement, ListProps>(
  function SlideListImageBg(
    { data, sourceImageUrl, slideImageUrl, sourceCredit, citation }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    const items = data.items.slice(0, 4)
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
          background: 'linear-gradient(180deg, rgba(10,10,15,0.75) 0%, rgba(10,10,15,0.6) 40%, rgba(10,10,15,0.95) 100%)',
        }} />
        <BentalaSlideHeader sourceCredit={sourceCredit} color="white" />
        <div style={{
          position: 'absolute', top: 240, left: BENTALA_LEFT, width: BENTALA_CONTENT_W,
          fontFamily: FONT_STACK, fontSize: 56, fontWeight: 800, lineHeight: 1.1,
          color: COLOR.white, letterSpacing: '-0.02em', zIndex: 5,
        }}>{data.title}</div>
        <div style={{
          position: 'absolute', top: 460, left: BENTALA_LEFT, right: BENTALA_LEFT, bottom: 140,
          display: 'flex', flexDirection: 'column', gap: 24, zIndex: 5,
        }}>
          {items.map((item, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 24 }}>
              <div style={{
                flexShrink: 0, width: 56, height: 56, borderRadius: '50%',
                background: ACCENT_BLUE, color: COLOR.white,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: FONT_STACK, fontSize: 28, fontWeight: 800,
                fontVariantNumeric: 'tabular-nums', marginTop: 4,
              }}>{i + 1}</div>
              <div style={{
                flex: 1, fontFamily: FONT_STACK, fontSize: 26, lineHeight: 1.42,
                fontWeight: 500, color: 'rgba(255,255,255,0.92)', letterSpacing: '-0.003em',
              }}>{item}</div>
            </div>
          ))}
        </div>
        <SlideFooter citation={citation} color="white" />
      </div>
    )
  },
)

export const SlideList = SlideListAccentCard
export const LIST_VARIANTS = [
  { id: 'accent-card', label: 'Accent Card', component: SlideListAccentCard },
  { id: 'text-only', label: 'Text Only', component: SlideListTextOnly },
  { id: 'image-bg', label: 'Image BG', component: SlideListImageBg },
]
