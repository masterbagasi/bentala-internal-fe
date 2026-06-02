export interface CoverSlideData {
  type: 'cover'
  title: string
  /** 3 strings — headline pre-split into visual lines. AI must always output this. */
  title_lines?: string[]
  subtitle: string
  title_highlight?: string
  image_query?: string
}
export interface IntroSlideData { type: 'intro'; title: string; highlight: string; body: string; image_query?: string }
export interface QuoteSlideData { type: 'quote'; quote: string; speaker_name: string; speaker_role: string; image_query?: string }
export interface PointSlideData { type: 'point'; title: string; highlight: string; body: string; image_query?: string }
export interface ListSlideData  { type: 'list';  title: string; items: string[]; image_query?: string }

export type CarouselSlideData =
  | CoverSlideData
  | IntroSlideData
  | QuoteSlideData
  | PointSlideData
  | ListSlideData
  | ClosingSlideData

import type { ContentCategoryKey } from '../designConstants'

export interface CarouselSharedProps {
  sourceImageUrl: string | null   // primary image (kept for backwards compat / fallback)
  slideImageUrl?: string | null   // per-slide image picked from the pool
  sourceCredit: string            // e.g. "Image Source: Bule Santun | YouTube"
  logoColor?: 'black' | 'white'
  slideIndex?: number             // 0-based, used for counter "1/N"
  slideTotal?: number             // total slide count
  citation?: string               // "Sumber: CNN Indonesia. (2026). [title]. Diakses pada [date]"
  contentCategory?: ContentCategoryKey | null  // "Local Go Global", "Global Achievement", etc.
  country?: string                // PascalCase country, e.g. "Singapura"
}

export interface ClosingSlideData {
  type: 'closing'
  cta_text?: string  // e.g. "Tulis pendapatmu di kolom komentar!"
}
