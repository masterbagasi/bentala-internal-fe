// Bentala wordmark — rendered from /public/logos/bentala-{black|white}.svg.
// SVG uses simple <path> data (no embedded base64 / no mask filters) for
// reliable rendering at any size. Native aspect 468:270 ≈ 1.73:1.
// Two ways to size:
//  • Pass explicit `width` + `height` for spec dimensions (141×70).
//  • Otherwise pass `fontSize`; height = fontSize × 1.88, width auto-derived.
const LOGO_ASPECT = 468 / 270 // 1.73:1 — matches simple-path SVG

export function BentalaLogo({
  color, fontSize = 50, width: customWidth, height: customHeight,
}: {
  color: 'black' | 'white'
  fontSize?: number
  width?: number
  height?: number
}) {
  const height = customHeight ?? fontSize * 1.88
  const width = customWidth ?? height * LOGO_ASPECT
  return (
    <img
      // Version param forces browser to bypass cached older SVG (which had a
      // broken mask+base64 layout that only showed "ber pro"). Bump v if the
      // SVG file changes again.
      src={`/logos/bentala-${color}.svg?v=3`}
      alt="Bentala"
      width={width}
      height={height}
      // object-fit: contain preserves the SVG's native 1.73:1 aspect inside
      // the requested box. For the 141×70 cover spec, the visible logo will
      // render ~121×70 centered horizontally — no stretch, just letterboxing.
      style={{ display: 'block', userSelect: 'none', objectFit: 'contain' }}
      draggable={false}
    />
  )
}
