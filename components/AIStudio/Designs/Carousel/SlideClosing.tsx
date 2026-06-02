import { forwardRef } from 'react'
import { COLOR, FONT_STACK } from '../designConstants'
import {
  slideRoot, SLIDE_W, SLIDE_H, ACCENT_BLUE, LIGHT_BG,
  BENTALA_LEFT, BENTALA_TOP,
} from './SlideShared'
import { BentalaLogo } from '../BentalaLogo'
import type { ClosingSlideData, CarouselSharedProps } from './types'

type ClosingProps = { data: ClosingSlideData } & CarouselSharedProps

function SocialHandle({ icon, handle, onLight = false }: { icon: 'instagram' | 'tiktok'; handle: string; onLight?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10,
        background: onLight ? ACCENT_BLUE : 'rgba(255,255,255,0.18)',
        border: onLight ? 'none' : '1px solid rgba(255,255,255,0.32)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 16, color: '#fff', fontWeight: 800,
        fontFamily: FONT_STACK, letterSpacing: '0.05em',
      }}>{icon === 'instagram' ? 'IG' : 'TT'}</div>
      <div style={{
        fontFamily: FONT_STACK, fontSize: 24, fontWeight: 700,
        color: onLight ? COLOR.black : COLOR.white, letterSpacing: '-0.005em',
      }}>{handle}</div>
    </div>
  )
}

// ─── Variant A — Full blue bg, centered CTA ─────────────────────────────────
const SlideClosingBlue = forwardRef<HTMLDivElement, ClosingProps>(
  function SlideClosingBlue({ data }, ref) {
    const cta = data.cta_text || 'Tulis pendapatmu di kolom komentar!'
    return (
      <div ref={ref} style={{ ...slideRoot(ACCENT_BLUE), color: COLOR.white }}>
        <div style={{
          position: 'absolute', top: BENTALA_TOP, left: BENTALA_LEFT,
          width: 153.3, height: 70, zIndex: 5,
          display: 'flex', alignItems: 'flex-start',
        }}>
          <BentalaLogo color="white" fontSize={37} />
        </div>
        <div style={{
          position: 'absolute', top: '46%', left: BENTALA_LEFT,
          width: SLIDE_W - BENTALA_LEFT * 2, textAlign: 'center',
          transform: 'translateY(-50%)', fontFamily: FONT_STACK,
          fontSize: 58, fontWeight: 800, lineHeight: 1.18, color: COLOR.white,
          letterSpacing: '-0.02em', zIndex: 5,
        }}>{cta}</div>
        <div style={{
          position: 'absolute', top: '60%', left: BENTALA_LEFT,
          width: SLIDE_W - BENTALA_LEFT * 2, textAlign: 'center',
          fontFamily: FONT_STACK, fontSize: 24, fontWeight: 500,
          color: 'rgba(255,255,255,0.78)', zIndex: 5,
        }}>Ikuti cerita Indonesia ke dunia berikutnya.</div>
        <div style={{
          position: 'absolute', bottom: 180, left: 0, right: 0,
          display: 'flex', gap: 56, justifyContent: 'center', alignItems: 'center', zIndex: 5,
        }}>
          <SocialHandle icon="instagram" handle="@bentalaproject" />
          <SocialHandle icon="tiktok" handle="@bentalaproject.id" />
        </div>
      </div>
    )
  },
)

// ─── Variant B — Image full-bleed bg + blue scrim + CTA ─────────────────────
const SlideClosingImage = forwardRef<HTMLDivElement, ClosingProps>(
  function SlideClosingImage(
    { data, sourceImageUrl, slideImageUrl }, ref,
  ) {
    const img = slideImageUrl ?? sourceImageUrl
    const cta = data.cta_text || 'Tulis pendapatmu di kolom komentar!'
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
          background: `linear-gradient(180deg, rgba(11,61,231,0.45) 0%, rgba(10,10,15,0.85) 100%)`,
        }} />
        <div style={{
          position: 'absolute', top: BENTALA_TOP, left: BENTALA_LEFT,
          width: 153.3, height: 70, zIndex: 5,
          display: 'flex', alignItems: 'flex-start',
        }}>
          <BentalaLogo color="white" fontSize={37} />
        </div>
        <div style={{
          position: 'absolute', top: '44%', left: BENTALA_LEFT,
          width: SLIDE_W - BENTALA_LEFT * 2, textAlign: 'center',
          transform: 'translateY(-50%)', fontFamily: FONT_STACK,
          fontSize: 60, fontWeight: 800, lineHeight: 1.16, color: COLOR.white,
          letterSpacing: '-0.022em', zIndex: 5,
          textShadow: '0 2px 18px rgba(0,0,0,0.45)',
        }}>{cta}</div>
        <div style={{
          position: 'absolute', bottom: 180, left: 0, right: 0,
          display: 'flex', gap: 56, justifyContent: 'center', alignItems: 'center', zIndex: 5,
        }}>
          <SocialHandle icon="instagram" handle="@bentalaproject" />
          <SocialHandle icon="tiktok" handle="@bentalaproject.id" />
        </div>
      </div>
    )
  },
)

// ─── Variant C — Light bg with blue accent block + CTA ──────────────────────
const SlideClosingLight = forwardRef<HTMLDivElement, ClosingProps>(
  function SlideClosingLight({ data }, ref) {
    const cta = data.cta_text || 'Tulis pendapatmu di kolom komentar!'
    return (
      <div ref={ref} style={{ ...slideRoot(LIGHT_BG), color: COLOR.black }}>
        <div style={{
          position: 'absolute', top: BENTALA_TOP, left: BENTALA_LEFT,
          width: 153.3, height: 70, zIndex: 5,
          display: 'flex', alignItems: 'flex-start',
        }}>
          <BentalaLogo color="black" fontSize={37} />
        </div>
        {/* Big blue block as design accent */}
        <div style={{
          position: 'absolute', top: SLIDE_H * 0.5, left: 0, right: 0, bottom: 0,
          background: ACCENT_BLUE, zIndex: 1,
        }} />
        <div style={{
          position: 'absolute', top: '38%', left: BENTALA_LEFT,
          width: SLIDE_W - BENTALA_LEFT * 2, textAlign: 'center',
          transform: 'translateY(-50%)', fontFamily: FONT_STACK,
          fontSize: 58, fontWeight: 800, lineHeight: 1.16, color: COLOR.black,
          letterSpacing: '-0.022em', zIndex: 5,
        }}>{cta}</div>
        <div style={{
          position: 'absolute', top: '64%', left: BENTALA_LEFT,
          width: SLIDE_W - BENTALA_LEFT * 2, textAlign: 'center',
          fontFamily: FONT_STACK, fontSize: 24, fontWeight: 500,
          color: 'rgba(255,255,255,0.85)', zIndex: 5,
        }}>Ikuti cerita Indonesia ke dunia berikutnya.</div>
        <div style={{
          position: 'absolute', bottom: 180, left: 0, right: 0,
          display: 'flex', gap: 56, justifyContent: 'center', alignItems: 'center', zIndex: 5,
        }}>
          <SocialHandle icon="instagram" handle="@bentalaproject" />
          <SocialHandle icon="tiktok" handle="@bentalaproject.id" />
        </div>
      </div>
    )
  },
)

export const SlideClosing = SlideClosingBlue
export const CLOSING_VARIANTS = [
  { id: 'blue', label: 'Blue Full', component: SlideClosingBlue },
  { id: 'image', label: 'Image BG', component: SlideClosingImage },
  { id: 'light', label: 'Light Block', component: SlideClosingLight },
]
