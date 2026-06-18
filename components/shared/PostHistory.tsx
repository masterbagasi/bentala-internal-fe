'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useStore } from '@/hooks/useStore'
import { useLogActivity } from '@/hooks/useData'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import { POST_STATUS_LABELS } from '@/lib/constants'

// Scope: which posts this history belongs to.
//  - { entity: 'bpi' } → Bentala Project / Studio boards
//  - { pic: 'Video Production' } → workspace pages (posts assigned to a member)
export type HistoryScope = { entity: string } | { pic: string } | { all: true }

function scopeKey(scope: HistoryScope): string {
  return 'all' in scope ? 'all' : 'entity' in scope ? `entity-${scope.entity}` : `pic-${scope.pic}`
}

interface HistoryRow {
  id: string
  post_id: string
  entity: string
  pics: string[] | null
  title: string
  action: 'created' | 'updated' | 'deleted' | 'restored' | 'purged'
  changes: Record<string, { from: unknown; to: unknown }> | null
  actor: string | null
  created_at: string
}

// Indonesian labels for changed post fields (translated via t at render).
const FIELD_LABEL: Record<string, string> = {
  title: 'Judul', date: 'Tanggal', status: 'Status', platforms: 'Platform',
  pics: 'PIC', caption: 'Caption', hashtags: 'Hashtag', content_types: 'Tipe konten',
  video_link: 'Link video', design_link: 'Link desain', video_file_url: 'File video',
  design_file_url: 'File desain', notes: 'Catatan', tagged: 'Tag', ratio: 'Rasio',
  files: 'File', brief: 'Brief',
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

/**
 * Icon-only "history" button. Opens a realtime change log (every create / edit
 * / delete / restore of posts in scope), with restore for soft-deleted posts.
 */
export function PostHistoryButton({ scope }: { scope: HistoryScope }) {
  const t = useT()
  const upsertPost = useStore(s => s.upsertPost)
  const logActivity = useLogActivity()
  const [open, setOpen] = useState(false)
  const [rows, setRows] = useState<HistoryRow[]>([])
  const [restorable, setRestorable] = useState<Set<string>>(new Set())
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null)
  const [confirmBusy, setConfirmBusy] = useState(false)
  // Hover preview: rows are truncated, so hovering shows the full title +
  // change in a fixed popup (rendered outside the clipped dropdown).
  const [hover, setHover] = useState<{ title: string; change: string; meta: string; details: { label: string; from: string; to: string }[]; x: number; y: number } | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    const sb = getSupabase()
    let q = sb.from('post_history').select('*').order('created_at', { ascending: false }).limit(150)
    // 'all' = every socmed post's history (incl. new projects); no entity filter.
    q = 'all' in scope ? q : 'entity' in scope ? q.eq('entity', scope.entity) : q.contains('pics', [scope.pic])
    const { data } = await q
    setRows((data ?? []) as HistoryRow[])

    // Which posts are currently soft-deleted (→ show Restore).
    let dq = sb.from('posts').select('id, entity, pics').not('deleted_at', 'is', null)
    dq = 'all' in scope ? dq : 'entity' in scope ? dq.eq('entity', scope.entity) : dq.contains('pics', [scope.pic])
    const { data: del } = await dq
    setRestorable(new Set(((del ?? []) as { id: string }[]).map(d => d.id)))
  }, [scope])

  // Initial load + realtime: new history rows (and post changes) re-fetch.
  useEffect(() => {
    load()
    const ch = getSupabase()
      .channel(`post-history-${scopeKey(scope)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'post_history' }, () => { load() })
      .subscribe()
    return () => { getSupabase().removeChannel(ch) }
  }, [load, scope])

  // Close on outside click.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  async function restore(postId: string, title: string) {
    setRestorable(prev => { const n = new Set(prev); n.delete(postId); return n })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (getSupabase() as any).from('posts').update({ deleted_at: null }).eq('id', postId)
    if (error) { load(); return }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (getSupabase() as any).from('posts').select('*').eq('id', postId).maybeSingle()
    if (row) upsertPost(row)
    logActivity(`Task "${title}" dipulihkan`)
  }

  function askPurge(postId: string) {
    setConfirmReq({
      title: t('Hapus Permanen'),
      message: t('Task ini akan dihapus permanen dan tidak bisa dipulihkan.'),
      confirmLabel: t('Hapus Permanen'),
      tone: 'danger',
      onConfirm: async () => {
        setConfirmBusy(true)
        try {
          await getSupabase().from('posts').delete().eq('id', postId)
          setRestorable(prev => { const n = new Set(prev); n.delete(postId); return n })
        } finally {
          setConfirmBusy(false)
          setConfirmReq(null)
        }
      },
    })
  }

  function describe(r: HistoryRow): string {
    switch (r.action) {
      case 'created': return t('Dibuat')
      case 'deleted': return t('Dihapus')
      case 'restored': return t('Dipulihkan')
      case 'purged': return t('Dihapus permanen')
      case 'updated': {
        const fields = Object.keys(r.changes ?? {}).map(k => t(FIELD_LABEL[k] ?? k))
        if (!fields.length) return t('Diubah')
        return `${fields.join(', ')} ${t('diubah')}`
      }
      default: return r.action
    }
  }

  // Human-readable value for a changed field (status → its label, arrays → list).
  function fmtVal(field: string, v: unknown): string {
    if (v == null || v === '') return t('(kosong)')
    if (Array.isArray(v)) return v.length ? v.join(', ') : t('(kosong)')
    if (field === 'status') return t(POST_STATUS_LABELS[String(v)] ?? String(v))
    return String(v)
  }
  // Per-field before → after detail for an 'updated' row (e.g. Status: Review → Done).
  function changeDetails(r: HistoryRow): { label: string; from: string; to: string }[] {
    if (r.action !== 'updated' || !r.changes) return []
    return Object.entries(r.changes).map(([k, v]) => ({
      label: t(FIELD_LABEL[k] ?? k), from: fmtVal(k, v.from), to: fmtVal(k, v.to),
    }))
  }

  const ACTION_COLOR: Record<HistoryRow['action'], string> = {
    created: 'var(--accent3)', updated: 'var(--accent)', deleted: 'var(--accent2)',
    restored: 'var(--accent3)', purged: 'var(--accent2)',
  }

  // Track which post ids already got a Restore button (show once, on the
  // newest row for that post).
  const shownRestore = new Set<string>()

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title={t('Riwayat')}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
          width: 30, height: 30, borderRadius: 8,
          border: '1px solid', borderColor: open ? 'var(--accent)' : 'var(--border)',
          background: open ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
          color: open ? 'var(--accent)' : 'var(--text2)', cursor: 'pointer',
        }}
        onMouseOver={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)' }}
        onMouseOut={e => { if (!open) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 3v5h5" />
          <path d="M3.05 13A9 9 0 1 0 6 5.3L3 8" />
          <path d="M12 7v5l4 2" />
        </svg>
        {restorable.size > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, padding: '0 3px',
            borderRadius: 8, background: 'var(--accent2)', color: '#fff', fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
          }}>{restorable.size}</span>
        )}
      </button>

      {open && (
        <div
          className="animate-slide-up"
          style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', width: 360, zIndex: 80,
            maxWidth: 'min(360px, 92vw)',
            background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)', overflow: 'hidden',
          }}
        >
          <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('Riwayat Perubahan')}</span>
          </div>
          <div style={{ maxHeight: 400, overflowY: 'auto', padding: 8 }}>
            {rows.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '28px 12px', color: 'var(--text2)', fontSize: 12.5 }}>
                {t('Belum ada riwayat.')}
              </div>
            ) : (
              rows.map(r => {
                const canRestore = restorable.has(r.post_id) && !shownRestore.has(r.post_id)
                if (canRestore) shownRestore.add(r.post_id)
                return (
                  <div
                    key={r.id}
                    style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '8px', borderRadius: 8, transition: 'background 0.12s' }}
                    onMouseEnter={e => {
                      const b = (e.currentTarget as HTMLElement).getBoundingClientRect()
                      ;(e.currentTarget as HTMLElement).style.background = 'var(--bg3)'
                      setHover({
                        title: r.title || t('(Tanpa judul)'),
                        change: describe(r),
                        meta: `${fmtTime(r.created_at)}${r.actor ? ` · ${r.actor}` : ''}`,
                        details: changeDetails(r),
                        x: b.left, y: b.top,
                      })
                    }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; setHover(null) }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: 4, marginTop: 5, flexShrink: 0, background: ACTION_COLOR[r.action] }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600 }}>{r.title || t('(Tanpa judul)')}</span>
                        <span style={{ color: 'var(--text2)' }}> — {describe(r)}</span>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
                        {fmtTime(r.created_at)}{r.actor ? ` · ${r.actor}` : ''}
                      </div>
                    </div>
                    {canRestore && (
                      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                        <button
                          onClick={() => restore(r.post_id, r.title)}
                          style={{ height: 24, padding: '0 9px', borderRadius: 6, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 11, fontWeight: 600 }}
                        >{t('Pulihkan')}</button>
                        <button
                          onClick={() => askPurge(r.post_id)}
                          title={t('Hapus Permanen')}
                          style={{ width: 24, height: 24, borderRadius: 6, cursor: 'pointer', background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#fff'; (e.currentTarget as HTMLElement).style.background = 'var(--accent2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent2)' }}
                          onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* Hover preview — full, untruncated text in a fixed popup (the dropdown
          itself clips overflow, so this is rendered outside it). */}
      {open && hover && (() => {
        const W = 300
        const vw = typeof window !== 'undefined' ? window.innerWidth : 1024
        const vh = typeof window !== 'undefined' ? window.innerHeight : 768
        // Prefer to the left of the panel; fall back to clamped within viewport.
        let x = hover.x - W - 12
        if (x < 8) x = Math.min(hover.x, vw - W - 8)
        const y = Math.min(hover.y, vh - 120)
        return (
          <div style={{
            position: 'fixed', left: x, top: y, width: W, zIndex: 200,
            background: 'var(--bg2)', border: '1px solid var(--accent)', borderRadius: 10,
            padding: '10px 12px', boxShadow: '0 12px 40px rgba(0,0,0,0.6)', pointerEvents: 'none',
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', lineHeight: 1.4, wordBreak: 'break-word' }}>
              {hover.title}
            </div>
            {hover.details.length > 0 ? (
              <div style={{ marginTop: 5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {hover.details.map((d, i) => (
                  <div key={i} style={{ fontSize: 12, lineHeight: 1.4, wordBreak: 'break-word' }}>
                    <span style={{ color: 'var(--text2)' }}>{d.label}: </span>
                    <span style={{ color: 'var(--text2)' }}>{d.from}</span>
                    <span style={{ color: 'var(--text2)' }}> → </span>
                    <span style={{ color: 'var(--text)', fontWeight: 600 }}>{d.to}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, lineHeight: 1.4, wordBreak: 'break-word' }}>
                {hover.change}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 6 }}>{hover.meta}</div>
          </div>
        )
      })()}

      {confirmReq && (
        <ConfirmDialog request={confirmReq} busy={confirmBusy} onCancel={() => setConfirmReq(null)} />
      )}
    </div>
  )
}
