'use client'

import { ReactNode } from 'react'

export type SectionTone =
  | 'default'
  | 'blue'
  | 'mint'
  | 'lavender'
  | 'peach'
  | 'rose'
  | 'amber'

const TONE_PALETTE: Record<
  SectionTone,
  { bg: string; titleColor?: string; border?: string }
> = {
  default: { bg: 'var(--bg2)' },
  blue: { bg: 'var(--tone-blue)', titleColor: 'var(--tone-blue-fg)' },
  mint: { bg: 'var(--tone-mint)', titleColor: 'var(--tone-mint-fg)' },
  lavender: { bg: 'var(--tone-lavender)', titleColor: 'var(--tone-lavender-fg)' },
  peach: { bg: 'var(--tone-peach)', titleColor: 'var(--tone-peach-fg)' },
  rose: { bg: 'var(--tone-rose)', titleColor: 'var(--tone-rose-fg)' },
  amber: { bg: 'var(--tone-amber)', titleColor: 'var(--tone-amber-fg)' },
}

interface SectionProps {
  title: string
  action?: ReactNode
  /** Pin the bubble to a specific pixel/CSS height. When set, the
   *  content area inside the bubble scrolls while the title stays
   *  fixed at the top. */
  height?: number | string
  sticky?: 'full' | 'header' | boolean
  stickyTop?: number
  /** Hue-tinted background variant. Defaults to the neutral `bg2`
   *  surface. */
  tone?: SectionTone
  /** Optional icon rendered in a colored badge next to the title. */
  icon?: ReactNode
  iconColor?: string
  /** When `true` (or when `height` is set), the content area scrolls
   *  internally instead of letting the page scroll past the bubble. */
  scrollable?: boolean
  children: ReactNode
}

/**
 * Shared building block for admin editor pages. Mirrors the visual
 * vocabulary of the Hero editor: an uppercase label header with
 * tracking, sitting above a rounded card that contains the form.
 *
 * The card surface picks a `tone` from the shared palette so editors
 * can give consecutive sections distinct, calm backgrounds — like
 * the bubble-cards layout in the Daisy reference, where each row of
 * the dashboard sits on a slightly different pastel surface.
 */
export function Section({
  title,
  action,
  height,
  sticky,
  stickyTop,
  tone = 'default',
  icon,
  iconColor,
  scrollable,
  children,
}: SectionProps) {
  const contentScrolls = scrollable || height != null
  const stickyMode: 'full' | 'header' | null =
    sticky === 'full' || sticky === true
      ? 'full'
      : sticky === 'header'
        ? 'header'
        : null
  const top = stickyTop ?? 0
  const palette = TONE_PALETTE[tone]

  const stickySlabStyle = {
    position: 'sticky' as const,
    top,
    zIndex: 10,
    background: 'var(--bg)',
    paddingBottom: 12,
    marginTop: -24,
    marginLeft: -24,
    marginRight: -24,
    paddingTop: 24,
    paddingLeft: 24,
    paddingRight: 24,
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: height ?? '100%',
        ...(height
          ? { maxHeight: height, minHeight: height, overflow: 'hidden' }
          : {}),
        ...(stickyMode === 'full' ? stickySlabStyle : {}),
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          background: palette.bg,
          border: '1px solid var(--border)',
          borderRadius: 20,
          boxShadow: 'var(--shadow-card)',
          flex: 1,
          overflow: 'hidden',
        }}
      >
        {/* Title row — sticky to the top of the bubble. Stays
            visible while the user scrolls through the content
            below, anchored to the page scroll container. The
            background matches the bubble so content slides under
            cleanly. */}
        <div
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '20px 24px 14px',
            background: palette.bg,
            borderBottom: '1px solid var(--border)',
            ...(stickyMode === 'header' ? stickySlabStyle : {}),
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              fontSize: 18,
              fontWeight: 700,
              letterSpacing: '-0.005em',
              color: palette.titleColor ?? 'var(--text)',
            }}
          >
            {icon && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  background: iconColor
                    ? `${iconColor}1f`
                    : 'var(--bg3)',
                  color: iconColor ?? 'var(--text)',
                  flexShrink: 0,
                }}
              >
                {icon}
              </span>
            )}
            {title}
          </div>
          {action}
        </div>
        {/* Content — the only scrollable region. Padding lives
            here (not on the bubble) so the sticky title fills the
            bubble's full width edge-to-edge. When the bubble has a
            fixed `height` (or `scrollable`), content area scrolls
            internally and the bubble itself stays put on the page. */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            padding: 24,
            flex: 1,
            minHeight: 0,
            overflowY: contentScrolls ? 'auto' : 'visible',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}

/**
 * Sub-grouping inside a Section — small uppercase header with a
 * hairline underline. Use to split a single Section into multiple
 * thematic clusters.
 */
export function Subgroup({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--text)',
          paddingBottom: 10,
          borderBottom: '1px solid var(--border-strong)',
        }}
      >
        {label}
      </div>
      {children}
    </div>
  )
}
