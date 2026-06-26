'use client'

import { useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { CRM_STAGES } from '@/lib/constants'
import { logStageChange } from '@/lib/log-interaction'
import type { Client, ClientStage } from '@/lib/types'

// The CRM stage control: a coloured pill that opens a dot-marked menu — the same
// pattern as the Projects task-detail status dropdown. Self-contained: it writes
// the stage change (optimistic store + persist + activity log) on its own, so it
// can live either in the Detail Client header bar or a modal's headerRight slot.
export function StageSelect({ client }: { client: Client }) {
  const t = useT()
  const upsertClient = useStore((s) => s.upsertClient)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)

  const cur = CRM_STAGES.find((s) => s.key === client.stage)
  const color = cur?.color ?? '#8b8fa8'

  function toggle() {
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.bottom + 6, left: Math.max(8, r.right - 200) })
    }
    setOpen((o) => !o)
  }

  async function pick(stage: ClientStage) {
    setOpen(false)
    if (stage === client.stage) return
    const prev = client.stage
    upsertClient({ ...client, stage }) // optimistic
    const { error } = await getSupabase().from('clients').update({ stage }).eq('id', client.id)
    if (error) { upsertClient({ ...client, stage: prev }); alert(error.message); return }
    logStageChange(client.id, prev, stage)
  }

  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        ref={btnRef}
        onClick={toggle}
        title={t('Ubah status')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 12px',
          borderRadius: 20, cursor: 'pointer', background: color + '22',
          border: `1px solid ${color}55`, color, fontSize: 12.5, fontWeight: 600, width: 'auto',
        }}
      >
        {cur?.label ?? client.stage}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 12 15 18 9" /></svg>
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 2999 }} onClick={() => setOpen(false)} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 3000, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 5, width: 200, boxShadow: '0 6px 24px rgba(0,0,0,0.4)' }}>
            {CRM_STAGES.map((s) => {
              const active = s.key === client.stage
              return (
                <button
                  key={s.key}
                  onClick={() => pick(s.key as ClientStage)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 7, cursor: 'pointer', background: active ? 'var(--bg3)' : 'transparent', border: 'none', color: 'var(--text)', fontSize: 13, fontWeight: active ? 600 : 500, textAlign: 'left' }}
                  onMouseOver={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--bg3)' }}
                  onMouseOut={(e) => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                >
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
                  {s.label}
                </button>
              )
            })}
          </div>
        </>
      )}
    </span>
  )
}
