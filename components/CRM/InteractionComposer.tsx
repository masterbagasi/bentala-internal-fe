'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { MultiFileUploader } from '@/components/website/FileUploader'
import { Combo } from './LeadFormModal'
import { SingleDatePicker } from '@/components/Social/DateRangePicker'
import { DANGEROUS_SCHEME, isUploadedFile, linkHref } from '@/lib/attachments'
import type { InteractionType } from '@/lib/types'

const TYPES: { value: InteractionType; label: string }[] = [
  { value: 'call', label: 'Telepon' }, { value: 'meeting', label: 'Meeting' },
  { value: 'whatsapp', label: 'WhatsApp' }, { value: 'email', label: 'Email' }, { value: 'note', label: 'Catatan' },
]
const TYPE_LABELS = TYPES.map(o => o.label)

// Channels for the NEXT follow-up — how the next contact will happen.
const FOLLOWUP_CHANNELS = ['WhatsApp', 'Telepon', 'Email', 'Zoom Meeting', 'Google Meet', 'Instagram', 'Meeting langsung', 'Lainnya']

// Per-channel destination field — what to fill in (phone, account, link, …).
function targetPlaceholder(via: string): string {
  switch (via) {
    case 'WhatsApp':
    case 'Telepon': return 'Nomor telepon…'
    case 'Email': return 'Alamat email…'
    case 'Instagram': return 'Username / akun Instagram…'
    case 'Zoom Meeting':
    case 'Google Meet': return 'Link meeting…'
    case 'Meeting langsung': return 'Lokasi pertemuan…'
    default: return 'Detail tujuan…'
  }
}

function todayInput(): string {
  const d = new Date()
  return `${d.getFullYear()}-${`${d.getMonth() + 1}`.padStart(2, '0')}-${`${d.getDate()}`.padStart(2, '0')}`
}

export function InteractionComposer({ clientId, onLogged }: { clientId: string; onLogged?: () => void }) {
  const t = useT()
  const [type, setType] = useState<InteractionType>('call')
  const [summary, setSummary] = useState('')
  const [occurred, setOccurred] = useState(todayInput())
  const [followUp, setFollowUp] = useState('')
  const [followUpTime, setFollowUpTime] = useState('')
  const [followUpVia, setFollowUpVia] = useState('')
  const [followUpTarget, setFollowUpTarget] = useState('')
  const [followUpNote, setFollowUpNote] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [linkInput, setLinkInput] = useState('')
  const [saving, setSaving] = useState(false)

  function addLink() {
    const v = linkInput.trim()
    if (!v) return
    if (DANGEROUS_SCHEME.test(v)) { alert(t('Link tidak valid — gunakan URL http(s).')); return }
    setFiles(f => (f.includes(v) ? f : [...f, v]))
    setLinkInput('')
  }

  async function save() {
    // Allow either a logged interaction (summary) OR a scheduled-only follow-up,
    // so a follow-up reminder can be saved without writing a past-interaction note.
    if (!summary.trim() && !followUp) { alert(t('Isi ringkasan interaksi atau jadwalkan tanggal follow-up dulu.')); return }
    setSaving(true)
    const supabase = getSupabase()
    const { data: u } = await supabase.auth.getUser()
    const meta = u.user?.user_metadata ?? {}
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).from('client_interactions').insert({
      client_id: clientId,
      type,
      summary: summary.trim(),
      occurred_at: new Date(occurred).toISOString(),
      next_follow_up: followUp || null,
      next_follow_up_time: followUp ? (followUpTime || null) : null,
      next_follow_up_via: followUp ? (followUpVia || null) : null,
      next_follow_up_target: followUp ? (followUpTarget.trim() || null) : null,
      next_follow_up_note: followUp ? (followUpNote.trim() || null) : null,
      files,
      author_email: u.user?.email ?? null,
      author_name: meta.full_name ?? meta.name ?? u.user?.email?.split('@')[0] ?? null,
    })
    setSaving(false)
    if (error) { alert(t('Gagal menyimpan: ') + error.message); return }
    setSummary(''); setFollowUp(''); setFollowUpTime(''); setFollowUpVia(''); setFollowUpTarget(''); setFollowUpNote(''); setFiles([]); setType('call'); setOccurred(todayInput())
    onLogged?.()
  }

  const links = files.filter(u => !isUploadedFile(u))
  const uploaded = files.filter(isUploadedFile)

  return (
    <div className="ic-composer" style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Uniform control height so every field lines up on the same grid. */}
      <style>{`.ic-composer select, .ic-composer input { height: 42px; box-sizing: border-box; } .ic-composer textarea { box-sizing: border-box; min-height: 84px; }`}</style>
      {/* Interaksi yang terjadi */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <Label>Jenis</Label>
          <Combo searchable={false} value={TYPES.find(o => o.value === type)?.label ?? ''} onChange={(lbl) => { const o = TYPES.find(x => x.label === lbl); if (o) setType(o.value) }} options={TYPE_LABELS} placeholder={t('Pilih jenis…')} />
        </div>
        <div>
          <Label>Tanggal interaksi</Label>
          <SingleDatePicker value={occurred} onChange={setOccurred} placeholder="Pilih tanggal…" />
        </div>
      </div>
      <div>
        <Label>Ringkasan interaksi</Label>
        <textarea rows={3} placeholder={t('Apa yang dibahas / hasilnya…')} value={summary} onChange={e => setSummary(e.target.value)} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
      </div>

      {/* Follow-up plan — accent group, mirrors the readout card's "upcoming" block. */}
      <div style={{ background: 'rgba(108,99,255,0.05)', border: '1px solid rgba(108,99,255,0.16)', borderLeft: '2px solid var(--accent)', borderRadius: 10, padding: 13, display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.6px', textTransform: 'uppercase', color: 'var(--link)' }}>Follow-up berikutnya</span>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>· opsional</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <Label>Tanggal</Label>
            <SingleDatePicker value={followUp} onChange={setFollowUp} placeholder="Pilih tanggal…" />
          </div>
          <div>
            <Label>Jam · opsional</Label>
            <input type="time" value={followUpTime} onChange={e => setFollowUpTime(e.target.value)} disabled={!followUp} title={followUp ? '' : t('Pilih tanggal follow-up dulu')} style={{ opacity: followUp ? 1 : 0.45, cursor: followUp ? 'auto' : 'not-allowed' }} />
          </div>
        </div>
        <div>
          <Label>Via · opsional</Label>
          <Combo searchable={false} value={followUpVia} onChange={setFollowUpVia} options={FOLLOWUP_CHANNELS} placeholder={t('Pilih channel…')} />
        </div>
        {followUpVia && (
          <div>
            <Label>Tujuan</Label>
            <input type="text" placeholder={t(targetPlaceholder(followUpVia))} value={followUpTarget} onChange={e => setFollowUpTarget(e.target.value)} />
          </div>
        )}
        <div>
          <Label>Catatan follow-up</Label>
          <input type="text" placeholder={t('Yang perlu dilakukan berikutnya…')} value={followUpNote} onChange={e => setFollowUpNote(e.target.value)} />
        </div>
      </div>

      {/* Lampiran */}
      <div>
        <Label>Lampiran · opsional</Label>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" inputMode="url" placeholder={t('Tempel link apa pun…')} value={linkInput} onChange={e => setLinkInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }} style={{ flex: 1 }} />
          <button type="button" onClick={addLink} style={{ flexShrink: 0, padding: '0 14px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13, fontWeight: 500 }}>+ {t('Link')}</button>
        </div>
        {links.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
            {links.map(link => (
              <div key={link} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <a href={linkHref(link)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--link)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }} title={link}>{link}</a>
                <button type="button" onClick={() => setFiles(f => f.filter(u => u !== link))} style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', color: '#ff6b6b', cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ marginTop: 8 }}>
          <MultiFileUploader value={uploaded} onChange={urls => setFiles(f => [...f.filter(u => !isUploadedFile(u)), ...urls])} prefix="clients/files" accept="all" />
        </div>
      </div>

      <button type="button" onClick={save} disabled={saving} style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 18px', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
        {saving ? t('Menyimpan…') : t('Catat interaksi')}
      </button>
    </div>
  )
}

// Small uppercase field label — matches the readout card's eyebrow so the form
// and the saved card read as one system.
function Label({ children }: { children: React.ReactNode }) {
  return <span style={{ display: 'block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text3)', marginBottom: 5 }}>{children}</span>
}
