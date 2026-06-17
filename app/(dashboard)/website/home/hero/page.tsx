'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import DOMPurify from 'isomorphic-dompurify'
import { getSupabase } from '@/lib/supabase'
import { uploadFileWithProgress } from '@/lib/storage'
import type { BsiHero, BackgroundType, FontStyle, TextTransform } from '@/lib/website-types'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { FileUploader } from '@/components/website/FileUploader'
import { VideoPosterPicker } from '@/components/website/VideoPosterPicker'
import { MediaGallery } from '@/components/website/MediaGallery'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { SaveActions } from '@/components/website/PageActions'
import { RichTextEditor } from '@/components/website/RichTextEditor'
import { ConfirmDialog, type ConfirmRequest } from '@/components/website/ConfirmDialog'
import { Section, Subgroup } from '@/components/website/Section'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useIsMobile } from '@/hooks/useIsMobile'

type FormState = Omit<BsiHero, 'id' | 'created_at' | 'updated_at'>

const EMPTY_FORM: FormState = {
  headline: '',
  subtitle: '',
  cta_text: 'Start Collaboration',
  cta_url: '',
  background_type: 'video',
  background_image_url: null,
  background_image_url_mobile: null,
  video_urls: [],
  poster_url: null,
  headline_color: '#ffffff',
  headline_font_size_px: 96,
  headline_font_weight: 700,
  headline_font_style: 'normal',
  headline_text_transform: 'uppercase',
  headline_letter_spacing_em: -0.01,
  subtitle_color: '#f0f4ff',
  subtitle_font_size_px: 18,
  subtitle_font_weight: 400,
  subtitle_font_style: 'normal',
  subtitle_text_transform: 'none',
  is_active: true,
  lead_whatsapp_number: '+6281284731599',
  lead_email: 'hello@bentalastudio.id',
  portfolio_header_image_url: null,
  logo_url: null,
  nav_home_hidden: false,
  nav_about_hidden: false,
  nav_news_hidden: false,
}

const FONT_WEIGHTS = [
  { value: 300, label: '300 — Light' },
  { value: 400, label: '400 — Regular' },
  { value: 500, label: '500 — Medium' },
  { value: 600, label: '600 — Semi-bold' },
  { value: 700, label: '700 — Bold' },
  { value: 800, label: '800 — Extra-bold' },
  { value: 900, label: '900 — Black' },
]

// Allowed tags for inline rich-text styling in headline.
// Tiptap uses <span style="..."> for color/font-size/weight, plus <strong>,
// <em>, <u>. <br> for line breaks. <p> as a paragraph wrapper that we
// flatten to <br> in toInlineHtml below.
const HEADLINE_SANITIZE_OPTS = {
  ALLOWED_TAGS: ['span', 'br', 'p', 'b', 'strong', 'em', 'i', 'u'],
  ALLOWED_ATTR: ['style', 'class'],
}

// For DB storage: strip dangerous HTML but keep newlines as-is so the textarea
// shows the same multi-line input the user typed when they re-open the form.
function sanitizeForStore(html: string): string {
  return DOMPurify.sanitize(html, HEADLINE_SANITIZE_OPTS)
}

// For rendering: convert newlines to <br> so multi-line input visually breaks
// the way the user expects. Used in the live preview and on the public site.
function sanitizeForRender(html: string): string {
  const withBreaks = html.replace(/\r\n|\n/g, '<br>')
  return DOMPurify.sanitize(withBreaks, HEADLINE_SANITIZE_OPTS)
}

// Flatten any <p>...</p><p>...</p> from Tiptap output into a single line of
// inline HTML separated by <br>. Keeps inline styling (span, strong, etc.).
function toInlineHtml(html: string): string {
  return (html ?? '')
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/p>/gi, '')
}

export default function HeroEditorPage() {
  const t = useT()
  const isMobile = useIsMobile()
  const supabase = getSupabase()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [heroId, setHeroId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  // Snapshot of the last persisted form so we can detect unsaved changes
  // and offer a discard action.
  const [savedForm, setSavedForm] = useState<FormState>(EMPTY_FORM)
  const [posterPickerOpen, setPosterPickerOpen] = useState(false)
  const [galleryOpen, setGalleryOpen] = useState(false)
  // UI-only: which tab the user is currently editing (image vs video).
  // Switching tabs does NOT modify form state or preview — only picking a file
  // actually commits to a background_type. This prevents accidental "dirty"
  // state from just toggling tabs.
  const [viewingTab, setViewingTab] = useState<BackgroundType>('video')

  const isDirty = useMemo(
    () => JSON.stringify(form) !== JSON.stringify(savedForm),
    [form, savedForm],
  )

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('bsi_hero')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }

      if (data) {
        setHeroId(data.id)
        const next: FormState = {
          headline: data.headline ?? '',
          subtitle: data.subtitle,
          cta_text: data.cta_text,
          cta_url: data.cta_url,
          background_type: data.background_type ?? 'video',
          background_image_url: data.background_image_url ?? null,
          background_image_url_mobile: data.background_image_url_mobile ?? null,
          video_urls: data.video_urls ?? [],
          poster_url: data.poster_url,
          headline_color: data.headline_color ?? '#ffffff',
          headline_font_size_px: data.headline_font_size_px ?? 96,
          headline_font_weight: data.headline_font_weight ?? 700,
          headline_font_style: data.headline_font_style ?? 'normal',
          headline_text_transform: data.headline_text_transform ?? 'uppercase',
          headline_letter_spacing_em: data.headline_letter_spacing_em ?? -0.01,
          subtitle_color: data.subtitle_color ?? '#f0f4ff',
          subtitle_font_size_px: data.subtitle_font_size_px ?? 18,
          subtitle_font_weight: data.subtitle_font_weight ?? 400,
          subtitle_font_style: data.subtitle_font_style ?? 'normal',
          subtitle_text_transform: data.subtitle_text_transform ?? 'none',
          is_active: data.is_active,
          lead_whatsapp_number: data.lead_whatsapp_number ?? '+6281284731599',
          lead_email: data.lead_email ?? 'hello@bentalastudio.id',
          portfolio_header_image_url: data.portfolio_header_image_url ?? null,
          logo_url: data.logo_url ?? null,
          nav_home_hidden: data.nav_home_hidden ?? false,
          nav_about_hidden: data.nav_about_hidden ?? false,
          nav_news_hidden: data.nav_news_hidden ?? false,
        }
        setForm(next)
        setSavedForm(next)
        setViewingTab(next.background_type)
      }
      setLoading(false)
    }
    load()
  }, [supabase])

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }))
  }

  async function handleSave() {
    setSaving(true)
    setError(null)

    // Tiptap emits HTML with <p> wrappers. Flatten those into <br> for inline
    // headline/subtitle use, then sanitize for safe DB storage.
    const cleanHeadline = sanitizeForStore(toInlineHtml(form.headline))
    const cleanSubtitle = sanitizeForStore(toInlineHtml(form.subtitle))
    const payload = {
      ...form,
      headline: cleanHeadline,
      subtitle: cleanSubtitle,
      // Hero is always live now that the Status toggle was removed; force the
      // column true on every save so a previously hidden row gets republished.
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    const { data, error } = heroId
      ? await supabase.from('bsi_hero').update(payload).eq('id', heroId).select().single()
      : await supabase.from('bsi_hero').insert(payload).select().single()

    if (error) {
      // Detect "column ... does not exist" (PostgREST 42703) — happens when a
      // schema migration hasn't been applied yet. Surface a clear, actionable
      // message instead of the raw Postgres error.
      const isMissingColumn =
        error.code === '42703' || /column .* does not exist/i.test(error.message)
      setError(
        isMissingColumn
          ? `${t('Database belum diupdate:')} ${error.message}. ${t('Jalankan migration "schema_hero_lead_destination.sql" di Supabase SQL Editor lalu coba simpan lagi.')}`
          : error.message,
      )
      setSaving(false)
      return
    }

    if (data) setHeroId(data.id)
    // Mirror cleaned values back into form state so the editor and savedForm
    // stay in sync — keeps isDirty=false right after save.
    const finalForm = { ...form, headline: cleanHeadline, subtitle: cleanSubtitle }
    setForm(finalForm)
    setSavedForm(finalForm)
    setSavedAt(new Date())
    setSaving(false)
  }

  function handleDiscard() {
    if (!confirm(t('Batalkan semua perubahan yang belum disimpan? Form akan kembali ke versi terakhir yang tersimpan.'))) {
      return
    }
    setForm(savedForm)
    setViewingTab(savedForm.background_type)
    setError(null)
  }

  // Warn before navigating away with unsaved changes.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  useRegisterPageAction(
    loading ? null : (
      <SaveActions
        isDirty={isDirty}
        saving={saving}
        savedAt={savedAt}
        onSave={handleSave}
        onDiscard={handleDiscard}
      />
    ),
  )

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text2)', fontSize: 13 }}>{t('Memuat…')}</div>
  }

  return (
    <>
      <div style={{ padding: isMobile ? '24px 14px' : 24 }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 24 }}>
          {error && (
            <div
              style={{
                padding: 12,
                borderRadius: 8,
                background: 'rgba(255,107,107,0.1)',
                border: '1px solid rgba(255,107,107,0.3)',
                color: '#ff6b6b',
                fontSize: 12,
              }}
            >
              {error}
            </div>
          )}

          <Preview form={form} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))',
              gridAutoRows: '500px',
              gap: 24,
            }}
          >
          <Section title="Background" height={500}>
            <FormField label="Background Type">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', gap: 6, padding: 4, background: 'var(--bg3)', borderRadius: 8, width: 'fit-content' }}>
                  {(['image', 'video'] as BackgroundType[]).map((t) => {
                    const isActiveTab = viewingTab === t
                    const isLiveType = form.background_type === t
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setViewingTab(t)}
                        title={isLiveType ? `${t} is active on the site` : `View ${t} editor (not set as background yet)`}
                        style={{
                          padding: '6px 16px',
                          borderRadius: 6,
                          border: 'none',
                          background: isActiveTab ? 'var(--accent)' : 'transparent',
                          color: isActiveTab ? '#fff' : 'var(--text2)',
                          fontSize: 12,
                          fontWeight: 500,
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {t}
                        {isLiveType && (
                          <span
                            title="Active on site"
                            style={{
                              width: 6,
                              height: 6,
                              borderRadius: 3,
                              background: '#43d9a2',
                              flexShrink: 0,
                            }}
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
                <button
                  type="button"
                  onClick={() => setGalleryOpen(true)}
                  style={{
                    marginLeft: 'auto',
                    height: 36,
                    padding: '0 14px',
                    background: 'var(--bg3)',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    color: 'var(--accent)',
                    fontSize: 12,
                    fontWeight: 500,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="3" width="7" height="7" />
                    <rect x="14" y="3" width="7" height="7" />
                    <rect x="3" y="14" width="7" height="7" />
                    <rect x="14" y="14" width="7" height="7" />
                  </svg>
                  History
                </button>
              </div>
            </FormField>

            {/* The grid above locks every section card to the same height,
                so toggling Image/Video never resizes the row. If video content
                exceeds the box (many videos + poster), it scrolls inside. */}
            <div
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 16,
                paddingRight: 4,
              }}
            >
            {/* Both uploaders stay MOUNTED — only one is visible at a time.
                Hiding via display:none keeps any in-progress upload alive
                across tab switches; the upload state inside MultiFileUploader
                persists, and finishes whether the user is on the Image or
                Video tab when it completes. */}
            <div
              style={{
                display: viewingTab === 'image' ? 'flex' : 'none',
                flexDirection: 'column',
                gap: 16,
                flex: 1,
                minHeight: 0,
              }}
            >
              <FileUploader
                label="Background Image (Desktop)"
                value={form.background_image_url}
                onChange={(url) => {
                  setForm((f) => ({
                    ...f,
                    background_image_url: url,
                    background_type: url ? 'image' : f.background_type,
                  }))
                }}
                prefix="hero"
                accept="image"
                compact
              />
              {/* Mobile-only override. When set, the public site uses
                  this image at viewport widths below the `md` breakpoint
                  (≤768px) and falls back to the desktop image / video
                  above. Optional — leave empty to use the desktop bg
                  on every screen size. */}
              <FileUploader
                label="Background Image (Mobile)"
                value={form.background_image_url_mobile}
                onChange={(url) => update('background_image_url_mobile', url)}
                prefix="hero-mobile"
                accept="image"
                compact
              />
              {form.background_image_url && (
                <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                  <ActiveTypeButton
                    isActive={form.background_type === 'image'}
                    label="Image"
                    onActivate={() => update('background_type', 'image')}
                  />
                </div>
              )}
            </div>
            <div
              style={{
                display: viewingTab === 'video' ? 'flex' : 'none',
                flexDirection: 'column',
                gap: 16,
                flex: 1,
                minHeight: 0,
              }}
            >
                <VideoField
                  value={form.video_urls[0] ?? null}
                  onChange={(url) => {
                    setForm((f) => ({
                      ...f,
                      video_urls: url ? [url] : [],
                      background_type: url ? 'video' : f.background_type,
                    }))
                  }}
                />
                {form.video_urls.length > 0 && (
                  <PosterField
                    value={form.poster_url}
                    onChange={(url) => update('poster_url', url)}
                    onPickFromVideo={() => setPosterPickerOpen(true)}
                  />
                )}
                {form.video_urls.length > 0 && (
                  <div style={{ marginTop: 'auto', display: 'flex', justifyContent: 'flex-end' }}>
                    <ActiveTypeButton
                      isActive={form.background_type === 'video'}
                      label="Video"
                      onActivate={() => update('background_type', 'video')}
                    />
                  </div>
                )}
            </div>
            </div>
          </Section>

          </div>

          <Section title="Headline & Subtitle">
            <HeroTextPreview form={form} />

            <FormField label="Headline" required>
              <RichTextEditor
                value={form.headline}
                onChange={(html) => update('headline', html)}
                placeholder="Type headline here..."
                minHeight={140}
              />
            </FormField>

            <FormField label="Subtitle" required>
              <RichTextEditor
                value={form.subtitle}
                onChange={(html) => update('subtitle', html)}
                placeholder="Type subtitle here..."
                minHeight={120}
              />
            </FormField>
          </Section>

          <Section title="Call-to-Action & Lead">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
              <Subgroup label="Hero Button">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr', gap: 14 }}>
                  <FormField label="Button Label" required>
                    <input
                      style={inputStyle}
                      value={form.cta_text}
                      onChange={(e) => update('cta_text', e.target.value)}
                      placeholder="Start Collaboration"
                    />
                  </FormField>
                  <FormField label="Direct Link (optional)">
                    <input
                      style={inputStyle}
                      type="url"
                      value={form.cta_url}
                      onChange={(e) => update('cta_url', e.target.value)}
                      placeholder="https://..."
                    />
                  </FormField>
                </div>
              </Subgroup>

              <Subgroup label="Lead Destination">
                <FormField label="Team WhatsApp Number" required>
                  <div style={{ maxWidth: 360 }}>
                    <input
                      style={{
                        ...inputStyle,
                        fontFamily:
                          'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, monospace',
                        letterSpacing: '0.02em',
                      }}
                      type="tel"
                      value={form.lead_whatsapp_number}
                      onChange={(e) => update('lead_whatsapp_number', e.target.value)}
                      placeholder="+6281284731599"
                    />
                  </div>
                </FormField>
              </Subgroup>
            </div>
          </Section>

        </div>
      </div>

      {posterPickerOpen && (
        <VideoPosterPicker
          videoUrls={form.video_urls}
          prefix="hero"
          currentPoster={form.poster_url}
          onPosterChange={(url) => update('poster_url', url)}
          onClose={() => setPosterPickerOpen(false)}
        />
      )}

      {galleryOpen && (
        <MediaGallery
          prefix="hero"
          currentUrl={form.background_type === 'image' ? form.background_image_url : form.video_urls[0] ?? null}
          filter="all"
          initialTab={viewingTab}
          onSelect={(url, isVideo) => {
            if (isVideo) {
              setViewingTab('video')
              setForm((f) => ({
                ...f,
                background_type: 'video',
                // Append video to the list (skip if already there). The other
                // type's data (image URL) is preserved.
                video_urls: f.video_urls.includes(url) ? f.video_urls : [...f.video_urls, url],
              }))
            } else {
              setViewingTab('image')
              setForm((f) => ({
                ...f,
                background_type: 'image',
                background_image_url: url,
                // Video list stays — switching back to Video tab shows them.
              }))
            }
            setGalleryOpen(false)
          }}
          onClose={() => setGalleryOpen(false)}
        />
      )}
    </>
  )
}


// Focused mini-preview for the Headline & Subtitle section. Drops
// the background image / video so the editor reads the actual
// copy on a clean dark plate. Uses the same rendering pipeline
// the existing `Preview` component below uses — both `safeHeadline`
// and `safeSubtitle` are run through DOMPurify via `sanitizeForRender`
// before they're handed to React, so dangerouslySetInnerHTML here
// is no riskier than the public-site renderer that displays the
// same value.
function HeroTextPreview({ form }: { form: FormState }) {
  const t = useT()
  const safeHeadline = useMemo(
    () => sanitizeForRender(toInlineHtml(form.headline || t('Judul Hero'))),
    [form.headline, t],
  )
  const safeSubtitle = useMemo(
    () => sanitizeForRender(toInlineHtml(form.subtitle || t('Subtitle hero akan tampil di sini'))),
    [form.subtitle, t],
  )

  const previewHeadlineSize = Math.min(form.headline_font_size_px * 0.4, 56)
  const previewSubtitleSize = Math.min(form.subtitle_font_size_px * 0.85, 18)

  return (
    <div
      style={{
        position: 'relative',
        background:
          'radial-gradient(ellipse at 30% 0%, rgba(11,61,231,0.18) 0%, transparent 60%), linear-gradient(180deg, #08090d 0%, #04060c 100%)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '32px 24px',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: '0.24em',
          textTransform: 'uppercase',
          color: 'rgba(240,244,255,0.4)',
          marginBottom: 18,
          fontWeight: 700,
        }}
      >
        {t('Live preview · sesuai tampilan public site')}
      </div>
      <SafeRichText
        html={safeHeadline}
        style={{
          margin: 0,
          color: form.headline_color,
          fontSize: previewHeadlineSize,
          fontWeight: form.headline_font_weight,
          fontStyle: form.headline_font_style,
          textTransform: form.headline_text_transform,
          letterSpacing: `${form.headline_letter_spacing_em}em`,
          lineHeight: 0.95,
          maxWidth: '90%',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      />
      <SafeRichText
        html={safeSubtitle}
        style={{
          margin: '18px auto 0',
          color: form.subtitle_color,
          fontSize: previewSubtitleSize,
          fontWeight: form.subtitle_font_weight,
          fontStyle: form.subtitle_font_style,
          textTransform: form.subtitle_text_transform,
          lineHeight: 1.5,
          maxWidth: 520,
          opacity: 0.95,
        }}
      />
    </div>
  )
}

function Preview({ form }: { form: FormState }) {
  const t = useT()
  const safeHeadline = useMemo(
    () => sanitizeForStore(toInlineHtml(form.headline || t('Judul Hero'))),
    [form.headline, t],
  )
  const safeSubtitle = useMemo(
    () => sanitizeForStore(toInlineHtml(form.subtitle || t('Subtitle hero akan tampil di sini'))),
    [form.subtitle, t],
  )

  const bgStyle: React.CSSProperties =
    form.background_type === 'image' && form.background_image_url
      ? { backgroundImage: `url(${form.background_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : form.poster_url
      ? { backgroundImage: `url(${form.poster_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
      : { background: 'linear-gradient(135deg, #1a1d27 0%, #08090d 100%)' }

  const overlayStyle: React.CSSProperties = {
    background: 'linear-gradient(to bottom, rgba(8,9,13,0.65) 0%, rgba(8,9,13,0.55) 40%, rgba(8,9,13,0.85) 100%)',
  }

  const previewHeadlineSize = Math.min(form.headline_font_size_px * 0.45, 64)
  const previewSubtitleSize = Math.min(form.subtitle_font_size_px * 0.85, 18)

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '21 / 9',
        minHeight: 240,
        maxHeight: 480,
        borderRadius: 12,
        overflow: 'hidden',
        border: '1px solid var(--border)',
        ...bgStyle,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, ...overlayStyle }} />
      <div
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          textAlign: 'center',
          padding: 20,
          gap: 12,
        }}
      >
        <h1
          style={{
            margin: 0,
            color: form.headline_color,
            fontSize: previewHeadlineSize,
            fontWeight: form.headline_font_weight,
            fontStyle: form.headline_font_style,
            textTransform: form.headline_text_transform,
            letterSpacing: `${form.headline_letter_spacing_em}em`,
            lineHeight: 0.95,
            maxWidth: '90%',
          }}
          dangerouslySetInnerHTML={{ __html: safeHeadline }}
        />
        <SafeRichText
          html={safeSubtitle}
          style={{
            margin: 0,
            color: form.subtitle_color,
            fontSize: previewSubtitleSize,
            fontWeight: form.subtitle_font_weight,
            fontStyle: form.subtitle_font_style,
            textTransform: form.subtitle_text_transform,
            lineHeight: 1.5,
            maxWidth: 480,
            opacity: 0.95,
          }}
        />
        <div style={{ marginTop: 8 }}>
          <span
            style={{
              padding: '8px 18px',
              background: '#00d4ff',
              color: '#08090d',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {form.cta_text || 'CTA Button'}
          </span>
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          padding: '3px 8px',
          background: 'rgba(0,0,0,0.6)',
          color: '#fff',
          borderRadius: 4,
          fontSize: 9,
          fontWeight: 600,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          backdropFilter: 'blur(8px)',
        }}
      >
        Live Preview
      </div>
    </div>
  )
}

interface TypographyProps {
  color: string
  fontSize: number
  fontWeight: number
  fontStyle: FontStyle
  textTransform: TextTransform
  onColorChange: (v: string) => void
  onFontSizeChange: (v: number) => void
  onFontWeightChange: (v: number) => void
  onFontStyleChange: (v: FontStyle) => void
  onTextTransformChange: (v: TextTransform) => void
}

// Caller MUST pass already-sanitized html (via DOMPurify upstream).
function SafeRichText({ html, style }: { html: string; style: React.CSSProperties }) {
  return <div style={style} dangerouslySetInnerHTML={{ __html: html }} />
}

// Custom poster field — when empty, shows two clear options (Upload File /
// Pilih dari Video). When set, shows the preview with Ganti & Hapus.
function PosterField({
  value,
  onChange,
  onPickFromVideo,
}: {
  value: string | null
  onChange: (url: string | null) => void
  onPickFromVideo: () => void
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const abortRef = useRef<(() => void) | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const { promise, abort } = uploadFileWithProgress(file, 'hero', (p) => {
        setProgress(p.percent)
      })
      abortRef.current = abort
      const result = await promise
      onChange(result.url)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      // Don't surface the cancellation as an error — user-initiated.
      if (message !== 'Upload dibatalkan') setError(message)
    } finally {
      setUploading(false)
      setProgress(0)
      abortRef.current = null
    }
  }

  function cancelUpload() {
    abortRef.current?.()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text2)',
        }}
      >
        {t('Poster (gambar sebelum video dimuat)')}
      </label>

      {value ? (
        <div
          style={{
            position: 'relative',
            borderRadius: 8,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background: 'var(--bg3)',
            height: 160,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={value} alt="Poster" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: t('Ganti poster?'),
                  message: t('Poster saat ini akan diganti dengan file baru. File lama tetap di Riwayat.'),
                  confirmLabel: t('Ganti'),
                  tone: 'warning',
                  onConfirm: () => {
                    setConfirm(null)
                    inputRef.current?.click()
                  },
                })
              }
              disabled={uploading}
              style={posterCornerBtn('#fff')}
            >
              {uploading ? `${progress.toFixed(0)}%` : t('Upload File')}
            </button>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: t('Ganti poster?'),
                  message: t('Poster saat ini akan diganti dengan frame yang dipilih dari video.'),
                  confirmLabel: t('Ganti'),
                  tone: 'warning',
                  onConfirm: () => {
                    setConfirm(null)
                    onPickFromVideo()
                  },
                })
              }
              style={posterCornerBtn('#fff')}
            >
              {t('Dari Video')}
            </button>
            <button
              type="button"
              onClick={() =>
                setConfirm({
                  title: t('Hapus poster?'),
                  message: t('Poster akan dilepas dari section ini. File asli tetap aman di Riwayat.'),
                  confirmLabel: t('Hapus'),
                  tone: 'danger',
                  onConfirm: () => {
                    setConfirm(null)
                    onChange(null)
                  },
                })
              }
              style={posterCornerBtn('#ff6b6b')}
            >
              {t('Hapus')}
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            height: 160,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            border: '2px dashed var(--border)',
            borderRadius: 8,
            background: 'var(--bg3)',
            padding: 16,
          }}
        >
          {uploading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                {t('Mengupload')} {progress.toFixed(0)}%
              </div>
              <button type="button" onClick={cancelUpload} style={cancelUploadBtn}>
                {t('Batalkan')}
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => inputRef.current?.click()}
                style={posterOptionBtn(false)}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {t('Upload File')}
              </button>
              <button type="button" onClick={onPickFromVideo} style={posterOptionBtn(true)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 3 19 12 5 21 5 3" />
                </svg>
                {t('Pilih dari Video')}
              </button>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />

      {error && <div style={{ fontSize: 11, color: '#ff6b6b' }}>{error}</div>}

      {confirm && <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function posterOptionBtn(highlight: boolean): React.CSSProperties {
  return {
    height: 38,
    padding: '0 18px',
    background: highlight ? 'var(--accent)' : 'var(--bg2)',
    color: highlight ? '#fff' : 'var(--text)',
    border: highlight ? 'none' : '1px solid var(--border)',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 8,
  }
}

function posterCornerBtn(color: string): React.CSSProperties {
  return {
    padding: '6px 10px',
    background: 'rgba(0,0,0,0.7)',
    backdropFilter: 'blur(8px)',
    color,
    border: 'none',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
  }
}

// Compact video field — shows file row when set, opens preview modal on click.
function VideoField({
  value,
  onChange,
}: {
  value: string | null
  onChange: (url: string | null) => void
}) {
  const t = useT()
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null)
  const abortRef = useRef<(() => void) | null>(null)

  async function handleFile(file: File) {
    setError(null)
    setUploading(true)
    setProgress(0)
    try {
      const { promise, abort } = uploadFileWithProgress(file, 'hero', (p) => {
        setProgress(p.percent)
      })
      abortRef.current = abort
      const result = await promise
      onChange(result.url)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message !== 'Upload dibatalkan') setError(message)
    } finally {
      setUploading(false)
      setProgress(0)
      abortRef.current = null
    }
  }

  function cancelUpload() {
    abortRef.current?.()
  }

  const fileName = value ? value.split('/').pop() ?? 'video' : ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <label
        style={{
          fontSize: 11,
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          color: 'var(--text2)',
        }}
      >
        Video Background
      </label>

      {value ? (
        <div
          onClick={() => setPreview(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: 10,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            cursor: 'pointer',
            transition: 'border-color 0.15s',
          }}
          onMouseEnter={(e) => {
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'
          }}
          onMouseLeave={(e) => {
            ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
          }}
        >
          {/* 36×36 inline video thumbnail — uses the source video
              with `preload="metadata"` so the first frame is shown
              without downloading the whole file. */}
          <div
            aria-hidden
            style={{
              width: 36,
              height: 36,
              borderRadius: 6,
              overflow: 'hidden',
              background: 'var(--bg2)',
              border: '1px solid var(--border)',
              flexShrink: 0,
            }}
          >
            <video
              src={value}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              muted
              preload="metadata"
            />
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 12,
              color: 'var(--text)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
            title={fileName}
          >
            {fileName}
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setConfirm({
                title: t('Ganti video?'),
                message: t('Video saat ini akan diganti dengan video baru. File lama tetap di Riwayat.'),
                confirmLabel: t('Ganti'),
                tone: 'warning',
                onConfirm: () => {
                  setConfirm(null)
                  inputRef.current?.click()
                },
              })
            }}
            style={rowActionBtn('var(--text)')}
          >
            {t('Ganti')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              setConfirm({
                title: t('Hapus video?'),
                message: t('Video akan dilepas dari section ini. File asli tetap aman di Riwayat.'),
                confirmLabel: t('Hapus'),
                tone: 'danger',
                onConfirm: () => {
                  setConfirm(null)
                  onChange(null)
                },
              })
            }}
            style={rowActionBtn('#ff6b6b')}
          >
            {t('Hapus')}
          </button>
        </div>
      ) : (
        <div
          onClick={() => !uploading && inputRef.current?.click()}
          onDragEnter={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={(e) => {
            e.preventDefault()
            setDragActive(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragActive(false)
            const f = e.dataTransfer.files?.[0]
            if (f) void handleFile(f)
          }}
          style={{
            height: 140,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            border: `2px dashed ${dragActive ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 8,
            background: dragActive ? 'rgba(108,99,255,0.05)' : 'var(--bg3)',
            color: 'var(--text2)',
            cursor: uploading ? 'wait' : 'pointer',
          }}
        >
          {uploading ? (
            <>
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  border: '2px solid var(--border)',
                  borderTopColor: 'var(--accent)',
                  animation: 'spin 0.8s linear infinite',
                }}
              />
              <div style={{ fontSize: 12 }}>{t('Mengupload')} {progress.toFixed(0)}%</div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  cancelUpload()
                }}
                style={cancelUploadBtn}
              >
                {t('Batalkan')}
              </button>
            </>
          ) : (
            <>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <div style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                {t('Klik atau drag video ke sini')}
              </div>
              <div style={{ fontSize: 10 }}>{t('MP4, WebM, MOV — max 200 MB · rasio 16:9')}</div>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="video/mp4,video/webm,video/quicktime"
        style={{ display: 'none' }}
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) void handleFile(f)
          e.target.value = ''
        }}
      />

      {error && <div style={{ fontSize: 11, color: '#ff6b6b' }}>{error}</div>}

      {preview && value && (
        <VideoPreviewModal
          src={value}
          onClose={() => setPreview(false)}
          onGanti={() => {
            setConfirm({
              title: t('Ganti video?'),
              message: t('Video saat ini akan diganti dengan video baru. File lama tetap di Riwayat.'),
              confirmLabel: t('Ganti'),
              tone: 'warning',
              onConfirm: () => {
                setConfirm(null)
                setPreview(false)
                inputRef.current?.click()
              },
            })
          }}
          onHapus={() => {
            setConfirm({
              title: t('Hapus video?'),
              message: t('Video akan dilepas dari section ini. File asli tetap aman di Riwayat.'),
              confirmLabel: t('Hapus'),
              tone: 'danger',
              onConfirm: () => {
                setConfirm(null)
                setPreview(false)
                onChange(null)
              },
            })
          }}
        />
      )}

      {confirm && <ConfirmDialog request={confirm} onCancel={() => setConfirm(null)} />}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  )
}

function VideoPreviewModal({
  src,
  onClose,
  onGanti,
  onHapus,
}: {
  src: string
  onClose: () => void
  onGanti: () => void
  onHapus: () => void
}) {
  const t = useT()
  const videoRef = useRef<HTMLVideoElement>(null)
  const [playing, setPlaying] = useState(false)

  function togglePlay() {
    const v = videoRef.current
    if (!v) return
    if (v.paused) {
      void v.play()
    } else {
      v.pause()
    }
  }

  function stop() {
    const v = videoRef.current
    if (!v) return
    v.pause()
    v.currentTime = 0
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(4px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 720,
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>Preview Video</div>
          <button
            type="button"
            onClick={onClose}
            title={t('Tutup')}
            style={{
              width: 28,
              height: 28,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              color: 'var(--text2)',
              fontSize: 14,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ background: '#000', aspectRatio: '16 / 9' }}>
          <video
            ref={videoRef}
            src={src}
            controls
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
          />
        </div>

        <div style={{ padding: 14, display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={togglePlay} style={previewBtn('var(--accent)', '#fff')}>
              {playing ? (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="4" width="4" height="16" />
                    <rect x="14" y="4" width="4" height="16" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  Play
                </>
              )}
            </button>
            <button type="button" onClick={stop} style={previewBtn('var(--bg3)', 'var(--text)')}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
              Stop
            </button>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" onClick={onGanti} style={previewBtn('var(--bg3)', 'var(--text)')}>
              {t('Ganti')}
            </button>
            <button type="button" onClick={onHapus} style={previewBtn('rgba(255,107,107,0.15)', '#ff6b6b')}>
              {t('Hapus')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const cancelUploadBtn: React.CSSProperties = {
  height: 26,
  padding: '0 12px',
  background: 'var(--bg2)',
  color: '#ff6b6b',
  border: '1px solid rgba(255,107,107,0.3)',
  borderRadius: 6,
  fontSize: 11,
  fontWeight: 500,
  cursor: 'pointer',
}

function rowActionBtn(color: string): React.CSSProperties {
  return {
    height: 28,
    padding: '0 10px',
    background: 'var(--bg2)',
    color,
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 11,
    fontWeight: 500,
    cursor: 'pointer',
    flexShrink: 0,
  }
}

function previewBtn(bg: string, color: string): React.CSSProperties {
  return {
    height: 34,
    padding: '0 14px',
    background: bg,
    color,
    border: bg.includes('var(--bg3)') ? '1px solid var(--border)' : 'none',
    borderRadius: 8,
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  }
}

function ActiveTypeButton({
  isActive,
  label,
  onActivate,
}: {
  isActive: boolean
  label: string
  onActivate: () => void
}) {
  const t = useT()
  // Both states share identical width & height. Only the inner text and
  // colors swap. This keeps the button position stable across toggles.
  return (
    <button
      type="button"
      onClick={onActivate}
      title={isActive ? `${label} ${t('sedang aktif')}` : `${t('Klik untuk aktifkan')} ${label}`}
      style={{
        width: 130,
        height: 36,
        padding: 0,
        background: isActive ? 'rgba(67,217,162,0.15)' : 'var(--bg3)',
        color: isActive ? '#43d9a2' : 'var(--text2)',
        border: `1px solid ${isActive ? 'rgba(67,217,162,0.5)' : 'var(--border)'}`,
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 600,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 4,
          background: isActive ? '#43d9a2' : 'var(--text2)',
          flexShrink: 0,
          boxShadow: isActive ? '0 0 6px rgba(67,217,162,0.7)' : 'none',
          transition: 'background 0.15s',
        }}
      />
      {isActive ? 'Active' : 'Non Active'}
    </button>
  )
}

function TypographyControls(p: TypographyProps) {
  const t = useT()
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
      <FormField label={t('Warna')}>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="color"
            value={p.color}
            onChange={(e) => p.onColorChange(e.target.value)}
            style={{
              width: 40,
              height: 36,
              padding: 2,
              border: '1px solid var(--border)',
              borderRadius: 6,
              background: 'var(--bg3)',
              cursor: 'pointer',
            }}
          />
          <input
            type="text"
            value={p.color}
            onChange={(e) => p.onColorChange(e.target.value)}
            style={{ ...inputStyle, fontFamily: 'monospace', textTransform: 'uppercase' }}
            placeholder="#ffffff"
          />
        </div>
      </FormField>

      <FormField label={t('Ukuran (px)')} hint="Desktop size">
        <input
          type="number"
          min={10}
          max={200}
          style={inputStyle}
          value={p.fontSize}
          onChange={(e) => p.onFontSizeChange(Number(e.target.value) || 0)}
        />
      </FormField>

      <FormField label="Font Weight">
        <select
          style={inputStyle as React.CSSProperties}
          value={p.fontWeight}
          onChange={(e) => p.onFontWeightChange(Number(e.target.value))}
        >
          {FONT_WEIGHTS.map((w) => (
            <option key={w.value} value={w.value}>
              {w.label}
            </option>
          ))}
        </select>
      </FormField>

      <FormField label="Font Style">
        <select
          style={inputStyle as React.CSSProperties}
          value={p.fontStyle}
          onChange={(e) => p.onFontStyleChange(e.target.value as FontStyle)}
        >
          <option value="normal">Normal</option>
          <option value="italic">Italic</option>
        </select>
      </FormField>

      <FormField label="Text Transform">
        <select
          style={inputStyle as React.CSSProperties}
          value={p.textTransform}
          onChange={(e) => p.onTextTransformChange(e.target.value as TextTransform)}
        >
          <option value="none">Normal</option>
          <option value="uppercase">UPPERCASE</option>
          <option value="lowercase">lowercase</option>
          <option value="capitalize">Capitalize</option>
        </select>
      </FormField>
    </div>
  )
}

