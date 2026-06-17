'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { BsiTeamMember } from '@/lib/website-types'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { PrimaryActionButton } from '@/components/website/PageActions'
import { useIsMobile } from '@/hooks/useIsMobile'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { ActionButton, IconBtn, ListEmpty, ListError, ModalShell, RowCard } from '@/components/website/SimpleList'
import { Section } from '@/components/website/Section'
import { useT } from '@/lib/i18n/LanguageProvider'

type FormState = Omit<BsiTeamMember, 'id' | 'created_at'>

const EMPTY: FormState = {
  name: '',
  title: '',
  role_description: '',
  initials: '',
  avatar_color: '#1757c2',
  tags: [],
  is_published: true,
  sort_order: 0,
}

export default function TeamAdminPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiTeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BsiTeamMember | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('bsi_team')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false })
    if (error) setError(error.message)
    else setItems(data ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus anggota tim ini?'))) return
    const { error } = await supabase.from('bsi_team').delete().eq('id', id)
    if (error) { alert(error.message); return }
    setItems((xs) => xs.filter((x) => x.id !== id))
  }

  async function togglePublish(item: BsiTeamMember) {
    const { error } = await supabase
      .from('bsi_team')
      .update({ is_published: !item.is_published })
      .eq('id', item.id)
    if (error) { alert(error.message); return }
    setItems((xs) => xs.map((x) => (x.id === item.id ? { ...x, is_published: !x.is_published } : x)))
  }

  useRegisterPageAction(
    <PrimaryActionButton onClick={() => setCreating(true)}>{t('+ Tambah Anggota')}</PrimaryActionButton>,
  )

  return (
    <>
      <div style={{ padding: isMobile ? '24px 14px' : 24 }}>
        {error && <ListError message={error} />}
        <Section title={t('Anggota Tim')}>
        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('Memuat…')}</div>
        ) : items.length === 0 ? (
          <ListEmpty message={t('Belum ada anggota tim. Klik + Tambah Anggota.')} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: '100%' }}>
            {items.map((m) => (
              <RowCard key={m.id} dimmed={!m.is_published}>
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    background: m.avatar_color,
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 15,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {m.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text2)' }}>{m.title}</div>
                  {m.tags.length > 0 && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {m.tags.map((t) => (
                        <span
                          key={t}
                          style={{
                            padding: '2px 8px',
                            background: 'var(--bg3)',
                            border: '1px solid var(--border)',
                            borderRadius: 4,
                            fontSize: 10,
                            color: 'var(--text2)',
                          }}
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <IconBtn onClick={() => setEditing(m)} title={t('Edit')}>✎</IconBtn>
                <IconBtn
                  onClick={() => togglePublish(m)}
                  title={m.is_published ? t('Sembunyikan') : t('Tampilkan')}
                  color={m.is_published ? 'var(--accent3)' : 'var(--text2)'}
                >
                  {m.is_published ? '●' : '○'}
                </IconBtn>
                <IconBtn onClick={() => handleDelete(m.id)} title={t('Hapus')} color="#ff6b6b">×</IconBtn>
              </RowCard>
            ))}
          </div>
        )}
        </Section>
      </div>

      {(editing || creating) && (
        <TeamModal
          initial={editing}
          onClose={() => { setEditing(null); setCreating(false) }}
          onSaved={() => { setEditing(null); setCreating(false); load() }}
        />
      )}
    </>
  )
}

function TeamModal({ initial, onClose, onSaved }: { initial: BsiTeamMember | null; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const supabase = getSupabase()
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          name: initial.name,
          title: initial.title,
          role_description: initial.role_description,
          initials: initial.initials,
          avatar_color: initial.avatar_color,
          tags: initial.tags,
          is_published: initial.is_published,
          sort_order: initial.sort_order,
        }
      : EMPTY,
  )
  const [tagsText, setTagsText] = useState(initial?.tags.join(', ') ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    setSaving(true)
    setError(null)
    const tags = tagsText.split(',').map((t) => t.trim()).filter(Boolean)
    const payload = { ...form, tags }
    const op = initial
      ? supabase.from('bsi_team').update(payload).eq('id', initial.id)
      : supabase.from('bsi_team').insert(payload)
    const { error } = await op
    if (error) { setError(error.message); setSaving(false); return }
    onSaved()
  }

  function update<K extends keyof FormState>(k: K, v: FormState[K]) { setForm((f) => ({ ...f, [k]: v })) }

  return (
    <ModalShell
      title={initial ? t('Edit Anggota') : t('Tambah Anggota')}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            style={{ flex: 1, height: 36, background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)', fontSize: 13, cursor: 'pointer' }}
          >
            {t('Batal')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ flex: 1, height: 36, background: 'var(--accent)', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 500, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}
          >
            {saving ? t('Menyimpan…') : initial ? t('Simpan') : t('Tambah')}
          </button>
        </>
      }
    >
      {error && <ListError message={error} />}

      <FormField label={t('Nama')} required>
        <input style={inputStyle} value={form.name} onChange={(e) => update('name', e.target.value)} />
      </FormField>
      <FormField label={t('Jabatan')} required>
        <input style={inputStyle} value={form.title} onChange={(e) => update('title', e.target.value)} />
      </FormField>
      <FormField label={t('Deskripsi Peran')}>
        <textarea style={textareaStyle} value={form.role_description} onChange={(e) => update('role_description', e.target.value)} />
      </FormField>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormField label={t('Inisial')} required hint={t('2 karakter, contoh: DR')}>
          <input style={inputStyle} value={form.initials} maxLength={3} onChange={(e) => update('initials', e.target.value.toUpperCase())} />
        </FormField>
        <FormField label={t('Warna Avatar')}>
          <input type="color" style={{ ...inputStyle, padding: 4, height: 36 }} value={form.avatar_color} onChange={(e) => update('avatar_color', e.target.value)} />
        </FormField>
        <FormField label={t('Urutan')}>
          <input type="number" style={inputStyle} value={form.sort_order} onChange={(e) => update('sort_order', Number(e.target.value) || 0)} />
        </FormField>
      </div>
      <FormField label={t('Tags')} hint={t('Pisahkan dengan koma. Contoh: Founder, Director, Strategy')}>
        <input style={inputStyle} value={tagsText} onChange={(e) => setTagsText(e.target.value)} />
      </FormField>
      <FormField label={t('Status')}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, color: 'var(--text)', cursor: 'pointer' }}>
          <input type="checkbox" checked={form.is_published} onChange={(e) => update('is_published', e.target.checked)} />
          {t('Tampilkan di website')}
        </label>
      </FormField>
    </ModalShell>
  )
}
