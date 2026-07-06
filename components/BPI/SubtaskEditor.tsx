'use client'

import { useRef, useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import type { Subtask } from '@/lib/types'

const uid = () =>
  (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

// Simple subtask checklist — add, tick off, delete, with a done/total count.
// Shared by the My Task add/edit form and the task detail.
export function SubtaskEditor({ value, onChange }: { value: Subtask[] | undefined; onChange: (next: Subtask[]) => void }) {
  const t = useT()
  const [input, setInput] = useState('')
  const [adding, setAdding] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const items = value ?? []
  const doneCount = items.filter(s => s.done).length

  // Commit the current draft as a subtask. Enter uses allowEmpty=false (a blank
  // Enter is almost always a mistake); the "+ Subtask" button uses allowEmpty=true
  // so a click always adds a row, even with no text typed yet.
  function commit(allowEmpty: boolean) {
    const title = input.trim()
    if (!title && !allowEmpty) return
    onChange([...items, { id: uid(), title, done: false }])
    setInput('')
    inputRef.current?.focus()
  }
  function openAdd() {
    setAdding(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }
  const toggle = (id: string) => onChange(items.map(s => (s.id === id ? { ...s, done: !s.done } : s)))
  const remove = (id: string) => onChange(items.filter(s => s.id !== id))
  const setTitle = (id: string, title: string) => onChange(items.map(s => (s.id === id ? { ...s, title } : s)))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)' }}>{t('Subtasks')}</span>
          {items.length > 0 && (
            <span style={{ fontSize: 11, color: 'var(--text3)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '1px 8px' }}>{doneCount}/{items.length}</span>
          )}
        </div>
        <button
          type="button"
          // Keep the input focused so its onBlur doesn't close the field before
          // the click registers (lets a click add even while the input is empty).
          onMouseDown={e => e.preventDefault()}
          onClick={() => { if (adding) commit(true); else openAdd() }}
          style={{ flexShrink: 0, height: 32, padding: '0 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}
        >
          + {t('Subtask')}
        </button>
      </div>

      {items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: adding ? 8 : 0 }}>
          {items.map(s => (
            <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 9px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
              <button
                type="button" onClick={() => toggle(s.id)}
                aria-label={s.done ? t('Tandai belum selesai') : t('Tandai selesai')}
                style={{ flexShrink: 0, width: 18, height: 18, borderRadius: '50%', border: `1.5px solid ${s.done ? 'var(--accent3)' : 'var(--text3)'}`, background: s.done ? 'var(--accent3)' : 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
              >
                {s.done && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
              </button>
              <input
                type="text"
                value={s.title}
                onChange={e => setTitle(s.id, e.target.value)}
                placeholder={t('Subtask…')}
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 'none', outline: 'none', boxShadow: 'none', padding: 0, fontSize: 13, color: s.done ? 'var(--text3)' : 'var(--text)', textDecoration: s.done ? 'line-through' : 'none' }}
              />
              <button type="button" onClick={() => remove(s.id)} title={t('Hapus')} style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', color: '#ff6b6b', cursor: 'pointer', fontSize: 13 }}>×</button>
            </div>
          ))}
        </div>
      )}

      {adding && (
        <input
          ref={inputRef} type="text" placeholder={t('Tambah subtask…')} value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); commit(false) } else if (e.key === 'Escape') { setInput(''); setAdding(false) } }}
          onBlur={() => { if (!input.trim()) setAdding(false) }}
        />
      )}
    </div>
  )
}
