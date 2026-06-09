'use client'

import { C } from './theme'

const STEPS = ['Konfigurasi Awal', 'Lengkapi Data', 'Memproses', 'Hasil Analisa']

export function Stepper({ current, onJump }: { current: number; onJump?: (n: number) => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
      {STEPS.map((label, i) => {
        const n = i + 1
        const active = n === current
        const done = n < current
        const canJump = !!onJump && n < current
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: i < STEPS.length - 1 ? 1 : 'none', minWidth: 'fit-content' }}>
            <div onClick={() => canJump && onJump!(n)} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: canJump ? 'pointer' : 'default' }} title={canJump ? 'Kembali ke langkah ini' : undefined}>
              <span style={{
                width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
                background: done ? C.success : active ? C.accent : 'var(--bg3)',
                color: done || active ? C.onAccent : 'var(--text2)',
                border: active ? `2px solid ${C.accent}` : '1px solid var(--border)',
                fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{done ? '✓' : n}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.5px', color: active ? C.accent : 'var(--text2)' }}>LANGKAH {n}</span>
                <span style={{ fontSize: 12, fontWeight: active ? 600 : 500, color: active || done ? 'var(--text)' : 'var(--text2)', whiteSpace: 'nowrap' }}>{label}</span>
              </div>
            </div>
            {i < STEPS.length - 1 && <div style={{ flex: 1, height: 2, background: done ? C.success : 'var(--border)', minWidth: 16, borderRadius: 2 }} />}
          </div>
        )
      })}
    </div>
  )
}
