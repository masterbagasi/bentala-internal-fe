'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useClientTaskList } from '@/hooks/useClientTaskList'
import { todayISODate } from '@/lib/follow-up'
import type { ClientTask } from '@/lib/types'

const INTERNALS = ['Dandi', 'Naufal', 'Reinaldi', 'Faizal']
const fmt = (iso: string) => new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })

export function ClientTasks({ clientId }: { clientId: string }) {
  const t = useT()
  const rows = useClientTaskList(clientId)
  const today = todayISODate()
  const [title, setTitle] = useState('')
  const [due, setDue] = useState('')
  const [assignee, setAssignee] = useState(INTERNALS[0])
  const [saving, setSaving] = useState(false)

  async function add() {
    if (!title.trim()) return
    setSaving(true)
    const supabase = getSupabase()
    const { data: u } = await supabase.auth.getUser()
    const meta = u.user?.user_metadata ?? {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('client_tasks').insert({
      client_id: clientId, title: title.trim(), due_date: due || null, assignee,
      created_by: meta.full_name ?? meta.name ?? u.user?.email?.split('@')[0] ?? null,
    })
    setSaving(false)
    if (error) { alert(t('Gagal menyimpan: ') + error.message); return }
    setTitle(''); setDue('')
  }

  async function toggle(task: ClientTask) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabase() as any).from('client_tasks').update({ done: !task.done }).eq('id', task.id)
  }
  async function remove(id: string) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (getSupabase() as any).from('client_tasks').delete().eq('id', id)
  }

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{t('Tugas')} ({rows.filter(r => !r.done).length})</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('Tugas baru...')} onKeyDown={e => { if (e.key === 'Enter') add() }} style={{ flex: '1 1 160px' }} />
        <input type="date" value={due} onChange={e => setDue(e.target.value)} />
        <select value={assignee} onChange={e => setAssignee(e.target.value)}>{INTERNALS.map(n => <option key={n} value={n}>{n}</option>)}</select>
        <button type="button" onClick={add} disabled={saving} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '0 14px', cursor: 'pointer', fontSize: 13 }}>{t('Tambah')}</button>
      </div>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Belum ada tugas.')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rows.map(r => {
            const overdue = !r.done && r.due_date && r.due_date < today
            return (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <input type="checkbox" checked={r.done} onChange={() => toggle(r)} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, textDecoration: r.done ? 'line-through' : 'none', color: r.done ? 'var(--text3)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                {r.assignee && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{r.assignee}</span>}
                {r.due_date && <span style={{ fontSize: 11, color: overdue ? '#ff6b6b' : 'var(--text2)' }}>{fmt(r.due_date)}</span>}
                <button onClick={() => remove(r.id)} style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', color: '#ff6b6b', cursor: 'pointer' }}>×</button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
