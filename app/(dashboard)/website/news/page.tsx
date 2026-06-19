'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { BsiNewsFeed } from '@/lib/website-types'
import { PageShell } from '@/components/shared/PageShell'
import { useIsMobile } from '@/hooks/useIsMobile'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { FileUploader } from '@/components/website/FileUploader'
import {
  ActionButton,
  IconBtn,
  ListEmpty,
  ListError,
  ModalShell,
  RowCard,
} from '@/components/website/SimpleList'
import { Section } from '@/components/website/Section'
import { useT } from '@/lib/i18n/LanguageProvider'

const ACCOUNT_OPTIONS = [
  { value: 'bpi_ig', label: 'Bentala Project — Instagram' },
  { value: 'bpi_tt', label: 'Bentala Project — TikTok' },
  { value: 'bsi_ig', label: 'Bentala Studio — Instagram' },
  { value: 'bsi_tt', label: 'Bentala Studio — TikTok' },
]

const MEDIA_TYPE_OPTIONS = [
  { value: 'image', label: 'Image' },
  { value: 'video', label: 'Video' },
]

type FormState = Omit<BsiNewsFeed, 'id' | 'created_at' | 'updated_at'>

const EMPTY: FormState = {
  account: 'bpi_ig',
  media_url: '',
  media_type: 'image',
  thumbnail_url: null,
  caption: '',
  permalink: '',
  like_count: 0,
  comments_count: 0,
  posted_at: new Date().toISOString(),
  is_published: true,
  sort_order: 0,
}

/**
 * News admin — CRUD over the `bsi_news_feed` table that powers the
 * /news public page. One row per Instagram/TikTok post; account
 * column distinguishes brand + platform so the public site can
 * render separate IG / TT grids.
 */
export default function NewsAdminPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiNewsFeed[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BsiNewsFeed | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    const { data, error } = await supabase
      .from('bsi_news_feed')
      .select('*')
      .order('account', { ascending: true })
      .order('sort_order', { ascending: true })
    if (error) setError(error.message)
    else setItems((data ?? []) as BsiNewsFeed[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus post ini? Tidak bisa di-undo.'))) return
    const { error } = await supabase.from('bsi_news_feed').delete().eq('id', id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) => xs.filter((x) => x.id !== id))
  }

  async function togglePublished(post: BsiNewsFeed) {
    const next = !post.is_published
    const { error } = await supabase
      .from('bsi_news_feed')
      .update({ is_published: next })
      .eq('id', post.id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) =>
      xs.map((x) => (x.id === post.id ? { ...x, is_published: next } : x)),
    )
  }

  const groups = groupByAccount(items)

  return (
    <PageShell
      title="News"
      action={
        <ActionButton variant="primary" onClick={() => setCreating(true)}>
          + {t('Tambah Post')}
        </ActionButton>
      }
    >
      <div style={{ padding: isMobile ? '24px 14px' : 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && <ListError message={error} />}

        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('Memuat…')}</div>
        ) : items.length === 0 ? (
          <Section title="Feed Posts">
            <ListEmpty message={t('Belum ada post. Tambah post pertama untuk muncul di /news.')} />
          </Section>
        ) : (
          groups.map(([account, posts]) => (
            <Section
              key={account}
              title={accountLabel(account)}
              action={
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 600,
                    letterSpacing: '0.06em',
                    color: 'var(--text2)',
                    textTransform: 'uppercase',
                  }}
                >
                  {posts.length} post{posts.length === 1 ? '' : 's'}
                </span>
              }
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {posts.map((p) => (
                  <RowCard key={p.id}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: 8,
                        background: 'var(--bg3)',
                        flexShrink: 0,
                        overflow: 'hidden',
                        position: 'relative',
                      }}
                    >
                      {p.thumbnail_url || p.media_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img loading="lazy" decoding="async"
                          src={p.thumbnail_url || p.media_url}
                          alt=""
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                            display: 'block',
                          }}
                        />
                      ) : null}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          color: 'var(--text)',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {p.caption || <span style={{ color: 'var(--text2)' }}>(no caption)</span>}
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: 'var(--text2)',
                          marginTop: 4,
                          display: 'flex',
                          gap: 12,
                        }}
                      >
                        <span>♥ {p.like_count.toLocaleString('id-ID')}</span>
                        <span>💬 {p.comments_count.toLocaleString('id-ID')}</span>
                        <span>{formatDate(p.posted_at)}</span>
                        <span>order: {p.sort_order}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => togglePublished(p)}
                      style={{
                        padding: '4px 10px',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.04em',
                        textTransform: 'uppercase',
                        borderRadius: 6,
                        border: 'none',
                        cursor: 'pointer',
                        background: p.is_published
                          ? 'rgba(67,217,162,0.12)'
                          : 'rgba(255,255,255,0.05)',
                        color: p.is_published ? 'var(--accent3)' : 'var(--text2)',
                        flexShrink: 0,
                      }}
                    >
                      {p.is_published ? 'Live' : 'Draft'}
                    </button>
                    <IconBtn onClick={() => setEditing(p)} title="Edit">
                      ✎
                    </IconBtn>
                    <IconBtn
                      onClick={() => handleDelete(p.id)}
                      title={t('Hapus')}
                      color="#ff6b6b"
                    >
                      ×
                    </IconBtn>
                  </RowCard>
                ))}
              </div>
            </Section>
          ))
        )}
      </div>

      {(editing || creating) && (
        <NewsModal
          initial={editing}
          onClose={() => {
            setEditing(null)
            setCreating(false)
          }}
          onSaved={() => {
            setEditing(null)
            setCreating(false)
            load()
          }}
        />
      )}
    </PageShell>
  )
}

function groupByAccount(items: BsiNewsFeed[]): [string, BsiNewsFeed[]][] {
  const map = new Map<string, BsiNewsFeed[]>()
  for (const item of items) {
    const list = map.get(item.account) ?? []
    list.push(item)
    map.set(item.account, list)
  }
  return Array.from(map.entries())
}

function accountLabel(account: string): string {
  const match = ACCOUNT_OPTIONS.find((o) => o.value === account)
  return match?.label ?? account
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}

function NewsModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: BsiNewsFeed | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const supabase = getSupabase()
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          account: initial.account,
          media_url: initial.media_url,
          media_type: initial.media_type,
          thumbnail_url: initial.thumbnail_url,
          caption: initial.caption,
          permalink: initial.permalink,
          like_count: initial.like_count,
          comments_count: initial.comments_count,
          posted_at: initial.posted_at,
          is_published: initial.is_published,
          sort_order: initial.sort_order,
        }
      : EMPTY,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const payload = { ...form, updated_at: new Date().toISOString() }
    const op = initial
      ? supabase.from('bsi_news_feed').update(payload).eq('id', initial.id)
      : supabase.from('bsi_news_feed').insert(payload)
    const { error } = await op
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    onSaved()
  }

  // <input type="datetime-local"> wants `YYYY-MM-DDTHH:mm`, not ISO.
  const postedAtLocal = form.posted_at
    ? new Date(form.posted_at).toISOString().slice(0, 16)
    : ''

  return (
    <ModalShell
      title={initial ? `${t('Edit Post')} — ${accountLabel(initial.account)}` : t('Tambah Post Baru')}
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              height: 36,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: 'var(--text)',
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {t('Batal')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              flex: 1,
              height: 36,
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 8,
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.6 : 1,
            }}
          >
            {saving ? t('Menyimpan…') : initial ? t('Simpan') : t('Tambah')}
          </button>
        </>
      }
    >
      {error && <ListError message={error} />}

      <FormField label="Account" required>
        <select
          style={inputStyle as React.CSSProperties}
          value={form.account}
          onChange={(e) => update('account', e.target.value)}
        >
          {ACCOUNT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Media Type" required>
        <select
          style={inputStyle as React.CSSProperties}
          value={form.media_type}
          onChange={(e) => update('media_type', e.target.value)}
        >
          {MEDIA_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Media Image / Video" required>
        <FileUploader
          value={form.media_url || null}
          onChange={(url) => update('media_url', url ?? '')}
          prefix="news-media"
          accept={form.media_type === 'video' ? 'video' : 'image'}
          previewHeight={140}
        />
      </FormField>

      {form.media_type === 'video' && (
        <FormField label="Thumbnail Image">
          <FileUploader
            value={form.thumbnail_url}
            onChange={(url) => update('thumbnail_url', url)}
            prefix="news-thumb"
            accept="image"
            previewHeight={120}
          />
        </FormField>
      )}

      <FormField label="Caption">
        <textarea
          style={textareaStyle}
          value={form.caption}
          onChange={(e) => update('caption', e.target.value)}
          rows={3}
          placeholder={t('Caption singkat untuk post')}
        />
      </FormField>

      <FormField label="Permalink" hint={t('Link ke post asli di Instagram / TikTok')}>
        <input
          style={inputStyle}
          value={form.permalink}
          onChange={(e) => update('permalink', e.target.value)}
          placeholder="https://instagram.com/p/..."
        />
      </FormField>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <FormField label="Likes">
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={form.like_count}
            onChange={(e) => update('like_count', Number(e.target.value) || 0)}
          />
        </FormField>
        <FormField label="Comments">
          <input
            style={inputStyle}
            type="number"
            min={0}
            value={form.comments_count}
            onChange={(e) => update('comments_count', Number(e.target.value) || 0)}
          />
        </FormField>
        <FormField label="Sort Order" hint={t('Kecil = atas')}>
          <input
            style={inputStyle}
            type="number"
            value={form.sort_order}
            onChange={(e) => update('sort_order', Number(e.target.value) || 0)}
          />
        </FormField>
      </div>

      <FormField label="Posted At" hint={t('Tanggal post di-publish di sosmed')}>
        <input
          style={inputStyle}
          type="datetime-local"
          value={postedAtLocal}
          onChange={(e) =>
            update(
              'posted_at',
              e.target.value ? new Date(e.target.value).toISOString() : new Date().toISOString(),
            )
          }
        />
      </FormField>

      <FormField label="Status">
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            fontSize: 13,
            color: 'var(--text)',
            cursor: 'pointer',
            padding: '8px 0',
          }}
        >
          <input
            type="checkbox"
            checked={form.is_published}
            onChange={(e) => update('is_published', e.target.checked)}
            style={{ width: 'auto' }}
          />
          {t('Tampilkan di public site (/news)')}
        </label>
      </FormField>
    </ModalShell>
  )
}
