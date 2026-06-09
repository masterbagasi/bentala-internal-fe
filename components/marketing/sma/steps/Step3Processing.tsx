'use client'

import { useEffect, useState } from 'react'
import { C } from '../theme'
import { ProgressBar } from '../ui'

const STAGES = [
  'Membaca profil akun...',
  'Menganalisa pola konten...',
  'Memeriksa hashtag dan kalimat pembuka...',
  'Mengidentifikasi kekuatan dan masalah...',
  'Menyusun strategi konkret...',
  'Menyiapkan hasil analisa...',
]

export function Step3Processing({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => setI((p) => Math.min(p + 1, STAGES.length - 1)), 600)
    const done = setTimeout(onDone, 3600)
    return () => { clearInterval(interval); clearTimeout(done) }
  }, [onDone])

  const pct = Math.round(((i + 1) / STAGES.length) * 100)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18, padding: '80px 24px', maxWidth: 460, margin: '0 auto', textAlign: 'center' }}>
      <span className="w-10 h-10 rounded-full border-2 border-white/15 border-t-white" style={{ display: 'inline-block', animation: 'spin 0.7s linear infinite', borderTopColor: C.accent }} />
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Menganalisa akun…</div>
      <div style={{ width: '100%' }}><ProgressBar pct={pct} /></div>
      <div style={{ fontSize: 13.5, color: C.accent, fontWeight: 500, minHeight: 20 }}>{STAGES[i]}</div>
    </div>
  )
}
