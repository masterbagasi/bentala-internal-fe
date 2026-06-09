'use client'

import { OBJECTIVE_META, PLATFORM_META, type HistoryEntry } from './data'
import { C, card } from './theme'
import { AvatarInitials, PlatformIcon } from './ui'

export function HistoryView({ entries, onView, onConfirm }: {
  entries: HistoryEntry[]
  onView: (e: HistoryEntry) => void
  onConfirm: (e: HistoryEntry) => void
}) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 16 }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Riwayat Analisa</h3>
        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{entries.length} analisa</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {entries.map((e) => (
          <div key={e.id} style={{ ...card, display: 'flex', alignItems: 'center', gap: 14, padding: 14, flexWrap: 'wrap' }}>
            <AvatarInitials name={e.username} size={40} />
            <div style={{ flex: 1, minWidth: 160 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>@{e.username}</span>
                <PlatformIcon platform={e.platform} size={14} />
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>{OBJECTIVE_META[e.objective].label} · {PLATFORM_META[e.platform].label}</div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', whiteSpace: 'nowrap' }}>{e.date}</div>
            <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 999, whiteSpace: 'nowrap', color: e.deal ? C.success : 'var(--text2)', background: e.deal ? C.successSoft : 'var(--bg3)', border: `1px solid ${e.deal ? C.success + '55' : 'var(--border)'}` }}>{e.deal ? 'Deal' : 'Belum Deal'}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <IconBtn title="Lihat" onClick={() => onView(e)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
              </IconBtn>
              <IconBtn title="Download" onClick={() => onView(e)}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              </IconBtn>
              {!e.deal && (
                <IconBtn title="Konfirmasi Deal" onClick={() => onConfirm(e)} color={C.success}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
                </IconBtn>
              )}
            </div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 14 }}>Analisa yang belum deal bisa dikonfirmasi kapanpun jika klien akhirnya setuju</div>
    </div>
  )
}

function IconBtn({ children, title, onClick, color }: { children: React.ReactNode; title: string; onClick: () => void; color?: string }) {
  return (
    <button type="button" title={title} onClick={onClick} style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: color ?? 'var(--text2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{children}</button>
  )
}
