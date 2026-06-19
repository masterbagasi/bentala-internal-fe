'use client'

import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import type { NewsItem, NewsCategory } from '@/lib/types'
import { DesignGeneratorModal } from './Designs/DesignGeneratorModal'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useIsMobile } from '@/hooks/useIsMobile'

type FilterType = 'all' | NewsCategory

const CATEGORIES: { key: FilterType; label: string; icon: string; color: string }[] = [
  { key: 'all',           label: 'Semua',              icon: '🌐', color: '#6c63ff' },
  { key: 'diaspora',      label: 'Diaspora & Abroad',  icon: '✈️',  color: '#43d9a2' },
  { key: 'prestasi',      label: 'Prestasi & Juara',   icon: '🏆', color: '#f59e0b' },
  { key: 'budaya',        label: 'Budaya & Kuliner',   icon: '🍜', color: '#f472b6' },
  { key: 'viral',         label: 'Viral & Creator',    icon: '🔥', color: '#ff6b6b' },
  { key: 'video',         label: 'Video YouTube',      icon: '▶️',  color: '#e53e3e' },
  { key: 'internasional', label: 'Media Internasional', icon: '📰', color: '#60a5fa' },
]

const CAT_META: Record<NewsCategory, { label: string; icon: string; color: string }> = {
  diaspora:      { label: 'Diaspora',    icon: '✈️',  color: '#43d9a2' },
  prestasi:      { label: 'Prestasi',    icon: '🏆', color: '#f59e0b' },
  budaya:        { label: 'Budaya',      icon: '🍜', color: '#f472b6' },
  viral:         { label: 'Viral',       icon: '🔥', color: '#ff6b6b' },
  video:         { label: 'YouTube',     icon: '▶️',  color: '#e53e3e' },
  internasional: { label: 'Intl Media',  icon: '📰', color: '#60a5fa' },
}

type ContentCategoryKey =
  | 'global_context'
  | 'indonesian_people'
  | 'indonesian_culture'
  | 'local_go_global'
  | 'global_achievement'

const CONTENT_CATEGORIES: Record<ContentCategoryKey, { label: string; icon: string; color: string; tagline: string }> = {
  global_context:      { label: 'Global Context',      icon: '🌐', color: '#60a5fa', tagline: 'Indonesia di mata dunia' },
  indonesian_people:   { label: 'Indonesian People',   icon: '👥', color: '#43d9a2', tagline: 'Cerita WNI di luar negeri' },
  indonesian_culture:  { label: 'Indonesian Culture',  icon: '🎭', color: '#f472b6', tagline: 'Budaya Indonesia mendunia' },
  local_go_global:     { label: 'Local Go Global',     icon: '🚀', color: '#fb923c', tagline: 'Karya lokal tembus global' },
  global_achievement:  { label: 'Global Achievement',  icon: '🏆', color: '#fbbf24', tagline: 'Prestasi Indonesia internasional' },
}

const SOURCE_LABEL: Record<string, string> = {
  gnews_diaspora:    'Google News',
  gnews_mendunia:    'Google News',
  gnews_prestasi:    'Google News',
  gnews_budaya:      'Google News',
  gnews_kuliner:     'Google News',
  gnews_viral:       'Google News',
  youtube_creator:   'Google News',
  youtube_video_indo:'Google News',
  youtube:           'YouTube',
  bbc_asia:          'BBC Asia',
  aljazeera:         'Al Jazeera',
  cna_asia:          'Channel News Asia',
  reuters_world:     'Reuters',
  gnews_intl:        'Google News (EN)',
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins}m lalu`
  const h = Math.floor(mins / 60)
  if (h < 24) return `${h}j lalu`
  return `${Math.floor(h / 24)}h lalu`
}

function CategoryBadge({ category }: { category: NewsCategory }) {
  const m = CAT_META[category]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700,
      background: `${m.color}18`, border: `1px solid ${m.color}33`, color: m.color,
      flexShrink: 0,
    }}>
      {m.icon} {m.label}
    </span>
  )
}

function NewsCard({
  item, active, onPreview,
}: {
  item: NewsItem
  active: boolean
  onPreview: (item: NewsItem) => void
}) {
  return (
    <div
      onClick={() => onPreview(item)}
      style={{
        padding: '12px 14px', borderRadius: 10,
        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
        background: active ? 'rgba(108,99,255,0.1)' : 'var(--bg2)',
        cursor: 'pointer', transition: 'all 0.12s',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <CategoryBadge category={item.category} />
        <span style={{ fontSize: 10, color: 'var(--text2)', fontWeight: 600 }}>
          {SOURCE_LABEL[item.source] ?? item.source}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 'auto', flexShrink: 0 }}>
          {timeAgo(item.published_at)}
        </span>
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.45, marginBottom: 6 }}>
        {item.title}
      </div>

      {item.summary && (
        <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
          {item.summary.slice(0, 160)}{item.summary.length > 160 ? '…' : ''}
        </div>
      )}
    </div>
  )
}

function VideoCard({
  item, active, onPreview,
}: {
  item: NewsItem
  active: boolean
  onPreview: (item: NewsItem) => void
}) {
  const thumb = item.video_id
    ? `https://img.youtube.com/vi/${item.video_id}/hqdefault.jpg`
    : null
  const m = CAT_META[item.category]

  return (
    <div
      className="yt-card"
      onClick={() => onPreview(item)}
      style={{
        display: 'flex', gap: 12, padding: '10px 12px',
        borderRadius: 10, position: 'relative',
        border: `1.5px solid ${active ? 'rgba(108,99,255,0.8)' : 'rgba(255,255,255,0.06)'}`,
        background: active ? 'rgba(108,99,255,0.08)' : 'var(--bg3)',
        boxShadow: active ? '0 0 0 3px rgba(108,99,255,0.12)' : 'none',
        transition: 'all 0.15s', cursor: 'pointer',
      }}
    >
      <div
        className="yt-thumb-wrap"
        style={{
          position: 'relative', flexShrink: 0,
          width: 148, height: 83, borderRadius: 7, overflow: 'hidden',
          background: '#120808', display: 'block',
        }}
      >
        {thumb && (
          <img loading="lazy" decoding="async"
            src={thumb}
            alt=""
            className="yt-thumb"
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', transition: 'transform 0.3s ease' }}
          />
        )}
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.18)',
        }}>
          <div style={{
            width: 30, height: 30, borderRadius: '50%',
            background: 'rgba(229,62,62,0.9)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            paddingLeft: 2, fontSize: 11, color: '#fff',
            boxShadow: '0 0 0 5px rgba(229,62,62,0.18)',
          }}>▶</div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 5 }}>
        <div style={{
          fontSize: 13, fontWeight: 700, color: 'var(--text)',
          lineHeight: 1.4,
          overflow: 'hidden', display: '-webkit-box',
          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
        }}>
          {item.title}
        </div>

        {item.channel_title && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#e53e3e" style={{ flexShrink: 0 }}>
              <path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.54 3.5 12 3.5 12 3.5s-7.54 0-9.38.55A3.02 3.02 0 0 0 .5 6.19C0 8.04 0 12 0 12s0 3.96.5 5.81a3.02 3.02 0 0 0 2.12 2.14c1.84.55 9.38.55 9.38.55s7.54 0 9.38-.55a3.02 3.02 0 0 0 2.12-2.14C24 15.96 24 12 24 12s0-3.96-.5-5.81zM9.75 15.02V8.98L15.5 12l-5.75 3.02z"/>
            </svg>
            <span style={{
              fontSize: 11, fontWeight: 600, color: '#e53e3e',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {item.channel_title}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 3,
            padding: '1px 6px', borderRadius: 3, fontSize: 9, fontWeight: 700,
            background: `${m.color}18`, border: `1px solid ${m.color}28`, color: m.color,
          }}>
            {m.icon} {m.label}
          </span>
          <span style={{ fontSize: 10, color: 'var(--text2)' }}>{timeAgo(item.published_at)}</span>
        </div>
      </div>
    </div>
  )
}

interface ArticlePreview {
  title: string
  image: string | null
  site_name: string | null
  byline: string | null
  content_html: string
  excerpt: string
  final_url: string
}

function VideoPreview({ item }: { item: NewsItem }) {
  const t = useT()
  const [failed, setFailed] = useState(false)
  const primary = `https://www.youtube-nocookie.com/embed/${item.video_id}?rel=0&modestbranding=1`

  useEffect(() => { setFailed(false) }, [item.id])

  return (
    <>
      <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', background: 'var(--bg3)' }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', lineHeight: 1.4, marginBottom: 6 }}>
          {item.title}
        </div>
        {item.channel_title && (
          <div style={{ fontSize: 11, color: '#e53e3e', fontWeight: 600 }}>
            {item.channel_title}
          </div>
        )}
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 0, background: '#000' }}>
        {failed ? (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center' }}>
            <img loading="lazy" decoding="async"
              src={`https://img.youtube.com/vi/${item.video_id}/hqdefault.jpg`}
              alt=""
              style={{ width: '80%', maxWidth: 360, borderRadius: 10, opacity: 0.65 }}
            />
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, maxWidth: 320 }}>
              {t('Video ini tidak mengizinkan pemutaran di luar YouTube.')}<br />
              {t('Klik tombol di bawah untuk menonton langsung.')}
            </div>
            <a
              href={`https://www.youtube.com/watch?v=${item.video_id}`}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                padding: '10px 18px', borderRadius: 22,
                background: '#e53e3e', color: '#fff',
                fontSize: 12, fontWeight: 700, textDecoration: 'none',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                boxShadow: '0 6px 18px rgba(229,62,62,0.35)',
              }}
            >
              ▶ {t('Tonton di YouTube')}
            </a>
          </div>
        ) : (
          <iframe
            key={item.id}
            src={primary}
            title={item.title}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </>
  )
}

function ArticlePreviewBody({
  item, article, loading, error,
}: {
  item: NewsItem
  article: ArticlePreview | null
  loading: boolean
  error: string | null
}) {
  const t = useT()
  // Sanitize extracted HTML before rendering. Server already strips scripts/iframes,
  // DOMPurify here is defense-in-depth against XSS from untrusted news HTML.
  const safeHtml = useMemo(() => {
    if (!article?.content_html) return ''
    return DOMPurify.sanitize(article.content_html, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'a', 'img', 'figure', 'figcaption', 'blockquote', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'code', 'pre'],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'target', 'rel'],
      ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|tel:|#)/i,
    })
  }, [article?.content_html])

  const cleanExcerpt = article?.excerpt?.replace(/&nbsp;/g, ' ').replace(/ /g, ' ').trim()
  const showDeck = cleanExcerpt && article?.content_html && !article.content_html.includes(cleanExcerpt.slice(0, 40))
  const sourceLabel = article?.site_name || SOURCE_LABEL[item.source] || item.source

  return (
    <div className="reader-shell">
      <article className="reader-article">
        {article?.image && (
          <figure className="reader-hero">
            <img loading="lazy" decoding="async"
              src={article.image}
              alt=""
              onError={e => { ((e.currentTarget as HTMLImageElement).parentElement as HTMLElement).style.display = 'none' }}
            />
          </figure>
        )}

        <div className="reader-kicker">
          <span className="kicker-cat">{CAT_META[item.category].label}</span>
          <span className="kicker-sep">/</span>
          <span className="kicker-source">{sourceLabel}</span>
        </div>

        <h1 className="reader-headline">
          {article?.title || item.title}
        </h1>

        {showDeck && (
          <p className="reader-deck">{cleanExcerpt}</p>
        )}

        <div className="reader-meta">
          {article?.byline && (
            <>
              <span className="meta-by">By</span>
              <strong>{article.byline}</strong>
              <span className="meta-dot">·</span>
            </>
          )}
          <time>{timeAgo(item.published_at)}</time>
        </div>

        {loading && (
          <div className="reader-skeleton">
            <div className="reader-skeleton-row tall" style={{ width: '88%' }} />
            <div className="reader-skeleton-row" style={{ width: '94%' }} />
            <div className="reader-skeleton-row" style={{ width: '90%' }} />
            <div className="reader-skeleton-row" style={{ width: '96%' }} />
            <div className="reader-skeleton-row" style={{ width: '78%' }} />
            <div className="reader-skeleton-row" style={{ width: '92%' }} />
            <div className="reader-skeleton-row" style={{ width: '85%' }} />
          </div>
        )}

        {!loading && error && (
          <div className="reader-error">
            <div className="reader-error-title">{t('Preview tidak tersedia')}</div>
            {item.summary && (
              <div className="reader-error-summary">
                {item.summary.replace(/&nbsp;/g, ' ').replace(/ /g, ' ')}
              </div>
            )}
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="reader-error-link"
            >
              {t('Baca artikel lengkap →')}
            </a>
          </div>
        )}

        {!loading && !error && article && (
          <div
            className="reader-body"
            dangerouslySetInnerHTML={{ __html: safeHtml || `<p class="empty">${t('Konten tidak dapat diekstrak dari halaman ini.')}</p>` }}
          />
        )}
      </article>

      <style>{`
        .reader-shell {
          flex: 1; overflow: auto; min-height: 0;
          background: var(--bg);
          background-image:
            radial-gradient(ellipse 1100px 550px at 85% -10%, rgba(108,99,255,0.10) 0%, transparent 55%),
            radial-gradient(ellipse 700px 500px at -8% 105%, rgba(124,75,255,0.06) 0%, transparent 50%);
          color: var(--text);
          position: relative;
        }
        .reader-shell::before {
          content: '';
          position: absolute; inset: 0;
          pointer-events: none;
          mix-blend-mode: overlay;
          opacity: 0.04;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' /%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
        }

        .reader-article {
          max-width: 680px;
          margin: 0 auto;
          padding: 48px 44px 80px;
          font-family: var(--font-sans);
          font-feature-settings: "kern" 1, "liga" 1;
          position: relative;
        }
        .reader-article > * {
          animation: readerFadeUp 0.55s cubic-bezier(0.2, 0.8, 0.2, 1) backwards;
        }
        .reader-article > *:nth-child(1) { animation-delay: 0ms; }
        .reader-article > *:nth-child(2) { animation-delay: 80ms; }
        .reader-article > *:nth-child(3) { animation-delay: 150ms; }
        .reader-article > *:nth-child(4) { animation-delay: 220ms; }
        .reader-article > *:nth-child(5) { animation-delay: 280ms; }
        .reader-article > *:nth-child(6) { animation-delay: 340ms; }
        @keyframes readerFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }

        .reader-hero {
          margin: 0 0 36px;
          aspect-ratio: 16/9;
          background: var(--bg3);
          overflow: hidden;
          border-radius: 4px;
          box-shadow:
            0 1px 0 rgba(255,255,255,0.04) inset,
            0 24px 60px -20px rgba(0,0,0,0.55),
            0 8px 20px -10px rgba(0,0,0,0.45);
          position: relative;
          border: 1px solid var(--border);
        }
        .reader-hero::after {
          content: '';
          position: absolute; inset: 0;
          background: linear-gradient(180deg, transparent 55%, rgba(15,17,23,0.45) 100%);
          pointer-events: none;
        }
        .reader-hero img {
          width: 100%; height: 100%; object-fit: cover; display: block;
        }

        .reader-kicker {
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          margin-bottom: 18px;
          display: inline-flex;
          align-items: center;
          gap: 10px;
        }
        .kicker-cat { color: #9b91ff; }
        .kicker-sep { color: rgba(155,145,255,0.35); font-weight: 300; }
        .kicker-source { color: rgba(232,234,246,0.55); }

        .reader-headline {
          font-family: var(--font-sans);
          font-size: 38px;
          font-weight: 800;
          line-height: 1.1;
          letter-spacing: -0.022em;
          color: #f4f5fb;
          margin: 0 0 20px;
          text-wrap: balance;
        }

        .reader-deck {
          font-family: var(--font-sans);
          font-size: 17px;
          line-height: 1.55;
          color: rgba(232,234,246,0.72);
          margin: 0 0 26px;
          font-weight: 400;
          text-wrap: pretty;
        }

        .reader-meta {
          font-family: var(--font-sans);
          font-size: 12.5px;
          color: rgba(232,234,246,0.55);
          padding-bottom: 28px;
          margin-bottom: 36px;
          border-bottom: 1px solid var(--border);
          display: flex;
          align-items: center;
          gap: 6px;
          letter-spacing: 0.005em;
          font-weight: 500;
        }
        .reader-meta strong {
          color: var(--text);
          font-weight: 700;
        }
        .reader-meta .meta-by {
          color: rgba(232,234,246,0.4);
          font-weight: 500;
          margin-right: 2px;
        }
        .reader-meta .meta-dot {
          color: rgba(155,145,255,0.4);
          margin: 0 4px;
        }

        .reader-body {
          font-family: var(--font-sans);
          font-size: 16px;
          line-height: 1.72;
          color: rgba(232,234,246,0.9);
          font-feature-settings: "kern" 1, "liga" 1;
          font-weight: 400;
        }
        .reader-body p {
          margin: 0 0 20px;
          text-wrap: pretty;
        }
        .reader-body > p:first-of-type:not(.empty)::first-letter {
          font-family: var(--font-sans);
          font-size: 72px;
          font-weight: 800;
          line-height: 0.85;
          float: left;
          margin: 6px 12px -2px -2px;
          color: var(--accent);
          text-shadow: 0 0 32px rgba(108,99,255,0.4);
        }

        .reader-body h2 {
          font-family: var(--font-sans);
          font-size: 24px;
          font-weight: 800;
          line-height: 1.25;
          margin: 40px 0 12px;
          color: #f4f5fb;
          letter-spacing: -0.012em;
        }

        .reader-body h3 {
          font-family: var(--font-sans);
          font-size: 19px;
          font-weight: 700;
          line-height: 1.3;
          margin: 30px 0 10px;
          color: var(--text);
        }
        .reader-body h4, .reader-body h5, .reader-body h6 {
          font-family: var(--font-sans);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          color: rgba(232,234,246,0.5);
          margin: 28px 0 8px;
        }

        .reader-body blockquote {
          margin: 32px 0 32px -8px;
          padding: 8px 24px 8px 28px;
          border-left: 3px solid var(--accent);
          font-family: var(--font-sans);
          font-size: 19px;
          line-height: 1.5;
          color: rgba(232,234,246,0.92);
          font-weight: 500;
          font-style: normal;
        }

        .reader-body a {
          color: var(--text);
          text-decoration-line: underline;
          text-decoration-thickness: 1px;
          text-decoration-color: rgba(108,99,255,0.6);
          text-underline-offset: 4px;
          transition: text-decoration-color 0.15s, text-decoration-thickness 0.15s, color 0.15s;
        }
        .reader-body a:hover {
          color: #c5bfff;
          text-decoration-color: var(--accent);
          text-decoration-thickness: 2px;
        }

        .reader-body img {
          width: 100%;
          height: auto;
          margin: 32px 0 8px;
          border-radius: 4px;
          border: 1px solid var(--border);
        }
        .reader-body figure {
          margin: 32px 0;
        }
        .reader-body figure img {
          margin: 0;
        }
        .reader-body figcaption {
          font-family: var(--font-sans);
          font-size: 12.5px;
          color: rgba(232,234,246,0.5);
          line-height: 1.5;
          padding: 10px 4px 14px;
          letter-spacing: 0.005em;
          border-bottom: 1px solid var(--border);
          font-weight: 500;
        }

        .reader-body ul, .reader-body ol {
          padding-left: 24px;
          margin: 0 0 22px;
        }
        .reader-body li {
          margin-bottom: 10px;
        }
        .reader-body ul li::marker {
          color: var(--accent);
        }
        .reader-body ol li::marker {
          color: var(--accent);
          font-weight: 700;
        }

        .reader-body strong, .reader-body b {
          font-weight: 600;
          color: #f4f5fb;
        }
        .reader-body em, .reader-body i {
          font-style: italic;
        }
        .reader-body code {
          font-family: 'JetBrains Mono', ui-monospace, monospace;
          background: rgba(108,99,255,0.12);
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 0.88em;
          color: #c5bfff;
        }
        .reader-body pre {
          background: var(--bg2);
          border: 1px solid var(--border);
          padding: 16px 20px;
          border-radius: 6px;
          overflow-x: auto;
          margin: 24px 0;
        }
        .reader-body pre code {
          background: transparent;
          padding: 0;
          color: var(--text);
        }
        .reader-body p.empty {
          color: rgba(232,234,246,0.4); font-style: italic; text-align: center; padding: 24px 0;
        }

        .reader-skeleton {
          display: flex; flex-direction: column; gap: 14px;
          margin-top: 8px;
        }
        .reader-skeleton-row {
          height: 14px;
          background: linear-gradient(90deg, var(--bg2) 0%, var(--bg3) 50%, var(--bg2) 100%);
          background-size: 200% 100%;
          animation: readerShimmer 1.6s infinite ease-in-out;
          border-radius: 3px;
        }
        .reader-skeleton-row.tall { height: 28px; margin-bottom: 8px; }
        @keyframes readerShimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .reader-error {
          padding: 26px 24px;
          background: rgba(108,99,255,0.06);
          border-left: 3px solid var(--accent);
          border-radius: 0 6px 6px 0;
          margin: 4px 0;
        }
        .reader-error-title {
          font-family: var(--font-sans);
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.16em;
          text-transform: uppercase;
          color: #9b91ff;
          margin-bottom: 14px;
        }
        .reader-error-summary {
          font-family: var(--font-sans);
          font-size: 15px;
          line-height: 1.65;
          color: rgba(232,234,246,0.85);
          margin-bottom: 20px;
        }
        .reader-error-link {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 11px 20px;
          background: var(--accent);
          color: #fff;
          font-family: var(--font-sans);
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-decoration: none;
          border-radius: 4px;
          transition: filter 0.15s, transform 0.15s;
        }
        .reader-error-link:hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
      `}</style>
    </div>
  )
}

function PreviewPanel({
  item, isAnalyzing, isAnalyzed, onAnalyze, onClose, isMobile,
}: {
  item: NewsItem
  isAnalyzing: boolean
  isAnalyzed: boolean
  onAnalyze: (item: NewsItem, article: ArticlePreview | null) => void
  onClose: () => void
  isMobile: boolean
}) {
  const t = useT()
  const isVideo = Boolean(item.video_id)
  const [article, setArticle] = useState<ArticlePreview | null>(null)
  const [articleLoading, setArticleLoading] = useState(false)
  const [articleError, setArticleError] = useState<string | null>(null)

  useEffect(() => {
    if (isVideo) return
    let cancelled = false
    setArticle(null)
    setArticleError(null)
    setArticleLoading(true)
    fetch(`/api/ai/article-preview?url=${encodeURIComponent(item.url)}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return
        if (data.error) {
          setArticleError(data.error === 'BOT_CHALLENGE' ? data.message : data.error)
        } else {
          setArticle(data)
        }
      })
      .catch(() => { if (!cancelled) setArticleError(t('Gagal memuat artikel')) })
      .finally(() => { if (!cancelled) setArticleLoading(false) })
    return () => { cancelled = true }
  }, [item.id, item.url, isVideo, t])

  const externalHref = article?.final_url ?? item.url

  return (
    <div style={{
      background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
      display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0,
      minHeight: isMobile ? '60vh' : undefined,
    }}>
      <div style={{
        padding: '12px 14px', borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
      }}>
        <CategoryBadge category={item.category} />
        <span style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600 }}>
          {SOURCE_LABEL[item.source] ?? item.source}
        </span>
        <span style={{ fontSize: 10, color: 'var(--text2)', opacity: 0.7 }}>
          · {timeAgo(item.published_at)}
        </span>

        <div style={{ flex: 1 }} />

        <button
          onClick={() => onAnalyze(item, article)}
          disabled={isAnalyzing}
          style={{
            padding: '6px 14px', borderRadius: 16,
            background: isAnalyzed ? 'rgba(108,99,255,0.12)' : 'var(--accent)',
            border: `1px solid ${isAnalyzed ? 'rgba(108,99,255,0.35)' : 'var(--accent)'}`,
            color: isAnalyzed ? 'var(--accent)' : '#fff',
            fontSize: 11, fontWeight: 700,
            cursor: isAnalyzing ? 'not-allowed' : 'pointer',
            display: 'inline-flex', alignItems: 'center', gap: 5,
            transition: 'all 0.12s',
            opacity: isAnalyzing ? 0.7 : 1,
          }}
        >
          {isAnalyzing ? t('Membuat konten…') : isAnalyzed ? t('✓ Konten Dibuat') : t('✦ Buat Konten dengan AI')}
        </button>
        <a
          href={externalHref}
          target="_blank"
          rel="noopener noreferrer"
          title={t('Buka di tab baru')}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--bg3)', border: '1px solid var(--border)',
            color: 'var(--text2)', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, lineHeight: 1, textDecoration: 'none',
          }}
        >
          ↗
        </a>
        <button
          onClick={onClose}
          title={t('Tutup')}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'var(--bg3)', border: '1px solid var(--border)',
            color: 'var(--text2)', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, lineHeight: 1,
          }}
        >
          ✕
        </button>
      </div>

      {isVideo ? (
        <VideoPreview item={item} />
      ) : (
        <ArticlePreviewBody
          item={item}
          article={article}
          loading={articleLoading}
          error={articleError}
        />
      )}
    </div>
  )
}

function ContentCategoryBlock({
  categoryKey, reason,
}: {
  categoryKey: ContentCategoryKey | null
  reason: string | null
}) {
  const t = useT()
  if (!categoryKey) return null
  const meta = CONTENT_CATEGORIES[categoryKey]

  return (
    <div style={{
      padding: '14px 16px',
      borderRadius: 10,
      border: `1px solid ${meta.color}33`,
      background: `linear-gradient(135deg, ${meta.color}14 0%, ${meta.color}06 60%, transparent 100%)`,
      animation: 'slideUp 0.3s ease backwards',
      position: 'relative',
      overflow: 'hidden',
    }}>
      <div style={{
        position: 'absolute', top: 0, left: 0, bottom: 0,
        width: 3, background: meta.color,
        boxShadow: `0 0 24px ${meta.color}88`,
      }} />

      <div style={{
        fontSize: 9, fontWeight: 700, color: 'var(--text2)',
        textTransform: 'uppercase', letterSpacing: '0.16em',
        marginBottom: 8,
      }}>
        {t('Kategori Konten')}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: reason ? 8 : 0 }}>
        <span style={{
          width: 32, height: 32, borderRadius: 8,
          background: `${meta.color}26`,
          border: `1px solid ${meta.color}55`,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 16, flexShrink: 0,
        }}>
          {meta.icon}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{
            fontSize: 14, fontWeight: 800, color: meta.color,
            letterSpacing: '-0.01em', lineHeight: 1.2,
          }}>
            {meta.label}
          </div>
          <div style={{
            fontSize: 11, color: 'var(--text2)',
            lineHeight: 1.3, marginTop: 1,
          }}>
            {meta.tagline}
          </div>
        </div>
      </div>

      {reason && (
        <div style={{
          fontSize: 11.5,
          lineHeight: 1.5,
          color: 'rgba(232,234,246,0.78)',
          paddingLeft: 42,
          fontStyle: 'normal',
        }}>
          {reason}
        </div>
      )}
    </div>
  )
}

function HeadlineBlock({
  lines, full, meta, copied, onCopy,
}: {
  lines: string[]
  full: string
  meta: { valid: boolean; reason: string | null; line_lengths: number[]; total_length: number } | null
  copied: boolean
  onCopy: () => void
}) {
  const t = useT()
  const accentColor = '#f59e0b'
  const MAX_LINE = 23
  const safeLines = lines.length === 3 ? lines : [...lines, '', '', ''].slice(0, 3)

  return (
    <div className="content-block" style={{
      background: 'var(--bg3)', borderRadius: 10,
      border: '1px solid var(--border)',
      animation: 'slideUp 0.3s ease backwards',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(0,0,0,0.12)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: accentColor, flexShrink: 0,
          boxShadow: `0 0 12px ${accentColor}`,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: accentColor,
          textTransform: 'uppercase', letterSpacing: '0.12em',
        }}>
          Headline
        </span>
        <span style={{
          fontSize: 9, color: meta?.valid === false ? '#ff6b6b' : 'var(--text2)',
          fontWeight: 600,
          padding: '1px 6px', borderRadius: 8,
          background: meta?.valid === false ? 'rgba(255,107,107,0.12)' : 'rgba(255,255,255,0.04)',
          border: meta?.valid === false ? '1px solid rgba(255,107,107,0.3)' : '1px solid rgba(255,255,255,0.06)',
        }}>
          {full.length}/55-70
        </span>
        <span style={{ flex: 1 }} />
        <button
          onClick={onCopy}
          style={{
            padding: '3px 9px', borderRadius: 12,
            background: copied ? accentColor : 'transparent',
            border: `1px solid ${copied ? accentColor : 'rgba(255,255,255,0.12)'}`,
            color: copied ? '#0f1117' : 'var(--text2)',
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {copied ? t('✓ Tersalin') : '⧉ Copy'}
        </button>
      </div>

      {/* Cover preview — 3 lines as they'll appear */}
      <div style={{
        padding: '20px 16px',
        background: 'linear-gradient(140deg, rgba(245,158,11,0.06) 0%, rgba(245,158,11,0) 60%)',
        display: 'flex', flexDirection: 'column', gap: 4,
        borderBottom: '1px solid var(--border)',
      }}>
        {safeLines.map((line, i) => {
          const len = line.length
          const over = len > MAX_LINE
          return (
            <div key={i} style={{ position: 'relative', display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 17,
                fontWeight: 800,
                lineHeight: 1.3,
                letterSpacing: '-0.015em',
                color: over ? '#ff6b6b' : 'var(--text)',
                textShadow: over ? 'none' : '0 1px 0 rgba(0,0,0,0.3)',
                flex: 1,
                minWidth: 0,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'clip',
              }}>
                {line || <span style={{ opacity: 0.3, fontStyle: 'italic' }}>—</span>}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 700,
                color: over ? '#ff6b6b' : 'rgba(232,234,246,0.4)',
                fontFamily: 'ui-monospace, "SF Mono", monospace',
                flexShrink: 0,
                padding: '1px 5px', borderRadius: 4,
                background: over ? 'rgba(255,107,107,0.12)' : 'transparent',
              }}>
                {len}/{MAX_LINE}
              </span>
            </div>
          )
        })}
      </div>

      {meta && !meta.valid && meta.reason && (
        <div style={{
          padding: '8px 14px',
          background: 'rgba(255,107,107,0.06)',
          fontSize: 10,
          color: '#ff6b6b',
          lineHeight: 1.4,
          fontWeight: 500,
        }}>
          ⚠ {meta.reason}
        </div>
      )}
    </div>
  )
}

function HashtagBlock({
  parts, full, copied, onCopy,
}: {
  parts: string[]
  full: string
  copied: boolean
  onCopy: () => void
}) {
  const t = useT()
  const accentColor = '#43d9a2'
  // parts order is fixed: [brand, tagline, category, country, audience]
  const labels = ['Brand', 'Tagline', t('Kategori'), t('Negara'), t('Audiens')]
  const safeParts = parts.length === 5 ? parts : full.split(/\s+/).filter(Boolean)

  return (
    <div className="content-block" style={{
      background: 'var(--bg3)', borderRadius: 10,
      border: '1px solid var(--border)',
      animation: 'slideUp 0.3s ease backwards',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(0,0,0,0.12)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: accentColor, flexShrink: 0,
          boxShadow: `0 0 12px ${accentColor}`,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: accentColor,
          textTransform: 'uppercase', letterSpacing: '0.12em', flex: 1,
        }}>
          {t('Hashtags · 5 tag baku')}
        </span>
        <button
          onClick={onCopy}
          style={{
            padding: '3px 9px', borderRadius: 12,
            background: copied ? accentColor : 'transparent',
            border: `1px solid ${copied ? accentColor : 'rgba(255,255,255,0.12)'}`,
            color: copied ? '#0f1117' : 'var(--text2)',
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.15s',
          }}
        >
          {copied ? t('✓ Tersalin') : '⧉ Copy'}
        </button>
      </div>

      <div style={{
        padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {safeParts.map((tag, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              fontSize: 9, fontWeight: 700, color: 'var(--text2)',
              textTransform: 'uppercase', letterSpacing: '0.08em',
              minWidth: 56, flexShrink: 0,
            }}>
              {labels[i] ?? `Tag ${i + 1}`}
            </span>
            <span style={{
              fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
              fontSize: 12.5,
              color: accentColor,
              fontWeight: 600,
              wordBreak: 'break-all',
              flex: 1, minWidth: 0,
            }}>
              {tag}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ContentBlock({
  label, value, copied, onCopy, accentColor, size = 'md', multiline = false, hashtag = false,
}: {
  label: string
  value: string
  copied: boolean
  onCopy: () => void
  accentColor: string
  size?: 'sm' | 'md' | 'lg'
  multiline?: boolean
  hashtag?: boolean
}) {
  const t = useT()
  const fontSize = size === 'lg' ? 13 : size === 'sm' ? 12 : 14

  return (
    <div className="content-block" style={{
      background: 'var(--bg3)', borderRadius: 10,
      border: '1px solid var(--border)',
      animation: 'slideUp 0.3s ease backwards',
      overflow: 'hidden',
    }}>
      <div style={{
        padding: '8px 12px', display: 'flex', alignItems: 'center', gap: 8,
        borderBottom: '1px solid var(--border)',
        background: 'rgba(0,0,0,0.12)',
      }}>
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: accentColor, flexShrink: 0,
          boxShadow: `0 0 12px ${accentColor}`,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 700, color: accentColor,
          textTransform: 'uppercase', letterSpacing: 0.12 + 'em', flex: 1,
        }}>
          {label}
        </span>
        <button
          onClick={onCopy}
          title={t('Salin ke clipboard')}
          style={{
            padding: '3px 9px', borderRadius: 12,
            background: copied ? accentColor : 'transparent',
            border: `1px solid ${copied ? accentColor : 'rgba(255,255,255,0.12)'}`,
            color: copied ? '#0f1117' : 'var(--text2)',
            fontSize: 10, fontWeight: 700, cursor: 'pointer',
            transition: 'all 0.15s',
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          {copied ? t('✓ Tersalin') : '⧉ Copy'}
        </button>
      </div>

      <div style={{
        padding: '12px 14px',
        fontSize,
        lineHeight: multiline ? 1.65 : 1.45,
        color: 'var(--text)',
        whiteSpace: multiline ? 'pre-wrap' : 'normal',
        wordBreak: hashtag ? 'break-word' : 'normal',
        fontWeight: size === 'md' && !multiline && !hashtag ? 600 : 400,
        ...(hashtag && { color: '#43d9a2', fontFamily: 'ui-monospace, "SF Mono", monospace', fontSize: 12 }),
      }}>
        {value}
      </div>
    </div>
  )
}

export default function BPIIntelligence() {
  const t = useT()
  const isMobile = useIsMobile()
  const [news, setNews] = useState<NewsItem[]>([])
  const [filter, setFilter] = useState<FilterType>('all')
  const [previewItem, setPreviewItem] = useState<NewsItem | null>(null)
  const [analyzedItem, setAnalyzedItem] = useState<NewsItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [youtubeReady, setYoutubeReady] = useState(false)
  const [cachedAt, setCachedAt] = useState<number | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [content, setContent] = useState<{
    headline: string
    headline_lines: string[]
    caption: string
    hashtags: string
    hashtag_parts: string[]
    content_category: ContentCategoryKey | null
    content_category_reason: string | null
    country: string
  } | null>(null)
  const [headlineMeta, setHeadlineMeta] = useState<{ valid: boolean; reason: string | null; line_lengths: number[]; total_length: number } | null>(null)
  const [designOpen, setDesignOpen] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  function copyToClipboard(text: string, field: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedField(field)
      setTimeout(() => setCopiedField(null), 1600)
    }).catch(() => { /* ignore */ })
  }

  const loadNews = useCallback(async (force = false) => {
    setLoading(true)
    setLoadError(null)
    const qs = force ? '?refresh=1' : ''
    try {
      const [newsResult, ytResult] = await Promise.allSettled([
        fetch(`/api/ai/news${qs}`).then(r => r.json()),
        fetch(`/api/ai/youtube${qs}`).then(r => r.json()),
      ])

      let all: NewsItem[] = []
      let latestTs = 0

      if (newsResult.status === 'fulfilled' && newsResult.value.items) {
        all = [...all, ...newsResult.value.items]
        if (newsResult.value.cached_at) latestTs = Math.max(latestTs, newsResult.value.cached_at)
      } else if (newsResult.status === 'rejected') {
        setLoadError(t('Gagal memuat berita. Coba refresh.'))
      }

      if (ytResult.status === 'fulfilled' && ytResult.value.items) {
        all = [...all, ...ytResult.value.items]
        setYoutubeReady(true)
        if (ytResult.value.cached_at) latestTs = Math.max(latestTs, ytResult.value.cached_at)
      } else {
        setYoutubeReady(false)
      }

      if (latestTs) setCachedAt(latestTs)

      all.sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
      setNews(all)
    } catch {
      setLoadError(t('Gagal memuat berita. Coba refresh.'))
    } finally {
      setLoading(false)
    }
  }, [t])

  const handleRefresh = () => { void loadNews(true) }
  useEffect(() => { void loadNews() }, [loadNews])

  const filtered = filter === 'all'
    ? news
    : filter === 'video'
      ? news.filter(n => Boolean(n.video_id))
      : news.filter(n => n.category === filter && !n.video_id)

  const counts: Record<FilterType, number> = {
    all: news.length,
    diaspora: news.filter(n => n.category === 'diaspora' && !n.video_id).length,
    prestasi: news.filter(n => n.category === 'prestasi' && !n.video_id).length,
    budaya: news.filter(n => n.category === 'budaya' && !n.video_id).length,
    viral: news.filter(n => n.category === 'viral' && !n.video_id).length,
    video: news.filter(n => Boolean(n.video_id)).length,
    internasional: news.filter(n => n.category === 'internasional' && !n.video_id).length,
  }

  const contentAbortRef = useRef<AbortController | null>(null)
  const contentRequestIdRef = useRef(0)

  async function createContent(item: NewsItem, article: ArticlePreview | null) {
    // Cancel any in-flight content generation to avoid race conditions
    contentAbortRef.current?.abort()
    const ctrl = new AbortController()
    contentAbortRef.current = ctrl
    const myReqId = ++contentRequestIdRef.current

    setAnalyzing(true)
    setContent(null)
    setHeadlineMeta(null)
    setAnalyzeError(null)
    setAnalyzedItem(item)

    try {
      const res = await fetch('/api/ai/bpi-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            title: article?.title || item.title,
            summary: item.summary,
            source: SOURCE_LABEL[item.source] ?? item.source,
            category: item.category,
            site_name: article?.site_name ?? null,
            excerpt: article?.excerpt ?? null,
            final_url: article?.final_url ?? null,
            is_video: Boolean(item.video_id),
            channel_title: item.channel_title ?? null,
            video_id: item.video_id ?? null,
          },
        }),
        signal: ctrl.signal,
      })
      const data = await res.json()
      // Drop response if a newer request superseded this one
      if (myReqId !== contentRequestIdRef.current) return
      if (!res.ok) throw new Error(data.error ?? t('Gagal membuat konten'))
      setContent(data.content ?? null)
      setHeadlineMeta(data.headline_meta ?? null)
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      if (myReqId !== contentRequestIdRef.current) return
      setAnalyzeError(e instanceof Error ? e.message : t('Terjadi kesalahan'))
    } finally {
      if (myReqId === contentRequestIdRef.current) {
        setAnalyzing(false)
      }
    }
  }

  const gridTemplate = previewItem
    ? 'minmax(320px, 360px) minmax(0, 1fr) minmax(320px, 360px)'
    : '1fr 380px'

  return (
    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : gridTemplate, gap: 16, height: isMobile ? 'auto' : 'calc(100vh - 180px)', minHeight: isMobile ? undefined : 500 }}>
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: isMobile ? '60vh' : undefined }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t('Koneksi Indonesia ke Dunia')}</span>
              {!loading && (
                <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 8 }}>{news.length} {t('konten')}</span>
              )}
              {cachedAt && !loading && (
                <span style={{ fontSize: 10, color: 'var(--text2)', marginLeft: 6, opacity: 0.6 }}>
                  · {t('diperbarui')} {timeAgo(new Date(cachedAt).toISOString())}
                </span>
              )}
            </div>
            <button
              onClick={handleRefresh}
              style={{ fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}
            >
              ↻ Refresh
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2 }}>
            {CATEGORIES.map(cat => {
              const isEmpty = cat.key !== 'all' && !loading && counts[cat.key] === 0
              const isActive = filter === cat.key
              return (
                <button
                  key={cat.key}
                  onClick={() => !isEmpty && setFilter(cat.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '5px 10px', borderRadius: 20, border: '1px solid',
                    borderColor: isActive ? cat.color : 'var(--border)',
                    background: isActive ? `${cat.color}15` : 'var(--bg3)',
                    color: isActive ? cat.color : isEmpty ? 'rgba(255,255,255,0.2)' : 'var(--text2)',
                    fontSize: 11, fontWeight: isActive ? 700 : 400,
                    cursor: isEmpty ? 'not-allowed' : 'pointer',
                    flexShrink: 0, whiteSpace: 'nowrap',
                    transition: 'all 0.12s',
                    opacity: isEmpty ? 0.45 : 1,
                  }}
                >
                  <span>{cat.icon}</span>
                  {cat.label}
                  {!isEmpty && counts[cat.key] > 0 && (
                    <span style={{ fontSize: 10, opacity: 0.7 }}>({counts[cat.key]})</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div style={{
          flex: 1, overflowY: 'auto',
          padding: filter === 'video' ? '12px 14px' : '12px 16px',
          display: 'flex', flexDirection: 'column',
          gap: filter === 'video' ? 6 : 8,
        }}>
          {loading ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text2)', fontSize: 13 }}>
              <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              {t('Mengambil berita terbaru...')}
            </div>
          ) : loadError ? (
            <div style={{ padding: '12px 16px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
              {loadError}
            </div>
          ) : counts.video === 0 && filter === 'video' && !youtubeReady ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, textAlign: 'center', padding: 24, color: 'var(--text2)' }}>
              <div style={{ fontSize: 32, opacity: 0.3 }}>▶</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('YouTube API belum dikonfigurasi')}</div>
              <div style={{ fontSize: 12, lineHeight: 1.7, maxWidth: 280 }}>
                {t('Tambahkan')} <code style={{ background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>YOUTUBE_API_KEY</code> {t('ke file')} <code style={{ background: 'var(--bg3)', padding: '1px 5px', borderRadius: 4, fontSize: 11 }}>.env.local</code> {t('untuk mengaktifkan konten video langsung dari YouTube.')}
              </div>
              <a
                href="https://console.cloud.google.com/apis/library/youtube.googleapis.com"
                target="_blank"
                rel="noopener noreferrer"
                style={{ fontSize: 11, color: '#e53e3e', fontWeight: 600, textDecoration: 'none' }}
              >
                {t('Buka Google Cloud Console →')}
              </a>
            </div>
          ) : filtered.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center', padding: 24 }}>
              <div style={{ fontSize: 28, opacity: 0.2 }}>
                {filter === 'internasional' ? '📰' : filter === 'diaspora' ? '✈️' : filter === 'prestasi' ? '🏆' : filter === 'budaya' ? '🍜' : '🔥'}
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', opacity: 0.5 }}>
                {filter === 'internasional'
                  ? t('Tidak ada liputan Indonesia hari ini')
                  : t('Belum ada konten di kategori ini')}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, maxWidth: 240, opacity: 0.7 }}>
                {filter === 'internasional'
                  ? t('BBC & Al Jazeera sedang tidak memuat artikel tentang Indonesia. Coba refresh beberapa saat lagi.')
                  : t('Coba tekan Refresh untuk memuat ulang berita terbaru.')}
              </div>
              <button
                onClick={handleRefresh}
                style={{ marginTop: 4, fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
              >
                ↻ {t('Refresh sekarang')}
              </button>
            </div>
          ) : (
            filtered.map(item => (
              item.video_id
                ? <VideoCard
                    key={item.id}
                    item={item}
                    active={previewItem?.id === item.id}
                    onPreview={setPreviewItem}
                  />
                : <NewsCard
                    key={item.id}
                    item={item}
                    active={previewItem?.id === item.id}
                    onPreview={setPreviewItem}
                  />
            ))
          )}
        </div>
      </div>

      {previewItem && (
        <PreviewPanel
          item={previewItem}
          isAnalyzing={analyzing && analyzedItem?.id === previewItem.id}
          isAnalyzed={!analyzing && analyzedItem?.id === previewItem.id && Boolean(content)}
          onAnalyze={createContent}
          onClose={() => setPreviewItem(null)}
          isMobile={isMobile}
        />
      )}

      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0, minHeight: isMobile ? '50vh' : undefined }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>✦ {t('Konten BPI')}</div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>
            {t('Headline · Caption · Hashtags siap-pakai')}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
         <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {analyzedItem && (
            <button
              onClick={() => setPreviewItem(analyzedItem)}
              title={t('Buka preview artikel')}
              className="source-card"
              style={{
                padding: '10px 14px', background: 'var(--bg3)', borderRadius: 8,
                border: '1px solid var(--border)',
                textAlign: 'left', cursor: 'pointer', width: '100%',
                display: 'flex', flexDirection: 'column', gap: 8,
                transition: 'all 0.15s',
                fontFamily: 'inherit',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>
                {t('Sumber berita')}
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                <span style={{ fontSize: 11, flexShrink: 0, marginTop: 1 }}>{CAT_META[analyzedItem.category].icon}</span>
                <div style={{ fontSize: 11.5, color: 'var(--text)', lineHeight: 1.45, fontWeight: 500 }}>
                  {analyzedItem.title}
                </div>
              </div>
            </button>
          )}

          {analyzeError && (
            <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 12 }}>
              {analyzeError}
            </div>
          )}

          {!content && !analyzing && !analyzeError && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, textAlign: 'center', color: 'var(--text2)' }}>
              <div style={{ fontSize: 32, opacity: 0.25 }}>✦</div>
              <div style={{ fontSize: 13, lineHeight: 1.7 }}>
                {t('Klik artikel untuk preview')}<br />
                {t('lalu tekan')} <strong style={{ color: 'var(--text)' }}>✦ {t('Buat Konten dengan AI')}</strong>
              </div>
              <div style={{ fontSize: 11, lineHeight: 1.6, maxWidth: 260 }}>
                {t('AI akan menghasilkan headline, caption, dan hashtag siap-posting untuk akun BPI')}
              </div>
            </div>
          )}

          {analyzing && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12, color: 'var(--text2)', fontSize: 13 }}>
              <div style={{ width: 24, height: 24, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              {t('Membuat konten…')}
            </div>
          )}

          {content && (
            <>
              <ContentCategoryBlock
                categoryKey={content.content_category}
                reason={content.content_category_reason}
              />
              <HeadlineBlock
                lines={content.headline_lines}
                full={content.headline}
                meta={headlineMeta}
                copied={copiedField === 'headline'}
                onCopy={() => copyToClipboard(content.headline, 'headline')}
              />
              <ContentBlock
                label="Caption"
                value={content.caption}
                copied={copiedField === 'caption'}
                onCopy={() => copyToClipboard(content.caption, 'caption')}
                accentColor="var(--accent)"
                size="lg"
                multiline
              />
              <HashtagBlock
                parts={content.hashtag_parts}
                full={content.hashtags}
                copied={copiedField === 'hashtags'}
                onCopy={() => copyToClipboard(content.hashtags, 'hashtags')}
              />

              <button
                onClick={() => {
                  copyToClipboard(
                    `${content.caption}\n\n${content.hashtags}`,
                    'all'
                  )
                }}
                style={{
                  marginTop: 4, padding: '10px 14px',
                  background: copiedField === 'all' ? '#43d9a2' : 'var(--bg3)',
                  border: `1px solid ${copiedField === 'all' ? '#43d9a2' : 'var(--border)'}`,
                  borderRadius: 8,
                  color: copiedField === 'all' ? '#0f1117' : 'var(--text)',
                  fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  transition: 'all 0.15s',
                }}
              >
                {copiedField === 'all' ? t('✓ Tersalin — siap dipaste') : '⧉ Copy Caption + Hashtags'}
              </button>

              <button
                onClick={() => setDesignOpen(true)}
                style={{
                  marginTop: 4, padding: '12px 14px',
                  background: 'linear-gradient(135deg, #6c63ff 0%, #8b5fff 100%)',
                  border: '1px solid rgba(108,99,255,0.5)',
                  borderRadius: 8,
                  color: '#fff',
                  fontSize: 12, fontWeight: 800,
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                  letterSpacing: '0.02em',
                  boxShadow: '0 8px 24px -12px rgba(108,99,255,0.6)',
                  transition: 'transform 0.15s, box-shadow 0.15s',
                }}
              >
                ✦ Generate Design
              </button>
            </>
          )}
         </div>
        </div>
      </div>

      {analyzedItem && content && (
        <DesignGeneratorModal
          key={analyzedItem.id}
          open={designOpen}
          onClose={() => setDesignOpen(false)}
          item={analyzedItem}
          content={content}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        .yt-card:hover { transform: translateY(-2px); box-shadow: 0 8px 24px rgba(0,0,0,0.4) !important; }
        .yt-card:hover .yt-thumb { transform: scale(1.04); }
        .source-card:hover { border-color: var(--accent) !important; background: rgba(108,99,255,0.06) !important; }
      `}</style>
    </div>
  )
}
