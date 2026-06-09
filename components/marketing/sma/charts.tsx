'use client'

import { Fragment } from 'react'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, RadialLinearScale,
} from 'chart.js'
import { Doughnut, Bar, Line, Radar } from 'react-chartjs-2'
import { C } from './theme'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler, RadialLinearScale)

const GRID = 'rgba(255,255,255,0.08)'
const TICK = 'rgba(255,255,255,0.55)'

/** Score colour band: red <40, yellow 40-60, green >60. */
export function scoreColor(v: number): string {
  if (v < 40) return C.danger
  if (v <= 60) return C.warning
  return C.success
}

export function ScoreDonut({ score, size = 180 }: { score: number; size?: number }) {
  const color = scoreColor(score)
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <Doughnut
        data={{ labels: ['Skor', 'Sisa'], datasets: [{ data: [score, 100 - score], backgroundColor: [color, '#262b3f'], borderWidth: 0 }] }}
        options={{ responsive: true, maintainAspectRatio: false, cutout: '74%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }}
      />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: size * 0.26, fontWeight: 800, color, lineHeight: 1 }}>{score}</div>
        <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>dari 100</div>
      </div>
    </div>
  )
}

export function VisualBar({ labels, values, colors, percent, height = 180 }: { labels: string[]; values: number[]; colors?: string[]; percent?: boolean; height?: number }) {
  return (
    <div style={{ height }}>
      <Bar
        data={{ labels, datasets: [{ data: values, backgroundColor: colors ?? C.accent, borderRadius: 5, maxBarThickness: 44 }] }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: TICK, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: TICK, font: { size: 10 }, callback: (v) => (percent ? `${v}%` : v) }, grid: { color: GRID } } },
        }}
      />
    </div>
  )
}

// Horizontal labeled bars (funnel / compare). Per-bar colors supported.
export function FunnelBars({ labels, values, colors, height }: { labels: string[]; values: number[]; colors?: string[]; height?: number }) {
  return (
    <div style={{ height: height ?? Math.max(120, labels.length * 30) }}>
      <Bar
        data={{ labels, datasets: [{ data: values, backgroundColor: colors ?? C.accent, borderRadius: 4, maxBarThickness: 26 }] }}
        options={{
          indexAxis: 'y', responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: TICK, font: { size: 9 } }, grid: { color: GRID } }, y: { ticks: { color: TICK, font: { size: 10 } }, grid: { display: false } } },
        }}
      />
    </div>
  )
}

// Grouped vertical bars (e.g. Akun ini vs Benchmark; Sekarang vs Ideal).
export function GroupedBars({ labels, series, percent, height = 200 }: { labels: string[]; series: { name: string; color: string; values: number[] }[]; percent?: boolean; height?: number }) {
  return (
    <div style={{ height }}>
      <Bar
        data={{ labels, datasets: series.map((s) => ({ label: s.name, data: s.values, backgroundColor: s.color, borderRadius: 4, maxBarThickness: 26 })) }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { color: TICK, boxWidth: 10, font: { size: 11 } } } },
          scales: { x: { ticks: { color: TICK, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: TICK, font: { size: 10 }, callback: (v) => (percent ? `${v}%` : v) }, grid: { color: GRID } } },
        }}
      />
    </div>
  )
}

// Donut with legend (composition).
export function DonutLegend({ labels, values, colors, height = 200 }: { labels: string[]; values: number[]; colors: string[]; height?: number }) {
  return (
    <div style={{ height }}>
      <Doughnut
        data={{ labels, datasets: [{ data: values, backgroundColor: colors, borderWidth: 0 }] }}
        options={{ responsive: true, maintainAspectRatio: false, cutout: '58%', plugins: { legend: { position: 'right', labels: { color: TICK, boxWidth: 10, font: { size: 11 }, padding: 8 } } } }}
      />
    </div>
  )
}

// Single-series radar (e.g. konsistensi branding per elemen).
export function RadarSingle({ axes, values, color = C.success, height = 240 }: { axes: string[]; values: number[]; color?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <Radar
        data={{ labels: axes, datasets: [{ data: values, borderColor: color, backgroundColor: 'rgba(72,187,120,0.18)', borderWidth: 2, pointRadius: 2 }] }}
        options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { angleLines: { color: GRID }, grid: { color: GRID }, pointLabels: { color: TICK, font: { size: 10 } }, ticks: { display: false }, min: 0, max: 100 } } }}
      />
    </div>
  )
}

// Heatmap grid (e.g. peta jam aktif audiens).
export function Heatmap({ rows, cols, values }: { rows: string[]; cols: string[]; values: number[][] }) {
  const max = Math.max(...values.flat(), 1)
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `34px repeat(${cols.length}, 1fr)`, gap: 4 }}>
      <div />
      {cols.map((c) => <div key={c} style={{ fontSize: 9, color: TICK, textAlign: 'center' }}>{c}</div>)}
      {rows.map((rlab, ri) => (
        <Fragment key={rlab}>
          <div style={{ fontSize: 9, color: TICK, display: 'flex', alignItems: 'center' }}>{rlab}</div>
          {cols.map((_, ci) => {
            const v = values[ri]?.[ci] ?? 0
            const a = v / max
            return <div key={ci} style={{ height: 24, borderRadius: 4, background: `rgba(99,179,237,${0.1 + a * 0.7})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: a > 0.5 ? '#06141c' : 'transparent' }}>{v || ''}</div>
          })}
        </Fragment>
      ))}
    </div>
  )
}

export function VisualLine({ labels, values, height = 180 }: { labels: string[]; values: number[]; height?: number }) {
  return (
    <div style={{ height }}>
      <Line
        data={{ labels, datasets: [{ data: values, borderColor: C.success, backgroundColor: 'rgba(72,187,120,0.14)', fill: true, tension: 0.35, pointRadius: 2, borderWidth: 2 }] }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: { x: { ticks: { color: TICK, font: { size: 10 } }, grid: { display: false } }, y: { ticks: { color: TICK, font: { size: 10 } }, grid: { color: GRID } } },
        }}
      />
    </div>
  )
}

const RADAR_COLORS = ['#00D4FF', '#FC8181', '#ECC94B']
export function RadarCompare({ axes, client, comps, height = 280 }: { axes: string[]; client: number[]; comps: { name: string; values: number[] }[]; height?: number }) {
  const datasets = [
    { label: 'Klien', data: client, borderColor: RADAR_COLORS[0], backgroundColor: 'rgba(0,212,255,0.18)', borderWidth: 2, pointRadius: 2 },
    ...comps.map((c, i) => ({ label: `@${c.name}`, data: c.values, borderColor: RADAR_COLORS[(i + 1) % RADAR_COLORS.length], backgroundColor: 'transparent', borderWidth: 2, pointRadius: 2 })),
  ]
  return (
    <div style={{ height }}>
      <Radar
        data={{ labels: axes, datasets }}
        options={{
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom', labels: { color: TICK, boxWidth: 10, font: { size: 11 } } } },
          scales: { r: { angleLines: { color: GRID }, grid: { color: GRID }, pointLabels: { color: TICK, font: { size: 10 } }, ticks: { display: false, stepSize: 25 }, min: 0, max: 100 } },
        }}
      />
    </div>
  )
}

export function ScoreBar({ label, value }: { label: string; value: number }) {
  const color = scoreColor(value)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{label}</span>
        <span style={{ fontSize: 12.5, fontWeight: 700, color }}>{value}%</span>
      </div>
      <div style={{ width: '100%', height: 7, background: 'var(--bg3)', borderRadius: 7, overflow: 'hidden' }}>
        <div style={{ width: `${value}%`, height: 7, background: color, borderRadius: 7 }} />
      </div>
    </div>
  )
}
