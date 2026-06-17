'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { PostPreviewModal } from '@/components/BPI/PostPreviewModal'
import { PostModal } from '@/components/BPI/PostModal'
import type { Post } from '@/lib/types'

interface ContentCalendarProps {
  entity: string  // 'bpi' | 'bsi' | 'ws-fz' | 'ws-rn'
  onPostClick?: (id: string) => void
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const MONTH_LABELS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

const WS_MAP: Record<string, string> = { 'ws-fz': 'Video Production', 'ws-rn': 'Design Studio' }

export function ContentCalendar({ entity, onPostClick }: ContentCalendarProps) {
  const { posts, calState, setCalState } = useStore()
  const [platformFilter, setPlatformFilter] = useState('all')
  const [previewPostId, setPreviewPostId] = useState<string | null>(null)
  const [addDate, setAddDate] = useState<string | null>(null)
  const [dayPopup, setDayPopup] = useState<{ date: string; x: number; y: number } | null>(null)

  const current = calState[entity] || new Date()

  function changeMonth(dir: number) {
    setCalState(entity, new Date(current.getFullYear(), current.getMonth() + dir, 1))
  }

  // Get posts for this entity
  function getEntityPosts(platform?: string): Post[] {
    const member = WS_MAP[entity]
    let filtered = entity === 'all'
      ? posts.slice() // All Project: every socmed post, including new projects
      : member
        ? posts.filter(p => (p.pics || []).includes(member))
        : posts.filter(p => p.entity === entity)
    if (platform && platform !== 'all') {
      filtered = filtered.filter(p => (p.platforms || []).includes(platform as 'ig' | 'tiktok'))
    }
    return filtered
  }

  const entityPosts = getEntityPosts(platformFilter)

  // Single-month view.
  const months = [{ year: current.getFullYear(), month: current.getMonth() }]

  const navLabel = `${MONTH_LABELS[months[0].month]} ${months[0].year}`

  const isWs = entity.startsWith('ws-')

  function handleDayClick(e: React.MouseEvent, dateStr: string) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setDayPopup({ date: dateStr, x: rect.left, y: rect.bottom + 4 })
  }

  function handlePostClick(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    if (onPostClick) onPostClick(id)
    else setPreviewPostId(id)
    setDayPopup(null)
  }

  return (
    <div>
      {/* Calendar Nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        {/* Month/Year selects */}
        <select
          value={current.getMonth()}
          onChange={e => setCalState(entity, new Date(current.getFullYear(), parseInt(e.target.value), 1))}
          style={{ width: 'auto', padding: '5px 10px' }}
        >
          {MONTH_LABELS.map((m, i) => <option key={i} value={i}>{m}</option>)}
        </select>
        <select
          value={current.getFullYear()}
          onChange={e => setCalState(entity, new Date(parseInt(e.target.value), current.getMonth(), 1))}
          style={{ width: 'auto', padding: '5px 10px' }}
        >
          {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <span style={{ fontSize: 14, fontWeight: 600 }}>{navLabel}</span>

        <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
          <button onClick={() => changeMonth(-1)}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: 'var(--text)', fontSize: 14 }}>
            ‹
          </button>
          <button onClick={() => changeMonth(1)}
            style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', color: 'var(--text)', fontSize: 14 }}>
            ›
          </button>
        </div>
      </div>

      {/* Calendar months grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 16, maxWidth: 1100 }}>
        {months.map(({ year, month }) => (
          <MonthPanel
            key={`${year}-${month}`}
            year={year}
            month={month}
            entity={entity}
            posts={entityPosts}
            onDayClick={handleDayClick}
            onPostClick={handlePostClick}
          />
        ))}
      </div>

      {/* Day popup */}
      {dayPopup && (
        <>
          <div className="fixed inset-0 z-[499]" onClick={() => setDayPopup(null)} />
          <DayPopup
            date={dayPopup.date}
            x={dayPopup.x}
            y={dayPopup.y}
            posts={entityPosts.filter(p => p.date === dayPopup.date)}
            entity={entity}
            onClose={() => setDayPopup(null)}
            onPostClick={(id, e) => handlePostClick(e, id)}
            onAddPost={() => { setAddDate(dayPopup.date); setDayPopup(null) }}
          />
        </>
      )}

      {/* Preview modal */}
      {previewPostId && (
        <PostPreviewModal
          open={!!previewPostId}
          postId={previewPostId}
          onClose={() => setPreviewPostId(null)}
          onEdit={() => {}}
        />
      )}

      {/* Add post modal */}
      {addDate && (
        <PostModal
          open={!!addDate}
          onClose={() => setAddDate(null)}
          editId={null}
          // Add-from-calendar creates the post on this calendar's project. For a
          // concrete project slug (bpi/bsi or any new project) use it directly;
          // 'all' and ws- PIC scopes have no single project, fall back to bpi.
          entity={entity === 'all' || isWs ? 'bpi' : entity}
        />
      )}
    </div>
  )
}

// ── Month Panel ──
function MonthPanel({
  year, month, entity, posts, onDayClick, onPostClick,
}: {
  year: number
  month: number
  entity: string
  posts: Post[]
  onDayClick: (e: React.MouseEvent, dateStr: string) => void
  onPostClick: (e: React.MouseEvent, id: string) => void
}) {
  const t = useT()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const today = new Date()

  const cells: Array<{ day: number; cur: boolean }> = []
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, cur: false })
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, cur: true })
  while (cells.length % 7 !== 0) cells.push({ day: cells.length - firstDay - daysInMonth + 1, cur: false })

  const isBpi = entity === 'bpi'

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '20px 20px 24px' }}>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 16 }}>
        {['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'][month]} {year}
      </div>

      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4, marginBottom: 4 }}>
        {DAY_LABELS.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 11, color: 'var(--text2)', padding: 4, fontWeight: 600 }}>{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
        {cells.map((c, i) => {
          if (!c.cur) return (
            <div key={i} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 6, minHeight: 96, padding: 6, opacity: 0.4 }}>
              <div style={{ fontSize: 12, fontWeight: 600 }}>{c.day}</div>
            </div>
          )

          const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(c.day).padStart(2,'0')}`
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === c.day
          const dayPosts = posts.filter(p => p.date === dateStr)

          return (
            <div
              key={i}
              onClick={(e) => onDayClick(e, dateStr)}
              style={{
                background: 'var(--bg3)',
                border: `1px solid ${isToday ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 6, minHeight: 96, padding: 6,
                fontSize: 11, cursor: 'pointer',
                transition: 'border-color 0.15s, background 0.15s',
                position: 'relative',
                userSelect: 'none',
              }}
              onMouseOver={e => {
                (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--bg2)'
              }}
              onMouseOut={e => {
                (e.currentTarget as HTMLElement).style.borderColor = isToday ? 'var(--accent)' : 'var(--border)'
                ;(e.currentTarget as HTMLElement).style.background = 'var(--bg3)'
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>{c.day}</span>
                <span style={{ fontSize: 15, fontWeight: 300, color: 'var(--accent)', opacity: 0 }}
                  className="cal-day-add"
                >+</span>
              </div>
              {dayPosts.slice(0, 4).map(p => (
                <div
                  key={p.id}
                  onClick={(e) => onPostClick(e, p.id)}
                  style={{
                    borderRadius: 3, padding: '2px 4px', marginBottom: 2,
                    fontSize: 10, cursor: 'pointer', whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis',
                    background: isBpi && (p.platforms || []).includes('ig') ? '#2a0a1f' : '#0a1a1a',
                    color: isBpi && (p.platforms || []).includes('ig') ? '#e1306c' : '#69c9d0',
                  }}
                >
                  {p.title}
                </div>
              ))}
              {dayPosts.length > 4 && (
                <div style={{ fontSize: 10, color: 'var(--text2)' }}>+{dayPosts.length - 4} {t('lagi')}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Day Popup ──
function DayPopup({
  date, x, y, posts, entity, onClose, onPostClick, onAddPost,
}: {
  date: string
  x: number
  y: number
  posts: Post[]
  entity: string
  onClose: () => void
  onPostClick: (id: string, e: React.MouseEvent) => void
  onAddPost: () => void
}) {
  const t = useT()
  const [d, m, yr] = date.split('-').map(Number)
  const fmtDate = `${d} ${['','Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'][m]} ${yr}`

  // Adjust position to stay within viewport
  const adjustedX = Math.min(x, window.innerWidth - 260)
  const adjustedY = Math.min(y, window.innerHeight - 200)

  return (
    <div
      style={{
        position: 'fixed', zIndex: 500,
        top: adjustedY, left: adjustedX,
        background: 'var(--bg2)', border: '1px solid var(--border)',
        borderRadius: 12, padding: 14, width: 240,
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        animation: 'slideUp 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 600 }}>{fmtDate}</span>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 16, padding: '0 2px', lineHeight: 1 }}>✕</button>
      </div>

      {posts.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '8px 0 4px' }}>
          {t('Tidak ada post di hari ini')}
        </div>
      ) : posts.map(p => (
        <div
          key={p.id}
          onClick={(e) => onPostClick(p.id, e)}
          style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 7, cursor: 'pointer', marginBottom: 2 }}
          onMouseOver={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'}
          onMouseOut={e => (e.currentTarget as HTMLElement).style.background = ''}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: (p.platforms || []).includes('ig') ? '#e1306c' : '#69c9d0', flexShrink: 0 }} />
          <span style={{ fontSize: 12, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</span>
        </div>
      ))}

      <button
        onClick={onAddPost}
        style={{ width: '100%', marginTop: 8, padding: 7, background: 'rgba(108,99,255,0.12)', border: '1px dashed rgba(108,99,255,0.4)', borderRadius: 7, color: 'var(--accent)', fontSize: 12, fontWeight: 500, cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s' }}
        onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = '#fff' }}
        onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(108,99,255,0.12)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)' }}
      >
        + {t('Tambah Post')}
      </button>
    </div>
  )
}
