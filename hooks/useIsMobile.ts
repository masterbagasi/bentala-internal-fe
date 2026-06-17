'use client'

import { useState, useEffect } from 'react'

/**
 * Returns true when the viewport is at or below `breakpoint` (default
 * 768px — the same cutoff the sidebar drawer and the mobile CSS layer
 * in globals.css use). SSR-safe: starts `false` and corrects on mount,
 * then tracks resize via matchMedia.
 *
 * Use this to collapse desktop split-pane / fixed-width layouts into a
 * single stacked column on phones, where a CSS-only override can't.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint}px)`)
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [breakpoint])
  return isMobile
}
