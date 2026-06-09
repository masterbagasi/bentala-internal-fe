'use client'

import { useState } from 'react'
import { OBJECTIVE_META, PLATFORM_META, PIC_LIST, DURATION_OPTIONS, type DeepConfig } from './data'
import { C, btnPrimary, btnSecondary, inputStyle } from './theme'
import { Modal, PlatformIcon } from './ui'

export function DealModal({ config, todayStr, onClose, onOpenClient }: {
  config: DeepConfig
  todayStr: string
  onClose: () => void
  onOpenClient: () => void
}) {
  const [done, setDone] = useState(false)
  const [client, setClient] = useState(config.username.replace(/^@/, ''))
  const [pic, setPic] = useState(PIC_LIST[0])
  const [date, setDate] = useState(toISODate())
  const [duration, setDuration] = useState(DURATION_OPTIONS[1])

  if (done) {
    return (
      <Modal open onClose={onClose} title="Deal Dikonfirmasi">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '12px 0', textAlign: 'center' }}>
          <div style={{ width: 64, height: 64, borderRadius: '50%', background: C.successSoft, color: C.success, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>Deal dikonfirmasi — {client} masuk ke Our Client</div>
          <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
            <button type="button" onClick={onClose} style={btnSecondary}>Tutup</button>
            <button type="button" onClick={onOpenClient} style={btnPrimary}>Buka Our Client</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Konfirmasi Deal"
      footer={<>
        <button type="button" onClick={onClose} style={btnSecondary}>Batal</button>
        <button type="button" onClick={() => setDone(true)} style={btnPrimary}>Konfirmasi Deal</button>
      </>}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text2)', marginBottom: 18, flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 600, color: 'var(--text)' }}>@{config.username.replace(/^@/, '')}</span>
        {config.platform && <PlatformIcon platform={config.platform} size={13} />}
        <span>· {config.objectives.map((o) => OBJECTIVE_META[o].label).join(', ')}</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nama klien / brand"><input value={client} onChange={(e) => setClient(e.target.value)} style={inputStyle} /></Field>
        <Field label="PIC dari tim Bentala">
          <select value={pic} onChange={(e) => setPic(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
            {PIC_LIST.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Tanggal deal"><input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={inputStyle} /></Field>
          <Field label="Durasi project">
            <select value={duration} onChange={(e) => setDuration(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
              {DURATION_OPTIONS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </Field>
        </div>
      </div>

      <div style={{ marginTop: 16, fontSize: 11.5, color: 'var(--text2)', background: C.accentSoft, border: `1px solid ${C.accentBorder}`, borderRadius: 8, padding: '10px 12px', lineHeight: 1.5 }}>
        ℹ️ Setelah dikonfirmasi, analisa ini terkunci dan klien masuk ke Tab Our Client
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
function toISODate(): string {
  try { return new Date().toISOString().slice(0, 10) } catch { return '2026-06-06' }
}
