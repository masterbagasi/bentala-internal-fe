'use client'

import { useRef, useState } from 'react'
import {
  OBJECTIVE_META, PLATFORM_META, readSheetMock, buildPublicLookup,
  type DeepConfig, type ManualAspect, type FieldValue, type SheetRead, type Platform, type PublicMetric,
} from '../data'
import { C, card, sectionLabel, btnPrimary, btnSecondary, inputStyle } from '../theme'
import { PlatformIcon, ProgressBar, Modal } from '../ui'

export function Step2Data({
  config, manualAspects, manual, setManualValue,
  sheets, setSheet,
  brandText, setBrandText, brandFiles, setBrandFiles,
  competitors, setCompetitors, onBack, onStart, notify,
}: {
  config: DeepConfig
  manualAspects: ManualAspect[]
  manual: Record<string, FieldValue>
  setManualValue: (id: string, fv: FieldValue) => void
  sheets: Record<string, SheetRead | undefined>
  setSheet: (platform: Platform, read: SheetRead | null) => void
  brandText: string
  setBrandText: (s: string) => void
  brandFiles: string[]
  setBrandFiles: (f: string[]) => void
  competitors: string[]
  setCompetitors: (c: string[]) => void
  onBack: () => void
  onStart: () => void
  notify: (msg: string, tone?: 'success' | 'error') => void
}) {
  const [review, setReview] = useState<Platform | null>(null)
  const platform = config.platform ?? 'instagram'
  const isA = (config.mode ?? 'B') === 'A' // Mode A = calon klien (data publik)

  // Readiness (informational only — everything optional).
  const sheetUnit = isA ? 0 : 1
  const units = sheetUnit + manualAspects.length
  const doneSheets = !isA && sheets[platform] ? 1 : 0
  const doneManual = manualAspects.filter((a) => (manual[a.id]?.value ?? '').trim() !== '' || (manual[a.id]?.files?.length ?? 0) > 0).length
  const pct = units ? Math.round(((doneSheets + doneManual) / units) * 100) : 0
  const objLabels = config.objectives.map((o) => OBJECTIVE_META[o].label).join(', ')
  const mofuInA = isA && config.objectives.includes('mofu')

  return (
    <div>
      {/* Header */}
      <div style={{ ...card, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>@{config.username.replace(/^@/, '')}</span>
          <PlatformIcon platform={platform} size={15} />
          {config.objectives.map((o) => <Tag key={o}>{OBJECTIVE_META[o].label}</Tag>)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ProgressBar pct={pct} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.accent, whiteSpace: 'nowrap' }}>{pct}% terisi</span>
        </div>
        <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 10 }}>Semua opsional. Lengkapi dokumen brand, unggah sheet performa, dan isi aspek kualitatif sebisanya.</div>
      </div>

      {/* Dokumen Brand Klien — paling atas */}
      <SectionTitle>Dokumen Brand Klien</SectionTitle>
      <div style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px' }}>Input kualitatif paling bernilai — taruh sebelum data lain.</div>
      <div style={{ marginBottom: 22 }}>
        <BrandCard text={brandText} setText={setBrandText} files={brandFiles} setFiles={setBrandFiles} onToast={notify} />
      </div>

      {/* BLOK 1 — sumber data berbeda per mode */}
      {isA ? (
        <>
          <SectionTitle>Data Publik · Lookup</SectionTitle>
          <div style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px' }}>Estimasi dari tool lookup pihak ketiga (membaca data publik tanpa akses akun). Bukan data internal — semua bersifat estimasi.</div>
          <div style={{ marginBottom: mofuInA ? 12 : 22 }}>
            <PublicLookupCard platform={platform} metrics={buildPublicLookup(config)} />
          </div>
          {mofuInA && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: C.warningSoft, border: `1px solid ${C.warning}66`, borderRadius: 10, padding: '12px 14px', marginBottom: 22 }}>
              <span style={{ color: C.warning }}>⚠</span>
              <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>Sebagian besar sinyal <strong>MOFU</strong> (save, share, DM, reach) tidak tersedia dari data publik. Audit MOFU di mode ini terbatas pada sinyal yang terlihat dari luar.</span>
            </div>
          )}
        </>
      ) : (
        <>
          <SectionTitle>Data Performa · Upload Sheet</SectionTitle>
          <div style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px' }}>Ekspor dari Meta Business Suite / TikTok Studio (data terukur). Sistem menghitung metrik dari sheet — tidak perlu ketik angka.</div>
          <div style={{ marginBottom: 22 }}>
            <SheetCard platform={platform} read={sheets[platform]}
              onUpload={(name) => { setSheet(platform, readSheetMock(name, platform)); notify('Sheet terbaca.') }}
              onClear={() => setSheet(platform, null)} onReview={() => setReview(platform)} />
          </div>
        </>
      )}

      {/* BLOK 2 — observasi (Mode A) / aspek manual (Mode B), gabungan tujuan */}
      <SectionTitle>{isA ? 'Observasi dari Luar' : 'Aspek Manual'} · {objLabels}</SectionTitle>
      <div style={{ fontSize: 12, color: 'var(--text2)', margin: '0 0 12px' }}>{isA ? 'Amatan dari feed/profil publik — ditandai sebagai observasi, bukan data terukur.' : 'Aspek kualitatif yang tidak ada di sheet (gabungan tujuan terpilih). Isi teks dan/atau lampirkan file.'}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 12 }}>
        {manualAspects.map((a) => {
          const cur = manual[a.id]
          return (
            <ManualCard key={a.id} aspect={a} value={cur?.value ?? ''} files={cur?.files ?? []}
              trustLabel={isA ? 'Observasi' : 'Isi manual'} trustColor={isA ? '#63B3ED' : C.warning}
              onChange={(value, files) => setManualValue(a.id, { value, files, source: 'manual', platform: a.onlyPlatform ?? platform })}
              onToast={notify} />
          )
        })}
      </div>

      {/* Kompetitor */}
      <div style={{ ...card, marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={sectionLabel}>Kompetitor Pembanding</span>
          <OptBadge>Opsional — maks. 2 akun</OptBadge>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {competitors.map((c, i) => (
            <input key={i} value={c} onChange={(e) => setCompetitors(competitors.map((x, idx) => (idx === i ? e.target.value : x)))} placeholder={`@kompetitor ${i + 1}`} style={inputStyle} />
          ))}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10 }}>Akan tampil sebagai kolom pembanding di hasil analisa.</div>
      </div>

      {/* Sticky footer */}
      <div style={{ position: 'sticky', bottom: 0, zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', margin: '8px -24px 0', padding: '14px 24px', background: 'var(--bg2)', borderTop: '1px solid var(--border)', boxShadow: '0 -6px 18px rgba(0,0,0,0.28)' }}>
        <button type="button" onClick={onBack} style={btnSecondary}>← Kembali</button>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <button type="button" onClick={onStart} style={btnPrimary}>Mulai Analisa →</button>
          <button type="button" onClick={onStart} style={{ background: 'none', border: 'none', color: C.accent, fontSize: 11.5, cursor: 'pointer', textDecoration: 'underline' }}>Lewati kolom opsional dan mulai analisa</button>
        </div>
      </div>

      {review && sheets[review] && (
        <ReviewModal read={sheets[review]!} onClose={() => setReview(null)} />
      )}
    </div>
  )
}

// ── Blok 1: sheet card ───────────────────────────────────────

function SheetCard({ platform, read, onUpload, onClear, onReview }: {
  platform: Platform; read?: SheetRead; onUpload: (name: string) => void; onClear: () => void; onReview: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  if (!read) {
    return (
      <div style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <PlatformIcon platform={platform} size={16} />
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Sheet Performa {PLATFORM_META[platform].label}</span>
        </div>
        <div onClick={() => ref.current?.click()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '26px 20px', borderRadius: 10, border: '2px dashed var(--border)', cursor: 'pointer', textAlign: 'center', background: 'var(--bg3)' }}>
          <input ref={ref} type="file" accept=".csv,.xlsx,.xls,.pdf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) { onUpload(f.name); e.target.value = '' } }} />
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.6"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Unggah sheet performa</div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>CSV · XLSX · PDF</div>
        </div>
      </div>
    )
  }
  const missing = Object.entries(read.available).filter(([, ok]) => !ok).map(([c]) => c)
  return (
    <div style={{ ...card, borderLeft: `3px solid ${C.success}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <PlatformIcon platform={platform} size={16} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Sheet Performa {PLATFORM_META[platform].label}</span>
        <span style={{ fontSize: 11, color: 'var(--text2)' }}>· {read.fileName}</span>
        <button type="button" onClick={onClear} style={{ marginLeft: 'auto', ...miniBtn }}>Ganti file</button>
      </div>

      {read.type === 'pdf' && (
        <div style={{ fontSize: 11.5, color: C.warning, background: C.warningSoft, border: `1px solid ${C.warning}55`, borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          ⚠ CSV/XLSX lebih akurat — PDF kadang menggeser kolom.
        </div>
      )}

      {/* Ringkasan baca */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 12 }}>
        <Stat label="Konten terbaca" value={`${read.contentCount}`} />
        <Stat label="Rentang tanggal" value={read.dateRange} small />
        <Stat label="Kolom terdeteksi" value={`${read.columns.length}`} />
        <Stat label="Baris janggal" value={`${read.anomalies.length}`} color={read.anomalies.length ? C.warning : C.success} />
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 10.5, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 6 }}>Kolom terdeteksi</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {read.columns.map((c) => <Chip key={c} color={C.success}>{c}</Chip>)}
          {missing.map((c) => <Chip key={c} color="var(--text2)" dim>{c} · tidak ada</Chip>)}
        </div>
      </div>

      {read.anomalies.length > 0 && (
        <button type="button" onClick={onReview} style={{ ...miniBtn, color: C.warning, borderColor: `${C.warning}66` }}>Tinjau {read.anomalies.length} baris janggal →</button>
      )}
    </div>
  )
}

function ReviewModal({ read, onClose }: { read: SheetRead; onClose: () => void }) {
  return (
    <Modal open onClose={onClose} title={`Baris Janggal — ${PLATFORM_META[read.platform].label}`}
      footer={<button type="button" onClick={onClose} style={btnPrimary}>Tutup</button>}>
      <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 12 }}>Baris berikut ditandai dan <strong style={{ color: 'var(--text)' }}>tidak ikut dihitung</strong> sebelum kamu meninjaunya.</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {read.anomalies.map((a, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: C.warning, background: C.warningSoft, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>Baris {a.row}</span>
            <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{a.reason}</span>
          </div>
        ))}
      </div>
    </Modal>
  )
}

// ── Blok 1 (Mode A): public lookup card ──────────────────────

function PublicLookupCard({ platform, metrics }: { platform: Platform; metrics: PublicMetric[] }) {
  return (
    <div style={{ ...card, borderLeft: '3px solid #b794f4' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        <PlatformIcon platform={platform} size={16} />
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Data Publik {PLATFORM_META[platform].label}</span>
        <Badge color="#b794f4">Estimasi publik</Badge>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        {metrics.map((m) => (
          <div key={m.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '9px 11px' }}>
            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{m.label}</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginTop: 3 }}>{m.value}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10 }}>Semua nilai estimasi dari data publik — bukan angka terukur internal.</div>
    </div>
  )
}

// ── Blok 2: manual card ──────────────────────────────────────

function ManualCard({ aspect, value, files, trustLabel, trustColor, onChange, onToast }: {
  aspect: ManualAspect; value: string; files: string[]
  trustLabel: string; trustColor: string
  onChange: (value: string, files: string[]) => void
  onToast: (m: string, t?: 'success' | 'error') => void
}) {
  return (
    <div style={{ ...card, padding: 14, borderLeft: `3px solid ${trustColor}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>{aspect.label}</span>
        <Badge color={trustColor}>{trustLabel}</Badge>
        <OptBadge>opsional</OptBadge>
      </div>
      {aspect.hint && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>{aspect.hint}</div>}
      <div style={{ marginTop: 10 }}>
        {aspect.inputKind === 'value' ? (
          <input value={value} onChange={(e) => onChange(e.target.value, files)} placeholder="Tulis manual (opsional)" style={inputStyle} />
        ) : (
          <textarea value={value} onChange={(e) => onChange(e.target.value, files)} rows={aspect.inputKind === 'upload' ? 2 : 3} placeholder="Tulis manual (opsional)" style={{ ...inputStyle, resize: 'vertical' }} />
        )}
      </div>
      <Attach files={files} onAdd={(name) => { onChange(value, [...files, name]); onToast('File terlampir.') }} onRemove={(i) => onChange(value, files.filter((_, idx) => idx !== i))} />
    </div>
  )
}

function BrandCard({ text, setText, files, setFiles, onToast }: {
  text: string; setText: (s: string) => void; files: string[]; setFiles: (f: string[]) => void; onToast: (m: string, t?: 'success' | 'error') => void
}) {
  return (
    <div style={{ ...card, padding: 14, borderLeft: `3px solid ${C.accent}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)' }}>Dokumen brand klien</span>
        <OptBadge>opsional</OptBadge>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>Brand guideline, company profile, USP, target market, tone.</div>
      <div style={{ marginTop: 10 }}>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="Tulis informasi brand (opsional)" style={{ ...inputStyle, resize: 'vertical' }} />
      </div>
      <Attach files={files} onAdd={(name) => { setFiles([...files, name]); onToast('File terlampir.') }} onRemove={(i) => setFiles(files.filter((_, idx) => idx !== i))} />
    </div>
  )
}

// ── attachments ──────────────────────────────────────────────

function Attach({ files, onAdd, onRemove }: { files: string[]; onAdd: (name: string) => void; onRemove: (i: number) => void }) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <div style={{ marginTop: 10 }}>
      <button type="button" onClick={() => ref.current?.click()} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 8, border: '1.5px dashed var(--border)', background: 'var(--bg3)', color: 'var(--text2)', fontSize: 12, cursor: 'pointer' }}>
        <input ref={ref} type="file" accept="image/*,video/*,.pdf,.doc,.docx" multiple hidden onChange={(e) => { if (e.target.files) { Array.from(e.target.files).forEach((f) => onAdd(f.name)); e.target.value = '' } }} />
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21.44 11.05l-9.19 9.19a5 5 0 01-7.07-7.07l9.19-9.19a3.5 3.5 0 014.95 4.95l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" /></svg>
        Lampirkan gambar / video / file
      </button>
      {files.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
          {files.map((f, i) => (
            <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 9px', color: 'var(--text)' }}>
              📎 {f}
              <button type="button" onClick={() => onRemove(i)} style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ── small bits ───────────────────────────────────────────────

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ ...sectionLabel, color: 'var(--text)', fontSize: 12, marginBottom: 4 }}>{children}</div>
}
function Stat({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <div style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>{label}</div>
      <div style={{ fontSize: small ? 11.5 : 15, fontWeight: 700, color: color ?? 'var(--text)', marginTop: 2 }}>{value}</div>
    </div>
  )
}
function Chip({ children, color, dim }: { children: React.ReactNode; color: string; dim?: boolean }) {
  return <span style={{ fontSize: 10.5, fontWeight: 600, color, background: dim ? 'var(--bg3)' : `${color}1f`, border: dim ? '1px dashed var(--border)' : 'none', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{children}</span>
}
function Badge({ color, children }: { color: string; children: React.ReactNode }) {
  return <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}1f`, padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{children}</span>
}
function OptBadge({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{children}</span>
}
function Tag({ children }: { children: React.ReactNode }) {
  return <span style={{ fontSize: 11, fontWeight: 600, color: C.accent, background: C.accentSoft, border: `1px solid ${C.accentBorder}`, padding: '2px 10px', borderRadius: 999 }}>{children}</span>
}
const miniBtn: React.CSSProperties = { padding: '5px 11px', borderRadius: 7, background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 11.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }
