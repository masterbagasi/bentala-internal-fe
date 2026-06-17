'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type {
  BsiAbroadProduction,
  BsiTripLocation,
} from '@/lib/website-types'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { PrimaryActionButton } from '@/components/website/PageActions'
import { FormField, inputStyle } from '@/components/website/FormField'
import {
  ListEmpty,
  ListError,
  ModalShell,
} from '@/components/website/SimpleList'
import { FileUploader } from '@/components/website/FileUploader'
import { Section } from '@/components/website/Section'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import AbroadServicesSection from './AbroadServicesSection'
import { AbroadTermsSection } from './AbroadTermsSection'
import { StatusPill } from './StatusPill'
import { useIsMobile } from '@/hooks/useIsMobile'

type FormState = Omit<BsiAbroadProduction, 'id' | 'created_at'>

const EMPTY: FormState = {
  image_url: '',
  country: '',
  departure_date: '',
  return_date: null,
  note: '',
  service_link_url: '',
  is_published: true,
  sort_order: 0,
  title: '',
  description: '',
  slug: '',
  locations: [],
  terms_conditions: '',
  secondary_image_url: null,
}

/** Slugify any free-form string — lowercase, alphanumeric + dashes only,
 *  collapse runs of separators, trim edge dashes. Matches the SQL backfill
 *  expression so admin-side preview lines up with the row produced by the
 *  migration. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/**
 * Admin CRUD for the public "Abroad Production" section — manages the
 * grid of upcoming on-location shoots that appears between Services and
 * Portfolio on the home page. Each row is one trip: image, destination
 * country, departure date, and the URL that the "Booking Now" button
 * on the public card opens.
 */
export default function AbroadProductionAdminPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const supabase = getSupabase()
  const [items, setItems] = useState<BsiAbroadProduction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<BsiAbroadProduction | null>(null)
  const [creating, setCreating] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)

  async function load() {
    const { data, error } = await supabase
      .from('bsi_abroad_production')
      .select('*')
      .order('sort_order', { ascending: true })
      .order('departure_date', { ascending: true })
    if (error) {
      const isMissingTable =
        error.code === '42P01' || /relation .* does not exist/i.test(error.message)
      setError(
        isMissingTable
          ? 'Table bsi_abroad_production does not exist. Run migration_abroad_production.sql in Supabase SQL Editor first.'
          : error.message,
      )
    } else {
      setItems(data ?? [])
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDelete(item: BsiAbroadProduction) {
    setConfirm({
      title: t('Hapus trip ini?'),
      message: `"${item.country}" ${t('akan dihapus dari section Abroad Production. Aksi ini tidak bisa dibatalkan.')}`,
      confirmLabel: t('Hapus'),
      tone: 'danger',
      onConfirm: async () => {
        setConfirm(null)
        const { error } = await supabase
          .from('bsi_abroad_production')
          .delete()
          .eq('id', item.id)
        if (error) {
          alert(error.message)
          return
        }
        setItems((xs) => xs.filter((x) => x.id !== item.id))
      },
    })
  }

  async function togglePublish(item: BsiAbroadProduction) {
    const next = !item.is_published
    const { error } = await supabase
      .from('bsi_abroad_production')
      .update({ is_published: next, updated_at: new Date().toISOString() })
      .eq('id', item.id)
    if (error) {
      alert(error.message)
      return
    }
    setItems((xs) =>
      xs.map((x) => (x.id === item.id ? { ...x, is_published: next } : x)),
    )
  }

  useRegisterPageAction(
    <PrimaryActionButton onClick={() => setCreating(true)}>
      + Add Trip
    </PrimaryActionButton>,
  )

  return (
    <>
      <div style={{ padding: isMobile ? '24px 14px' : 24, display: 'flex', flexDirection: 'column', gap: 24 }}>
        {error && <ListError message={error} />}
        <Section title="Abroad Production Trips">
          {loading ? (
            <div style={{ color: 'var(--text2)', fontSize: 13 }}>Loading…</div>
          ) : items.length === 0 ? (
            <ListEmpty message="No trips yet. Click + Add Trip to create the first one." />
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns:
                  'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 18,
                width: '100%',
              }}
            >
              {items.map((trip) => (
                <TripCard
                  key={trip.id}
                  item={trip}
                  onEdit={() => setEditing(trip)}
                  onTogglePublish={() => togglePublish(trip)}
                  onDelete={() => handleDelete(trip)}
                />
              ))}
            </div>
          )}
        </Section>

        {/* Service categories — universal list rendered on every
            trip's detail page. Lives in the same tab as the trips
            list so editors only need one navigation entry for the
            whole abroad-production feature. */}
        <AbroadServicesSection />

        {/* Universal Terms & Conditions — singleton row in
            `bsi_abroad_settings`. Replaces the per-trip T&C field
            that used to live inside TripModal so editors update
            the legal copy once and have it apply to every trip. */}
        <AbroadTermsSection />
      </div>

      {(editing || creating) && (
        <TripModal
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

      {confirm && (
        <ConfirmDialog
          request={confirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </>
  )
}

function TripCard({
  item,
  onEdit,
  onTogglePublish,
  onDelete,
}: {
  item: BsiAbroadProduction
  onEdit: () => void
  onTogglePublish: () => void
  onDelete: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const departureLabel = item.departure_date
    ? formatDate(item.departure_date)
    : null
  const returnLabel = item.return_date ? formatDate(item.return_date) : null

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: 'linear-gradient(180deg, var(--bg2) 0%, var(--bg) 100%)',
        border: `1px solid ${hovered ? 'var(--border-strong)' : 'var(--border)'}`,
        borderRadius: 14,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        opacity: item.is_published ? 1 : 0.62,
        transform: hovered ? 'translateY(-3px)' : 'translateY(0)',
        boxShadow: hovered
          ? '0 18px 40px -14px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.04)'
          : '0 4px 12px -4px rgba(0,0,0,0.3)',
        transition: 'transform 0.28s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.28s ease, border-color 0.18s ease, opacity 0.2s ease',
      }}
    >
      {/* Image area — 16:10 cinematic ratio with subtle zoom on hover.
          Floating chips for note + hidden status, plus a bottom gradient
          so the content area below the image blends in cleanly. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '16 / 10',
          background: 'var(--bg3)',
          overflow: 'hidden',
        }}
      >
        {item.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.image_url}
            alt={item.country}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: hovered ? 'scale(1.05)' : 'scale(1.0)',
              transition: 'transform 0.6s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              color: 'var(--text3)',
            }}
          >
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            <span style={{ fontSize: 11, letterSpacing: '0.06em' }}>
              No image
            </span>
          </div>
        )}

        {/* Bottom feather so the image's lower edge melts into the card body */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background:
              'linear-gradient(180deg, rgba(8,9,13,0) 55%, rgba(8,9,13,0.55) 100%)',
          }}
        />

        {item.note && (
          <span
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              padding: '5px 11px',
              background: 'rgba(11, 61, 231, 0.94)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.16em',
              borderRadius: 999,
              boxShadow: '0 6px 18px rgba(11,61,231,0.45)',
            }}
          >
            {item.note}
          </span>
        )}

        {/* Status pill — ALWAYS visible (top-right of the image
            zone) so editors see at-a-glance whether each card is
            live on the public site. Green for active, neutral-dark
            for hidden. Dot + label gives a clear semantic cue
            beyond colour alone. */}
        <StatusPill isPublished={item.is_published} />
      </div>

      {/* Content body — eyebrow + country + date stacked, then a
          row of three balanced action buttons pinned to the bottom. */}
      <div
        style={{
          padding: '18px 18px 16px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          flex: 1,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h3
            style={{
              margin: 0,
              fontSize: 19,
              fontWeight: 700,
              color: 'var(--text)',
              letterSpacing: '-0.005em',
              lineHeight: 1.15,
            }}
          >
            {item.country || 'Untitled'}
          </h3>
        </div>

        {/* Departure / Return — editorial typography pair. Cyan
            eyebrow over the date, separated by a soft vertical cyan
            rule so the two fields read as paired-but-distinct without
            the heavy boxed-tile treatment that didn't suit the card's
            density. Matches the labelling on the public detail page
            and the Book Now popup. */}
        {(departureLabel || returnLabel) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'stretch',
              gap: 18,
              flexWrap: 'wrap',
            }}
          >
            {departureLabel && (
              <DateField label="Departure" value={departureLabel} />
            )}
            {departureLabel && returnLabel && (
              <span
                aria-hidden
                style={{
                  width: 1,
                  alignSelf: 'stretch',
                  background:
                    'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0) 100%)',
                }}
              />
            )}
            {returnLabel && (
              <DateField label="Return" value={returnLabel} />
            )}
          </div>
        )}

        <div
          style={{
            display: 'flex',
            gap: 8,
            marginTop: 'auto',
            paddingTop: 4,
          }}
        >
          <ActionButton onClick={onEdit} variant="primary">
            Edit
          </ActionButton>
          <ActionButton onClick={onTogglePublish} variant="ghost">
            {item.is_published ? 'Hide' : 'Show'}
          </ActionButton>
          <ActionButton onClick={onDelete} variant="danger">
            Delete
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

/**
 * Departure / Return field rendered on the trip card. Lean editorial
 * pair — tracked dim-white eyebrow over a bold white date, no box, no
 * border, no icon. The visual grouping comes from the parent's soft
 * white rule between the two fields, not from boxed containers.
 */
function DateField({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <span
        style={{
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          color: 'var(--text2)',
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--text)',
          letterSpacing: '-0.005em',
          whiteSpace: 'nowrap',
        }}
      >
        {value}
      </span>
    </div>
  )
}

/**
 * Three-style button used in the trip card action row. `primary` is the
 * filled accent (Edit), `ghost` is a transparent bordered pill (Hide/
 * Show), and `danger` is the destructive variant (Delete). All three
 * share the same height + flex:1 sizing so the row stays evenly balanced.
 */
function ActionButton({
  onClick,
  variant,
  children,
}: {
  onClick: () => void
  variant: 'primary' | 'ghost' | 'danger'
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)

  const baseStyle: React.CSSProperties = {
    flex: 1,
    height: 34,
    padding: '0 12px',
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: '0.02em',
    borderRadius: 8,
    cursor: 'pointer',
    transition: 'background 0.18s ease, color 0.18s ease, border-color 0.18s ease, transform 0.18s ease',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    transform: hovered ? 'translateY(-1px)' : 'translateY(0)',
  }

  const variantStyle: React.CSSProperties =
    variant === 'primary'
      ? {
          background: hovered ? 'var(--accent-hover, #1849f0)' : 'var(--accent)',
          color: '#fff',
          border: 'none',
          boxShadow: '0 4px 14px -4px rgba(11,61,231,0.5)',
        }
      : variant === 'danger'
        ? {
            background: hovered
              ? 'rgba(255, 107, 107, 0.14)'
              : 'rgba(255, 107, 107, 0.07)',
            color: '#ff6b6b',
            border: '1px solid rgba(255, 107, 107, 0.38)',
          }
        : {
            background: hovered ? 'var(--bg-hover)' : 'transparent',
            color: hovered ? 'var(--text)' : 'var(--text2)',
            border: '1px solid var(--border)',
          }

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ ...baseStyle, ...variantStyle }}
    >
      {children}
    </button>
  )
}

function TripModal({
  initial,
  onClose,
  onSaved,
}: {
  initial: BsiAbroadProduction | null
  onClose: () => void
  onSaved: () => void
}) {
  const t = useT()
  const supabase = getSupabase()
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          image_url: initial.image_url,
          country: initial.country,
          departure_date: initial.departure_date,
          return_date: initial.return_date ?? null,
          note: initial.note ?? '',
          service_link_url: initial.service_link_url,
          is_published: initial.is_published,
          sort_order: initial.sort_order,
          title: initial.title ?? '',
          description: initial.description ?? '',
          slug: initial.slug ?? slugify(initial.country),
          locations: Array.isArray(initial.locations) ? initial.locations : [],
          terms_conditions: initial.terms_conditions ?? '',
          secondary_image_url: initial.secondary_image_url ?? null,
        }
      : EMPTY,
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setError(null)
    if (!form.country.trim()) {
      setError('Destination country is required.')
      return
    }
    if (!form.image_url) {
      setError('Image is required.')
      return
    }
    if (!form.departure_date) {
      setError('Departure date is required.')
      return
    }
    if (form.return_date && form.return_date < form.departure_date) {
      setError('Return date cannot be earlier than departure date.')
      return
    }
    setSaving(true)
    // Auto-fill slug from country when the editor left it blank — the
    // detail-page route /abroad-production/[slug] needs *something*
    // unique per row. SQL backfilled existing rows with the same rule.
    const finalSlug = form.slug?.trim()
      ? slugify(form.slug.trim())
      : slugify(form.country)
    const payload = {
      ...form,
      // service_link_url is optional in the UI but the DB column is
      // NOT NULL — coerce empty input to an empty string so the insert
      // doesn't bounce. Banner click now uses the internal detail
      // route, so this field is effectively legacy.
      service_link_url: form.service_link_url?.trim() ?? '',
      note: form.note?.trim() ? form.note.trim() : null,
      title: form.title?.trim() ? form.title.trim() : null,
      description: form.description?.trim() ? form.description.trim() : null,
      return_date: form.return_date || null,
      slug: finalSlug,
      // Only keep locations with both a name and an uploaded image —
      // half-filled rows are dropped on save so the public gallery
      // never tries to render a broken or unlabeled card.
      locations: (form.locations ?? [])
        .map((loc) => ({
          name: loc.name?.trim() ?? '',
          image_url: loc.image_url ?? '',
        }))
        .filter((loc) => loc.name && loc.image_url),
      terms_conditions: form.terms_conditions?.trim()
        ? form.terms_conditions.trim()
        : null,
      updated_at: new Date().toISOString(),
    }
    const op = initial
      ? supabase.from('bsi_abroad_production').update(payload).eq('id', initial.id)
      : supabase.from('bsi_abroad_production').insert(payload)
    const { error } = await op
    if (error) {
      setError(error.message)
      setSaving(false)
      return
    }
    onSaved()
  }

  return (
    <ModalShell
      title={initial ? 'Edit Trip' : 'Add Trip'}
      onClose={onClose}
      maxWidth={1180}
      headerExtra={
        <button
          type="button"
          onClick={() => update('is_published', !form.is_published)}
          style={{
            padding: '6px 12px',
            background: form.is_published
              ? 'rgba(67, 217, 162, 0.12)'
              : 'var(--bg3)',
            color: form.is_published ? '#43d9a2' : 'var(--text2)',
            border: form.is_published
              ? '1px solid rgba(67,217,162,0.4)'
              : '1px solid var(--border)',
            borderRadius: 999,
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: 3,
              background: form.is_published ? '#43d9a2' : 'var(--text3)',
            }}
          />
          {form.is_published ? 'Active' : 'Hidden'}
        </button>
      }
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 18px',
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '10px 22px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : initial ? 'Save Changes' : 'Add Trip'}
          </button>
        </>
      }
    >
      {error && (
        <div
          style={{
            padding: '10px 14px',
            background: 'rgba(255,107,107,0.08)',
            border: '1px solid rgba(255,107,107,0.3)',
            borderRadius: 8,
            color: '#ff6b6b',
            fontSize: 12,
          }}
        >
          {error}
        </div>
      )}

      {/* Top — landscape 2-column grid. LEFT carries the heavy
          visual fields (banner image + secondary image) so the
          editor reads as a media-first composition; RIGHT carries
          the rest of the data fields stacked vertically. */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.1fr)',
          gap: 24,
          // Stretch both columns to the same height so their top
          // AND bottom edges line up. The right-column description
          // textarea uses flex-grow to absorb the extra vertical
          // space (instead of leaving an empty gap at the bottom).
          alignItems: 'stretch',
        }}
      >
        {/* LEFT — media column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <FormField label="Image" required>
            <FileUploader
              value={form.image_url || null}
              onChange={(url) => update('image_url', url ?? '')}
              prefix="abroad-production"
              accept="image"
              previewHeight={160}
              hint="16:9 ratio (1920×1080 px) recommended."
            />
          </FormField>

          <FormField label="Secondary image (optional)">
            <FileUploader
              value={form.secondary_image_url}
              onChange={(url) => update('secondary_image_url', url)}
              prefix="abroad-production"
              accept="image"
              previewHeight={160}
              hint="4:5 ratio (1200×1500 px) recommended."
            />
          </FormField>
        </div>

        {/* RIGHT — text/data column. `height: 100%` + flex-grow on
            the description textarea makes the column fill the row's
            full height (matching the LEFT media column) and absorb
            any extra space into the description input. */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, height: '100%' }}>
          <FormField label="Destination country" required>
            <input
              style={inputStyle}
              value={form.country}
              onChange={(e) => {
                const next = e.target.value
                // Slug always auto-derives from country — there's no
                // longer a manual slug input, so we keep them in sync
                // on every keystroke.
                setForm((f) => ({
                  ...f,
                  country: next,
                  slug: slugify(next),
                }))
              }}
              placeholder="e.g. Japan"
            />
          </FormField>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
            }}
          >
            <FormField label="Departure date" required>
              <input
                type="date"
                style={inputStyle}
                value={form.departure_date}
                onChange={(e) => update('departure_date', e.target.value)}
              />
            </FormField>
            <FormField label="Return date (optional)">
              <input
                type="date"
                style={inputStyle}
                value={form.return_date ?? ''}
                min={form.departure_date || undefined}
                onChange={(e) =>
                  update('return_date', e.target.value || null)
                }
              />
            </FormField>
          </div>

          {/* Description — wrapper grows to fill the remaining
              vertical space in the right column so the column's
              bottom edge aligns with the left media column's bottom
              edge. The textarea inside fills its parent (`height:
              100%`) so editors get a roomy place to type. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, flex: '1 1 auto', minHeight: 0 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'var(--text2)',
              }}
            >
              Destination country description{' '}
              <span style={{ color: 'var(--text3)', fontWeight: 500, letterSpacing: 'normal', textTransform: 'none' }}>
                (optional)
              </span>
            </label>
            <textarea
              style={{
                ...inputStyle,
                minHeight: 110,
                height: '100%',
                flex: '1 1 auto',
                resize: 'vertical',
                fontFamily: 'inherit',
                lineHeight: 1.5,
              }}
              value={form.description ?? ''}
              onChange={(e) => update('description', e.target.value)}
              placeholder={t('Tulis konteks singkat tentang negara tujuan — kondisi lokal, alasan ke sini, itinerary highlights, atau apapun yang relevan untuk visitor.')}
            />
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1.5fr 1fr',
              gap: 14,
            }}
          >
            <FormField label="Note (optional)">
              <input
                style={inputStyle}
                value={form.note ?? ''}
                onChange={(e) => update('note', e.target.value)}
                placeholder='e.g. "Eropa Trip 2026" or "Limited slots"'
              />
            </FormField>
            <FormField label="Sort order">
              <input
                type="number"
                style={inputStyle}
                value={form.sort_order}
                onChange={(e) =>
                  update('sort_order', Number(e.target.value) || 0)
                }
              />
            </FormField>
          </div>
        </div>
      </div>

      {/* Hairline separator between the trip-level form fields above
          and the destinations sub-editor below — gives the modal a
          clear "primary fields | secondary list" reading order
          without a heavy section header. */}
      <div
        aria-hidden
        style={{
          height: 1,
          background:
            'linear-gradient(90deg, transparent 0%, var(--border) 20%, var(--border) 80%, transparent 100%)',
          margin: '4px 0',
        }}
      />

      {/* Destinations to visit — full-width section. Custom header
          (label + "+ Add destination" inline on the right) instead
          of the standard FormField label-on-top, so the section
          reads as a self-contained sub-tool with its own affordance. */}
      <LocationsEditor
        value={form.locations ?? []}
        onChange={(next) => update('locations', next)}
      />
    </ModalShell>
  )
}

/**
 * In-modal editor for the trip's destinations list. Each row owns one
 * `BsiTripLocation` — image upload on the left, name on the right,
 * plus reorder and remove buttons. The "+ Add destination" button
 * appends an empty entry that the editor fills in; rows missing a
 * name or an image are dropped on save by the parent so the public
 * gallery never renders half-baked cards.
 */
function LocationsEditor({
  value,
  onChange,
}: {
  value: BsiTripLocation[]
  onChange: (next: BsiTripLocation[]) => void
}) {
  const updateAt = (idx: number, patch: Partial<BsiTripLocation>) => {
    onChange(value.map((v, i) => (i === idx ? { ...v, ...patch } : v)))
  }
  const remove = (idx: number) => {
    onChange(value.filter((_, i) => i !== idx))
  }
  const add = () => {
    onChange([...value, { name: '', image_url: '' }])
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Section header — title on the LEFT (caps eyebrow + count
          chip), "+ Add destination" button inline on the RIGHT so
          editors can add a destination without scrolling past the
          grid. The count chip gives editors instant feedback on
          how many destinations they've already added. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 2,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label
            style={{
              fontSize: 11,
              letterSpacing: '0.2em',
              textTransform: 'uppercase',
              color: 'var(--text2)',
              fontWeight: 600,
            }}
          >
            Destinations to visit
          </label>
          {value.length > 0 && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '2px 8px',
                background: 'rgba(11, 61, 231, 0.14)',
                color: '#7da1ff',
                border: '1px solid rgba(11, 61, 231, 0.32)',
                borderRadius: 999,
                lineHeight: 1.4,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {value.length}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={add}
          style={{
            padding: '7px 14px',
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--text)',
            background: 'var(--bg3)',
            border: '1px dashed var(--border-strong)',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'background 0.18s ease, border-color 0.18s ease',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg-hover, var(--bg2))'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--accent, #0B3DE7)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg3)'
            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border-strong)'
          }}
        >
          + Add destination
        </button>
      </div>

      {value.length === 0 ? (
        <div
          style={{
            padding: '16px 18px',
            background: 'var(--bg3)',
            border: '1px dashed var(--border)',
            borderRadius: 10,
            fontSize: 12,
            color: 'var(--text2)',
            textAlign: 'center',
          }}
        >
          No destinations yet. Click + Add destination to start the list.
        </div>
      ) : (
        // Gallery grid — destinations render as compact cards so the
        // editor mirrors the public "Places We'll Visit" gallery
        // visually. Auto-fill columns keep the layout responsive as
        // the modal width changes.
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 14,
          }}
        >
          {value.map((loc, idx) => (
            <DestinationCard
              key={idx}
              location={loc}
              onUpdate={(patch) => updateAt(idx, patch)}
              onRemove={() => remove(idx)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One destination row in the LocationsEditor grid. Owns the local
 * `actionsRef` so the Ganti / Hapus buttons we render in the card's
 * bottom row can trigger the FileUploader's internal change / remove
 * flows (the same confirm dialogs that the inline buttons would have
 * shown) without duplicating the upload logic.
 */
function DestinationCard({
  location,
  onUpdate,
  onRemove,
}: {
  location: BsiTripLocation
  onUpdate: (patch: Partial<BsiTripLocation>) => void
  onRemove: () => void
}) {
  const t = useT()
  const fileActions = useRef<{
    change: () => void
    remove: () => void
  } | null>(null)

  return (
    <div
      style={{
        background:
          'linear-gradient(180deg, var(--bg3) 0%, var(--bg2) 100%)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        transition: 'border-color 0.15s ease',
      }}
    >
      <FileUploader
        value={location.image_url || null}
        onChange={(url) => onUpdate({ image_url: url ?? '' })}
        prefix="abroad-production-locations"
        accept="image"
        previewHeight={130}
        hint="4:3 · 800×600 px"
        hideActions
        actionsRef={fileActions}
      />
      <input
        style={{ ...inputStyle, fontSize: 13 }}
        value={location.name}
        onChange={(e) => onUpdate({ name: e.target.value })}
        placeholder="Location name"
      />
      {/* Bottom action row — Ganti triggers FileUploader's file
          picker, Hapus removes the entire destination row (file +
          name) since that's the most common edit pattern. Ganti
          only renders once an image has been uploaded (no point
          showing it on an empty card; the preview itself is the
          uploader). */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        {location.image_url && (
          <SmallBtn
            onClick={() => fileActions.current?.change()}
            title={t('Ganti file')}
          >
            {t('Ganti')}
          </SmallBtn>
        )}
        <SmallBtn onClick={onRemove} tone="danger" title={t('Hapus destination')}>
          {t('Hapus')}
        </SmallBtn>
      </div>
    </div>
  )
}

function SmallBtn({
  onClick,
  disabled,
  title,
  tone,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  title: string
  tone?: 'danger'
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 600,
        color: tone === 'danger' ? '#ff6b6b' : 'var(--text2)',
        background: tone === 'danger' ? 'rgba(255,107,107,0.08)' : 'transparent',
        border: `1px solid ${tone === 'danger' ? 'rgba(255,107,107,0.35)' : 'var(--border)'}`,
        borderRadius: 6,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background 0.18s ease',
      }}
    >
      {children}
    </button>
  )
}

function formatDate(iso: string): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return iso
    return new Intl.DateTimeFormat('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(d)
  } catch {
    return iso
  }
}

