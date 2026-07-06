'use client'

import DOMPurify from 'isomorphic-dompurify'

// Shared helpers for the rich-text fields (Description, Headline, Brief,
// Caption, Internal Notes) edited with RichTextEditor (Tiptap → HTML) and
// shown read-only across the app. Tiptap emits <p> paragraphs with inline
// <span style="..."> for color/size/weight/spacing/case/line-height plus
// <strong>/<em>/<u>. We keep exactly those and drop everything else.
const RICH_SANITIZE_OPTS = {
  ALLOWED_TAGS: ['span', 'br', 'p', 'b', 'strong', 'em', 'i', 'u'],
  ALLOWED_ATTR: ['style', 'class'],
}

/** True when a stored value carries HTML markup (i.e. came from RichTextEditor).
 *  Old plain-text values have no tags and are rendered/copy-ed verbatim. */
export function isRichHtml(value: string | null | undefined): boolean {
  return !!value && /<\/?(p|br|span|strong|b|em|i|u)\b[^>]*>/i.test(value)
}

/** Sanitize HTML for safe storage / rendering — keeps inline styling. */
export function sanitizeRich(html: string): string {
  return DOMPurify.sanitize(html ?? '', RICH_SANITIZE_OPTS)
}

/** Flatten rich HTML to plain text — used for clipboard copy (paste into
 *  Instagram/TikTok) and for short list/card previews. Block boundaries become
 *  newlines; entities are decoded. */
export function htmlToPlain(value: string | null | undefined): string {
  if (!value) return ''
  if (!isRichHtml(value)) return value
  let s = value
    .replace(/<\/(p|div|h[1-6])>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
  if (typeof document !== 'undefined') {
    const el = document.createElement('textarea')
    el.innerHTML = s
    s = el.value
  } else {
    s = s
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  }
  return s.replace(/\n{3,}/g, '\n\n').trim()
}

/** Convert an old plain-text value into HTML the editor can show without
 *  losing line breaks. HTML values pass through untouched. */
export function plainToRich(value: string | null | undefined): string {
  if (!value) return ''
  if (isRichHtml(value)) return value
  const esc = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return esc.replace(/\r\n|\n/g, '<br>')
}

/** Read-only viewer: renders rich HTML (sanitized) or plain text verbatim. */
export function RichTextView({
  value, style, className,
}: { value: string | null | undefined; style?: React.CSSProperties; className?: string }) {
  const text = (value ?? '').toString()
  const cls = className ? `rich-text-view ${className}` : 'rich-text-view'
  if (isRichHtml(text)) {
    return (
      <div
        className={cls}
        style={style}
        dangerouslySetInnerHTML={{ __html: sanitizeRich(text) }}
      />
    )
  }
  // Plain text — preserve the user's line breaks.
  return <div className={cls} style={{ whiteSpace: 'pre-wrap', ...style }}>{text}</div>
}
