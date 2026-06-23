'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useClientMessages } from '@/hooks/useClientMessages'
import type { Client, ClientMessage } from '@/lib/types'

type Channel = 'whatsapp' | 'email'
const fmt = (iso: string) => new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const digits = (s: string) => (s || '').replace(/[^\d]/g, '')

async function author() {
  const { data } = await getSupabase().auth.getUser()
  const meta = data.user?.user_metadata ?? {}
  return { email: data.user?.email ?? null, name: (meta.full_name as string) ?? (meta.name as string) ?? data.user?.email?.split('@')[0] ?? null }
}
/** Returns true on success; alerts + returns false on a failed write so the
 *  caller keeps the composed text instead of silently losing the record. */
async function insertMessage(row: Omit<ClientMessage, 'id' | 'created_at'>): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (getSupabase() as any).from('client_messages').insert(row)
  if (error) { alert('Gagal mencatat pesan: ' + error.message); return false }
  return true
}

export function ClientComms({ client }: { client: Client }) {
  const t = useT()
  const [tab, setTab] = useState<Channel>('whatsapp')
  const messages = useClientMessages(client.id)
  const list = messages.filter(m => m.channel === tab)

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {(['whatsapp', 'email'] as Channel[]).map(c => (
          <button key={c} onClick={() => setTab(c)} style={{
            padding: '5px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 600,
            border: '1px solid', borderColor: tab === c ? 'var(--accent)' : 'var(--border)',
            background: tab === c ? 'rgba(108,99,255,0.12)' : 'var(--bg3)', color: tab === c ? 'var(--accent)' : 'var(--text2)',
          }}>{c === 'whatsapp' ? '💬 WhatsApp' : '✉️ Email'}</button>
        ))}
      </div>

      {tab === 'whatsapp' ? <WhatsAppCompose client={client} t={t} /> : <EmailCompose client={client} t={t} />}
      <LogInbound client={client} channel={tab} t={t} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
        {list.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>{t('Belum ada pesan.')}</div>
        ) : list.map(m => (
          <div key={m.id} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: '8px 12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, fontSize: 11, color: 'var(--text2)' }}>
              <span style={{ fontWeight: 600, color: m.direction === 'out' ? 'var(--accent)' : 'var(--accent3)' }}>{m.direction === 'out' ? `→ ${t('Keluar')}` : `← ${t('Masuk')}`}</span>
              <StatusChip status={m.status} />
              <span>· {fmt(m.created_at)}{m.author_name ? ` · ${m.author_name}` : ''}</span>
            </div>
            {m.subject && <div style={{ fontSize: 12, fontWeight: 600 }}>{m.subject}</div>}
            <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{m.body}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function StatusChip({ status }: { status: string }) {
  const color = status === 'sent' ? 'var(--accent3)' : status === 'failed' ? '#ff6b6b' : 'var(--text3)'
  return <span style={{ fontSize: 10, color, border: `1px solid ${color}`, borderRadius: 20, padding: '0 6px' }}>{status}</span>
}

function WhatsAppCompose({ client, t }: { client: Client; t: (s: string) => string }) {
  const [to, setTo] = useState(digits(client.contact || ''))
  const [body, setBody] = useState('')
  async function send() {
    if (!to || !body.trim()) return
    window.open(`https://wa.me/${digits(to)}?text=${encodeURIComponent(body)}`, '_blank', 'noopener')
    const a = await author()
    const logged = await insertMessage({ client_id: client.id, channel: 'whatsapp', direction: 'out', subject: null, body: body.trim(), to_address: to, status: 'logged', author_email: a.email, author_name: a.name })
    if (logged) setBody('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input value={to} onChange={e => setTo(e.target.value)} placeholder={t('Nomor WhatsApp')} />
      <textarea rows={2} value={body} onChange={e => setBody(e.target.value)} placeholder={t('Tulis pesan...')} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
      <button type="button" onClick={send} style={{ alignSelf: 'flex-end', background: '#25D366', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>{t('Buka WhatsApp')}</button>
    </div>
  )
}

function EmailCompose({ client, t }: { client: Client; t: (s: string) => string }) {
  const [to, setTo] = useState((client.contact || '').includes('@') ? client.contact ?? '' : '')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  async function send() {
    if (!to.trim() || !body.trim()) return
    setSending(true)
    let ok = false, error = ''
    try {
      const res = await fetch('/api/crm/email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to, subject, body }) })
      const data = await res.json()
      ok = !!data.ok; error = data.error || ''
    } catch (e) { error = e instanceof Error ? e.message : 'Network error' }
    const a = await author()
    const logged = await insertMessage({ client_id: client.id, channel: 'email', direction: 'out', subject: subject || null, body: body.trim(), to_address: to, status: ok ? 'sent' : 'failed', author_email: a.email, author_name: a.name })
    setSending(false)
    if (!ok) { alert(t('Gagal kirim email: ') + error); return }
    if (logged) { setSubject(''); setBody('') }
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <input value={to} onChange={e => setTo(e.target.value)} placeholder="email@tujuan.com" />
      <input value={subject} onChange={e => setSubject(e.target.value)} placeholder={t('Subjek')} />
      <textarea rows={3} value={body} onChange={e => setBody(e.target.value)} placeholder={t('Tulis email...')} style={{ fontFamily: 'inherit', resize: 'vertical' }} />
      <button type="button" onClick={send} disabled={sending} style={{ alignSelf: 'flex-end', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', cursor: sending ? 'wait' : 'pointer', fontSize: 13, fontWeight: 600 }}>{sending ? t('Mengirim…') : t('Kirim')}</button>
    </div>
  )
}

function LogInbound({ client, channel, t }: { client: Client; channel: Channel; t: (s: string) => string }) {
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState('')
  async function save() {
    if (!body.trim()) return
    const a = await author()
    const logged = await insertMessage({ client_id: client.id, channel, direction: 'in', subject: null, body: body.trim(), to_address: null, status: 'logged', author_email: a.email, author_name: a.name })
    if (logged) { setBody(''); setOpen(false) }
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} style={{ marginTop: 8, background: 'none', border: '1px dashed var(--border)', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', fontSize: 12, color: 'var(--text2)' }}>+ {t('Catat balasan masuk')}</button>
  return (
    <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
      <input value={body} onChange={e => setBody(e.target.value)} placeholder={t('Balasan masuk...')} style={{ flex: 1 }} onKeyDown={e => { if (e.key === 'Enter') save() }} />
      <button type="button" onClick={save} style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', cursor: 'pointer', fontSize: 12, color: 'var(--text)' }}>{t('Catat')}</button>
      <button type="button" onClick={() => { setOpen(false); setBody('') }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)' }}>✕</button>
    </div>
  )
}
