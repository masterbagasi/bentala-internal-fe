'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { FileUploader } from '@/components/website/FileUploader'
import { FormField } from '@/components/website/FormField'
import { SaveActions } from '@/components/website/PageActions'
import { Section } from '@/components/website/Section'
import { PageShell } from '@/components/shared/PageShell'

interface NavbarFormState {
  logo_url: string | null
  nav_home_hidden: boolean
  nav_about_hidden: boolean
  nav_news_hidden: boolean
  abroad_section_hidden: boolean
}

const EMPTY: NavbarFormState = {
  logo_url: null,
  nav_home_hidden: false,
  nav_about_hidden: false,
  nav_news_hidden: false,
  abroad_section_hidden: false,
}

/**
 * Navbar settings — split out of the Home/Hero editor because the
 * navbar is a site-wide concern, not a Home-Page concern. Edits the
 * same `bsi_hero` row but only the four navbar columns
 * (logo_url + nav_*_hidden), so Hero copy edits and Navbar edits
 * never overwrite each other's other fields.
 */
export default function NavbarSettingsPage() {
  const supabase = getSupabase()
  const [heroId, setHeroId] = useState<string | null>(null)
  const [form, setForm] = useState<NavbarFormState>(EMPTY)
  const [savedForm, setSavedForm] = useState<NavbarFormState>(EMPTY)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<Date | null>(null)

  useEffect(() => {
    async function load() {
      const { data, error: loadError } = await supabase
        .from('bsi_hero')
        .select(
          'id, logo_url, nav_home_hidden, nav_about_hidden, nav_news_hidden, abroad_section_hidden',
        )
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (loadError) {
        setError(loadError.message)
        setLoading(false)
        return
      }
      if (data) {
        setHeroId(data.id)
        const next: NavbarFormState = {
          logo_url: data.logo_url ?? null,
          nav_home_hidden: Boolean(data.nav_home_hidden),
          nav_about_hidden: Boolean(data.nav_about_hidden),
          nav_news_hidden: Boolean(data.nav_news_hidden),
          abroad_section_hidden: Boolean(data.abroad_section_hidden),
        }
        setForm(next)
        setSavedForm(next)
      }
      setLoading(false)
    }
    load()
  }, [supabase])

  function update<K extends keyof NavbarFormState>(key: K, value: NavbarFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    const payload = {
      ...form,
      updated_at: new Date().toISOString(),
    }
    const { error: saveError } = heroId
      ? await supabase.from('bsi_hero').update(payload).eq('id', heroId)
      : await supabase.from('bsi_hero').insert({ ...payload, is_active: true })
    if (saveError) {
      const isMissingColumn =
        saveError.code === '42703' ||
        /column .* does not exist/i.test(saveError.message)
      setError(
        isMissingColumn
          ? 'A required column is missing on bsi_hero. Run the visibility / abroad-section migrations in Supabase SQL Editor first.'
          : `Save failed: ${saveError.message}`,
      )
      setSaving(false)
      return
    }
    setSavedForm(form)
    setSavedAt(new Date())
    setSaving(false)
  }

  const dirty = JSON.stringify(form) !== JSON.stringify(savedForm)

  return (
    <PageShell
      title="Settings"
      action={
        <SaveActions
          isDirty={dirty && !loading}
          saving={saving}
          savedAt={savedAt}
          onSave={handleSave}
          onDiscard={() => setForm(savedForm)}
        />
      }
    >
      <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && (
          <div
            style={{
              padding: '12px 16px',
              background: 'rgba(255,107,107,0.08)',
              border: '1px solid rgba(255,107,107,0.3)',
              borderRadius: 8,
              color: '#ff6b6b',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 14 }}>Loading…</div>
        ) : (
          <>
            <Section title="Brand Logo">
              <FormField label="Logo image">
                <FileUploader
                  value={form.logo_url}
                  onChange={(url) => update('logo_url', url)}
                  prefix="logo"
                  accept="image"
                  previewHeight={120}
                />
              </FormField>
            </Section>

            <Section title="Navbar Menu">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <NavToggleRow
                  label="Home"
                  hidden={form.nav_home_hidden}
                  onChange={(v) => update('nav_home_hidden', v)}
                />
                <NavToggleRow
                  label="About Us"
                  hidden={form.nav_about_hidden}
                  onChange={(v) => update('nav_about_hidden', v)}
                />
                <NavToggleRow
                  label="News"
                  hidden={form.nav_news_hidden}
                  onChange={(v) => update('nav_news_hidden', v)}
                />
              </div>
            </Section>

            <Section title="Home Page Sections">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <NavToggleRow
                  label="Abroad Production"
                  description="Banner section between hero and services. Hide to make the Services section move up."
                  hidden={form.abroad_section_hidden}
                  onChange={(v) => update('abroad_section_hidden', v)}
                />
              </div>
            </Section>
          </>
        )}
      </div>
    </PageShell>
  )
}

function NavToggleRow({
  label,
  description,
  hidden,
  onChange,
}: {
  label: string
  /** Optional helper text rendered under the label. When provided it
   *  replaces the default "Hidden from navbar / Shown in navbar"
   *  state line — useful when the toggle controls something other
   *  than a navbar link (e.g. a whole home-page section). */
  description?: string
  hidden: boolean
  onChange: (next: boolean) => void
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 18px',
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        gap: 16,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{label}</span>
        <span
          style={{
            fontSize: 12,
            color: 'var(--text2)',
            lineHeight: 1.45,
          }}
        >
          {description
            ? description
            : hidden
              ? 'Hidden from navbar'
              : 'Shown in navbar'}
        </span>
      </div>
      <div
        role="group"
        aria-label={`Visibility ${label}`}
        style={{
          display: 'inline-flex',
          padding: 3,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 8,
        }}
      >
        <button
          type="button"
          onClick={() => onChange(false)}
          style={navToggleButtonStyle(!hidden)}
        >
          Show
        </button>
        <button
          type="button"
          onClick={() => onChange(true)}
          style={navToggleButtonStyle(hidden)}
        >
          Hide
        </button>
      </div>
    </div>
  )
}

function navToggleButtonStyle(active: boolean): React.CSSProperties {
  return {
    padding: '8px 18px',
    fontSize: 13,
    fontWeight: 600,
    letterSpacing: '0.02em',
    color: active ? '#fff' : 'var(--text2)',
    background: active ? 'var(--accent)' : 'transparent',
    border: 'none',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 0.15s, color 0.15s',
  }
}
