'use client'

import { useState } from 'react'
import { format } from 'date-fns'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { NotificationBell } from '@/components/shared/NotificationBell'

// ── Date range presets ──
const PRESETS = [
  { label: 'Hari Ini',  days: 0 },
  { label: '7 Hari',   days: 7 },
  { label: 'Bulan Ini', days: -1 },
  { label: '30 Hari',  days: 30 },
  { label: '90 Hari',  days: 90 },
  { label: 'Tahun Ini', days: -2 },
]

// ── Tab icons ──
const TAB_ICONS: Record<string, React.ReactNode> = {
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
  list: 'List',
  board: 'Board',
  calendar: 'Calendar',
  files: 'Files',
  analytics: 'Analytics',
  brief: 'Brief',
  accounts: 'Accounts',
  reports: 'Reports',
  plan: 'Plan',
}

// ── Types ──
export type TabKey = 'list' | 'board' | 'calendar' | 'files' | 'analytics' | 'brief' | 'accounts' | 'reports' | 'plan'

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

// ── Shared button height constant ──
const BTN_H = 32 // px — all buttons use this height

export function PageHeader({
  title,
  showDateFilter = false,
  tabs,
  activeTab,
  onTabChange,
  action,
  tabsRight,
}: PageHeaderProps) {
  const t = useT()
  const { dateRange, setDateRange } = useStore()
  const [dateOpen, setDateOpen] = useState(false)

  function applyPreset(preset: (typeof PRESETS)[0]) {
    const now = new Date()
    let from: Date, to: Date
    if (preset.days === -1) {
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else if (preset.days === -2) {
      from = new Date(now.getFullYear(), 0, 1)
      to   = new Date(now.getFullYear(), 11, 31)
    } else if (preset.days === 0) {
      from = to = now
    } else {
      from = new Date(now.getTime() - preset.days * 86400000)
      to   = now
    }
    setDateRange({ from: format(from, 'yyyy-MM-dd'), to: format(to, 'yyyy-MM-dd'), label: preset.label })
    setDateOpen(false)
  }

  const hasTabs = tabs && tabs.length > 0

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
        style={{
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 24px',
          borderBottom: '1px solid var(--border)',
          gap: 12,
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
          {/* Date filter */}
          {showDateFilter && (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setDateOpen(o => !o)}
                style={{
                  height: BTN_H,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '0 12px',
                  borderRadius: 8,
                  background: 'var(--bg3)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                  fontSize: 13,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                  <line x1="3" y1="10" x2="21" y2="10"/>
                </svg>
                <span>{dateRange.label}</span>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.5">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </button>

              {dateOpen && (
                <div
                  className="animate-slide-up"
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: 'calc(100% + 4px)',
                    width: 200,
                    background: 'var(--bg2)',
                    border: '1px solid var(--border)',
                    borderRadius: 10,
                    boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                    overflow: 'hidden',
                    zIndex: 999,
                  }}
                >
                  <div style={{ padding: '8px 4px' }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text2)', padding: '0 12px 8px' }}>
                      {t('Periode')}
                    </div>
                    {PRESETS.map(p => (
                      <button
                        key={p.label}
                        onClick={() => applyPreset(p)}
                        style={{
                          width: '100%',
                          textAlign: 'left',
                          padding: '7px 12px',
                          borderRadius: 6,
                          border: 'none',
                          background: dateRange.label === p.label ? 'rgba(108,99,255,0.15)' : 'transparent',
                          color: dateRange.label === p.label ? 'var(--accent)' : 'var(--text)',
                          fontSize: 13,
                          cursor: 'pointer',
                        }}
                        onMouseOver={e => {
                          if (dateRange.label !== p.label)
                            (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'
                        }}
                        onMouseOut={e => {
                          if (dateRange.label !== p.label)
                            (e.currentTarget as HTMLElement).style.background = 'transparent'
                        }}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User-supplied action — always in top-right title row,
              matching PageTabs / PageGroupShell. */}
          {action}

          {/* Notification bell */}
          <NotificationBell />
        </div>
      </div>

      {/* ── Tabs bar — only when tabs provided ── */}
      {hasTabs && (
        <div
          style={{
            display: 'flex',
            alignItems: 'stretch',
            padding: '0 24px',
            gap: 4,
          }}
        >
          {tabs!.map(t => {
            const isActive = activeTab === t
            return (
              <button
                key={t}
                onClick={() => onTabChange?.(t)}
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
          {tabsRight && (
            <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0, marginLeft: 'auto', paddingLeft: 12 }}>
              {tabsRight}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
