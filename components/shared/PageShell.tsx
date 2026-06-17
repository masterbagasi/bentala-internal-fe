'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { NotificationBell } from '@/components/shared/NotificationBell'

// ── Tab descriptors ─────────────────────────────────────────
//
// Link-tabs use real Next.js routing (deep-linkable, used by
// /website/home and /website/about). Button-tabs flip a parent
// state (used by /bpi, /bsi, AI analytics, etc).

interface LinkTab {
  href: string
  label: string
  icon?: ReactNode
}

interface ButtonTab {
  key: string
  label: string
  icon?: ReactNode
}

type Tabs =
  | { kind: 'link'; items: LinkTab[] }
  | { kind: 'button'; items: ButtonTab[]; active: string; onChange: (k: string) => void }

interface Props {
  /** Title shown in the top-left of the header. */
  title: string
  /** When present, a back-arrow Link renders to the left of the title. */
  backHref?: string
  /** Top-right action (button, button group, etc). */
  action?: ReactNode
  /** Sub-navigation row below the title. Either link-routed or
   *  state-driven. Omit to render header without tabs. */
  tabs?: Tabs
  /** Body content. Rendered inside a `flex-1 overflow-y-auto`
   *  scroll container so the header stays sticky on top. */
  children: ReactNode
}

/**
 * Single source of truth for every dashboard page's header.
 *
 * Every dashboard tab — Website, BPI, BSI, Clients, Projects,
 * AI Studio, Team, Settings — renders through this shell so the
 * top-bar height, paddings, title type, action position, and tabs
 * row are identical regardless of which page-level wrapper
 * (PageGroupShell, PageHeader, WebsiteAdminHeader) the page uses.
 *
 * Visual contract:
 *  - Title bar: 56px tall, padding 0/24, border-bottom, sticky
 *  - Title:     font 15, weight 600, var(--text)
 *  - Action:    pinned top-right of title bar
 *  - Tabs row:  padding 0/24, gap 4, each tab 12/14 padding,
 *               border-bottom 2px solid (active = accent)
 *  - Body:      flex-1 overflow-y-auto, scrolls within the page card
 */
export function PageShell({ title, backHref, action, tabs, children }: Props) {
  const t = useT()
  const pathname = usePathname()
  const hasTabs = !!tabs && tabs.items.length > 0

  return (
    <>
      {/* Sticky top bar — same shape every tab */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'var(--bg2)',
          flexShrink: 0,
        }}
      >
        {/* Title row */}
        <div
          className="ps-gutter"
          style={{
            height: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            borderBottom: hasTabs ? '1px solid var(--border)' : '1px solid var(--border)',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            {backHref && (
              <Link
                href={backHref}
                aria-label={t('Kembali')}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--text2)',
                  textDecoration: 'none',
                  flexShrink: 0,
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </Link>
            )}
            <span
              style={{
                fontSize: 19,
                fontWeight: 700,
                letterSpacing: '-0.005em',
                color: 'var(--text)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {title}
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            {action}
            <NotificationBell />
          </div>
        </div>

        {/* Tabs row */}
        {hasTabs && tabs && (
          <div
            className="ps-gutter no-scrollbar"
            style={{
              display: 'flex',
              alignItems: 'stretch',
              padding: '0 24px',
              gap: 4,
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            {tabs.kind === 'link'
              ? tabs.items.map((tab) => {
                  const active = pathname === tab.href || pathname.startsWith(tab.href + '/')
                  return (
                    <TabButton
                      key={tab.href}
                      label={tab.label}
                      icon={tab.icon}
                      active={active}
                      asLink={tab.href}
                    />
                  )
                })
              : tabs.items.map((tab) => {
                  const active = tabs.active === tab.key
                  return (
                    <TabButton
                      key={tab.key}
                      label={tab.label}
                      icon={tab.icon}
                      active={active}
                      onClick={() => tabs.onChange(tab.key)}
                    />
                  )
                })}
          </div>
        )}
      </div>

      {/* Body scroll area */}
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>
    </>
  )
}

// ── Tab button (shared style for link + button variants) ────

function TabButton({
  label,
  icon,
  active,
  asLink,
  onClick,
}: {
  label: string
  icon?: ReactNode
  active: boolean
  asLink?: string
  onClick?: () => void
}) {
  const style: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    padding: '12px 14px',
    background: 'none',
    border: 'none',
    borderBottom: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
    marginBottom: -1,
    fontSize: 13,
    fontWeight: active ? 600 : 400,
    cursor: 'pointer',
    transition: 'color 0.15s, border-color 0.15s',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    textDecoration: 'none',
    // Parent color drives the icon glyph (svg uses currentColor).
    // The label is wrapped in its own span with the gradient class
    // so the icon stays visible while only the text is gradient-filled.
    color: active ? 'var(--accent)' : 'var(--text2)',
  }
  const labelEl = active ? (
    <span className="tab-active-text">{label}</span>
  ) : (
    <span>{label}</span>
  )
  if (asLink) {
    return (
      <Link href={asLink} style={style}>
        {icon}
        {labelEl}
      </Link>
    )
  }
  return (
    <button type="button" onClick={onClick} style={style}>
      {icon}
      {labelEl}
    </button>
  )
}
