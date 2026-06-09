'use client'

import { useRef, useState } from 'react'
import { MOCK_KOLS, type KOL, type Platform } from '@/lib/mock-data/kol-analytics'
import { PlatformIcon } from '../PlatformIcon'
import { KolResultCard } from '../KolResultCard'
import { useToast } from '../useToast'

type SubTab = 'single' | 'bulk'

const PLATFORMS: Platform[] = ['instagram', 'tiktok', 'youtube', 'facebook']
const PLATFORM_LABEL_SHORT: Record<Platform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  facebook: 'Facebook',
}
const SLOTS = 10

export function AnalyserTab() {
  const [subTab, setSubTab] = useState<SubTab>('single')
  const { showToast, toastNode } = useToast()
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [results, setResults] = useState<KOL[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)

  function handleSave(kol: KOL) {
    if (savedIds.has(kol.id)) return
    setSavedIds((s) => new Set(s).add(kol.id))
    showToast('Berhasil disimpan!')
  }
  function handleAddToReport() {
    showToast('Ditambahkan ke laporan!')
  }

  function analyze(kols: KOL[]) {
    setAnalyzing(true)
    setResults(null)
    setTimeout(() => {
      setResults(kols)
      setAnalyzing(false)
    }, 700)
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: 22, fontWeight: 700, color: 'var(--text)', margin: 0 }}>Analyser</h2>
          <p style={{ fontSize: 13, color: 'var(--text2)', margin: '4px 0 0' }}>Analisis akun sosial untuk insight kampanye terbaik</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" onClick={() => showToast('Riwayat analisis (mock).')} style={btnSecondary}>Riwayat</button>
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 16px', textAlign: 'right' }}>
            <div style={{ fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Sisa Kredit Analyser</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', lineHeight: 1.1 }}>13</div>
          </div>
        </div>
      </div>

      {/* Sub-tabs */}
      <SubTabs active={subTab} onChange={setSubTab} />

      {subTab === 'single' ? (
        <SingleUpload onAnalyze={analyze} />
      ) : (
        <BulkUpload onAnalyze={analyze} onToast={showToast} />
      )}

      {/* Results */}
      <Results results={results} analyzing={analyzing} savedIds={savedIds} onSave={handleSave} onAddToReport={handleAddToReport} />

      {toastNode}
    </div>
  )
}

// ── Sub-tabs ─────────────────────────────────────────────────

function SubTabs({ active, onChange }: { active: SubTab; onChange: (t: SubTab) => void }) {
  const items: { key: SubTab; label: string }[] = [
    { key: 'single', label: 'Single Upload' },
    { key: 'bulk', label: 'Bulk Upload' },
  ]
  return (
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginBottom: 20, overflowX: 'auto', whiteSpace: 'nowrap' }}>
      {items.map((it) => {
        const on = active === it.key
        return (
          <button
            key={it.key}
            type="button"
            onClick={() => onChange(it.key)}
            style={{
              padding: '10px 14px', background: 'none', border: 'none',
              borderBottom: `2px solid ${on ? 'var(--accent)' : 'transparent'}`, marginBottom: -1,
              fontSize: 13, fontWeight: on ? 600 : 400, color: on ? 'var(--accent)' : 'var(--text2)',
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

// ── Single Upload ────────────────────────────────────────────

function SingleUpload({ onAnalyze }: { onAnalyze: (k: KOL[]) => void }) {
  const [enabled, setEnabled] = useState<Set<Platform>>(new Set<Platform>(['instagram']))
  const [open, setOpen] = useState<Set<Platform>>(new Set<Platform>(['instagram']))
  // usernames[platform] = string[10]
  const [usernames, setUsernames] = useState<Record<Platform, string[]>>(() => ({
    instagram: Array(SLOTS).fill(''),
    tiktok: Array(SLOTS).fill(''),
    youtube: Array(SLOTS).fill(''),
    facebook: Array(SLOTS).fill(''),
  }))

  function toggleEnabled(p: Platform) {
    setEnabled((prev) => {
      const next = new Set(prev)
      if (next.has(p)) next.delete(p)
      else { next.add(p); setOpen((o) => new Set(o).add(p)) }
      return next
    })
  }
  function toggleOpen(p: Platform) {
    setOpen((prev) => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }
  function setName(p: Platform, idx: number, val: string) {
    setUsernames((prev) => {
      const arr = [...prev[p]]
      arr[idx] = val
      return { ...prev, [p]: arr }
    })
  }

  function reset() {
    setUsernames({
      instagram: Array(SLOTS).fill(''),
      tiktok: Array(SLOTS).fill(''),
      youtube: Array(SLOTS).fill(''),
      facebook: Array(SLOTS).fill(''),
    })
  }

  function run() {
    const out: KOL[] = []
    const used = new Set<string>()
    PLATFORMS.forEach((p) => {
      if (!enabled.has(p)) return
      const filled = usernames[p].map((u) => u.trim()).filter(Boolean)
      const pool = MOCK_KOLS.filter((k) => k.platform === p)
      filled.forEach((handle, i) => {
        const base = pool[i % pool.length]
        if (!base) return
        const id = `${base.id}-${handle}`
        if (used.has(id)) return
        used.add(id)
        out.push({ ...base, id, username: handle.replace(/^@/, ''), displayName: handle.replace(/^@/, '') })
      })
    })
    // Nothing typed → analyse a small default sample per enabled platform.
    if (out.length === 0) {
      PLATFORMS.forEach((p) => {
        if (!enabled.has(p)) return
        MOCK_KOLS.filter((k) => k.platform === p).slice(0, 2).forEach((k) => out.push(k))
      })
    }
    onAnalyze(out)
  }

  return (
    <div>
      <InfoBar>Anda bisa menganalisis hingga 10 kreator per platform. Butuh lebih? Coba Bulk Upload.</InfoBar>

      {PLATFORMS.map((p) => {
        const isEnabled = enabled.has(p)
        const isOpen = open.has(p)
        return (
          <div key={p} style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, marginBottom: 12, overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <input type="checkbox" checked={isEnabled} onChange={() => toggleEnabled(p)} style={{ width: 16, height: 16 }} />
                <PlatformIcon platform={p} size={18} />
                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{PLATFORM_LABEL_SHORT[p]}</span>
              </label>
              <button type="button" onClick={() => toggleOpen(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transform: isOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            {isOpen && (
              <div style={{ padding: '0 18px 18px', opacity: isEnabled ? 1 : 0.45, pointerEvents: isEnabled ? 'auto' : 'none' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
                  {Array.from({ length: SLOTS }, (_, i) => (
                    <PrefixInput key={i} prefix="@" value={usernames[p][i]} onChange={(v) => setName(p, i, v)} placeholder="Masukkan username" />
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      <FooterActions onReset={reset} onRun={run} />
    </div>
  )
}

// ── Bulk Upload ──────────────────────────────────────────────

function BulkUpload({ onAnalyze, onToast }: { onAnalyze: (k: KOL[]) => void; onToast: (m: string, t?: 'success' | 'error') => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function accept(f: File | undefined) {
    if (!f) return
    if (!f.name.toLowerCase().endsWith('.xlsx')) {
      onToast('Hanya file .xlsx yang didukung.', 'error')
      return
    }
    if (f.size > 25 * 1024 * 1024) {
      onToast('Ukuran file melebihi 25 MB.', 'error')
      return
    }
    setFile(f)
  }

  function downloadTemplate() {
    // Functional template (CSV with the expected columns).
    const csv = 'platform,username\ninstagram,nama_kreator\ntiktok,nama_kreator\n'
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'template-kol-analyser.csv'
    a.click()
    URL.revokeObjectURL(url)
    onToast('Template diunduh.')
  }

  function run() {
    // Mock parse → return a sample set of creators.
    onAnalyze(MOCK_KOLS.slice(0, 6))
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14, flexWrap: 'wrap' }}>
        <InfoBar nomargin>Upload hingga 100 kreator sekaligus.</InfoBar>
        <button type="button" onClick={downloadTemplate} style={btnSecondary}>📥 Template</button>
      </div>

      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); accept(e.dataTransfer.files[0]) }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '48px 24px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
          background: dragOver ? 'rgba(11,61,231,0.08)' : 'var(--bg2)',
          border: `2px dashed ${dragOver ? 'var(--accent)' : 'var(--border)'}`,
          transition: 'border-color 0.15s, background 0.15s',
        }}
      >
        <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(e) => accept(e.target.files?.[0])} />
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="1.6">
          <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
          <polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
        </svg>
        {file ? (
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>📄 {file.name}</div>
        ) : (
          <div style={{ fontSize: 14, color: 'var(--text)', fontWeight: 500 }}>Klik untuk upload atau drag and drop</div>
        )}
        <div style={{ fontSize: 12, color: 'var(--text2)' }}>Hanya file .xlsx · Max 25 MB</div>
      </div>

      <FooterActions onReset={() => setFile(null)} onRun={run} runDisabled={!file} />
    </div>
  )
}

// ── Results ──────────────────────────────────────────────────

function Results({
  results, analyzing, savedIds, onSave, onAddToReport,
}: {
  results: KOL[] | null
  analyzing: boolean
  savedIds: Set<string>
  onSave: (k: KOL) => void
  onAddToReport: (k: KOL) => void
}) {
  if (analyzing) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '56px 24px', marginTop: 8 }}>
        <span className="w-7 h-7 rounded-full border-2 border-white/20 border-t-white" style={{ display: 'inline-block', animation: 'spin 0.65s linear infinite' }} />
        <div style={{ fontSize: 14, color: 'var(--text2)' }}>Menganalisis kreator…</div>
      </div>
    )
  }
  if (results === null) return null
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', margin: '0 0 16px' }}>
        Hasil Analisis · {results.length} Kreator
      </h3>
      {results.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', fontSize: 14, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12 }}>
          Tidak ada kreator untuk dianalisis. Aktifkan platform dan isi username.
        </div>
      ) : (
        results.map((k) => (
          <KolResultCard key={k.id} kol={k} saved={savedIds.has(k.id)} onSave={onSave} onAddToReport={onAddToReport} />
        ))
      )}
    </div>
  )
}

// ── Shared bits ──────────────────────────────────────────────

function InfoBar({ children, nomargin }: { children: React.ReactNode; nomargin?: boolean }) {
  return (
    <div style={{ background: 'rgba(11,61,231,0.10)', border: '1px solid rgba(11,61,231,0.30)', borderRadius: 10, padding: '12px 16px', fontSize: 13, color: 'var(--text2)', marginBottom: nomargin ? 0 : 16, flex: nomargin ? 1 : undefined, minWidth: 240 }}>
      ℹ️ {children}
    </div>
  )
}
function PrefixInput({ prefix, value, onChange, placeholder }: { prefix: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <span style={{ padding: '0 0 0 12px', color: 'var(--text2)', fontSize: 14 }}>{prefix}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ border: 'none', background: 'transparent', boxShadow: 'none', paddingLeft: 6, fontSize: 13 }} />
    </div>
  )
}
function FooterActions({ onReset, onRun, runDisabled }: { onReset: () => void; onRun: () => void; runDisabled?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
      <button type="button" onClick={onReset} style={btnSecondary}>Reset</button>
      <button type="button" onClick={onRun} disabled={runDisabled} style={{ ...btnPrimary, opacity: runDisabled ? 0.5 : 1, cursor: runDisabled ? 'not-allowed' : 'pointer' }}>
        Analyser
      </button>
    </div>
  )
}

const btnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 18px', borderRadius: 8,
  background: 'var(--accent)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 600, cursor: 'pointer',
}
const btnSecondary: React.CSSProperties = {
  padding: '9px 18px', borderRadius: 8, background: 'var(--bg3)', color: 'var(--text)',
  border: '1px solid var(--border)', fontSize: 13, fontWeight: 500, cursor: 'pointer',
}
