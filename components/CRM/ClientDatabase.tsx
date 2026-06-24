'use client'

import { useMemo, useState } from 'react'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { formatRupiah } from '@/lib/utils'
import { CRM_STAGES, STAGE_LABELS, SERVICE_OPTIONS, TEMPERATURES } from '@/lib/constants'
import { Modal } from '@/components/shared/Modal'
import { ClientProfile } from './ClientProfile'
import type { Client } from '@/lib/types'

const INTERNALS = ['Dandi', 'Naufal', 'Reinaldi', 'Faizal']
const SOURCES = ['manual', 'website', 'referral']

type SortKey = 'name' | 'pic' | 'stage' | 'value' | 'internal' | 'source' | 'temperature' | 'expected_close' | 'created_at'

const stageColor = (s: string) => CRM_STAGES.find(x => x.key === s)?.color ?? 'var(--text2)'
const serviceLabel = (s: string) => SERVICE_OPTIONS.find(o => o.value === s)?.label ?? s
const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')
const cap = (s?: string | null) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '—')

export function ClientDatabase() {
  const t = useT()
  const clients = useStore(useShallow((s) => s.clients))
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('all')
  const [internal, setInternal] = useState('all')
  const [temperature, setTemperature] = useState('all')
  const [source, setSource] = useState('all')
  const [sortKey, setSortKey] = useState<SortKey>('created_at')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [detailId, setDetailId] = useState<string | null>(null)

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = clients.filter((c) => {
      if (stage !== 'all' && c.stage !== stage) return false
      if (internal !== 'all' && c.internal !== internal) return false
      if (temperature !== 'all' && (c.temperature ?? '') !== temperature) return false
      if (source !== 'all' && (c.source ?? 'manual') !== source) return false
      if (q && !`${c.name} ${c.pic} ${c.contact}`.toLowerCase().includes(q)) return false
      return true
    })
    const dir = sortDir === 'asc' ? 1 : -1
    return filtered.sort((a, b) => {
      const av = a[sortKey] ?? ''
      const bv = b[sortKey] ?? ''
      if (sortKey === 'value') return ((a.value || 0) - (b.value || 0)) * dir
      return String(av).localeCompare(String(bv)) * dir
    })
  }, [clients, query, stage, internal, temperature, source, sortKey, sortDir])

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortKey(k); setSortDir('asc') }
  }

  function exportCsv() {
    const headers = ['Nama', 'PIC', 'Kontak', 'Stage', 'Nilai', 'Layanan', 'PIC Internal', 'Source', 'Temperature', 'Perkiraan Closing', 'Dibuat']
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
    const lines = rows.map((c) => [
      c.name, c.pic, c.contact, STAGE_LABELS[c.stage] ?? c.stage, String(c.value || 0), serviceLabel(c.service),
      c.internal || '', c.source || 'manual', c.temperature || '', c.expected_close || '', (c.created_at || '').slice(0, 10),
    ].map((v) => esc(String(v ?? ''))).join(','))
    const csv = [headers.map(esc).join(','), ...lines].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `database-client-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const selectStyle: React.CSSProperties = { fontSize: 12, padding: '6px 8px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('Cari nama / PIC / kontak...')}
          style={{ flex: '1 1 220px', minWidth: 180, fontSize: 13, padding: '8px 12px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)' }}
        />
        <select value={stage} onChange={(e) => setStage(e.target.value)} style={selectStyle}>
          <option value="all">{t('Semua Stage')}</option>
          {CRM_STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          <option value="inactive">Inactive</option>
        </select>
        <select value={internal} onChange={(e) => setInternal(e.target.value)} style={selectStyle}>
          <option value="all">{t('Semua PIC')}</option>
          {INTERNALS.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={temperature} onChange={(e) => setTemperature(e.target.value)} style={selectStyle}>
          <option value="all">{t('Semua Suhu')}</option>
          {TEMPERATURES.map((tp) => <option key={tp.key} value={tp.key}>{tp.label}</option>)}
        </select>
        <select value={source} onChange={(e) => setSource(e.target.value)} style={selectStyle}>
          <option value="all">{t('Semua Source')}</option>
          {SOURCES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}
        </select>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>{rows.length} {t('client')}</span>
          <button type="button" onClick={exportCsv} style={{ fontSize: 12, fontWeight: 600, padding: '8px 14px', borderRadius: 8, background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            ↓ Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: 'auto', border: '1px solid var(--border)', borderRadius: 10 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 980 }}>
          <thead>
            <tr style={{ background: 'var(--bg2)', position: 'sticky', top: 0 }}>
              <Th label={t('Nama')} k="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="PIC" k="pic" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label={t('Kontak')} />
              <Th label="Stage" k="stage" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label={t('Nilai')} k="value" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} align="right" />
              <Th label={t('Layanan')} />
              <Th label="Internal" k="internal" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Source" k="source" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label="Suhu" k="temperature" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label={t('Closing')} k="expected_close" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
              <Th label={t('Dibuat')} k="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={11} style={{ padding: 32, textAlign: 'center', color: 'var(--text2)' }}>{t('Tidak ada client.')}</td></tr>
            ) : rows.map((c: Client) => {
              const temp = TEMPERATURES.find((x) => x.key === c.temperature)
              return (
                <tr
                  key={c.id}
                  onClick={() => setDetailId(c.id)}
                  style={{ borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                  onMouseOver={(e) => (e.currentTarget.style.background = 'var(--bg2)')}
                  onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
                >
                  <td style={{ padding: '9px 12px', fontWeight: 600, color: 'var(--text)' }}>{c.name}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{c.pic || '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)', fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5 }}>{c.contact || '—'}</td>
                  <td style={{ padding: '9px 12px' }}>
                    <span style={{ fontSize: 11, color: stageColor(c.stage), background: stageColor(c.stage) + '22', borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap' }}>{STAGE_LABELS[c.stage] ?? c.stage}</span>
                  </td>
                  <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--text)', whiteSpace: 'nowrap' }}>{c.value ? formatRupiah(c.value) : '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{serviceLabel(c.service)}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{c.internal || '—'}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)' }}>{cap(c.source ?? 'manual')}</td>
                  <td style={{ padding: '9px 12px' }}>
                    {temp ? <span style={{ fontSize: 11, color: temp.color, background: temp.color + '22', borderRadius: 20, padding: '2px 8px' }}>{temp.label}</span> : <span style={{ color: 'var(--text3)' }}>—</span>}
                  </td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(c.expected_close)}</td>
                  <td style={{ padding: '9px 12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{fmtDate(c.created_at)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {detailId && (
        <Modal open onClose={() => setDetailId(null)} title={t('Detail Client')} maxWidth={1040}>
          <ClientProfile id={detailId} onClose={() => setDetailId(null)} />
        </Modal>
      )}
    </div>
  )
}

function Th({ label, k, sortKey, sortDir, onSort, align }: {
  label: string
  k?: SortKey
  sortKey?: SortKey
  sortDir?: 'asc' | 'desc'
  onSort?: (k: SortKey) => void
  align?: 'right'
}) {
  const active = k && sortKey === k
  return (
    <th
      onClick={k && onSort ? () => onSort(k) : undefined}
      style={{
        padding: '10px 12px', textAlign: align ?? 'left', fontSize: 11, fontWeight: 600, color: active ? 'var(--text)' : 'var(--text2)',
        textTransform: 'uppercase', letterSpacing: '0.04em', whiteSpace: 'nowrap', cursor: k ? 'pointer' : 'default', userSelect: 'none',
      }}
    >
      {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}
