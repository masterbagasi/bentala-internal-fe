import { useCallback, useRef, useState } from 'react'
import { toPng } from 'html-to-image'

export type RenderState = 'idle' | 'rendering' | 'ready' | 'error'

async function captureNode(node: HTMLElement, width: number, height: number): Promise<string> {
  // Wait for fonts to be loaded (Open Sauce variants)
  if ('fonts' in document) {
    await Promise.race([
      document.fonts.ready,
      new Promise(resolve => setTimeout(resolve, 3000)),
    ])
    // Explicitly load weights we use across slide templates so
    // html-to-image embeds them when serializing
    try {
      // Open Sauce One is the primary (Canva); Open Sauce Sans loaded as fallback.
      await Promise.all([
        document.fonts.load('400 16px "Open Sauce One"'),
        document.fonts.load('500 16px "Open Sauce One"'),
        document.fonts.load('600 16px "Open Sauce One"'),
        document.fonts.load('700 16px "Open Sauce One"'),
        document.fonts.load('800 16px "Open Sauce One"'),
        document.fonts.load('700 61px "Open Sauce One"'),
        document.fonts.load('700 46px "Open Sauce One"'),
        document.fonts.load('400 16px "Open Sauce Sans"'),
        document.fonts.load('700 16px "Open Sauce Sans"'),
      ])
    } catch { /* best effort */ }
  }

  // Wait for all <img> inside the node to finish loading
  const imgs = Array.from(node.querySelectorAll('img'))
  await Promise.all(imgs.map(img => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve()
    return new Promise<void>(resolve => {
      const done = () => resolve()
      img.addEventListener('load', done, { once: true })
      img.addEventListener('error', done, { once: true })
      setTimeout(done, 8000)
    })
  }))

  // Layout settle
  await new Promise(resolve => setTimeout(resolve, 60))

  try {
    return await toPng(node, {
      width, height,
      pixelRatio: 1,
      cacheBust: true,
      skipFonts: false,
    })
  } catch {
    // One retry after a short delay (handles transient font/image race conditions)
    await new Promise(resolve => setTimeout(resolve, 400))
    return toPng(node, {
      width, height,
      pixelRatio: 1,
      cacheBust: true,
      skipFonts: false,
    })
  }
}

// Single-node renderer — used by IG Feed Cover (one image output)
export function useDesignRenderer() {
  const [state, setState] = useState<RenderState>('idle')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const nodeRef = useRef<HTMLDivElement>(null)

  const render = useCallback(async (width: number, height: number) => {
    if (!nodeRef.current) return
    setState('rendering')
    setError(null)
    setDataUrl(null)

    try {
      const url = await captureNode(nodeRef.current, width, height)
      setDataUrl(url)
      setState('ready')
    } catch (err) {
      console.error('[design renderer] capture failed:', err)
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      setError(msg)
      setState('error')
    }
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setDataUrl(null)
    setError(null)
  }, [])

  return { state, dataUrl, error, render, reset, nodeRef }
}

// Multi-node renderer — used by Carousel (sequential capture of N slides)
export function useMultiSlideRenderer() {
  const [state, setState] = useState<RenderState>('idle')
  const [dataUrls, setDataUrls] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const nodesRef = useRef<(HTMLDivElement | null)[]>([])
  const runningRef = useRef(false)

  const setSlideRef = useCallback((index: number, el: HTMLDivElement | null) => {
    // Only persist the element — ignore null cleanup calls so the ref stays
    // valid across React's ref-callback churn (each render passes a new
    // closure, prompting React to clean up + reset).
    if (el !== null) nodesRef.current[index] = el
  }, [])

  const renderAll = useCallback(async (count: number, width: number, height: number) => {
    // Re-entry guard — prevent overlapping renderAll calls
    if (runningRef.current) {
      console.log('[multi renderer] already running, skipping')
      return
    }
    runningRef.current = true

    setState('rendering')
    setError(null)
    setDataUrls([])
    setProgress({ current: 0, total: count })

    try {
      const urls: string[] = []
      for (let i = 0; i < count; i++) {
        const node = nodesRef.current[i]
        if (!node) {
          console.warn(`[multi renderer] missing slide ${i}`)
          continue
        }
        try {
          console.log(`[multi renderer] capturing slide ${i + 1}/${count}`)
          const url = await captureNode(node, width, height)
          urls.push(url)
          setProgress({ current: i + 1, total: count })
          setDataUrls([...urls])
        } catch (err) {
          console.error(`[multi renderer] slide ${i} failed:`, err)
          const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
          setError(`Slide ${i + 1}: ${msg}`)
          setState('error')
          return
        }
      }
      setState('ready')
    } finally {
      runningRef.current = false
    }
  }, [])

  const renderSlide = useCallback(async (index: number, width: number, height: number) => {
    const node = nodesRef.current[index]
    if (!node) {
      console.warn(`[multi renderer] renderSlide: missing node for index ${index}`)
      return
    }
    if (runningRef.current) return
    runningRef.current = true
    setState('rendering')
    setError(null)
    try {
      const url = await captureNode(node, width, height)
      setDataUrls(prev => {
        const next = [...prev]
        next[index] = url
        return next
      })
      setState('ready')
    } catch (err) {
      console.error(`[multi renderer] re-capture slide ${index} failed:`, err)
      const msg = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      setError(`Slide ${index + 1}: ${msg}`)
      setState('error')
    } finally {
      runningRef.current = false
    }
  }, [])

  const reset = useCallback(() => {
    setState('idle')
    setDataUrls([])
    setError(null)
    setProgress({ current: 0, total: 0 })
    nodesRef.current = []
    runningRef.current = false
  }, [])

  return { state, dataUrls, error, progress, renderAll, renderSlide, reset, setSlideRef }
}
