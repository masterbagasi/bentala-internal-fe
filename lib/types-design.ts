// Shared types for design generator. Mirrored from BPIIntelligence component
// to avoid coupling Designs/ files to that component's local types.

export interface ArticlePreview {
  title: string
  image: string | null
  images?: string[]
  site_name: string | null
  byline: string | null
  content_html: string
  excerpt: string
  final_url: string
}

import type { ContentCategoryKey } from '@/components/AIStudio/Designs/designConstants'

export interface BPIContent {
  headline: string
  headline_lines: string[]
  caption: string
  hashtags: string
  hashtag_parts: string[]
  content_category: ContentCategoryKey | null
  content_category_reason: string | null
  country: string
}
