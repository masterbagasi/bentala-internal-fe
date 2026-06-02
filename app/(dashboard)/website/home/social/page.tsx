'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { BsiSocialLink } from '@/lib/website-types'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { PrimaryActionButton } from '@/components/website/PageActions'
import { FormField, inputStyle } from '@/components/website/FormField'
import { ActionButton, IconBtn, ListEmpty, ListError, ModalShell, RowCard } from '@/components/website/SimpleList'
import { Section } from '@/components/website/Section'

const PLATFORM_LABELS: Record<BsiSocialLink['platform'], string> = {
  ig: 'Instagram',
  tiktok: 'TikTok',
  whatsapp: 'WhatsApp',
}

// Inline SVG icons — replaces the text-badge platform label in the
// list rows. Each icon is brand-coloured so the row reads at a glance.
function PlatformIcon({ platform }: { platform: BsiSocialLink['platform'] }) {
  const common = { width: 22, height: 22, viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg' }
  if (platform === 'ig') {
    return (
      <svg {...common} aria-label="Instagram">
        <defs>
          <linearGradient id="ig-grad" x1="0%" y1="100%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#feda75" />
            <stop offset="35%" stopColor="#fa7e1e" />
            <stop offset="65%" stopColor="#d62976" />
            <stop offset="100%" stopColor="#4f5bd5" />
          </linearGradient>
        </defs>
        <rect x="2" y="2" width="20" height="20" rx="5" fill="url(#ig-grad)" />
        <rect x="5" y="5" width="14" height="14" rx="4.5" fill="none" stroke="#fff" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="3.5" fill="none" stroke="#fff" strokeWidth="1.6" />
        <circle cx="17" cy="7" r="0.9" fill="#fff" />
      </svg>
    )
  }
  if (platform === 'tiktok') {
    return (
      <svg {...common} aria-label="TikTok">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="#000" />
        <path
          d="M15.5 7.2c.9 1 2 1.6 3.3 1.6v2.6c-1.3 0-2.5-.4-3.6-1.1v4.9c0 2.8-2.3 5.1-5.1 5.1-2.8 0-5.1-2.3-5.1-5.1 0-2.8 2.3-5.1 5.1-5.1.3 0 .6 0 .9.1v2.6c-.3-.1-.6-.1-.9-.1-1.4 0-2.5 1.1-2.5 2.5s1.1 2.5 2.5 2.5 2.5-1.1 2.5-2.5V5h2.6c.1 1 .5 1.7 1.3 2.2z"
          fill="#fff"
        />
        <path
          d="M16 6c.9 1 2 1.6 3.3 1.6v2.6c-1.3 0-2.5-.4-3.6-1.1v4.9c0 2.8-2.3 5.1-5.1 5.1"
          fill="none"
          stroke="#25f4ee"
          strokeWidth="0.6"
          opacity="0.7"
        />
      </svg>
    )
  }
  // whatsapp
  return (
    <svg {...common} aria-label="WhatsApp">
      <rect x="2" y="2" width="20" height="20" rx="5" fill="#25d366" />
      <path
        d="M16.6 13.8c-.3-.2-1.7-.8-2-.9-.3-.1-.5-.2-.7.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6.1-.1.3-.3.4-.5.2-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-1-2.2-.3-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4s-1 1-1 2.5 1.1 2.9 1.3 3.1c.1.2 2.2 3.4 5.3 4.7 1.9.8 2.7.9 3.6.8.6-.1 1.7-.7 1.9-1.4.2-.7.2-1.3.2-1.4 0-.1-.2-.2-.5-.3z"
        fill="#fff"
      />
    </svg>
  )
}

type FormState = Omit<BsiSocialLink, 'id' | 'created_at'>

const EMPTY: FormState = {
  platform: 'ig',
  handle: '',
  url: '',
  is_published: true,
}

export default function SocialAdminPage() {
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiSocialLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BsiSocialLink | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('bsi_social_links')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm('Hapus link ini?')) return
    const { error } = await supabase.from('bsi_social_links').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setItems((xs) => xs.filter((x) => x.id !== id))
  }

  async function togglePublish(item: BsiSocialLink) {
    const { error } = await supabase
      .from('bsi_social_links')
      .update({ is_published: !item.is_published })
      .eq('id', item.id)
    if (error) { alert(error.message); return }
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, is_published: !x.is_published } : x)))
  }

  useRegisterPageAction(
    <PrimaryActionButton onClick={() => setCreating(true)}>+ Tambah Link</PrimaryActionButton>,
  )

  return (
    <>
      <div style={{ padding: 24 }}>
        {error && <ListError message={error} />}
        <Section title="Social Links">
          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>Memuat…</div>
          ) : items.length === 0 ? (
            <ListEmpty message="Belum ada social link." />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
              {items.map((s) => (
                <RowCard key={s.id} dimmed={!s.is_published}>
                  <span
                    aria-label={PLATFORM_LABELS[s.platform]}
                    title={PLATFORM_LABELS[s.platform]}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: 'var(--bg3)',
                      border: '1px solid var(--border)',
                      flexShrink: 0,
                    }}
                  >
                    <PlatformIcon platform={s.platform} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.handle}</div>
                    <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.url}</div>
                  </div>
                  <IconBtn onClick={() => setEditing(s)} title="Edit">✎</IconBtn>
                  <IconBtn onClick={() => togglePublish(s)} title={s.is_published ? 'Sembunyikan' : 'Tampilkan'} color={s.is_published ? 'var(--accent3)' : 'var(--text2)'}>
                    {s.is_published ? '●' : '○'}
                  </IconBtn>
                  <IconBtn onClick={() => handleDelete(s.id)} title="Hapus" color="#ff6b6b">×</IconBtn>
                </RowCard>
              ))}
            </div>
          )}
        </Section>
      </div>

      {(editing || creating) && (
        <SocialModal
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={() => { setEditing(null); setCreating(false); load() }}
        />
      )}
    </>
  )
}

function SocialModal({ initial, onClose, onSaved }: { initial: BsiSocialLink | null; onClose: () => void; onSaved: () => void }) {
  const supabase = getSupabase()
  const [form, setForm] = useState<FormState>(
    initial
      ? { platform: initial.platform, handle: initial.handle, url: initial.url, is_published: initial.is_published }
      : EMPTY,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const op = initial
      ? supabase.from('bsi_social_links').update(form).eq('id', initial.id)
      : supabase.from('bsi_social_links').insert(form)
    const { error } = await op
    if (error) { setError(error.message); setSaving(false); return }
    onSaved()
  }

  return (
    <ModalShell
      title={initial ? 'Edit Link' : 'Tambah Link'}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={{ flex: 1, height: 36, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>Batal</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, height: 36, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? 'Menyimpan…' : initial ? 'Simpan' : 'Tambah'}</button>
        </>
      }
    >
      {error && <ListError message={error} />}

      <FormField label="Platform" required>
        <select
          style={inputStyle as React.CSSProperties}
          value={form.platform}
          onChange={(e) => update('platform', e.target.value as BsiSocialLink['platform'])}
        >
          <option value="ig">Instagram</option>
          <option value="tiktok">TikTok</option>
          <option value="whatsapp">WhatsApp</option>
        </select>
      </FormField>
      <FormField label="Handle" required hint="Contoh: @bentalastudio atau +6281234567890">
        <input style={inputStyle} value={form.handle} onChange={(e) => update('handle', e.target.value)} />
      </FormField>
      <FormField label="URL" required hint="Link tujuan saat di-klik">
        <input style={inputStyle} value={form.url} onChange={(e) => update('url', e.target.value)} placeholder="https://..." />
      </FormField>
      <FormField label="Status">
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_published} onChange={(e) => update('is_published', e.target.checked)} />
          Tampilkan di website
        </label>
      </FormField>
    </ModalShell>
  )
}
