'use client'

import { useEffect, useState } from 'react'

// Returns a counter that increments whenever the document's theme changes
// (the `data-theme` attribute on <html> is toggled). Canvas charts can't read
// CSS custom properties reactively, so they depend on this tick to re-render
// their theme-aware colours the moment the user flips dark ↔ light.
export function useThemeTick(): number {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const obs = new MutationObserver(() => setTick(t => t + 1))
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])
  return tick
}
