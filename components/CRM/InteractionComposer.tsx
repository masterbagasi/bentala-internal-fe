'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { MultiFileUploader } from '@/components/website/FileUploader'
import { DANGEROUS_SCHEME, isUploadedFile, linkHref } from '@/lib/attachments'
import type { InteractionType } from '@/lib/types'

const TYPES: { value: InteractionType; label: string }[] = [
  { value: 'call', label: '📞 Telepon' }, { value: 'meeting', label: '🤝 Meeting' },
  { value: 'whatsapp', label: '💬 WhatsApp' }, { value: 'email', label: '✉️ Email' }, { value: 'note', label: '📝 Catatan' },
]

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
    if (!summary.trim()) { alert(t('Isi ringkasan dulu.')); return }
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
      files,
      author_email: u.user?.email ?? null,
      author_name: meta.full_name ?? meta.name ?? u.user?.email?.split('@')[0] ?? null,
    })
    setSaving(false)
    if (error) { alert(t('Gagal menyimpan: ') + error.message); return }
    setSummary(''); setFollowUp(''); setFiles([]); setType('call'); setOccurred(todayInput())
    onLogged?.()
  }

  const links = files.filter(u => !isUploadedFile(u))
  const uploaded = files.filter(isUploadedFile)

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14, marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <select value={type} onChange={e => setType(e.target.value as InteractionType)}>
          {TYPES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <input type="date" value={occurred} onChange={e => setOccurred(e.target.value)} />
      </div>
      <textarea rows={3} placeholder={t('Ringkasan interaksi...')} value={summary} onChange={e => setSummary(e.target.value)} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
      <label style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Follow-up berikutnya (opsional)')}</label>
      <input type="date" value={followUp} onChange={e => setFollowUp(e.target.value)} />

      <div style={{ display: 'flex', gap: 8 }}>
        <input type="text" inputMode="url" placeholder={t('Tempel link apa pun...')} value={linkInput} onChange={e => setLinkInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }} style={{ flex: 1 }} />
        <button type="button" onClick={addLink} style={{ flexShrink: 0, padding: '0 14px', borderRadius: 8, cursor: 'pointer', background: 'var(--bg3)', border: '1px solid var(--border)', color: 'var(--text)', fontSize: 13 }}>+ Link</button>
      </div>
      {links.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {links.map(link => (
            <div key={link} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 6, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <a href={linkHref(link)} target="_blank" rel="noopener noreferrer" style={{ flex: 1, minWidth: 0, fontSize: 12, color: 'var(--accent)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textDecoration: 'none' }} title={link}>🔗 {link}</a>
              <button type="button" onClick={() => setFiles(f => f.filter(u => u !== link))} style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--bg2)', border: '1px solid var(--border)', color: '#ff6b6b', cursor: 'pointer' }}>×</button>
            </div>
          ))}
        </div>
      )}
      <MultiFileUploader value={uploaded} onChange={urls => setFiles(f => [...f.filter(u => !isUploadedFile(u)), ...urls])} prefix="clients/files" accept="all" />

      <button type="button" onClick={save} disabled={saving} style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 16px', cursor: saving ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600 }}>
        {saving ? t('Menyimpan…') : t('Catat interaksi')}
      </button>
    </div>
  )
}
