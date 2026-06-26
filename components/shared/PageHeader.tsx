'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { NotificationBell } from '@/components/shared/NotificationBell'
import { DateRangePicker } from '@/components/Social/DateRangePicker'

// ── Tab icons ──
const TAB_ICONS: Record<string, React.ReactNode> = {
  dashboard: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/>
      <rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
    </svg>
  ),
  list: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
      <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
      <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
    </svg>
  ),
  board: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  ),
  calendar: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  files: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  ),
  analytics: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/>
      <line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  ),
  brief: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/>
      <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
      <polyline points="10 9 9 9 8 9"/>
    </svg>
  ),
  accounts: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  ),
  reports: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
    </svg>
  ),
  plan: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
}

const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  list: 'List',
  board: 'Board',
  calendar: 'Calendar',
  files: 'Files',
  analytics: 'Summary',
  brief: 'Brief',
  accounts: 'Accounts',
  reports: 'Reports',
  plan: 'Plan',
}

// ── Types ──
export type TabKey = 'dashboard' | 'list' | 'board' | 'calendar' | 'files' | 'analytics' | 'brief' | 'accounts' | 'reports' | 'plan'

interface PageHeaderProps {
  title: string
  showDateFilter?: boolean
  tabs?: TabKey[]
  activeTab?: TabKey
  onTabChange?: (tab: TabKey) => void
  action?: React.ReactNode
  /** Rendered at the right edge of the tab row (e.g. a Filter button). */
  tabsRight?: React.ReactNode
}

export function PageHeader({
  title,
  showDateFilter = false,
  tabs,
  activeTab,
  onTabChange,
  action,
  tabsRight,
}: PageHeaderProps) {
  const { dateRange, setDateRange } = useStore(useShallow((s) => ({ dateRange: s.dateRange, setDateRange: s.setDateRange })))

  const hasTabs = tabs && tabs.length > 0

  // Remember the active tab per route so a browser refresh keeps you on the
  // same tab (List/Board/Calendar/…) instead of snapping back to the first one.
  const pathname = usePathname()
  const tabKey = `bentala_tab:${pathname}`
  const restoredPath = useRef<string | null>(null)
  useEffect(() => {
    if (!hasTabs || !onTabChange) return
    if (restoredPath.current === pathname) return
    restoredPath.current = pathname
    try {
      const saved = localStorage.getItem(tabKey) as TabKey | null
      if (saved && tabs!.includes(saved) && saved !== activeTab) onTabChange(saved)
    } catch {}
  }, [pathname, hasTabs, onTabChange, tabs, activeTab, tabKey])

  function selectTab(tab: TabKey) {
    onTabChange?.(tab)
    try { localStorage.setItem(tabKey, tab) } catch {}
  }

  return (
    <div
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'var(--bg2)',
        flexShrink: 0,
      }}
    >
      {/* ── Title bar — matches PageShell chrome exactly so any page
          using PageHeader looks identical to a page using PageShell. */}
      <div
        className="ps-gutter ps-titlebar"
        style={{
          minHeight: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 24px',
          borderBottom: '1px solid var(--border)',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        {/* Title */}
        <span
          style={{
            fontSize: 19,
            fontWeight: 700,
            letterSpacing: '-0.005em',
            color: 'var(--text)',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </span>

        {/* Actions — date filter + user action button + bell, all
            anchored top-right like PageTabs does, so every page
            in the dashboard has the same affordance position. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Date filter — rich range picker (same as Social analytics) */}
          {showDateFilter && (
            <DateRangePicker value={dateRange} onChange={setDateRange} />
          )}

          {/* User-supplied action — always in top-right title row,
              matching PageTabs / PageGroupShell. */}
          {action}

          {/* Notification bell */}
          <NotificationBell />
        </div>
      </div>

      {/* ── Tabs bar — only when tabs provided ──
          The tab buttons live in their OWN horizontal scroller; tabsRight
          (history/filter, which open absolutely-positioned dropdowns) sits
          OUTSIDE that scroller. Keeping them apart matters: an overflow
          scroller clips its absolutely-positioned descendants, so if the
          filter/history popovers were inside the scroller they'd be cut off
          and look broken on mobile. */}
      {hasTabs && (
        <div
          className="ps-gutter"
          style={{
            display: 'flex',
            alignItems: 'stretch',
            padding: '0 24px',
            gap: 8,
          }}
        >
          <div
            className="no-scrollbar"
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 4,
              flex: 1,
              minWidth: 0,
              // Tabs scroll horizontally on narrow screens instead of
              // overflowing and getting clipped by the page card.
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
              touchAction: 'pan-x',
            }}
          >
            {tabs!.map(t => {
              const isActive = activeTab === t
              return (
                <button
                  key={t}
                  onClick={() => selectTab(t)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 14px',
                    background: 'none',
                    border: 'none',
                    borderBottom: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
                    marginBottom: -1,
                    fontSize: 13,
                    fontWeight: isActive ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'color 0.15s, border-color 0.15s',
                    whiteSpace: 'nowrap',
                    // Keep natural width so the row overflows (and scrolls)
                    // rather than the tabs compressing into each other.
                    flexShrink: 0,
                    textDecoration: 'none',
                    color: isActive ? 'var(--accent)' : 'var(--text2)',
                  }}
                  onMouseOver={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text)'
                  }}
                  onMouseOut={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text2)'
                  }}
                >
                  {TAB_ICONS[t]}
                  {isActive ? (
                    <span className="tab-active-text">{TAB_LABELS[t]}</span>
                  ) : (
                    <span>{TAB_LABELS[t]}</span>
                  )}
                </button>
              )
            })}
          </div>
          {tabsRight && (
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
              {tabsRight}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
