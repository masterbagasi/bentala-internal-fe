'use client'

import { useState } from 'react'
import {
  OBJECTIVE_META, PLATFORM_META, HEALTH_STATUS_META,
  type AnalysisResult, type ObjectiveAnalysis, type Signal, type Priority, type ProblemCard, type ProblemChart, type AnalysisMode,
} from '../data'
import { C, card, innerCard, sectionLabel, btnPrimary, btnSecondary, disabledStyle } from '../theme'
import { PlatformIcon } from '../ui'
import { ScoreDonut, ScoreBar, VisualBar, VisualLine, RadarCompare, FunnelBars, GroupedBars, DonutLegend, Heatmap, RadarSingle } from '../charts'

const signalColor = (s: Signal) => (s === 'green' ? C.success : s === 'yellow' ? C.warning : C.danger)
const PRIORITY_META: Record<Priority, { label: string; color: string }> = {
  kritis: { label: 'Kritis', color: C.danger },
  tinggi: { label: 'Tinggi', color: '#ED8936' },
  sedang: { label: 'Sedang', color: C.warning },
}

export function Step4Result({ result, todayStr, generating, onDownloadPDF, onConfirmDeal }: {
  result: AnalysisResult
  todayStr: string
  generating: boolean
  onDownloadPDF: () => void
  onConfirmDeal: () => void
}) {
  const [active, setActive] = useState(0)
  const a = result.byObjective[Math.min(active, result.byObjective.length - 1)]
  const multi = result.byObjective.length > 1
  const isA = result.mode === 'A'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Framing banner per mode */}
      <div style={{ ...card, borderLeft: `3px solid ${isA ? '#b794f4' : C.success}`, background: isA ? 'rgba(183,148,244,0.08)' : C.successSoft }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{isA ? '🔍 Audit Awal dari Luar' : '✅ Analisa Lengkap'}</div>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 3, lineHeight: 1.5 }}>
          {isA
            ? 'Berbasis data publik (lookup pihak ketiga) + observasi dari luar. Semua angka bersifat estimasi — ini baru permukaan.'
            : 'Berbasis data terukur dari sheet ekspor Studio + input tim. Siap untuk eksekusi nyata.'}
        </div>
      </div>
      {/* Shared top bar */}
      <div style={{ ...card }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 19, fontWeight: 800, color: 'var(--text)' }}>@{result.username.replace(/^@/, '')}</span>
              <Verified />
            </div>
            <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 4 }}>
              {OBJECTIVE_META[a.objective].full} · {PLATFORM_META[result.platform].label} · {result.contentCount} konten dianalisa · {todayStr}
            </div>
          </div>
          {(() => { const st = HEALTH_STATUS_META[a.healthStatus]; return (
            <span style={{ fontSize: 13, fontWeight: 700, color: st.color, background: `${st.color}1f`, border: `1px solid ${st.color}55`, padding: '6px 14px', borderRadius: 999 }}>⚠ {st.label}</span>
          ) })()}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 10 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <Dot color={C.success} /> Sheet <Dot color={C.warning} /> Manual <Dot color="var(--text2)" /> Tidak tersedia
          </span>
        </div>
      </div>

      {/* Objective sub-tabs */}
      {multi && (
        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', overflowX: 'auto', whiteSpace: 'nowrap' }}>
          {result.byObjective.map((o, i) => {
            const on = i === active
            return (
              <button key={o.objective} type="button" onClick={() => setActive(i)}
                style={{ padding: '10px 16px', background: 'none', border: 'none', marginBottom: -1, borderBottom: `2px solid ${on ? C.accent : 'transparent'}`, color: on ? C.accent : 'var(--text2)', fontSize: 13.5, fontWeight: on ? 600 : 500, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {OBJECTIVE_META[o.objective].label}
              </button>
            )
          })}
        </div>
      )}

      <ObjectiveView a={a} competitorCount={result.competitors.length} mode={result.mode} />

      {/* Actions */}
      <div style={{ ...card, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
          <button type="button" onClick={onDownloadPDF} disabled={generating} style={{ ...btnPrimary, ...disabledStyle(generating) }}>{generating ? '⏳ Membuat PDF…' : '📥 Download PDF Analisa & Strategi'}</button>
          <button type="button" onClick={onConfirmDeal} style={btnSecondary}>Konfirmasi Deal →</button>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>Analisa ini tersimpan otomatis di riwayat · ISI rantai bersifat placeholder hingga dokumen acuan tersedia</div>
      </div>
    </div>
  )
}

function ObjectiveView({ a, competitorCount, mode }: { a: ObjectiveAnalysis; competitorCount: number; mode: AnalysisMode }) {
  const isA = mode === 'A'
  const trust = isA ? { label: 'Estimasi publik', color: '#b794f4' } : { label: 'Terukur', color: C.success }
  const mofuLimited = isA && a.objective === 'mofu'
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {mofuLimited && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', background: C.warningSoft, border: `1px solid ${C.warning}66`, borderRadius: 10, padding: '12px 14px' }}>
          <span style={{ color: C.warning }}>⚠</span>
          <span style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5 }}>Audit MOFU ini <strong>terbatas</strong> — sinyal inti (save, share, DM, reach) tidak terlihat dari data publik. Penilaian hanya pada sinyal yang tampak dari luar.</span>
        </div>
      )}

      {/* 2. Ringkasan Eksekutif */}
      <Section label="Ringkasan Eksekutif">
        <div style={card}>
          <p style={{ fontSize: 13.5, color: 'var(--text)', margin: 0, lineHeight: 1.7 }}>{a.execSummary}</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginTop: 16 }}>
            {a.execMetrics.map((m) => (
              <div key={m.label} style={{ ...innerCard, borderTop: `3px solid ${signalColor(m.signal)}` }}>
                <div style={{ fontSize: 21, fontWeight: 800, color: signalColor(m.signal) }}>{m.value}</div>
                <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--text)', marginTop: 2 }}>{m.label}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text2)', marginTop: 2 }}>{m.benchmark}</div>
                <span style={{ display: 'inline-block', marginTop: 6, fontSize: 9, fontWeight: 700, color: trust.color, background: `${trust.color}1f`, padding: '1px 6px', borderRadius: 5 }}>[{trust.label}]</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* 3. Skor Kesehatan */}
      <Section label={a.scoreTitle}>
        <div style={{ ...card, display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center' }}><ScoreDonut score={a.healthScore} /></div>
          <div style={{ flex: 1, minWidth: 260 }}>
            {a.dimensions.map((d) => <ScoreBar key={d.label} label={d.label} value={d.value} />)}
          </div>
        </div>
      </Section>

      {/* 4. Ringkasan Visual */}
      <Section label="Ringkasan Visual">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{a.visualA.title}</div>
            <VisualBar labels={a.visualA.labels} values={a.visualA.values} />
          </div>
          <div style={card}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', marginBottom: 10 }}>{a.visualB.title}</div>
            <VisualLine labels={a.visualB.labels} values={a.visualB.values} />
          </div>
        </div>
      </Section>

      {/* 5. Masalah & Strategi */}
      <Section label={`${a.problems.length} Masalah & Strategi Konkret Berdampingan`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {a.problems.map((p) => <ProblemRow key={p.n} p={p} />)}
        </div>
      </Section>

      {/* 6. Posisi vs Kompetitor */}
      {a.radar && competitorCount > 0 && (
        <Section label="Posisi vs Kompetitor">
          <div style={card}><RadarCompare axes={a.radar.axes} client={a.radar.client} comps={a.radar.comps} /></div>
        </Section>
      )}

      {/* 7. Realism Check */}
      <Section label="Realism Check — Jujur Walau Pahit">
        <div style={{ background: C.warningSoft, border: `1px solid ${C.warning}66`, borderRadius: 12, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, color: C.warning, fontWeight: 700, fontSize: 13 }}>⚠ Yang TIDAK bisa dicapai bulan ini</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {a.realism.map((r, i) => (
              <div key={i} style={{ display: 'flex', gap: 10 }}>
                <span style={{ color: C.warning, flexShrink: 0 }}>•</span>
                <span style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.55 }}>{r}</span>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 12, fontStyle: 'italic' }}>Catatan: semua target adalah estimasi berbasis benchmark, bukan janji hasil.</div>
        </div>
      </Section>

      {/* 8. Summary Penutup */}
      <Section label="Summary Penutup">
        <div style={{ ...card, borderLeft: `3px solid ${C.accent}` }}>
          <p style={{ fontSize: 13.5, color: 'var(--text)', margin: 0, lineHeight: 1.75 }}>{a.closing}</p>
          {isA && (
            <p style={{ fontSize: 13, color: 'var(--text)', margin: '12px 0 0', lineHeight: 1.7, fontWeight: 600, background: 'rgba(0,212,255,0.10)', border: `1px solid ${C.accentBorder}`, borderRadius: 8, padding: '10px 12px' }}>
              💡 Ini baru analisa permukaan dari data publik. Dengan kerja sama penuh, kami bisa mengakses data internal akun (save, share, reach, demografi) untuk audit yang jauh lebih dalam dan strategi yang lebih presisi.
            </p>
          )}
        </div>
      </Section>

      {/* 9. Langkah Konkret (ringkasan by poin) */}
      <ActionPlan problems={a.problems} />
    </div>
  )
}

function ActionPlan({ problems }: { problems: ProblemCard[] }) {
  const W: Record<Priority, number> = { kritis: 0, tinggi: 1, sedang: 2 }
  const ordered = [...problems].sort((a, b) => W[a.priority] - W[b.priority] || a.n - b.n)
  return (
    <Section label="Langkah Konkret — Yang Harus Dilakukan">
      <div style={{ ...card }}>
        <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 14 }}>Daftar aksi terurut prioritas. Mulai dari yang kritis, satu per satu.</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ordered.map((p, i) => {
            const pr = PRIORITY_META[p.priority]
            const step = p.strategy.steps.find((s) => s.timeline === 'Hari-1')?.text ?? p.strategy.steps[0]?.text ?? ''
            return (
              <div key={p.n} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, paddingBottom: 10, borderBottom: i < ordered.length - 1 ? '1px solid var(--border)' : 'none' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: pr.color, background: `${pr.color}1f`, padding: '1px 8px', borderRadius: 5 }}>{pr.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)' }}>{p.category}</span>
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text)', lineHeight: 1.5 }}>{step}</div>
                  <div style={{ fontSize: 11.5, color: C.success, marginTop: 3 }}>🎯 Target: {p.strategy.targetMetric} → {p.strategy.targetValue}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </Section>
  )
}

function ProblemRow({ p }: { p: ProblemCard }) {
  const pr = PRIORITY_META[p.priority]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12, alignItems: 'stretch' }}>
      {/* Left — masalah */}
      <div style={{ ...innerCard, borderLeft: `3px solid ${pr.color}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: pr.color, background: `${pr.color}1f`, padding: '2px 8px', borderRadius: 6 }}>#{p.n} · {pr.label}</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text2)', background: 'var(--bg2)', border: '1px solid var(--border)', padding: '2px 8px', borderRadius: 6 }}>{p.category}</span>
        </div>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text)' }}>{p.title}</div>
        <p style={{ fontSize: 12, color: 'var(--text2)', margin: '6px 0 10px', lineHeight: 1.5 }}>{p.description}</p>
        {p.chart && (
          <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text2)', marginBottom: 8 }}>{p.chart.title}</div>
            <ProblemChartView chart={p.chart} />
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <SubBox label="Akar masalah">{p.rootCause}</SubBox>
          <SubBox label="Dampak bisnis">{p.businessImpact}</SubBox>
        </div>
        <div style={{ fontSize: 10.5, fontStyle: 'italic', color: 'var(--text2)', marginTop: 10 }}>Dasar: {p.theory}</div>
      </div>
      {/* Right — strategi */}
      <div style={{ ...innerCard, borderLeft: `3px solid ${C.accent}` }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.accent, marginBottom: 10 }}>Strategi konkret</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {p.strategy.steps.map((s, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <span style={{ fontSize: 9.5, fontWeight: 700, color: C.accent, background: C.accentSoft, padding: '2px 7px', borderRadius: 5, whiteSpace: 'nowrap', flexShrink: 0 }}>{s.timeline}</span>
              <span style={{ fontSize: 12.5, color: 'var(--text)', lineHeight: 1.45 }}>{s.text}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, background: C.successSoft, border: `1px solid ${C.success}55`, borderRadius: 8, padding: '9px 12px' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.success }}>🎯 Target 30 hari: </span>
          <span style={{ fontSize: 12, color: 'var(--text)' }}>{p.strategy.targetMetric} → <strong style={{ color: C.success }}>{p.strategy.targetValue}</strong></span>
        </div>
      </div>
    </div>
  )
}

function ProblemChartView({ chart }: { chart: ProblemChart }) {
  switch (chart.kind) {
    case 'funnel': return <FunnelBars labels={chart.labels} values={chart.values} colors={chart.colors} />
    case 'grouped': return <GroupedBars labels={chart.labels} series={chart.series} percent={chart.percent} />
    case 'donut': return <DonutLegend labels={chart.labels} values={chart.values} colors={chart.colors} />
    case 'vbars': return <VisualBar labels={chart.labels} values={chart.values} colors={chart.colors} percent={chart.percent} height={170} />
    case 'heatmap': return <Heatmap rows={chart.rows} cols={chart.cols} values={chart.values} />
    case 'radar': return <RadarSingle axes={chart.axes} values={chart.values} />
    default: return null
  }
}

function SubBox({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
      <div style={{ fontSize: 9.5, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.4px', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 11.5, color: 'var(--text)', lineHeight: 1.4 }}>{children}</div>
    </div>
  )
}
function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ ...sectionLabel, marginBottom: 12 }}>{label}</div>
      {children}
    </div>
  )
}
function Verified() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill={C.accent} aria-label="Verified">
      <path d="M12 2l2.4 1.8 3-.3 1.2 2.8 2.7 1.4-.6 3 .6 3-2.7 1.4-1.2 2.8-3-.3L12 22l-2.4-1.8-3 .3-1.2-2.8L2.7 16l.6-3-.6-3 2.7-1.4 1.2-2.8 3 .3z" />
      <polyline points="8.5 12 11 14.5 15.5 9.5" fill="none" stroke={C.onAccent} strokeWidth="1.8" />
    </svg>
  )
}
function Dot({ color }: { color: string }) {
  return <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
}
