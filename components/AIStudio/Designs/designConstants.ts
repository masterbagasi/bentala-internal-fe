// Shared constants for the design generator templates.

export const COLOR = {
  white: '#FFFFFF',
  black: '#000000',
  blue: '#0B3DE7',
} as const

// Direct font stack (NOT via CSS variable) — html-to-image doesn't always
// resolve custom properties when serializing computed styles, causing the
// captured PNG to fall back to the platform default font. Always inline.
// Open Sauce One is Canva's "Open Sauce" — primary. Open Sauce Sans is the
// sibling fallback. Both are loaded via Google Fonts in globals.css and also
// resolved from local() if the user has them installed system-wide.
export const FONT_STACK = "'Open Sauce One', 'Open Sauce Sans', 'Segoe UI', system-ui, -apple-system, BlinkMacSystemFont, sans-serif"

// Adaptive color sample regions in design-canvas coordinates (1080×1350).
export const SAMPLE_REGION = {
  logo: { x: 64, y: 64, w: 280, h: 130 },
  source: { x: 700, y: 64, w: 320, h: 100 },
} as const

export const IG_FEED_COVER = {
  width: 1080,
  height: 1350,
  margin: 64,
  shapePadding: 48,
} as const

// Reels variant: 1080×1920 (9:16). Reuses the entire IG_FEED_COVER design
// (logo, photo area, bottom shape, text) — adds 285px of padding above and
// below so the existing 1350px layout sits centered vertically inside the
// 1920 canvas. All internal positions/sizes/colors are unchanged.
export const IG_REELS_COVER = {
  width: 1080,
  height: 1920,
  topPadding: 285,    // space above the existing 1350 design area
  bottomPadding: 285, // space below the existing 1350 design area
} as const

// Precise spec for the Bentala IG Feed cover template (used by TemplateIGFeed
// and BentalaCoverEditor). Pixel values come straight from the design spec
// image — do not "round" them without checking the spec.
export const IG_FEED_COVER_SPEC = {
  // Logo position + size. Width derived from SVG's natural 1.73:1 aspect
  // (viewBox 468:270) so no stretch: height 83 × (468/270) = 143.867.
  logoTop: 50.6,
  logoLeft: 98,
  logoWidth: 143.867,
  logoHeight: 83,
  // Source attribution: right-aligned, vertically centered on the logo's
  // center line (so source midline = logo midline). Position via right edge.
  sourceRight: 100,
  // Bottom shape: full-bleed, fixed height
  shapeHeight: 506.4,
  // Internal shape padding. shapePadX = 100 so the text left-edge lines up
  // with the logo (logoLeft = 100). Headline can fill up to 1080 - 200 = 880px
  // wide before wrapping, which is fine since lines are hard-broken by the user.
  shapePadTop: 66.5,
  shapePadBottom: 146,
  shapePadX: 100,
  // Vertical gap between the category line and the headline block.
  // Spec image showed 57px, then user shifted headline UP by 25.8px to match
  // their visual reference: 57 - 25.8 = 31.2.
  gapCategoryHeadline: 32.4,
  // Category | Country typography (Canva spec: 29pt, line-height 1.2, ls 0).
  // Kategori = Bold (700), Country = Regular (400).
  // Canva uses POINTS: 29pt × (96/72) = 38.67px → round to 39.
  categoryFontSize: 39,
  categoryLineHeight: 1.2,
  // Headline typography (Canva spec: 46pt, line-height 1.2, letter-spacing 0).
  // 46pt × (96/72) = 61.33px → round to 61.
  headlineFontSize: 61,
  headlineLineHeight: 1.2,
  headlineLetterSpacing: 0,
} as const

export type ContentCategoryKey =
  | 'global_context'
  | 'indonesian_people'
  | 'indonesian_culture'
  | 'local_go_global'
  | 'global_achievement'

export const CATEGORY_LABEL_FOR_DESIGN: Record<ContentCategoryKey, string> = {
  global_context: 'Global Context',
  indonesian_people: 'Indonesian People',
  indonesian_culture: 'Indonesian Culture',
  local_go_global: 'Local Go Global',
  global_achievement: 'Global Achievement',
}

// Convert PascalCase country to readable form for display: "UnitedStates" → "United States"
export function formatCountry(country: string): string {
  if (!country) return ''
  return country.replace(/([a-z])([A-Z])/g, '$1 $2')
}
