'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Renders children at the public site's actual content width
 * (`window.innerWidth − 104` to mirror the 52px section padding on
 * each side), then scales the whole subtree down so it fits inside
 * the admin's preview card. Because the simulator scales the entire
 * subtree by the same factor, any clamp/vw typography resolves once
 * at the real viewport and is uniformly downscaled — so what the
 * admin sees matches what visitors will see at the same viewport.
 */
export function PublicViewportSimulator({
  children,
}: {
  children: React.ReactNode
}) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(1336) // 1440 − 104 fallback
  const [scale, setScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState(0)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const update = () => {
      const viewportWidth = window.innerWidth
      const newContentWidth = Math.max(640, viewportWidth - 104)
      const outerWidth = outer.offsetWidth
      const newScale =
        outerWidth > 0 ? Math.min(1, outerWidth / newContentWidth) : 1
      const innerHeight = inner.offsetHeight

      setContentWidth(newContentWidth)
      setScale(newScale)
      setScaledHeight(innerHeight * newScale)
    }

    update()
    const ro = new ResizeObserver(update)
    ro.observe(outer)
    ro.observe(inner)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div
      ref={outerRef}
      style={{ width: '100%', height: scaledHeight, overflow: 'hidden' }}
    >
      <div
        ref={innerRef}
        style={{
          width: contentWidth,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}
