'use client'

import { useMemo, useState } from 'react'
import {
  MOCK_REPORTS,
  MOCK_SAVED_KOLS,
  REPORT_SECTIONS,
  DEFAULT_SECTION_KEYS,
  REPORT_STATUS_META,
  type Report,
  type KOL,
  formatCompact,
} from '@/lib/mock-data/kol-analytics'
import { uid } from '@/lib/utils'
import { Modal } from '@/components/shared/Modal'
import { PlatformIcon } from '../PlatformIcon'
import { useToast } from '../useToast'

function monthRange(): { from: string; to: string } {
  const now = new Date('2026-05-29')
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) }
}

async function buildBlob(report: Report, kols: KOL[]): Promise<Blob> {
  const [{ pdf }, { CampaignReportPdf }] = await Promise.all([
    import('@react-pdf/renderer'),
    import('../pdf/CampaignReportPdf'),
  ])
  return pdf(<CampaignReportPdf report={report} kols={kols} />).toBlob()
}

export function ReportingTab() {
  const [reports, setReports] = useState<Report[]>(MOCK_REPORTS)
  const [search, setSearch] = useState('')
  const initial = monthRange()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [createOpen, setCreateOpen] = useState(false)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { showToast, toastNode } = useToast()

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return reports.filter((r) => {
      if (q && !(`${r.name} ${r.clientName}`.toLowerCase().includes(q))) return false
      if (from && r.createdAt < from) return false
      if (to && r.createdAt > to) return false
      return true
    })
  }, [reports, search, from, to])

  function kolsFor(r: Report): KOL[] {
    return MOCK_SAVED_KOLS.filter((k) => r.selectedKOLIds.includes(k.id))
  }

  async function download(r: Report) {
    setBusyId(r.id)
    try {
      const blob = await buildBlob(r, kolsFor(r))
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${r.name.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      showToast('PDF berhasil diunduh!')
    } catch {
      showToast('Gagal membuat PDF.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  async function view(r: Report) {
    setBusyId(r.id)
    try {
      const blob = await buildBlob(r, kolsFor(r))
      window.open(URL.createObjectURL(blob), '_blank')
    } catch {
      showToast('Gagal membuka PDF.', 'error')
    } finally {
      setBusyId(null)
    }
  }

  function removeReport(r: Report) {
    setReports((prev) => prev.filter((x) => x.id !== r.id))
    showToast('Laporan dihapus.')
  }

  function addReport(r: Report) {
    setReports((prev) => [r, ...prev])
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Laporan Kampanye</h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Dapatkan tampilan 360° kampanye Anda</p>
        </div>
        <button type="button" onClick={() => setCreateOpen(true)} style={btnPrimary}>+ Buat Laporan</button>
      </div>

      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} />
          <span style={{ color: 'var(--text2)' }}>—</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} />
        </div>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320, minWidth: 200 }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text2)', fontSize: 14 }}>🔍</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari laporan..." style={{ paddingLeft: 34 }} />
        </div>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState hasAny={reports.length > 0} />
      ) : (
        <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  <Th>Nama Laporan</Th>
                  <Th center>Status</Th>
                  <Th>Dibuat Pada</Th>
                  <Th right>Aksi</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const st = REPORT_STATUS_META[r.status]
                  const busy = busyId === r.id
                  return (
                    <tr key={r.id}>
                      <Td>
                        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{r.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text2)' }}>{r.clientName} · {r.selectedKOLIds.length} kreator</div>
                      </Td>
                      <Td center>
                        <span style={{ background: st.bg, color: st.color, fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 6 }}>{st.label}</span>
                      </Td>
                      <Td>{r.createdAt}</Td>
                      <Td right>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button type="button" onClick={() => view(r)} disabled={busy} style={miniBtn}>👁 Lihat</button>
                          <button type="button" onClick={() => download(r)} disabled={busy} style={{ ...miniBtn, color: 'var(--accent)', borderColor: 'rgba(11,61,231,0.4)' }}>
                            {busy ? '⏳' : '📥'} PDF
                          </button>
                          <button type="button" onClick={() => removeReport(r)} disabled={busy} style={{ ...miniBtn, color: 'var(--accent2)', borderColor: 'rgba(255,69,58,0.4)' }}>🗑</button>
                        </div>
                      </Td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {createOpen && (
        <CreateReportModal
          onClose={() => setCreateOpen(false)}
          onCreate={addReport}
          onGenerate={buildBlob}
          onToast={showToast}
        />
      )}
      {toastNode}
    </div>
  )
}

// ── Create Report multi-step modal ───────────────────────────

function CreateReportModal({
  onClose, onCreate, onGenerate, onToast,
}: {
  onClose: () => void
  onCreate: (r: Report) => void
  onGenerate: (r: Report, k: KOL[]) => Promise<Blob>
  onToast: (m: string, t?: 'success' | 'error') => void
}) {
  const [step, setStep] = useState(1)
  const mr = monthRange()
  const [name, setName] = useState('')
  const [client, setClient] = useState('')
  const [logoName, setLogoName] = useState('')
  const [pFrom, setPFrom] = useState(mr.from)
  const [pTo, setPTo] = useState(mr.to)
  const [kolSearch, setKolSearch] = useState('')
  const [selectedKols, setSelectedKols] = useState<Set<string>>(new Set())
  const [sections, setSections] = useState<Set<string>>(new Set(DEFAULT_SECTION_KEYS))
  const [generating, setGenerating] = useState(false)

  const kolList = MOCK_SAVED_KOLS.filter((k) => {
    const q = kolSearch.trim().toLowerCase()
    return !q || `${k.username} ${k.displayName}`.toLowerCase().includes(q)
  })

  const step1Valid = name.trim() && client.trim()
  const step2Valid = selectedKols.size > 0
  const step3Valid = sections.size > 0

  function buildReport(): Report {
    return {
      id: uid(),
      name: name.trim(),
      clientName: client.trim(),
      periodStart: pFrom,
      periodEnd: pTo,
      selectedKOLIds: Array.from(selectedKols),
      sections: REPORT_SECTIONS.map((s) => s.key).filter((k) => sections.has(k)),
      status: 'completed',
      createdAt: new Date('2026-05-29').toISOString().slice(0, 10),
    }
  }

  async function generate() {
    setGenerating(true)
    try {
      const report = buildReport()
      const kols = MOCK_SAVED_KOLS.filter((k) => selectedKols.has(k.id))
      const blob = await onGenerate(report, kols)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${report.name.replace(/\s+/g, '-')}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      onCreate(report)
      onToast('Laporan dibuat & PDF diunduh!')
      onClose()
    } catch {
      onToast('Gagal membuat PDF.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  const canNext = (step === 1 && step1Valid) || (step === 2 && step2Valid) || (step === 3 && step3Valid)

  return (
    <Modal
      open
      onClose={onClose}
      wide
      maxWidth={640}
      title="Buat Laporan"
      footer={
        <>
          {step > 1 && <button type="button" onClick={() => setStep(step - 1)} style={btnSecondary}>Kembali</button>}
          {step < 4 ? (
            <button type="button" onClick={() => canNext && setStep(step + 1)} disabled={!canNext} style={{ ...btnPrimary, opacity: canNext ? 1 : 0.5, cursor: canNext ? 'pointer' : 'not-allowed' }}>Lanjut</button>
          ) : (
            <button type="button" onClick={generate} disabled={generating} style={{ ...btnPrimary, display: 'flex', alignItems: 'center', gap: 8, opacity: generating ? 0.7 : 1 }}>
              {generating && <span className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white" style={{ display: 'inline-block', animation: 'spin 0.65s linear infinite' }} />}
              Generate PDF
            </button>
          )}
        </>
      }
    >
      <Stepper step={step} />

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Field label="Nama Laporan"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="mis. Kampanye Ramadan 2026" /></Field>
          <Field label="Nama Klien"><input value={client} onChange={(e) => setClient(e.target.value)} placeholder="mis. Wardah Beauty" /></Field>
          <Field label="Logo Klien (opsional)">
            <label style={{ ...btnSecondary, display: 'inline-block', cursor: 'pointer' }}>
              {logoName || 'Pilih file…'}
              <input type="file" accept="image/*" hidden onChange={(e) => setLogoName(e.target.files?.[0]?.name ?? '')} />
            </label>
          </Field>
          <Field label="Periode Kampanye">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="date" value={pFrom} onChange={(e) => setPFrom(e.target.value)} style={{ width: 'auto' }} />
              <span style={{ color: 'var(--text2)' }}>—</span>
              <input type="date" value={pTo} onChange={(e) => setPTo(e.target.value)} style={{ width: 'auto' }} />
            </div>
          </Field>
        </div>
      )}

      {step === 2 && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <input value={kolSearch} onChange={(e) => setKolSearch(e.target.value)} placeholder="Cari kreator..." style={{ maxWidth: 240 }} />
            <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{selectedKols.size} kreator dipilih</span>
          </div>
          <div style={{ maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {kolList.map((k) => {
              const on = selectedKols.has(k.id)
              return (
                <label key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg3)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer' }}>
                  <input type="checkbox" checked={on} onChange={() => setSelectedKols((prev) => { const n = new Set(prev); n.has(k.id) ? n.delete(k.id) : n.add(k.id); return n })} style={{ width: 16, height: 16 }} />
                  <PlatformIcon platform={k.platform} size={15} />
                  <span style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>@{k.username}</span>
                  <span style={{ fontSize: 11, color: 'var(--text2)', marginLeft: 'auto' }}>{formatCompact(k.followers)} · {k.engagementRate}%</span>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {REPORT_SECTIONS.map((sec) => {
            const on = sections.has(sec.key)
            return (
              <label key={sec.key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg3)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, cursor: 'pointer' }}>
                <input type="checkbox" checked={on} onChange={() => setSections((prev) => { const n = new Set(prev); n.has(sec.key) ? n.delete(sec.key) : n.add(sec.key); return n })} style={{ width: 16, height: 16 }} />
                <span style={{ fontSize: 13, color: 'var(--text)' }}>{sec.label}</span>
              </label>
            )
          })}
        </div>
      )}

      {step === 4 && (
        <div>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
            {/* Mock PDF preview thumbnail */}
            <div style={{ width: 150, height: 200, background: '#fff', borderRadius: 6, border: '1px solid var(--border)', padding: 12, flexShrink: 0, boxShadow: '0 4px 14px rgba(0,0,0,0.3)' }}>
              <div style={{ width: 30, height: 6, background: '#0B3DE7', borderRadius: 2, marginBottom: 14 }} />
              <div style={{ width: '90%', height: 9, background: '#1a1d2e', borderRadius: 2, marginBottom: 5 }} />
              <div style={{ width: '60%', height: 9, background: '#1a1d2e', borderRadius: 2, marginBottom: 14 }} />
              <div style={{ width: 24, height: 3, background: '#0B3DE7', marginBottom: 14 }} />
              {[...Array(4)].map((_, i) => <div key={i} style={{ width: `${80 - i * 12}%`, height: 5, background: '#e5e7eb', borderRadius: 2, marginBottom: 6 }} />)}
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', margin: '0 0 4px' }}>{name || 'Tanpa Judul'}</h4>
              <p style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px' }}>{client || '—'} · {pFrom} s/d {pTo}</p>
              <SummaryRow label="Kreator" value={`${selectedKols.size} dipilih`} />
              <SummaryRow label="Section" value={`${sections.size} bagian`} />
              <SummaryRow label="Format" value="PDF (A4)" />
              <p style={{ fontSize: 11, color: 'var(--text2)', marginTop: 14, lineHeight: 1.5 }}>
                Klik <strong style={{ color: 'var(--text)' }}>Generate PDF</strong> untuk membuat & mengunduh laporan. Laporan akan muncul di tabel dengan status Selesai.
              </p>
            </div>
          </div>
        </div>
      )}
    </Modal>
  )
}

function Stepper({ step }: { step: number }) {
  const labels = ['Info Dasar', 'Pilih Kreator', 'Pilih Section', 'Preview']
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
      {labels.map((l, i) => {
        const n = i + 1
        const active = n === step
        const done = n < step
        return (
          <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: i < labels.length - 1 ? 1 : 'none' }}>
            <div style={{ width: 22, height: 22, borderRadius: '50%', background: active || done ? 'var(--accent)' : 'var(--bg3)', color: active || done ? '#fff' : 'var(--text2)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {done ? '✓' : n}
            </div>
            <span style={{ fontSize: 11, color: active ? 'var(--text)' : 'var(--text2)', fontWeight: active ? 600 : 400, whiteSpace: 'nowrap' }}>{l}</span>
            {i < labels.length - 1 && <div style={{ flex: 1, height: 1, background: 'var(--border)', minWidth: 12 }} />}
          </div>
        )
      })}
    </div>
  )
}
function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 12 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ color: 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

// ── shared bits ──────────────────────────────────────────────

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 6 }}>{label}</div>
      {children}
    </div>
  )
}
function EmptyState({ hasAny }: { hasAny: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '56px 24px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, textAlign: 'center' }}>
      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.6">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" /><polyline points="14 2 14 8 20 8" />
      </svg>
      <div style={{ fontSize: 14, color: 'var(--text2)' }}>
        {hasAny ? 'Tidak ada laporan pada rentang/pencarian ini.' : "Belum ada laporan. Klik 'Buat Laporan' untuk mulai."}
      </div>
    </div>
  )
}
function Th({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return <th style={{ textAlign: right ? 'right' : center ? 'center' : 'left', fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', padding: '12px 14px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</th>
}
function Td({ children, right, center }: { children: React.ReactNode; right?: boolean; center?: boolean }) {
  return <td style={{ textAlign: right ? 'right' : center ? 'center' : 'left', fontSize: 13, color: 'var(--text)', padding: '12px 14px', borderBottom: '1px solid var(--border)' }}>{children}</td>
}

const btnPrimary: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
}
const miniBtn: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 12, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
}
