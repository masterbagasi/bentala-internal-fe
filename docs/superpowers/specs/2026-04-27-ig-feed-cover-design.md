# IG Feed Cover Design — Spec

**Status:** Draft, pending user review
**Date:** 2026-04-27
**Owner:** BPI Intelligence team

## Overview

Generate publish-ready Instagram Feed Cover (4:5 portrait, 1080×1350px) dari konten BPI Intelligence yang sudah dibuat (headline, content_category, country, source). Render client-side via `html-to-image`, output PNG.

Ini adalah **format pertama** dari rangkaian design generator (Story 9:16, Carousel, Video Cover, YouTube Thumbnail menyusul nanti). MVP fokus ke 1 format dulu untuk validasi pipeline render + UX.

## Goals

- Auto-generate cover yang match Canva-quality dari konten BPI yang sudah ada
- Logo color adaptive berdasarkan brightness dari area background image
- Single-click flow: tombol → modal → preview → download PNG
- Use real picture (source thumbnail / og:image), no AI image generation

## Non-Goals

- AI image generation (DALL-E/SDXL) — eksplisit dikecualikan
- User upload custom image (auto pakai source image only)
- Multi-format support — Story/Carousel/Video Cover/YT Thumb di iterasi berikutnya
- Auto-post ke social media — manual download only
- Save ke Supabase Storage — defer ke iterasi nanti

## Architecture

### Trigger & Flow

1. User generate konten di BPI Intelligence panel (headline_lines, caption, hashtags, content_category, country sudah tersedia di state)
2. Tombol **`+ Generate Design`** muncul di header preview panel sebelah `✦ Buat Konten` ketika `content` sudah ada
3. Klik → `<DesignGeneratorModal>` open, format picker dengan 5 thumbnails (untuk MVP cuma "IG Feed Cover" yang aktif, lainnya disabled with badge "Coming soon")
4. User pilih "IG Feed Cover" → renderer mounts `<TemplateIGFeed>` di hidden DOM node
5. System wait untuk: fonts ready (`document.fonts.ready`) + image loaded + brightness detection done
6. Capture node via `html-to-image.toPng()` di resolusi native 1080×1350
7. Show preview di modal + tombol `⬇ Download PNG`
8. Klik download → browser save PNG file

### Component Tree

```
BPIIntelligence
└── DesignGeneratorModal (new)
    ├── FormatPicker
    ├── TemplateIGFeed (new) ← rendered hidden during capture
    │   ├── BackgroundImage
    │   ├── BentalaLogo
    │   ├── SourceAttribution
    │   └── BottomShape
    │       ├── CategoryLine
    │       └── HeadlineBlock
    └── PreviewPanel + DownloadButton
```

## Layout Spec

**Canvas:** 1080×1350px (Instagram portrait 4:5)

```
┌──────────────────────────────────────────┐ y=0
│                                          │
│ [bentala]    Image Source: NASA          │ ← top overlay (no bg fill)
│ [project]    | Instagram                 │
│              @yumasoerianto              │
│                                          │
│         ┌─ FULL-BLEED IMAGE ─┐           │
│         │                    │           │ ← image fills entire canvas
│         │                    │           │
│         │                    │           │
│         │                    │           │
│         └────────────────────┘           │
│                                          │
│ ┌────────────────────────────────────┐   │ ← white SHAPE overlay
│ │  Indonesian People | Australia      │   │   width 952px (1080-64*2)
│ │                                     │   │   padding 48px
│ │  Bocah 13 Tahun Asal                │   │
│ │  Indonesia Bikin Kagum              │   │
│ │  CEO Apple                          │   │
│ └────────────────────────────────────┘   │ y=1286 (64px from bottom)
└──────────────────────────────────────────┘ y=1350
```

**Margins:** 64px from all canvas edges to top-row elements and bottom shape.

**Z-order (bottom to top):**
1. Background image (z-index: 0, full bleed) — image fills entire 1080×1350 canvas
2. Logo (z-index: 2, top-left over image)
3. Source attribution (z-index: 2, top-right over image)
4. Bottom white shape (z-index: 3, over image at bottom area) with text content rendered inside

Logo + source attribution always overlay directly on image (adaptive color). Bottom shape is solid white, so text inside (category + headline) always sits on white background regardless of image content.

## Element Specs

### 1. Background Image

- HTML: `<img>` with `object-fit: cover`, `width: 100%`, `height: 100%`
- Position: absolute, inset 0
- Image source priority:
  1. `article.image` (og:image dari article-preview API) untuk artikel
  2. `https://img.youtube.com/vi/{video_id}/maxresdefault.jpg` untuk video
  3. Fallback: solid `#0B3DE7` (biru utama BPI)
- `crossOrigin: 'anonymous'` wajib (untuk canvas brightness sampling)
- Image preload sebelum render: tunggu `img.onload`

### 2. Logo "bentala project"

Text-based wordmark direplikasi dari Open Sauce Sans:

- Position: absolute, top: 64px, left: 64px
- Layout: 2 baris stacked
  - Line 1: "bentala"
  - Line 2: "project"
- Font: Open Sauce Sans
- Weight: 800
- Size: 56px
- Line-height: 0.92 (sangat ketat)
- Letter-spacing: -0.025em
- Color: **adaptive** (lihat Adaptive Color Logic di bawah)

### 3. Source Attribution

- Position: absolute, top: 64px, right: 64px, text-align: right
- Format dynamic per source type:

  **Video YouTube (MVP):**
  ```
  Image Source: {channel_title} | YouTube
  ```

  **Article (MVP):**
  ```
  Image Source: {site_name}
  ```

  **Future enhancement (post-MVP):** add second line `@{handle}` underlined if handle data available (requires extra YouTube Data API call to channels endpoint or scraping channel URL).

- Typography:
  - "Image Source: " + source name → Open Sauce Bold 15px
  - "| Platform" (separator + platform) → Open Sauce Regular 15px (only for video)
- Color: **adaptive** (sama logic dengan logo)
- Right-aligned, line-height 1.4
- max-width: 320px to prevent overflow on long source names

### 4. Bottom Shape (white container)

- Position: absolute, bottom: 64px, left: 64px, right: 64px
- Width: 952px (auto-fit dari left/right insets)
- Background: `#FFFFFF` (solid white)
- Padding: 48px
- Border-radius: 0 (sharp corners — match referensi user)
- Auto-height (fits content)
- No drop shadow

### 5. Category Line (inside shape)

- Format: `{category_label} | {country}`
  - `category_label`: dari `content.content_category` mapped via CONTENT_CATEGORIES.label
  - `country`: dari `content.country` (sudah dalam PascalCase, e.g. "Australia", "UnitedStates")
- Layout: single line, left-aligned
- Typography:
  - Category: Open Sauce **Bold** 39px, color `#000000`
  - Separator " | ": Open Sauce Regular 39px, color `#000000`, padding 8px each side
  - Country: Open Sauce **Regular** 39px, color `#000000`
- Margin-bottom: 24px

### 6. Headline (inside shape)

- Source: `content.headline_lines` array (3 strings, each ≤ 23 chars)
- Layout: 3 lines, left-aligned, each line on its own row
- Typography:
  - Open Sauce **Bold** 61px
  - Color: `#000000`
  - Line-height: 1.1
  - Letter-spacing: -0.02em
- Render: each line as `<div>` di dalam container

## Color Palette

```
--cover-white: #FFFFFF      (shape bg, adaptive light)
--cover-black: #000000      (text default, adaptive dark)
--cover-blue:  #0B3DE7      (fallback bg if no image)
```

Hanya 3 warna ini di MVP. No additional accent colors untuk Cover format.

## Adaptive Color Logic

Logo dan source attribution berubah warna otomatis berdasarkan brightness dari area image di belakangnya.

```typescript
// lib/image-brightness.ts
export async function detectImageRegionBrightness(
  imageUrl: string,
  region: { x: number; y: number; w: number; h: number },
  canvasWidth: number,
  canvasHeight: number
): Promise<number> {
  const img = new Image()
  img.crossOrigin = 'anonymous'
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = reject
    img.src = imageUrl
  })

  const canvas = document.createElement('canvas')
  canvas.width = img.naturalWidth
  canvas.height = img.naturalHeight
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, 0, 0)

  // Map design canvas region to actual image dimensions
  const scaleX = img.naturalWidth / canvasWidth
  const scaleY = img.naturalHeight / canvasHeight
  const sx = Math.floor(region.x * scaleX)
  const sy = Math.floor(region.y * scaleY)
  const sw = Math.floor(region.w * scaleX)
  const sh = Math.floor(region.h * scaleY)

  const data = ctx.getImageData(sx, sy, sw, sh).data
  let sum = 0
  let count = 0
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    sum += (0.299 * r + 0.587 * g + 0.114 * b) / 255
    count++
  }
  return count === 0 ? 0.5 : sum / count
}

export function pickContrastColor(luminance: number): 'black' | 'white' {
  return luminance > 0.55 ? 'black' : 'white'
}
```

**Sample regions** (di canvas coordinate 1080×1350):
- Logo: `{ x: 64, y: 64, w: 280, h: 130 }`
- Source attribution: `{ x: 700, y: 64, w: 320, h: 80 }`

Threshold 0.55 untuk fallback ke black/white. Below threshold = bright background → use black logo.

If image fails to load atau CORS blocked → fallback `'black'` (assume light/blue fallback bg).

## Render Pipeline

```typescript
// components/AIStudio/Designs/useDesignRenderer.ts
export function useDesignRenderer() {
  const [state, setState] = useState<RenderState>('idle')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const nodeRef = useRef<HTMLDivElement>(null)

  async function render() {
    setState('rendering')
    try {
      // 1. Wait for fonts (Open Sauce already loaded globally but ensure all weights ready)
      await document.fonts.ready

      // 2. Wait for all <img> in template to load
      const imgs = nodeRef.current?.querySelectorAll('img') ?? []
      await Promise.all(Array.from(imgs).map(img => 
        img.complete ? Promise.resolve() : new Promise<void>(res => {
          img.onload = () => res()
          img.onerror = () => res()
        })
      ))

      // 3. Capture
      const url = await htmlToImage.toPng(nodeRef.current!, {
        width: 1080,
        height: 1350,
        pixelRatio: 1,
        cacheBust: true,
      })
      setDataUrl(url)
      setState('ready')
    } catch (err) {
      setState('error')
    }
  }

  return { state, dataUrl, render, nodeRef }
}
```

**Hidden render node:** template di-mount dengan `position: fixed; left: -10000px; top: 0; width: 1080px; height: 1350px;` supaya tidak terlihat user tapi tetap full-size untuk capture.

## Source Attribution Data Flow

```typescript
function buildSourceAttribution(item: NewsItem, article?: ArticlePreview | null): {
  primary: string
  platform: string
  handle: string | null
} {
  if (item.video_id) {
    return {
      primary: item.channel_title ?? 'YouTube',
      platform: 'YouTube',
      handle: null, // future: extract @handle from channel data
    }
  }
  return {
    primary: article?.site_name ?? SOURCE_LABEL[item.source] ?? item.source,
    platform: '',
    handle: null,
  }
}
```

## Pt → Px Conversion

Canva pakai pt (point) sebagai unit font. Konversi ke px untuk web rendering:

| Element | Canva (pt) | Web (px) |
|---------|-----------|----------|
| Category | 29 | 39 |
| Country | 29 | 39 |
| Headline | 46 | 61 |
| Source | 11 | 15 |

Konversi: `px = pt × 1.333` (96 DPI baseline). Kalau hasil render visually tidak match dengan Canva user, scale up dengan multiplier 1.2-1.5 globally.

## File Structure

```
components/AIStudio/Designs/
  DesignGeneratorModal.tsx        ← format picker + preview + download
  TemplateIGFeed.tsx              ← layout untuk IG Feed Cover
  BentalaLogo.tsx                 ← reusable text-based logo
  SourceAttribution.tsx           ← reusable attribution block
  useDesignRenderer.ts            ← capture hook
  designConstants.ts              ← canvas size, regions, fonts, palette
lib/image-brightness.ts           ← luminance detection utility
components/AIStudio/BPIIntelligence.tsx   ← add `+ Generate Design` button
package.json                       ← add html-to-image dependency
```

## Dependencies Added

- `html-to-image` ^1.11.x (~50KB) — DOM-to-PNG capture, well-maintained, no Puppeteer needed

## Edge Cases

1. **Source image fails to load (CORS/404)** → fallback `#0B3DE7` solid blue background. Logo + source attribution default ke white (since blue is dark).
2. **Image partly transparent** → fallback to solid blue same as above.
3. **CORS blocks brightness sampling** even though image loads → fallback ke black logo (assume bright bg).
4. **Source attribution data missing** (no channel_title, no site_name) → use generic `Image Source: {SOURCE_LABEL[item.source]}`.
5. **Headline less than 3 lines** (validation should prevent but defensive) → render whatever lines exist.
6. **Long source name** → truncate with `text-overflow: ellipsis` at character 35 to prevent overflow.
7. **Headline content_category null** (validation failed at content gen step) → skip category line, just show country, OR show "BPI Konten" as fallback label.
8. **Country not provided** → show only category, no `|` separator.

## Testing

- **Manual visual**: generate cover untuk sample konten dari masing-masing 5 content categories. Compare ke Canva reference visually.
- **Cross-browser**: Chrome, Safari, Firefox. Font rendering different in each — acceptable variance.
- **Image variations**: bright image (logo black), dark image (logo white), no image (blue fallback), broken image URL (fallback).
- **Long/short content**: long headline (70 chars), short country name, very long source name.

## Out of Scope (Future Iterations)

| Format | When | Notes |
|--------|------|-------|
| IG Story (9:16) | Iter 2 | Different layout, full-bleed, larger headline |
| IG Carousel | Iter 3 | Multi-slide, AI-generated slide content |
| Video Cover (9:16) | Iter 4 | Mirip Story, optimasi untuk hook 0.3 detik |
| YouTube Thumbnail (16:9) | Iter 5 | Landscape, ALL CAPS variant |
| AI image generation | Future | Eksplisit di-skip untuk MVP |
| Save to Supabase Storage | Future | Manual download cukup untuk MVP |
| Auto-post ke social | Future | Out of scope completely |

## Decisions Locked In

- **Logo:** text-based replication pakai Open Sauce Bold (no SVG asset needed)
- **Image source:** real pictures only — source thumbnail / og:image, fallback solid blue
- **Bottom shape:** solid white rectangle, sharp corners, no drop shadow
- **Adaptive color:** logo + source attribution adapt to image brightness behind them
- **Content text:** always black on white shape (high contrast guaranteed)
- **No AI image generation** — full stop
- **MVP scope:** IG Feed Cover only, other 4 formats coming in subsequent iterations

## Approval

Pending user review. After approval, transition to writing-plans skill untuk implementation plan.
