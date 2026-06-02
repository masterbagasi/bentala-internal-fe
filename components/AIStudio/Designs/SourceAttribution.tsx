import { FONT_STACK } from './designConstants'

export interface SourceData {
  primary: string       // channel_title or site_name
  platform: string      // "YouTube" for video, "" for article
}

export function SourceAttribution({
  data, color,
}: {
  data: SourceData
  color: 'black' | 'white'
}) {
  return (
    <div
      style={{
        fontFamily: FONT_STACK,
        fontSize: 15,
        lineHeight: 1.2,
        letterSpacing: '0px',
        color,
        textAlign: 'right',
        maxWidth: 320,
      }}
    >
      <div>
        <span style={{ fontWeight: 700 }}>Image Source: </span>
        <span style={{ fontWeight: 700 }}>{data.primary}</span>
        {data.platform && (
          <span style={{ fontWeight: 400 }}> | {data.platform}</span>
        )}
      </div>
    </div>
  )
}

import type { NewsItem } from '@/lib/types'
import type { ArticlePreview } from '@/lib/types-design'

export function buildSourceData(
  item: NewsItem,
  article: ArticlePreview | null,
  fallbackSourceLabel: string
): SourceData {
  if (item.video_id) {
    return {
      primary: item.channel_title || 'YouTube',
      platform: 'YouTube',
    }
  }
  return {
    primary: article?.site_name || fallbackSourceLabel,
    platform: '',
  }
}
