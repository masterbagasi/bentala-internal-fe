'use client'

import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { NotificationBell } from '@/components/shared/NotificationBell'
import { DateRangePicker } from '@/components/Social/DateRangePicker'
import { useT } from '@/lib/i18n/LanguageProvider'

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
  followup: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  ),
}

// Indonesian SOURCE labels (t() maps them to English in EN mode). Loanwords that
// read the same in both languages (Dashboard, Brief) are left as-is.
const TAB_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  list: 'Daftar',
  board: 'Papan',
  calendar: 'Kalender',
  files: 'Berkas',
  analytics: 'Ringkasan',
  brief: 'Brief',
  accounts: 'Akun',
  reports: 'Laporan',
  plan: 'Rencana',
  followup: 'Tindak Lanjut',
}

// ── Types ──
export type TabKey = 'dashboard' | 'list' | 'board' | 'calendar' | 'files' | 'analytics' | 'brief' | 'accounts' | 'reports' | 'plan' | 'followup'

interface PageHeaderProps {
  title: string
  showDateFilter?: boolean
  /** Let the date picker select future dates (task boards schedule ahead). */
  dateAllowFuture?: boolean
  tabs?: TabKey[]
  activeTab?: TabKey
  onTabChange?: (tab: TabKey) => void
  action?: React.ReactNode
  /** Rendered at the right edge of the tab row (e.g. a Filter button). */
  tabsRight?: React.ReactNode
  /** Optional count appended to a tab's label, e.g. "Follow-up (1)". */
  tabBadges?: Partial<Record<TabKey, number>>
}

export function PageHeader({
  title,
  showDateFilter = false,
  dateAllowFuture = false,
  tabs,
  activeTab,
  onTabChange,
  action,
  tabsRight,
  tabBadges,
}: PageHeaderProps) {
  const t = useT()
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
          {t(title)}
        </span>

        {/* Actions — date filter + user action button + bell, all
            anchored top-right like PageTabs does, so every page
            in the dashboard has the same affordance position. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Date filter — in the title bar only for tab-less pages; tabbed
              pages render it in the tab row (aligned with the tabs) below. */}
          {showDateFilter && !hasTabs && (
            <DateRangePicker value={dateRange} onChange={setDateRange} allowFuture={dateAllowFuture} />
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
            // Vertical breathing room so the row isn't the exact height of its
            // tallest control (the date picker) — that made the tabs and button
            // feel cramped top-and-bottom. Applies to every tabbed page.
            padding: '10px 24px',
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
            {tabs!.map(tab => {
              const isActive = activeTab === tab
              const badge = tabBadges?.[tab]
              const label = t(TAB_LABELS[tab]) + (badge ? ` (${badge})` : '')
              return (
                <button
                  key={tab}
                  onClick={() => selectTab(tab)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '12px 14px',
                    background: 'none',
                    border: 'none',
                    borderBottom: `2px solid ${isActive ? '#60a5fa' : 'transparent'}`,
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
                    color: isActive ? '#60a5fa' : 'var(--text2)',
                  }}
                  onMouseOver={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text)'
                  }}
                  onMouseOut={e => {
                    if (!isActive) (e.currentTarget as HTMLElement).style.color = 'var(--text2)'
                  }}
                >
                  {TAB_ICONS[tab]}
                  {isActive ? (
                    <span className="tab-active-text">{label}</span>
                  ) : (
                    <span>{label}</span>
                  )}
                </button>
              )
            })}
          </div>
          {(tabsRight || showDateFilter) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              {showDateFilter && <DateRangePicker value={dateRange} onChange={setDateRange} allowFuture={dateAllowFuture} />}
              {tabsRight}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
