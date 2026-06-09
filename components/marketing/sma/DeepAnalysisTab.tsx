'use client'

import { useMemo, useState } from 'react'
import {
  buildManualAspects, buildResult, MOCK_HISTORY,
  type DeepConfig, type FieldValue, type SheetRead, type Platform, type AnalysisResult, type HistoryEntry,
} from './data'
import { C } from './theme'
import { useToast } from './ui'
import { Stepper } from './Stepper'
import { Step1Config } from './steps/Step1Config'
import { Step2Data } from './steps/Step2Data'
import { Step3Processing } from './steps/Step3Processing'
import { Step4Result } from './steps/Step4Result'
import { HistoryView } from './HistoryView'
import { DealModal } from './DealModal'

const EMPTY_CONFIG: DeepConfig = { username: '', platform: null, tier: null, objectives: [], mode: null }

function todayLabel(): string {
  try { return new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) } catch { return '6 Jun 2026' }
}

export function DeepAnalysisTab({ onOpenClient }: { onOpenClient?: () => void }) {
  const [view, setView] = useState<'new' | 'history'>('new')
  const [step, setStep] = useState(1)
  const [config, setConfig] = useState<DeepConfig>(EMPTY_CONFIG)
  const [manual, setManual] = useState<Record<string, FieldValue>>({})
  const [sheets, setSheets] = useState<Record<string, SheetRead>>({})
  const [brandFiles, setBrandFiles] = useState<string[]>([])
  const [brandText, setBrandText] = useState('')
  const [competitors, setCompetitors] = useState<string[]>(['', ''])
  const [result, setResult] = useState<AnalysisResult | null>(null)
  const [generating, setGenerating] = useState(false)
  const [dealOpen, setDealOpen] = useState(false)
  const { showToast, toastNode } = useToast()
  const today = todayLabel()

  const manualAspects = useMemo(() => buildManualAspects(config), [config])

  const setManualValue = (id: string, fv: FieldValue) => setManual((prev) => ({ ...prev, [id]: fv }))
  const setSheet = (platform: Platform, read: SheetRead | null) => setSheets((prev) => {
    const next = { ...prev }
    if (read) next[platform] = read; else delete next[platform]
    return next
  })

  function resetFlow() {
    setStep(1); setConfig(EMPTY_CONFIG); setManual({}); setSheets({}); setBrandFiles([]); setBrandText('')
    setCompetitors(['', '']); setResult(null)
  }

  function startProcessing() { setStep(3) }
  function finishProcessing() {
    setResult(buildResult(config, competitors.map((c) => c.trim()).filter(Boolean)))
    setStep(4)
  }

  async function downloadPDF() {
    if (!result) return
    setGenerating(true)
    try {
      const [{ pdf }, { AnalysisPdf }] = await Promise.all([import('@react-pdf/renderer'), import('./pdf/AnalysisPdf')])
      const blob = await pdf(<AnalysisPdf result={result} todayStr={today} />).toBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Analisa-${config.username.replace(/[^a-zA-Z0-9]/g, '') || 'akun'}.pdf`
      a.click()
      URL.revokeObjectURL(url)
      showToast('PDF analisa berhasil diunduh!')
    } catch {
      showToast('Gagal membuat PDF.', 'error')
    } finally {
      setGenerating(false)
    }
  }

  // Load a history entry into the result view (demo).
  function loadHistory(e: HistoryEntry, openDeal: boolean) {
    const cfg: DeepConfig = { username: e.username, platform: e.platform, tier: 'umkm', objectives: [e.objective], mode: 'A' }
    setConfig(cfg)
    setResult(buildResult(cfg, []))
    setView('new')
    setStep(4)
    if (openDeal) setDealOpen(true)
  }

  return (
    <div>
      {/* Analisa Baru / Riwayat toggle */}
      <div style={{ display: 'inline-flex', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, marginBottom: 20 }}>
        {([['new', 'Analisa Baru'], ['history', 'Riwayat']] as const).map(([key, label]) => {
          const on = view === key
          return (
            <button key={key} type="button"
              onClick={() => { if (key === 'new') { setView('new'); if (step === 4) resetFlow() } else setView('history') }}
              style={{ padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, background: on ? C.accent : 'transparent', color: on ? C.onAccent : 'var(--text2)' }}>
              {label}
            </button>
          )
        })}
      </div>

      {view === 'history' ? (
        <HistoryView entries={MOCK_HISTORY} onView={(e) => loadHistory(e, false)} onConfirm={(e) => loadHistory(e, true)} />
      ) : (
        <>
          <Stepper current={step} onJump={(n) => { if (n < step) setStep(n) }} />
          {step === 1 && <Step1Config config={config} setConfig={setConfig} onNext={() => setStep(2)} />}
          {step === 2 && (
            <Step2Data
              config={config} manualAspects={manualAspects} manual={manual} setManualValue={setManualValue}
              sheets={sheets} setSheet={setSheet}
              brandFiles={brandFiles} setBrandFiles={setBrandFiles} brandText={brandText} setBrandText={setBrandText}
              competitors={competitors} setCompetitors={setCompetitors}
              onBack={() => setStep(1)} onStart={startProcessing} notify={showToast}
            />
          )}
          {step === 3 && <Step3Processing onDone={finishProcessing} />}
          {step === 4 && result && (
            <Step4Result result={result} todayStr={today} generating={generating}
              onDownloadPDF={downloadPDF} onConfirmDeal={() => setDealOpen(true)} />
          )}
        </>
      )}

      {dealOpen && (
        <DealModal config={config} todayStr={today}
          onClose={() => setDealOpen(false)}
          onOpenClient={() => { setDealOpen(false); onOpenClient?.() }} />
      )}

      {toastNode}
    </div>
  )
}
