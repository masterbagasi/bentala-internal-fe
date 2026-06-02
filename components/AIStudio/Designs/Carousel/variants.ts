import { SlideCover } from './SlideCover'
import { INTRO_VARIANTS } from './SlideIntro'
import { POINT_VARIANTS } from './SlidePoint'
import { QUOTE_VARIANTS } from './SlideQuote'
import { LIST_VARIANTS } from './SlideList'
import { CLOSING_VARIANTS } from './SlideClosing'
import type { CarouselSlideData } from './types'

// Registry of layout variants per slide type. The user can cycle through these
// per slide via the "Coba design lain" button — useful when an AI-generated
// slide looks off and needs a different layout.
//
// The cover follows a fixed Bentala spec, so it has a single variant.
export const SLIDE_VARIANTS = {
  cover: [{ id: 'spec', label: 'Bentala Cover', component: SlideCover }],
  intro: INTRO_VARIANTS,
  point: POINT_VARIANTS,
  quote: QUOTE_VARIANTS,
  list: LIST_VARIANTS,
  closing: CLOSING_VARIANTS,
} as const

export type SlideTypeKey = CarouselSlideData['type']

export function getVariantCount(type: SlideTypeKey): number {
  return SLIDE_VARIANTS[type].length
}
