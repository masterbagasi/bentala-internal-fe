'use client'

import { useT } from '@/lib/i18n/LanguageProvider'

/**
 * Universal status pill used across the abroad-production admin tab
 * (trip cards + service category cards). Solid near-opaque dark
 * background ensures the badge is legible on ANY image (bright sky,
 * portraits, food, neon city) — the prior translucent green tint
 * failed contrast on light photographs. Status differentiation
 * comes from accent colour of the dot + label text:
 *   • Active: green-cyan dot with halo + green label + green-tinted
 *     glow ring around the pill so it pulses live-ish.
 *   • Hidden: dim white dot + white label, no glow.
 * Positioned absolutely — render inside an element with
 * `position: relative`.
 */
export function StatusPill({ isPublished }: { isPublished: boolean }) {
  const t = useT()
  const accent = '#43d9a2'
  return (
    <span
      style={{
        position: 'absolute',
        top: 10,
        right: 10,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 7,
        padding: '6px 12px 6px 10px',
        // Always a dark fill — opaque enough to be readable on
        // any image. Editors immediately see the badge regardless
        // of what's behind it.
        background: 'rgba(8, 9, 13, 0.88)',
        backdropFilter: 'blur(10px) saturate(140%)',
        WebkitBackdropFilter: 'blur(10px) saturate(140%)',
        color: isPublished ? accent : 'rgba(255,255,255,0.92)',
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: 'uppercase',
        letterSpacing: '0.2em',
        borderRadius: 999,
        border: `1px solid ${
          isPublished ? 'rgba(67, 217, 162, 0.55)' : 'rgba(255,255,255,0.16)'
        }`,
        // Heavy drop shadow + outward halo glow on active so the
        // badge appears to lift off the photo. Hidden uses a
        // simple drop shadow.
        boxShadow: isPublished
          ? '0 0 0 1px rgba(67, 217, 162, 0.15), 0 4px 16px rgba(67, 217, 162, 0.32), 0 8px 24px rgba(0, 0, 0, 0.5)'
          : '0 6px 18px rgba(0, 0, 0, 0.45)',
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: isPublished ? accent : 'rgba(255,255,255,0.6)',
          // Strong halo on active so the dot reads as a live status
          // indicator (like a recording light). 12px outer glow.
          boxShadow: isPublished
            ? `0 0 12px ${accent}, 0 0 0 2px rgba(67, 217, 162, 0.18)`
            : 'none',
          flexShrink: 0,
        }}
      />
      {isPublished ? t('Aktif') : 'Hidden'}
    </span>
  )
}
