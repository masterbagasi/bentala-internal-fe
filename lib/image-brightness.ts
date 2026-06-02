// Detects average luminance of a region inside an image, used to pick
// contrasting text/logo color for overlays in design generation.

export async function detectImageRegionBrightness(
  imageUrl: string,
  region: { x: number; y: number; w: number; h: number },
  designCanvasWidth: number,
  designCanvasHeight: number
): Promise<number> {
  const img = new Image()
  img.crossOrigin = 'anonymous'

  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('image-load-failed'))
    img.src = imageUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')
  if (!ctx) return 0.5

  ctx.drawImage(img, 0, 0)

  // Map design canvas region to actual image-pixel region (object-fit: cover)
  const designAspect = designCanvasWidth / designCanvasHeight
  const imageAspect = img.naturalWidth / img.naturalHeight
  // simulate object-fit: cover
  let drawW = img.naturalWidth
  let drawH = img.naturalHeight
  let offsetX = 0
  let offsetY = 0
  if (imageAspect > designAspect) {
    drawW = img.naturalHeight * designAspect
    offsetX = (img.naturalWidth - drawW) / 2
  } else {
    drawH = img.naturalWidth / designAspect
    offsetY = (img.naturalHeight - drawH) / 2
  }
  const scaleX = drawW / designCanvasWidth
  const scaleY = drawH / designCanvasHeight

  const sx = Math.max(0, Math.floor(offsetX + region.x * scaleX))
  const sy = Math.max(0, Math.floor(offsetY + region.y * scaleY))
  const sw = Math.max(1, Math.min(img.naturalWidth - sx, Math.floor(region.w * scaleX)))
  const sh = Math.max(1, Math.min(img.naturalHeight - sy, Math.floor(region.h * scaleY)))

  let data: Uint8ClampedArray
  try {
    data = ctx.getImageData(sx, sy, sw, sh).data
  } catch {
    // CORS-tainted canvas; can't sample
    return 0.5
  }

  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    sum += (0.299 * r + 0.587 * g + 0.114 * b) / 255
    count++
  }
  return count === 0 ? 0.5 : sum / count
}

export function pickContrastColor(luminance: number): 'black' | 'white' {
  return luminance > 0.55 ? 'black' : 'white'
}
