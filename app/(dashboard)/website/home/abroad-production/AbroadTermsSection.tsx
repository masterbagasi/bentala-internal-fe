'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type {
  BsiAbroadSettings,
  BsiAbroadTermItem,
} from '@/lib/website-types'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { Section } from '@/components/website/Section'
import { ListError } from '@/components/website/SimpleList'

interface DraftState {
  description: string
  items: BsiAbroadTermItem[]
}

const EMPTY_DRAFT: DraftState = { description: '', items: [] }

/**
 * Universal Terms & Conditions editor for the abroad-production
 * area. Edits the singleton row in `bsi_abroad_settings` so one T&C
 * applies to every /abroad-production/[slug] detail page.
 *
 * Two layers:
 *   • Description: intro paragraph rendered on the LEFT column of
 *     the public T&C section.
 *   • Clauses (items): structured list of { title, body }. Title
 *     renders in the public card row; body expands to a popup when
 *     the visitor clicks the title.
 */
export function AbroadTermsSection() {
  const supabase = getSupabase()
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT)
  const [original, setOriginal] = useState<DraftState>(EMPTY_DRAFT)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('bsi_abroad_settings')
      .select('terms_description, terms_items, terms_conditions')
      .eq('id', 1)
      .maybeSingle()
    if (error) {
      setError(error.message)
      setLoading(false)
      return
    }
    const row = data as BsiAbroadSettings | null
    // Seed items from the legacy free-form text the first time the
    // structured fields are empty so editors don't lose their old
    // clauses on first load with the new schema.
    const seededItems: BsiAbroadTermItem[] =
      Array.isArray(row?.terms_items) && row!.terms_items.length > 0
        ? row!.terms_items
        : parseLegacyText(row?.terms_conditions ?? '')
    const next: DraftState = {
      description: row?.terms_description ?? '',
      items: seededItems,
    }
    setDraft(next)
    setOriginal(next)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const isDirty =
    draft.description !== original.description ||
    JSON.stringify(draft.items) !== JSON.stringify(original.items)

  async function save() {
    setSaving(true)
    setError(null)
    // Strip empty clauses on save so the public list never renders
    // a half-filled row. Trim everything so leading/trailing spaces
    // from copy-paste don't bleed into the layout.
    const cleanedItems = draft.items
      .map((item) => ({
        title: item.title.trim(),
        body: item.body.trim(),
      }))
      .filter((item) => item.title.length > 0)
    const { error } = await supabase
      .from('bsi_abroad_settings')
      .update({
        terms_description: draft.description.trim() || null,
        terms_items: cleanedItems,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)
    setSaving(false)
    if (error) {
      const isMissingColumn =
        error.code === '42703' || /column .* does not exist/i.test(error.message)
      setError(
        isMissingColumn
          ? `Database belum diupdate: ${error.message}. Jalankan migration "migration_abroad_settings_structured_terms.sql" di Supabase SQL Editor.`
          : error.message,
      )
      return
    }
    const cleaned: DraftState = { ...draft, items: cleanedItems }
    setDraft(cleaned)
    setOriginal(cleaned)
    setSavedAt(new Date())
  }

  // Clause editor mutators ------------------------------------------------
  function updateItem(idx: number, patch: Partial<BsiAbroadTermItem>) {
    setDraft((d) => ({
      ...d,
      items: d.items.map((it, i) => (i === idx ? { ...it, ...patch } : it)),
    }))
  }
  function moveItem(idx: number, dir: -1 | 1) {
    setDraft((d) => {
      const target = idx + dir
      if (target < 0 || target >= d.items.length) return d
      const next = [...d.items]
      ;[next[idx], next[target]] = [next[target], next[idx]]
      return { ...d, items: next }
    })
  }
  function removeItem(idx: number) {
    setDraft((d) => ({
      ...d,
      items: d.items.filter((_, i) => i !== idx),
    }))
  }
  function addItem() {
    setDraft((d) => ({
      ...d,
      items: [...d.items, { title: '', body: '' }],
    }))
  }

  return (
    <Section
      title="Terms & Conditions"
      action={
        <button
          type="button"
          onClick={save}
          disabled={!isDirty || saving}
          style={{
            height: 32,
            padding: '0 16px',
            background: isDirty && !saving ? 'var(--accent)' : 'var(--bg3)',
            color: isDirty && !saving ? '#fff' : 'var(--text2)',
            border: 'none',
            borderRadius: 8,
            fontSize: 12,
            fontWeight: 600,
            cursor: isDirty && !saving ? 'pointer' : 'not-allowed',
            opacity: isDirty && !saving ? 1 : 0.7,
            transition: 'opacity 0.15s',
          }}
        >
          {saving ? 'Menyimpan…' : 'Simpan T&C'}
        </button>
      }
    >
      {error && <ListError message={error} />}
      {loading ? (
        <div style={{ color: 'var(--text2)', fontSize: 13 }}>Memuat…</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          {/* Universal description — left-column intro paragraph on
              the public site. Optional. */}
          <FormField label="Deskripsi Section (opsional)">
            <textarea
              style={{
                ...textareaStyle,
                minHeight: 90,
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.55,
              }}
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Kami percaya kerja sama yang baik dimulai dari pemahaman yang jelas…"
            />
          </FormField>

          {/* Structured clause list. Each entry has a title + body
              edited independently. Order = render order on public. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <label
                style={{
                  fontSize: 11,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: 'var(--text2)',
                  fontWeight: 600,
                }}
              >
                Klausul / Item T&C
              </label>
              <button
                type="button"
                onClick={addItem}
                style={{
                  padding: '7px 14px',
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text)',
                  background: 'var(--bg3)',
                  border: '1px dashed var(--border-strong)',
                  borderRadius: 8,
                  cursor: 'pointer',
                }}
              >
                + Tambah Klausul
              </button>
            </div>

            {draft.items.length === 0 ? (
              <div
                style={{
                  padding: '18px 20px',
                  background: 'var(--bg3)',
                  border: '1px dashed var(--border)',
                  borderRadius: 10,
                  fontSize: 12,
                  color: 'var(--text2)',
                  textAlign: 'center',
                }}
              >
                Belum ada klausul. Klik <strong>+ Tambah Klausul</strong>{' '}
                untuk membuat list T&C pertama.
              </div>
            ) : (
              <ol
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                  margin: 0,
                  padding: 0,
                  listStyle: 'none',
                }}
              >
                {draft.items.map((item, idx) => (
                  <ClauseRow
                    key={idx}
                    index={idx}
                    total={draft.items.length}
                    item={item}
                    onChange={(patch) => updateItem(idx, patch)}
                    onMove={(dir) => moveItem(idx, dir)}
                    onRemove={() => removeItem(idx)}
                  />
                ))}
              </ol>
            )}
          </div>

          {savedAt && !isDirty && (
            <div
              style={{
                fontSize: 11,
                color: 'var(--accent3, #43d9a2)',
              }}
            >
              ● Tersimpan {savedAt.toLocaleTimeString('id-ID')}
            </div>
          )}
        </div>
      )}
    </Section>
  )
}

/**
 * Single clause editor card. Number badge on the left, title input
 * + body textarea on the right, reorder/delete controls in a
 * footer strip so they don't fight the inputs for visual space.
 */
function ClauseRow({
  index,
  total,
  item,
  onChange,
  onMove,
  onRemove,
}: {
  index: number
  total: number
  item: BsiAbroadTermItem
  onChange: (patch: Partial<BsiAbroadTermItem>) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
}) {
  const num = String(index + 1).padStart(2, '0')
  return (
    <li
      style={{
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: 14,
        display: 'grid',
        gridTemplateColumns: '44px 1fr',
        gap: 14,
        alignItems: 'start',
      }}
    >
      <span
        style={{
          fontSize: 24,
          fontWeight: 700,
          color: 'var(--accent)',
          fontVariantNumeric: 'tabular-nums',
          lineHeight: 1,
          marginTop: 6,
          textAlign: 'center',
          userSelect: 'none',
        }}
      >
        {num}
      </span>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <input
          style={{ ...inputStyle, fontWeight: 600 }}
          value={item.title}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="Judul klausul (mis. Booking & Down Payment)"
        />
        <textarea
          style={{
            ...textareaStyle,
            minHeight: 80,
            resize: 'vertical',
            fontFamily: 'inherit',
            lineHeight: 1.55,
          }}
          value={item.body}
          onChange={(e) => onChange({ body: e.target.value })}
          placeholder="Isi lengkap klausul — muncul di popup saat visitor klik judul di public site."
        />
        <div style={{ display: 'flex', gap: 6 }}>
          <FooterBtn
            onClick={() => onMove(-1)}
            disabled={index === 0}
            title="Naik"
          >
            ↑
          </FooterBtn>
          <FooterBtn
            onClick={() => onMove(1)}
            disabled={index === total - 1}
            title="Turun"
          >
            ↓
          </FooterBtn>
          <span style={{ flex: 1 }} />
          <FooterBtn onClick={onRemove} tone="danger" title="Hapus">
            Hapus
          </FooterBtn>
        </div>
      </div>
    </li>
  )
}

function FooterBtn({
  children,
  onClick,
  disabled,
  tone,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean
  tone?: 'danger'
  title?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        height: 28,
        padding: '0 12px',
        fontSize: 12,
        fontWeight: 600,
        color:
          disabled
            ? 'var(--text3)'
            : tone === 'danger'
              ? '#ff6b6b'
              : 'var(--text)',
        background:
          disabled
            ? 'transparent'
            : tone === 'danger'
              ? 'rgba(255, 107, 107, 0.08)'
              : 'var(--bg2)',
        border: `1px solid ${
          disabled
            ? 'var(--border)'
            : tone === 'danger'
              ? 'rgba(255, 107, 107, 0.35)'
              : 'var(--border-strong)'
        }`,
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  )
}

/**
 * Best-effort migration helper: parse the legacy free-form
 * `terms_conditions` text into structured items the first time the
 * structured `terms_items` column is empty. Honors the convention
 * the old public renderer used (blank-line separated items, first
 * line = title, rest = body). Single-line items become title-only.
 */
function parseLegacyText(raw: string): BsiAbroadTermItem[] {
  const text = raw.trim()
  if (!text) return []
  if (/\n\s*\n/.test(text)) {
    return text
      .split(/\n\s*\n/)
      .map((block) => block.trim())
      .filter(Boolean)
      .map((block) => {
        const lines = block
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean)
        const title = (lines[0] ?? '').replace(/^\s*\d+[.)]\s+/, '')
        const body = lines.slice(1).join(' ').trim()
        return { title, body }
      })
      .filter((it) => it.title.length > 0)
  }
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => ({
      title: l.replace(/^\s*\d+[.)]\s+/, ''),
      body: '',
    }))
}
