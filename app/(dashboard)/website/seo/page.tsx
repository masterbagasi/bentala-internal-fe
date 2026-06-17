'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { BsiSeo } from '@/lib/website-types'
import { PageShell } from '@/components/shared/PageShell'
import { useIsMobile } from '@/hooks/useIsMobile'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { ActionButton, IconBtn, ListEmpty, ListError, ModalShell, RowCard } from '@/components/website/SimpleList'
import { Section } from '@/components/website/Section'
import { useT } from '@/lib/i18n/LanguageProvider'

const SUGGESTED_PAGES =['/', '/about', '/portfolio', '/news', '/contact']

type FormState = Omit<BsiSeo, 'id' | 'updated_at'>

const EMPTY: FormState = {
  page: '/',
  meta_title: '',
  meta_description: '',
  og_image_url: null,
}

export default function SeoAdminPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiSeo[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BsiSeo | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const { data, error } = await supabase.from('bsi_seo').select('*').order('page', { ascending: true })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus entry SEO ini?'))) return
    const { error } = await supabase.from('bsi_seo').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setItems((xs) => xs.filter((x) => x.id !== id))
  }

  return (
    <PageShell
      title="SEO"
      action={<ActionButton variant="primary" onClick={() => setCreating(true)}>+ {t('Tambah Halaman')}</ActionButton>}
    >
      <div style={{ padding: isMobile ? '24px 14px' : 24 }}>
        {error && <ListError message={error} />}
        <Section title={t('Halaman SEO')}>
        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('Memuat…')}</div>
        ) : items.length === 0 ? (
          <ListEmpty message={t('Belum ada konfigurasi SEO.')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((s) => (
              <RowCard key={s.id}>
                <code
                  style={{
                    padding: '4px 8px',
                    background: 'var(--bg3)',
                    borderRadius: 4,
                    fontSize: 12,
                    color: 'var(--accent)',
                    flexShrink: 0,
                  }}
                >
                  {s.page}
                </code>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{s.meta_title}</div>
                  <div
                    style={{
                      fontSize: 11,
                      color: 'var(--text2)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      marginTop: 2,
                    }}
                  >
                    {s.meta_description}
                  </div>
                </div>
                <IconBtn onClick={() => setEditing(s)} title="Edit">✎</IconBtn>
                <IconBtn onClick={() => handleDelete(s.id)} title={t('Hapus')} color="#ff6b6b">×</IconBtn>
              </RowCard>
            ))}
          </div>
        )}
        </Section>
      </div>

      {(editing || creating) && (
        <SeoModal
          initial={editing}
          existingPages={items.map((x) => x.page)}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={() => { setEditing(null); setCreating(false); load() }}
        />
      )}
    </PageShell>
  )
}

function SeoModal({
  initial,
  existingPages,
  onClose,
  onSaved,
}: {
  initial: BsiSeo | null
  existingPages: string[]
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const supabase = getSupabase()
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          page: initial.page,
          meta_title: initial.meta_title,
          meta_description: initial.meta_description,
          og_image_url: initial.og_image_url,
        }
      : EMPTY,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((f) => ({ ...f, [k]: v })) }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const payload = { ...form, updated_at: new Date().toISOString() }
    const op = initial
      ? supabase.from('bsi_seo').update(payload).eq('id', initial.id)
      : supabase.from('bsi_seo').insert(payload)
    const { error } = await op
    if (error) { setError(error.message); setSaving(false); return }
    onSaved()
  }

  const titleLen = form.meta_title.length
  const descLen = form.meta_description.length

  return (
    <ModalShell
      title={initial ? `${t('Edit SEO')} — ${initial.page}` : t('Tambah Konfigurasi SEO')}
      onClose={onClose}
      footer={
        <>
          <button onClick={onClose} style={{ flex: 1, height: 36, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}>{t('Batal')}</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 1, height: 36, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>{saving ? t('Menyimpan…') : initial ? t('Simpan') : t('Tambah')}</button>
        </>
      }
    >
      {error && <ListError message={error} />}

      <FormField label={t('Halaman')} required hint={t('Path tanpa domain. Contoh: / atau /about')}>
        <input
          style={inputStyle}
          value={form.page}
          onChange={(e) => update('page', e.target.value)}
          disabled={!!initial}
          list="suggested-pages"
        />
        <datalist id="suggested-pages">
          {SUGGESTED_PAGES.filter((p) => !existingPages.includes(p) || p === initial?.page).map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </FormField>

      <FormField
        label="Meta Title"
        required
        hint={`${titleLen}/60 ${t('karakter')}${titleLen > 60 ? ` — ${t('terlalu panjang!')}` : ''}`}
      >
        <input style={inputStyle} value={form.meta_title} onChange={(e) => update('meta_title', e.target.value)} />
      </FormField>

      <FormField
        label="Meta Description"
        required
        hint={`${descLen}/160 ${t('karakter')}${descLen > 160 ? ` — ${t('terlalu panjang!')}` : ''}`}
      >
        <textarea
          style={textareaStyle}
          value={form.meta_description}
          onChange={(e) => update('meta_description', e.target.value)}
          rows={3}
        />
      </FormField>

      <FormField label="OG Image URL" hint={t('Gambar untuk preview saat di-share di sosial media (1200×630 ideal)')}>
        <input
          style={inputStyle}
          value={form.og_image_url ?? ''}
          onChange={(e) => update('og_image_url', e.target.value || null)}
          placeholder="https://..."
        />
      </FormField>
    </ModalShell>
  )
}
