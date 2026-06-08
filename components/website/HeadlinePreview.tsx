'use client'

import DOMPurify from 'isomorphic-dompurify'
import { useT } from '@/lib/i18n/LanguageProvider'
import { PublicViewportSimulator } from './PublicViewportSimulator'

type Variant = 'principles' | 'cta'

interface Props {
  source: string
  /** Picks the public-site headline preset so the preview uses the
   *  same clamp font-size, padding, and section background the
   *  visitor will see. */
  variant?: Variant
  label?: string
}

/**
 * Renders the admin-editable headline EXACTLY as the public site
 * does — same clamp typography, same accent inline styles, same
 * background slab — then downscales the whole thing through
 * PublicViewportSimulator so it fits the admin's preview card.
 * This guarantees admin → public visual parity regardless of the
 * admin window width.
 */
export function HeadlinePreview({ source, variant = 'principles', label }: Props) {
  const t = useT()
  const safeHtml = source && source.trim() ? buildSafeHtml(source) : ''
  const preset = PRESETS[variant]

  return (
    <div style={{ marginTop: 12 }}>
      {label && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text2)',
            marginBottom: 8,
          }}
        >
          {label}
        </div>
      )}
      <div
        style={{
          background: '#000',
          borderRadius: 12,
          border: '1px solid var(--border)',
          overflow: 'hidden',
        }}
      >
        {safeHtml ? (
          <PublicViewportSimulator>
            <div
              style={{
                padding: preset.sectionPadding,
                background: preset.background,
              }}
            >
              <div
                style={preset.headlineStyle}
                suppressHydrationWarning
                dangerouslySetInnerHTML={{ __html: safeHtml }}
              />
            </div>
          </PublicViewportSimulator>
        ) : (
          <div
            style={{
              padding: '40px 24px',
              fontSize: 12,
              color: 'var(--text2)',
              textAlign: 'center',
              fontStyle: 'italic',
            }}
          >
            {t('(kosong — isi field di atas untuk melihat preview)')}
          </div>
        )}
      </div>
    </div>
  )
}

// Presets mirror the public site's ValuesGrid (principles) and
// CtaBand (cta) styling 1:1 — clamp font-sizes, padding, line-height
// and background colours. The simulator scales the entire subtree
// uniformly, so a change here must mirror the same change in the
// public component to keep parity.
const PRESETS: Record<Variant, {
  sectionPadding: string
  background: string
  headlineStyle: React.CSSProperties
}> = {
  principles: {
    sectionPadding: '80px 52px',
    background: '#000',
    headlineStyle: {
      margin: 0,
      fontFamily: '"Open Sauce Sans", sans-serif',
      fontWeight: 900,
      textTransform: 'uppercase',
      color: '#f0f4ff',
      textAlign: 'center',
      lineHeight: 0.92,
      letterSpacing: '-0.01em',
      fontSize: 'clamp(44px, 7.5vw, 104px)',
    },
  },
  cta: {
    sectionPadding: '112px 52px',
    background: 'transparent',
    headlineStyle: {
      margin: 0,
      fontFamily: '"Open Sauce Sans", sans-serif',
      fontWeight: 700,
      textTransform: 'uppercase',
      color: '#f0f4ff',
      textAlign: 'center',
      lineHeight: 0.92,
      letterSpacing: '-0.015em',
      fontSize: 'clamp(48px, 8vw, 128px)',
    },
  },
}

const BOLD_STYLE =
  'color:transparent;-webkit-text-stroke:2px #0B3DE7;font-weight:800;'
const ITALIC_STYLE =
  'font-family:Georgia,serif;font-style:italic;font-weight:500;color:#0B3DE7;letter-spacing:-0.02em;'

function buildSafeHtml(source: string): string {
  const intermediate = looksLikeHtml(source)
    ? sanitiseRichHtml(source)
    : escapeAndWrapBreaks(source)
  return inlineMarkdownToHtml(intermediate)
}

function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(s)
}

function sanitiseRichHtml(source: string): string {
  const sanitised = sanitizeKeepStyles(source, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'span',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a',
    ],
    ALLOWED_ATTR: ['style', 'class', 'href', 'target', 'rel'],
  })
  return stripOuterParagraphs(sanitised)
}

function escapeAndWrapBreaks(source: string): string {
  const escaped = source
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
  return escaped.replace(/\n/g, '<br/>')
}

function inlineMarkdownToHtml(html: string): string {
  return html
    .replace(/\*\*([^*<>\n]+)\*\*/g, `<span style="${BOLD_STYLE}">$1</span>`)
    .replace(
      /(^|[^*])\*([^*<>\n]+)\*(?!\*)/g,
      `$1<span style="${ITALIC_STYLE}">$2</span>`,
    )
}

function stripOuterParagraphs(html: string): string {
  if (!/<p\b[^>]*>/i.test(html)) return html
  const pattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  const collected = Array.from(html.matchAll(pattern), (m) => m[1].trim())
  if (collected.length === 0) {
    return html.replace(/<\/?p\b[^>]*>/gi, '')
  }
  const FONT_SIZE_RE = /font-size:\s*([\d.]+(?:px|em|rem|pt|%))/i
  return collected
    .filter(Boolean)
    .map((line) => {
      const match = line.match(FONT_SIZE_RE)
      const sizeDecl = match ? `;font-size:${match[1]}` : ''
      return `<span style="display:block;line-height:1${sizeDecl}">${line}</span>`
    })
    .join('')
}

function sanitizeKeepStyles(
  html: string,
  config: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] },
): string {
  const styles: string[] = []
  const stashed = html.replace(/\sstyle="([^"]*)"/gi, (_match, value) => {
    const idx = styles.push(value) - 1
    return ` data-bsi-style="${idx}"`
  })
  const cleaned = DOMPurify.sanitize(stashed, {
    ALLOWED_TAGS: config.ALLOWED_TAGS,
    ALLOWED_ATTR: [...config.ALLOWED_ATTR, 'data-bsi-style'],
  })
  return cleaned.replace(/\sdata-bsi-style="(\d+)"/g, (_m, idx) => {
    const value = styles[Number(idx)]
    if (!value) return ''
    return ` style="${value.replace(/"/g, '&quot;')}"`
  })
}
