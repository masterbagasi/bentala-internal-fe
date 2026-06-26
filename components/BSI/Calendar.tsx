'use client'

import { useState, useMemo } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useSocmedProjects } from '@/lib/socmed-projects'
import { PostPreviewModal } from '@/components/BPI/PostPreviewModal'
import { PostModal } from '@/components/BPI/PostModal'
import type { PostFilters } from '@/components/BPI'
import type { Post } from '@/lib/types'

interface ContentCalendarProps {
  entity: string  // 'bpi' | 'bsi' | 'ws-fz' | 'ws-rn' | 'all' | <project slug>
  onPostClick?: (id: string) => void
  /** Board filters — applied live so the calendar reacts the moment a chip
   *  is toggled, exactly like the List/Board views (no refresh needed). */
  filters?: PostFilters
  /** My Task mode: scope to tasks tagging me OR created by me (overrides entity). */
  mineScope?: { email: string; name: string }
}

// Mirror of the List/Board predicate so the calendar filters identically.
function matchesFilters(p: Post, f?: PostFilters): boolean {
  if (!f) return true
  if (f.platforms.length && !f.platforms.some(x => (p.platforms || []).includes(x as 'ig' | 'tiktok'))) return false
  if (f.contentTypes.length && !f.contentTypes.some(x => (p.content_types || []).includes(x))) return false
  if (f.tagged.length && !f.tagged.some(x => (p.tagged || []).includes(x))) return false
  if (f.ratios.length) {
    const rs = (p.ratio || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!f.ratios.some(x => rs.includes(x))) return false
  }
  if (f.month && (p.date || '').slice(0, 7) !== f.month) return false
  if (f.statuses.length && !f.statuses.includes(p.status)) return false
  return true
}

const DAY_LABELS = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab']
const MONTH_LABELS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const MONTH_SHORT = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

const WS_MAP: Record<string, string> = { 'ws-fz': 'Video Production', 'ws-rn': 'Design Studio' }

const FALLBACK_COLOR = '#8b8fff'

export function ContentCalendar({ entity, onPostClick, filters, mineScope }: ContentCalendarProps) {
  const t = useT()
  const { posts, calState, setCalState } = useStore(useShallow((s) => ({ posts: s.posts, calState: s.calState, setCalState: s.setCalState })))
  // A task's accent = its project's brand colour (same as the sidebar/menu
  // icon), so on the All Project calendar you can tell projects apart at a
  // glance — Bentala Project orange, Bentala Studio purple, Master Bagasi blue…
  const allProjectsList = useSocmedProjects(false) // incl. archived so old tasks still colour
  const colorOf = useMemo(() => {
    const m: Record<string, string> = {}
    for (const p of allProjectsList) m[p.slug] = p.color || FALLBACK_COLOR
    return (post: Post) => m[post.entity] || FALLBACK_COLOR
  }, [allProjectsList])
  const [previewPostId, setPreviewPostId] = useState<string | null>(null)
  const [addDate, setAddDate] = useState<string | null>(null)
  const [dayPopup, setDayPopup] = useState<{ date: string; x: number; y: number } | null>(null)

  const current = calState[entity] || new Date()
  const today = new Date()

  function changeMonth(dir: number) {
    setCalState(entity, new Date(current.getFullYear(), current.getMonth() + dir, 1))
  }
  function goToday() {
    setCalState(entity, new Date(today.getFullYear(), today.getMonth(), 1))
  }

  function getEntityPosts(): Post[] {
    const member = WS_MAP[entity]
    const scoped = mineScope
      ? posts.filter(p => {
          // Only briefed tasks enter an account's worksheet, like the WS boards
          // (Video Production / Design Studio) — a 'todo' (Idea) hasn't entered yet.
          if (p.status === 'todo') return false
          const tags = (p.tagged || []).map(x => (x || '').toLowerCase())
          const taggedMe = tags.includes(mineScope.email.toLowerCase())
          const myPersonal = p.entity === 'personal' && (p.created_by || '') === mineScope.name
          return taggedMe || myPersonal
        })
      : entity === 'all'
      ? posts.filter(p => p.entity !== 'personal') // private My Task bucket stays out
      : member
        ? posts.filter(p => (p.pics || []).includes(member))
        : posts.filter(p => p.entity === entity)
    // Apply the board filters live — toggling a chip re-renders this component
    // (filters is a prop), so the calendar updates instantly without a refresh.
    return scoped.filter(p => matchesFilters(p, filters))
  }

  const entityPosts = getEntityPosts()

  // Two-month planner: this month + the next, so plans that straddle a month
  // boundary stay visible. The selects/arrows drive the first (left) month.
  const next = new Date(current.getFullYear(), current.getMonth() + 1, 1)
  const months = [
    { year: current.getFullYear(), month: current.getMonth() },
    { year: next.getFullYear(), month: next.getMonth() },
  ]
  const rangeLabel = months[0].year === months[1].year
    ? `${MONTH_LABELS[months[0].month]} – ${MONTH_LABELS[months[1].month]} ${months[0].year}`
    : `${MONTH_LABELS[months[0].month]} ${months[0].year} – ${MONTH_LABELS[months[1].month]} ${months[1].year}`

  const isWs = entity.startsWith('ws-')
  const atCurrentMonth = current.getFullYear() === today.getFullYear() && current.getMonth() === today.getMonth()

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

  const selStyle: React.CSSProperties = {
    width: 'auto', padding: '6px 10px', fontSize: 13, fontWeight: 500,
    background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', borderRadius: 8,
  }

  return (
    <div className="bcal-root" style={{ width: '100%' }}>
      <style>{CAL_CSS}</style>

      {/* ── Toolbar ── */}
      <div className="bcal-toolbar">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.01em', color: 'var(--text)', whiteSpace: 'nowrap' }}>
            {rangeLabel}
          </h2>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: 'auto', flexWrap: 'wrap' }}>
          {/* Platform legend */}
          {entity === 'all' && (
            <div className="bcal-legend">
              {allProjectsList.filter(p => p.active).map(p => (
                <span key={p.slug}><i style={{ background: p.color || FALLBACK_COLOR }} />{p.name}</span>
              ))}
            </div>
          )}

          {/* Quick jump */}
          <select aria-label={t('Bulan')} value={current.getMonth()} style={selStyle}
            onChange={e => setCalState(entity, new Date(current.getFullYear(), parseInt(e.target.value), 1))}>
            {MONTH_LABELS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>
          <select aria-label={t('Tahun')} value={current.getFullYear()} style={selStyle}
            onChange={e => setCalState(entity, new Date(parseInt(e.target.value), current.getMonth(), 1))}>
            {Array.from({ length: 8 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          {/* Segmented prev / today / next */}
          <div className="bcal-seg" role="group" aria-label={t('Navigasi bulan')}>
            <button className="bcal-seg-btn" onClick={() => changeMonth(-1)} aria-label={t('Bulan sebelumnya')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
            </button>
            <button className="bcal-seg-btn bcal-seg-today" onClick={goToday} disabled={atCurrentMonth}>
              {t('Hari Ini')}
            </button>
            <button className="bcal-seg-btn" onClick={() => changeMonth(1)} aria-label={t('Bulan berikutnya')}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Two month panels ── */}
      <div className="bcal-grid">
        {months.map(({ year, month }) => (
          <MonthPanel
            key={`${year}-${month}`}
            year={year}
            month={month}
            posts={entityPosts}
            today={today}
            colorOf={colorOf}
            onDayClick={handleDayClick}
            onPostClick={handlePostClick}
          />
        ))}
      </div>

      {dayPopup && (
        <>
          <div className="fixed inset-0 z-[499]" onClick={() => setDayPopup(null)} />
          <DayPopup
            date={dayPopup.date}
            x={dayPopup.x}
            y={dayPopup.y}
            posts={entityPosts.filter(p => p.date === dayPopup.date)}
            colorOf={colorOf}
            onClose={() => setDayPopup(null)}
            onPostClick={(id, e) => handlePostClick(e, id)}
            onAddPost={() => { setAddDate(dayPopup.date); setDayPopup(null) }}
          />
        </>
      )}

      {previewPostId && (
        <PostPreviewModal open={!!previewPostId} postId={previewPostId} onClose={() => setPreviewPostId(null)} onEdit={() => {}} />
      )}

      {addDate && (
        <PostModal
          open={!!addDate}
          onClose={() => setAddDate(null)}
          editId={null}
          entity={entity === 'all' || isWs ? 'bpi' : entity}
        />
      )}
    </div>
  )
}

// ── Month Panel ──
function MonthPanel({
  year, month, posts, today, colorOf, onDayClick, onPostClick,
}: {
  year: number
  month: number
  posts: Post[]
  today: Date
  colorOf: (p: Post) => string
  onDayClick: (e: React.MouseEvent, dateStr: string) => void
  onPostClick: (e: React.MouseEvent, id: string) => void
}) {
  const t = useT()
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()

  const cells: Array<{ day: number; cur: boolean }> = []
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, cur: false })
  for (let i = 1; i <= daysInMonth; i++) cells.push({ day: i, cur: true })
  // Always fill 6 rows (42 cells) so every month — and therefore both panels —
  // is exactly the same size, regardless of how many weeks the month spans.
  while (cells.length < 42) cells.push({ day: cells.length - firstDay - daysInMonth + 1, cur: false })

  return (
    <section className="bcal-panel">
      <header className="bcal-panel-head">{MONTH_LABELS[month]} {year}</header>

      <div className="bcal-dow">
        {DAY_LABELS.map((d, i) => (
          <div key={d} className="bcal-dow-cell" data-weekend={i === 0 || i === 6 ? '1' : undefined}>{d}</div>
        ))}
      </div>

      <div className="bcal-days">
        {cells.map((c, i) => {
          if (!c.cur) {
            return <div key={i} className="bcal-cell bcal-cell-muted" aria-hidden><span className="bcal-num">{c.day}</span></div>
          }

          const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(c.day).padStart(2, '0')}`
          const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === c.day
          const dayPosts = posts.filter(p => p.date === dateStr)
          const weekday = (firstDay + c.day - 1) % 7
          const isWeekend = weekday === 0 || weekday === 6

          return (
            <div
              key={i}
              role="button"
              tabIndex={0}
              aria-label={`${c.day} ${MONTH_LABELS[month]} ${year}${dayPosts.length ? `, ${dayPosts.length} post` : ''}`}
              className="bcal-cell"
              data-today={isToday ? '1' : undefined}
              data-weekend={isWeekend ? '1' : undefined}
              onClick={(e) => onDayClick(e, dateStr)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onDayClick(e as unknown as React.MouseEvent, dateStr) } }}
            >
              <div className="bcal-cell-head">
                <span className={isToday ? 'bcal-num bcal-num-today' : 'bcal-num'}>{c.day}</span>
                <span className="bcal-add" aria-hidden>+</span>
              </div>
              <div className="bcal-pills">
                {dayPosts.slice(0, 3).map(p => {
                  const c2 = colorOf(p)
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className="bcal-pill"
                      style={{ ['--pc' as string]: c2 }}
                      title={p.title}
                      onClick={(e) => onPostClick(e, p.id)}
                    >
                      {p.title}
                    </button>
                  )
                })}
                {dayPosts.length > 3 && (
                  <span className="bcal-more">+{dayPosts.length - 3} {t('lagi')}</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}

// ── Day Popup ──
function DayPopup({
  date, x, y, posts, colorOf, onClose, onPostClick, onAddPost,
}: {
  date: string
  x: number
  y: number
  posts: Post[]
  colorOf: (p: Post) => string
  onClose: () => void
  onPostClick: (id: string, e: React.MouseEvent) => void
  onAddPost: () => void
}) {
  const t = useT()
  const [yr, m, d] = date.split('-').map(Number)
  const fmtDate = `${d} ${MONTH_SHORT[m - 1]} ${yr}`

  const adjustedX = Math.min(x, (typeof window !== 'undefined' ? window.innerWidth : 1024) - 280)
  const adjustedY = Math.min(y, (typeof window !== 'undefined' ? window.innerHeight : 768) - 220)

  return (
    <div className="bcal-pop" style={{ top: adjustedY, left: adjustedX }}>
      <div className="bcal-pop-head">
        <span>{fmtDate}</span>
        <button onClick={onClose} aria-label={t('Tutup')} className="bcal-pop-x">✕</button>
      </div>

      {posts.length === 0 ? (
        <div className="bcal-pop-empty">{t('Belum ada task — tambahkan satu.')}</div>
      ) : posts.map(p => (
        <button key={p.id} type="button" className="bcal-pop-item" onClick={(e) => onPostClick(p.id, e)}>
          <span className="bcal-pop-dot" style={{ background: colorOf(p) }} />
          <span className="bcal-pop-title">{p.title}</span>
        </button>
      ))}

      <button onClick={onAddPost} className="bcal-pop-add">+ {t('Tambah Task')}</button>
    </div>
  )
}

const CAL_CSS = `
.bcal-toolbar { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
.bcal-legend { display:flex; align-items:center; gap:14px; font-size:11.5px; color:var(--text2); margin-right:2px; }
.bcal-legend span { display:inline-flex; align-items:center; gap:5px; }
.bcal-legend i { width:9px; height:9px; border-radius:3px; display:inline-block; }

.bcal-seg { display:inline-flex; align-items:stretch; background:var(--bg3); border:1px solid var(--border); border-radius:9px; overflow:hidden; }
.bcal-seg-btn { display:flex; align-items:center; justify-content:center; gap:4px; min-width:34px; padding:7px 10px; background:transparent; border:none; border-left:1px solid var(--border); color:var(--text); font-size:12.5px; font-weight:600; cursor:pointer; transition:background .14s, color .14s; }
.bcal-seg-btn:first-child { border-left:none; }
.bcal-seg-btn:hover:not(:disabled) { background:var(--bg2); color:var(--accent); }
.bcal-seg-btn:disabled { color:var(--text3); cursor:default; }
.bcal-seg-btn:focus-visible { outline:2px solid var(--accent); outline-offset:-2px; }
.bcal-seg-today { padding-inline:14px; }

.bcal-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:18px; width:100%; align-items:start; }
@media (max-width: 900px) { .bcal-grid { grid-template-columns:1fr; } }

.bcal-panel { background:var(--bg2); border:1px solid var(--border); border-radius:14px; padding:16px 16px 18px; }
.bcal-panel-head { font-size:14px; font-weight:700; color:var(--text); margin-bottom:12px; letter-spacing:-0.01em; }

.bcal-dow { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:6px; }
.bcal-dow-cell { text-align:center; font-size:10.5px; font-weight:600; letter-spacing:0.04em; text-transform:uppercase; color:var(--text2); padding:2px 0; }
.bcal-dow-cell[data-weekend] { color:var(--text3); }

.bcal-days { display:grid; grid-template-columns:repeat(7,1fr); grid-auto-rows:118px; gap:6px; }

.bcal-cell { position:relative; height:118px; padding:7px 7px 8px; border-radius:9px; background:var(--bg3); border:1px solid transparent; cursor:pointer; user-select:none; transition:background .14s, border-color .14s, box-shadow .14s; overflow:hidden; }
.bcal-cell[data-weekend] { background:color-mix(in srgb, var(--bg3) 86%, var(--bg2)); }
.bcal-cell:hover { background:var(--bg2); border-color:var(--accent); box-shadow:0 4px 14px rgba(0,0,0,0.22); }
.bcal-cell:focus-visible { outline:2px solid var(--accent); outline-offset:1px; }
.bcal-cell[data-today] { border-color:color-mix(in srgb, var(--accent) 55%, var(--border)); background:color-mix(in srgb, var(--accent) 9%, var(--bg3)); }
.bcal-cell-muted { background:transparent; border-color:transparent; cursor:default; }
.bcal-cell-muted .bcal-num { color:var(--text3); opacity:0.55; }

.bcal-cell-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:5px; }
.bcal-num { font-size:12.5px; font-weight:600; color:var(--text); line-height:1; }
.bcal-num-today { display:inline-flex; align-items:center; justify-content:center; min-width:20px; height:20px; padding:0 5px; border-radius:999px; background:var(--accent); color:#fff; }
.bcal-add { font-size:15px; font-weight:300; line-height:1; color:var(--accent); opacity:0; transition:opacity .14s; }
.bcal-cell:hover .bcal-add { opacity:0.9; }

.bcal-pills { display:flex; flex-direction:column; gap:3px; }
.bcal-pill { display:block; width:100%; text-align:left; font-size:10.5px; font-weight:500; line-height:1.3; padding:3px 6px 3px 7px; border:none; border-left:2.5px solid var(--pc); border-radius:4px; background:color-mix(in srgb, var(--pc) 16%, transparent); color:var(--text); cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; transition:filter .12s, transform .12s; }
.bcal-pill:hover { filter:brightness(1.18); transform:translateX(1px); }
.bcal-pill:focus-visible { outline:2px solid var(--pc); outline-offset:1px; }
.bcal-more { font-size:10px; font-weight:600; color:var(--text2); padding:1px 2px; }

.bcal-pop { position:fixed; z-index:500; width:256px; background:var(--bg2); border:1px solid var(--border); border-radius:13px; padding:13px; box-shadow:0 12px 40px rgba(0,0,0,0.55); animation:slideUp 0.15s ease; }
.bcal-pop-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:9px; }
.bcal-pop-head > span { font-size:13px; font-weight:700; color:var(--text); }
.bcal-pop-x { background:none; border:none; color:var(--text2); cursor:pointer; font-size:15px; line-height:1; padding:0 2px; }
.bcal-pop-x:hover { color:var(--text); }
.bcal-pop-empty { font-size:12px; color:var(--text2); text-align:center; padding:10px 0 6px; }
.bcal-pop-item { display:flex; align-items:center; gap:9px; width:100%; text-align:left; padding:7px 8px; border:none; background:transparent; border-radius:8px; cursor:pointer; }
.bcal-pop-item:hover { background:var(--bg3); }
.bcal-pop-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
.bcal-pop-title { font-size:12px; color:var(--text); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.bcal-pop-add { width:100%; margin-top:8px; padding:8px; background:color-mix(in srgb, var(--accent) 12%, transparent); border:1px dashed color-mix(in srgb, var(--accent) 45%, transparent); border-radius:8px; color:var(--accent); font-size:12px; font-weight:600; cursor:pointer; transition:background .14s, color .14s; }
.bcal-pop-add:hover { background:var(--accent); color:#fff; }

@media (max-width: 560px) {
  .bcal-days { grid-auto-rows:84px; }
  .bcal-cell { height:84px; }
  .bcal-legend { display:none; }
}
@media (prefers-reduced-motion: reduce) {
  .bcal-cell, .bcal-pill, .bcal-add, .bcal-seg-btn, .bcal-pop-add { transition:none; }
  .bcal-pop { animation:none; }
}
`
