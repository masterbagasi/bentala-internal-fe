'use client'

import { useState } from 'react'
import { SUBJECTS, REPORT_NARRATIVE } from './mock'
import { Card, StatCard, SectionTitle, fmtNum } from './ui'

export function ReportsView() {
  const [subjectId, setSubjectId] = useState(SUBJECTS[0].id)
  const subject = SUBJECTS.find(s => s.id === subjectId)!
  const totalFollowers = subject.connections.reduce((a, c) => a + c.followers, 0)

  return (
    <div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 18, flexWrap: 'wrap' }}>
        <select
          value={subjectId}
          onChange={e => setSubjectId(e.target.value)}
          style={{
            background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
            borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 500, minWidth: 220,
          }}
        >
          {SUBJECTS.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select
          style={{
            background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
            borderRadius: 9, padding: '8px 12px', fontSize: 13, fontWeight: 500,
          }}
        >
          <option>Mei 2026</option>
          <option>April 2026</option>
          <option>Q2 2026</option>
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button
            style={{
              background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9,
              padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            }}
          >
            Generate Laporan (AI)
          </button>
          <button
            style={{
              background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)',
              borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer',
            }}
          >
            Export PDF
          </button>
        </div>
      </div>

      {/* Report document mockup */}
      <Card style={{ padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, color: 'var(--text)', margin: 0 }}>
              Laporan Performa Sosial Media
            </h2>
            <div style={{ fontSize: 13, color: 'var(--text2)', marginTop: 4 }}>
              {subject.name} · Periode Mei 2026
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text3)' }}>Dibuat 3 Jun 2026</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          <StatCard label="Followers" value={fmtNum(totalFollowers)} delta="17.0%" />
          <StatCard label="Reach" value="433k" delta="22.3%" />
          <StatCard label="Engagement" value="5.4%" delta="1.6pts" />
          <StatCard label="Posts" value="38" delta="6 vs lalu" />
        </div>

        <SectionTitle>Ringkasan Eksekutif</SectionTitle>
        <div style={{ fontSize: 13.5, lineHeight: 1.75, color: 'var(--text2)', whiteSpace: 'pre-line' }}>
          {REPORT_NARRATIVE}
        </div>

        <div
          style={{
            marginTop: 22, padding: '12px 14px', borderRadius: 10, fontSize: 12,
            background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)',
          }}
        >
          Narasi ini akan dihasilkan otomatis oleh AI (Claude/GPT) dari data metrik live pada fase implementasi.
        </div>
      </Card>
    </div>
  )
}
