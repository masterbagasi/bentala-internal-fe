'use client'

import { PAGE_TITLES } from '@/lib/constants'
import { useStore } from '@/hooks/useStore'
import { useState, useRef, useEffect } from 'react'
import { format } from 'date-fns'
import { id } from 'date-fns/locale'
import { getSupabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { useT } from '@/lib/i18n/LanguageProvider'

const PRESETS = [
  { label: 'Hari Ini',    days: 0 },
  { label: '7 Hari',      days: 7 },
  { label: 'Bulan Ini',   days: -1 }, // special
  { label: '30 Hari',     days: 30 },
  { label: '90 Hari',     days: 90 },
  { label: 'Tahun Ini',   days: -2 }, // special
]

interface TopbarProps {
  page: string
}

export function Topbar({ page }: TopbarProps) {
  const t = useT()
  const { dateRange, setDateRange } = useStore()
  const [open, setOpen] = useState(false)
  const showDateFilter = ['dashboard', 'bpi-analytics'].includes(page)
  const router = useRouter()

  async function handleLogout() {
    const supabase = getSupabase()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    const now = new Date()
    let from: Date, to: Date

    if (preset.days === -1) {
      // Bulan ini
      from = new Date(now.getFullYear(), now.getMonth(), 1)
      to   = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    } else if (preset.days === -2) {
      // Tahun ini
      from = new Date(now.getFullYear(), 0, 1)
      to   = new Date(now.getFullYear(), 11, 31)
    } else if (preset.days === 0) {
      from = to = now
    } else {
      from = new Date(now.getTime() - preset.days * 86400000)
      to = now
    }

    setDateRange({
      from: format(from, 'yyyy-MM-dd'),
      to:   format(to, 'yyyy-MM-dd'),
      label: preset.label,
    })
    setOpen(false)
  }

  return (
    <div
      className="flex items-center justify-between flex-shrink-0"
      style={{
        background: 'var(--bg2)',
        borderBottom: '1px solid var(--border)',
        padding: '14px 24px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div className="text-base font-semibold" style={{ color: 'var(--text)' }}>
        {PAGE_TITLES[page] || page}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Date range picker */}
        {showDateFilter && (
          <div className="relative">
            <button
              onClick={() => setOpen(o => !o)}
              className="flex items-center gap-2 rounded-lg cursor-pointer text-sm transition-all"
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                padding: '7px 12px',
                color: 'var(--text)',
              }}
              onMouseOver={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseOut={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <span>{dateRange.label}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>

            {open && (
              <div
                className="absolute right-0 top-full mt-1 rounded-xl overflow-hidden animate-slide-up"
                style={{
                  background: 'var(--bg2)',
                  border: '1px solid var(--border)',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  width: 200,
                  zIndex: 999,
                }}
              >
                <div style={{ padding: '8px 4px' }}>
                  <div className="text-[11px] uppercase tracking-widest px-3 pb-2" style={{ color: 'var(--text2)' }}>
                    {t('Periode')}
                  </div>
                  {PRESETS.map(p => (
                    <button
                      key={p.label}
                      onClick={() => applyPreset(p)}
                      className="w-full text-left text-sm px-3 py-2 rounded-lg transition-colors"
                      style={{
                        background: dateRange.label === p.label ? 'var(--accent)22' : 'transparent',
                        color: dateRange.label === p.label ? 'var(--accent)' : 'var(--text)',
                        border: 'none',
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

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="text-xs px-3 py-1.5 rounded-lg transition-all"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            color: 'var(--text2)',
            cursor: 'pointer',
          }}
          onMouseOver={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent2)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--accent2)'
          }}
          onMouseOut={e => {
            (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
            ;(e.currentTarget as HTMLElement).style.color = 'var(--text2)'
          }}
        >
          {t('Keluar')}
        </button>
      </div>
    </div>
  )
}
