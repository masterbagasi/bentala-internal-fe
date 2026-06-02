'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

interface Tab {
  href: string
  label: string
  icon?: React.ReactNode
}

interface Props {
  title: string
  tabs: Tab[]
  /** Optional element rendered on the right side of the title row. */
  action?: React.ReactNode
}

/**
 * Header for grouped editor pages — shows a title row plus a horizontal tab
 * navigation underneath. Tabs are real Next.js Links so deep-linking works.
 *
 * Used by /website/home and /website/about layouts to give a unified
 * "page → tabs → content" structure similar to /bsi.
 */
export function PageTabs({ title, tabs, action }: Props) {
  const pathname = usePathname()

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.005em',
            color: 'var(--text)',
          }}
        >
          {title}
        </span>
        {action}
      </div>

      <div
        style={{
          display: 'flex',
          gap: 4,
          padding: '0 24px',
          overflowX: 'auto',
        }}
      >
        {tabs.map((tab) => {
          const isActive = pathname === tab.href || pathname.startsWith(tab.href + '/')
          return (
            <Link
              key={tab.href}
              href={tab.href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '12px 14px',
                fontSize: 13,
                fontWeight: isActive ? 600 : 400,
                textDecoration: 'none',
                borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                marginBottom: -1,
                whiteSpace: 'nowrap',
                transition: 'color 0.15s, border-color 0.15s',
                color: isActive ? 'var(--accent)' : 'var(--text2)',
              }}
            >
              {tab.icon}
              {isActive ? (
                <span className="tab-active-text">{tab.label}</span>
              ) : (
                <span>{tab.label}</span>
              )}
            </Link>
          )
        })}
      </div>
    </div>
  )
}
