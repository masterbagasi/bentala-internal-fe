'use client'

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Filler,
} from 'chart.js'
import { Pie, Bar, Line } from 'react-chartjs-2'
import type { KOL } from '@/lib/mock-data/kol-analytics'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement, Filler)

const GRID = 'rgba(255,255,255,0.08)'
const TICK = 'rgba(255,255,255,0.55)'

export function GenderPie({ kol }: { kol: KOL }) {
  const g = kol.audienceDemographics.gender
  return (
    <div style={{ height: 150 }}>
      <Pie
        data={{
          labels: ['Perempuan', 'Laki-laki'],
          datasets: [{ data: [g.female, g.male], backgroundColor: ['#ff6b9d', '#5b9bd5'], borderWidth: 0 }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { position: 'bottom', labels: { color: TICK, boxWidth: 10, font: { size: 11 } } },
          },
        }}
      />
    </div>
  )
}

export function AgeBar({ kol }: { kol: KOL }) {
  const age = kol.audienceDemographics.age
  return (
    <div style={{ height: 150 }}>
      <Bar
        data={{
          labels: Object.keys(age),
          datasets: [{ data: Object.values(age), backgroundColor: '#0B3DE7', borderRadius: 4, maxBarThickness: 26 }],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: TICK, font: { size: 10 } }, grid: { display: false } },
            y: { ticks: { color: TICK, font: { size: 10 }, callback: (v) => `${v}%` }, grid: { color: GRID } },
          },
        }}
      />
    </div>
  )
}

export function GrowthLine({ kol }: { kol: KOL }) {
  const data = kol.growthData
  return (
    <div style={{ height: 160 }}>
      <Line
        data={{
          labels: data.map((d) => d.date.slice(5)),
          datasets: [
            {
              data: data.map((d) => d.followers),
              borderColor: '#43d9a2',
              backgroundColor: 'rgba(67,217,162,0.12)',
              fill: true,
              tension: 0.35,
              pointRadius: 0,
              borderWidth: 2,
            },
          ],
        }}
        options={{
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            x: { ticks: { color: TICK, font: { size: 9 }, maxTicksLimit: 6 }, grid: { display: false } },
            y: { ticks: { color: TICK, font: { size: 10 }, maxTicksLimit: 5 }, grid: { color: GRID } },
          },
        }}
      />
    </div>
  )
}
