'use client'

import { useEffect, useRef, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { BsiAbout, AboutValueIcon } from '@/lib/website-types'
import { useRegisterPageAction } from '@/components/website/PageActionsContext'
import { PrimaryActionButton } from '@/components/website/PageActions'
import { FormField, inputStyle, textareaStyle } from '@/components/website/FormField'
import { Section } from '@/components/website/Section'
import { FileUploader } from '@/components/website/FileUploader'
import { RichTextEditor } from '@/components/website/RichTextEditor'
import { HeadlinePreview } from '@/components/website/HeadlinePreview'
import DOMPurify from 'isomorphic-dompurify'

// Mirror the public site's sanitize-keep-styles pipeline. Each
// `style="..."` is stashed into a numbered `data-bsi-style`
// placeholder before DOMPurify runs, then restored verbatim
// afterwards — bypassing the CSS scrubber entirely so font-size,
// color, etc survive the round-trip identically to public. Safe
// because the source is the admin's own authenticated Tiptap
// editor.
function sanitizeKeepStyles(
  html: string,
  config: { ALLOWED_TAGS: string[]; ALLOWED_ATTR: string[] },
): string {
  const styles: string[] = []
  const stashed = html.replace(/\sstyle="([^"]*)"/gi, (_match, value) => {
    const idx = styles.push(value) - 1
    return ` data-bsi-style="${idx}"`
  })
  const cleaned = DOMPurify.sanitize(stashed, {
    ALLOWED_TAGS: config.ALLOWED_TAGS,
    ALLOWED_ATTR: [...config.ALLOWED_ATTR, 'data-bsi-style'],
  })
  return cleaned.replace(/\sdata-bsi-style="(\d+)"/g, (_m, idx) => {
    const value = styles[Number(idx)]
    if (!value) return ''
    return ` style="${value.replace(/"/g, '&quot;')}"`
  })
}

type Stat = { label: string; value: string }
type Value = { name: string; desc: string; icon: AboutValueIcon }

type FormState = Omit<BsiAbout, 'id' | 'updated_at'>

const ICON_OPTIONS: { value: AboutValueIcon; label: string }[] = [
  { value: 'globe', label: 'Globe — global / international' },
  { value: 'film', label: 'Film — cinematic / quality' },
  { value: 'star', label: 'Star — brand / prominence' },
  { value: 'users', label: 'Users — collaboration / team' },
  { value: 'check', label: 'Check — accountability / done' },
  { value: 'refresh', label: 'Refresh — evolution / iterate' },
]

/** Pre-populated defaults that mirror what the public About page
 *  shows when the bsi_about row is empty. Editing these in admin
 *  immediately replaces the matching public copy. Updating here
 *  also keeps the form's "open" state aligned with what visitors
 *  actually see on bentalastudio.com/about. */
const EMPTY_FORM: FormState = {
  story_title: 'OUR\nVISION',
  story_body:
    'Bentala is a creative ecosystem born in Indonesia, blending cinematic production with global perspective for indonesian brands ready to step on the world stage.',
  story_cta_url: 'https://wa.me/6281284731599?text=Hi%20Bentala%20Studio!',
  hero_overlay_image_url: null,
  // Position is no longer used by the public hero — image now
  // renders as a fixed top banner. Field is kept for backwards
  // DB compat; default null avoids saving stale anchor data.
  hero_overlay_position: null,
  story_eyebrow: 'Our Story',
  story_heading: 'Born in **Indonesia.**\n*Made* for the world.',
  story_paragraph:
    'Bentala adalah **creative ecosystem** yang menggabungkan kekuatan dua entitas — satu membangun narasi, satu memproduksi visual. Bersama, kami membawa perspektif Indonesia ke skala global.',
  story_video_url: null,
  entity_1_logo_url: null,
  entity_2_logo_url: null,
  entity_1_desc:
    'Media platform yang menyajikan informasi internasional berkaitan dengan Indonesia — membangun narasi global dari dalam negeri.',
  entity_2_desc:
    'Creative agency dengan kapabilitas produksi internasional — menghasilkan konten sinematik yang membawa brand Indonesia ke panggung dunia.',
  vision_text:
    "To be Indonesia's leading creative ecosystem — recognized regionally for building global narratives and helping Indonesian brands elevate their perspective and positioning on the world stage.",
  mission_text:
    "We build strong, consistent brand identities. We elevate company reputation through world-class content. We develop personal branding for leaders and public figures. We tell Indonesia's stories from every corner of the globe.",
  edge_text:
    'We produce content internationally — giving your brand visuals that stand out in every feed, every story, every scroll.',
  vision_text_line_height: 1.55,
  mission_text_line_height: 1.55,
  edge_text_line_height: 1.55,
  vision_image_url: null,
  mission_image_url: null,
  edge_image_url: null,
  hero_grid_image_urls: [],
  hero_banner_image_url: null,
  hero_banner_image_url_mobile: null,
  contact_email: null,
  stats: [
    { value: '4', label: 'Core Creatives' },
    { value: '5+', label: 'Countries' },
    { value: '2', label: 'Active Brands' },
    { value: '∞', label: 'Ideas' },
  ],
  values: [
    {
      name: 'Think Global',
      desc: "We don't limit ourselves to what's available locally. Every project is approached with a global mindset and international production standards.",
      icon: 'globe',
    },
    {
      name: 'Cinematic Quality',
      desc: 'Everything we produce is crafted with cinematic intention. No shortcuts, no generic templates — only content that earns attention.',
      icon: 'film',
    },
    {
      name: 'Brand First',
      desc: 'Every decision starts with your brand. We obsess over how your story looks, feels, and lands — before we ever hit record.',
      icon: 'star',
    },
    {
      name: 'Collaborate Deep',
      desc: "We don't just execute briefs. We become partners — understanding your audience, your goals, and your voice at every stage.",
      icon: 'users',
    },
    {
      name: 'Own It',
      desc: 'We take full responsibility for our work — the strategy, the execution, the results. No excuses. Just accountability and growth.',
      icon: 'check',
    },
    {
      name: 'Always Evolve',
      desc: 'Trends change. Platforms shift. We stay ahead — constantly learning, experimenting, and refining our craft.',
      icon: 'refresh',
    },
  ],
  principles_title: 'The Six Principles',
  cta_title: 'Ready to *create*\nsomething **great**?',
}

export default function AboutEditorPage() {
  const supabase = getSupabase()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<Date | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aboutId, setAboutId] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)

  useEffect(() => {
    async function load() {
      const { data, error } = await supabase
        .from('bsi_about')
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
        setAboutId(data.id)
        // Migrate any legacy `values` rows that still use the old
        // {title, body} shape to the new {name, desc, icon} shape
        // expected by the public ValuesGrid. Preserves user data
        // — title→name, body→desc, icon defaults to "globe".
        const rawValues = Array.isArray(data.values) ? data.values : []
        const normalisedValues: Value[] = rawValues.map((v: unknown) => {
          const obj = v as Record<string, unknown>
          return {
            name: (obj.name ?? obj.title ?? '') as string,
            desc: (obj.desc ?? obj.body ?? '') as string,
            icon: ((obj.icon as AboutValueIcon | undefined) ?? 'globe') as AboutValueIcon,
          }
        })
        const row = data as unknown as Record<string, unknown>
        setForm({
          story_title: data.story_title || EMPTY_FORM.story_title,
          story_body: data.story_body || EMPTY_FORM.story_body,
          story_cta_url: data.story_cta_url || EMPTY_FORM.story_cta_url,
          // Hero overlay image fields fall back to null/default
          // position when the DB columns haven't been added yet —
          // form still opens cleanly without a migration.
          hero_overlay_image_url: (row.hero_overlay_image_url as string | null) ?? null,
          hero_overlay_position: null,
          story_eyebrow: (row.story_eyebrow as string | null) ?? EMPTY_FORM.story_eyebrow,
          story_heading: (row.story_heading as string | null) ?? EMPTY_FORM.story_heading,
          story_paragraph: (row.story_paragraph as string | null) ?? EMPTY_FORM.story_paragraph,
          story_video_url: (row.story_video_url as string | null) ?? null,
          entity_1_logo_url: (row.entity_1_logo_url as string | null) ?? null,
          entity_2_logo_url: (row.entity_2_logo_url as string | null) ?? null,
          entity_1_desc:
            (row.entity_1_desc as string | null) ?? EMPTY_FORM.entity_1_desc,
          entity_2_desc:
            (row.entity_2_desc as string | null) ?? EMPTY_FORM.entity_2_desc,
          vision_text: data.vision_text || EMPTY_FORM.vision_text,
          mission_text: data.mission_text || EMPTY_FORM.mission_text,
          edge_text: data.edge_text || EMPTY_FORM.edge_text,
          vision_text_line_height:
            (row.vision_text_line_height as number | null) ?? 1.55,
          mission_text_line_height:
            (row.mission_text_line_height as number | null) ?? 1.55,
          edge_text_line_height:
            (row.edge_text_line_height as number | null) ?? 1.55,
          vision_image_url: (row.vision_image_url as string | null) ?? null,
          mission_image_url: (row.mission_image_url as string | null) ?? null,
          edge_image_url: (row.edge_image_url as string | null) ?? null,
          hero_grid_image_urls: Array.isArray(row.hero_grid_image_urls)
            ? (row.hero_grid_image_urls as string[])
            : [],
          hero_banner_image_url:
            (row.hero_banner_image_url as string | null) ?? null,
          hero_banner_image_url_mobile:
            (row.hero_banner_image_url_mobile as string | null) ?? null,
          contact_email: (row.contact_email as string | null) ?? null,
          stats: Array.isArray(data.stats) && data.stats.length > 0 ? data.stats : EMPTY_FORM.stats,
          values: normalisedValues.length > 0 ? normalisedValues : EMPTY_FORM.values,
          principles_title:
            (row.principles_title as string | null) ?? EMPTY_FORM.principles_title,
          cta_title: (row.cta_title as string | null) ?? EMPTY_FORM.cta_title,
        })
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
    const payload = { ...form, updated_at: new Date().toISOString() }

    const { data, error } = aboutId
      ? await supabase.from('bsi_about').update(payload).eq('id', aboutId).select().single()
      : await supabase.from('bsi_about').insert(payload).select().single()

    if (error) {
      setError(`${error.message}${error.hint ? ' — ' + error.hint : ''}`)
      alert(`Simpan gagal: ${error.message}`)
      setSaving(false)
      return
    }

    if (data) setAboutId(data.id)
    setSavedAt(new Date())
    setSaving(false)
  }

  useRegisterPageAction(
    loading ? null : (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {savedAt && (
          <span style={{ fontSize: 11, color: 'var(--accent3)' }}>
            Tersimpan {savedAt.toLocaleTimeString('id-ID')}
          </span>
        )}
        <PrimaryActionButton onClick={handleSave} disabled={saving}>
          {saving ? 'Menyimpan…' : 'Simpan'}
        </PrimaryActionButton>
      </div>
    ),
  )

  if (loading) {
    return <div style={{ padding: 24, color: 'var(--text2)', fontSize: 13 }}>Memuat…</div>
  }

  return (
    <>
      <div style={{ padding: 24 }}>
        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 28 }}>
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

          <Section title="Hero Banner">
            <FormField label="Banner Image (Desktop)">
              <FileUploader
                value={form.hero_banner_image_url}
                onChange={(url) => update('hero_banner_image_url', url)}
                prefix="about-hero-banner"
                accept="image"
                previewHeight={220}
              />
            </FormField>
            <FormField label="Banner Image (Mobile)">
              <FileUploader
                value={form.hero_banner_image_url_mobile}
                onChange={(url) => update('hero_banner_image_url_mobile', url)}
                prefix="about-hero-banner-mobile"
                accept="image"
                previewHeight={220}
              />
              <p style={{ fontSize: 12, color: 'var(--text2)', marginTop: 6 }}>
                Opsional. Tampil di layar HP dengan rasio <b>9:16</b>{' '}
                (portrait) — utuh tanpa terpotong. Kalau kosong, banner
                desktop dipakai.
              </p>
            </FormField>
          </Section>

          <Section title="Cinematic Video">
            <FormField label="Video URL">
              <input
                style={inputStyle}
                value={form.story_video_url ?? ''}
                onChange={(e) => update('story_video_url', e.target.value || null)}
                placeholder="https://your-cdn.com/video.mp4"
              />
            </FormField>

            <FormField label="Or upload file">
              <FileUploader
                value={form.story_video_url ?? null}
                onChange={(url) => update('story_video_url', url)}
                prefix="about-story-video"
                accept="video"
                previewHeight={180}
              />
            </FormField>
          </Section>

          <Section title="Entity Cards">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <FormField label="Logo">
                  <FileUploader
                    value={form.entity_1_logo_url}
                    onChange={(url) => update('entity_1_logo_url', url)}
                    prefix="about-entity"
                    accept="image"
                    previewHeight={120}
                  />
                </FormField>
                <FormField label="Description">
                  <textarea
                    style={textareaStyle}
                    rows={4}
                    value={form.entity_1_desc ?? ''}
                    onChange={(e) => update('entity_1_desc', e.target.value)}
                    placeholder="Short description (1-2 sentences)"
                  />
                </FormField>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <FormField label="Logo">
                  <FileUploader
                    value={form.entity_2_logo_url}
                    onChange={(url) => update('entity_2_logo_url', url)}
                    prefix="about-entity"
                    accept="image"
                    previewHeight={120}
                  />
                </FormField>
                <FormField label="Description">
                  <textarea
                    style={textareaStyle}
                    rows={4}
                    value={form.entity_2_desc ?? ''}
                    onChange={(e) => update('entity_2_desc', e.target.value)}
                    placeholder="Short description (1-2 sentences)"
                  />
                </FormField>
              </div>
            </div>
          </Section>

          <Section title="Vision · Mission · Edge">
            <PhilosophyList
              items={[
                {
                  key: 'vision',
                  label: 'Vision',
                  num: '01',
                  text: form.vision_text,
                  imageUrl: form.vision_image_url ?? null,
                  onTextChange: (v) => update('vision_text', v),
                  onImageChange: (url) => update('vision_image_url', url),
                  placeholder: "To be Indonesia's leading creative ecosystem…",
                },
                {
                  key: 'mission',
                  label: 'Mission',
                  num: '02',
                  text: form.mission_text,
                  imageUrl: form.mission_image_url ?? null,
                  onTextChange: (v) => update('mission_text', v),
                  onImageChange: (url) => update('mission_image_url', url),
                  placeholder: 'We build strong brand identities…',
                },
                {
                  key: 'edge',
                  label: 'Edge',
                  num: '03',
                  text: form.edge_text,
                  imageUrl: form.edge_image_url ?? null,
                  onTextChange: (v) => update('edge_text', v),
                  onImageChange: (url) => update('edge_image_url', url),
                  placeholder: 'We produce content internationally…',
                },
              ]}
            />
          </Section>

          <Section title="The Six Principles">
            <HeadlinePreview
              variant="principles"
              source={
                (form.principles_title && form.principles_title.trim()) ||
                EMPTY_FORM.principles_title ||
                ''
              }
            />
            <RichTextEditor
              value={form.principles_title ?? ''}
              onChange={(html) => update('principles_title', html)}
              placeholder="The Six Principles"
              minHeight={100}
            />

            <FormField label="6 Values">
              <ValuesEditor values={form.values} onChange={(values) => update('values', values)} />
            </FormField>
          </Section>

          <Section title="CTA Band">
            <HeadlinePreview
              variant="cta"
              source={
                (form.cta_title && form.cta_title.trim()) ||
                EMPTY_FORM.cta_title ||
                ''
              }
            />
            <RichTextEditor
              value={form.cta_title ?? ''}
              onChange={(html) => update('cta_title', html)}
              placeholder={'Ready to *create*\nsomething **great**?'}
              minHeight={120}
            />

            <FormField label="Contact Email">
              <input
                type="email"
                style={inputStyle}
                value={form.contact_email ?? ''}
                onChange={(e) => update('contact_email', e.target.value || null)}
                placeholder="hello@bentalastudio.id"
              />
            </FormField>
          </Section>
        </div>
      </div>
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Mini markdown-lite renderer + live preview card for the
// "Born in Indonesia" headline composition. Mirrors the same
// `**word**` → cyan / `*word*` → italic-serif rules the public
// StorySection uses, so what the admin types here is exactly
// what site visitors will see.
// ─────────────────────────────────────────────────────────────────
function renderHeadlineMarkdown(
  source: string,
  opts: { boldColor: string; italicFamily?: string; allowBreaks?: boolean },
): React.ReactNode[] {
  const { boldColor, italicFamily, allowBreaks = false } = opts
  const tokens = source.split(/(\*\*[^*\n]+\*\*|\*[^*\n]+\*|\n)/g)
  return tokens.map((tok, i) => {
    if (!tok) return null
    if (tok === '\n') return allowBreaks ? <br key={i} /> : ' '
    if (tok.startsWith('**') && tok.endsWith('**') && tok.length > 4) {
      return (
        <span key={i} style={{ color: boldColor, fontWeight: 800 }}>
          {tok.slice(2, -2)}
        </span>
      )
    }
    if (tok.startsWith('*') && tok.endsWith('*') && tok.length > 2) {
      return (
        <span
          key={i}
          style={{
            fontFamily: italicFamily ?? 'Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 500,
            letterSpacing: '-0.01em',
            color: 'rgba(240,244,255,0.92)',
          }}
        >
          {tok.slice(1, -1)}
        </span>
      )
    }
    return <span key={i}>{tok}</span>
  })
}

// Detect whether a stored value is HTML (from RichTextEditor) or
// the legacy markdown-lite syntax (`**word**` / `*word*`). Any
// presence of an HTML tag flips us into HTML mode; otherwise we
// fall back to the markdown renderer so older content keeps
// rendering correctly.
function looksLikeHtml(s: string): boolean {
  return /<\/?[a-z][\s\S]*?>/i.test(s)
}

// Unwrap Tiptap's `<p>` blocks into `display:block` line
// wrappers. When the inner content carries a custom `font-size`
// (rich-text editor), we LIFT that size onto the wrapper too —
// otherwise the wrapper's CSS strut inherits the heading's
// viewport-scaled clamp font-size and the gap between lines
// drifts as the viewport changes. With the lift + `line-height:
// 1`, each block collapses to exactly its content's height,
// making the layout stable across breakpoints.
function stripOuterParagraphs(html: string): string {
  if (!/<p\b[^>]*>/i.test(html)) return html
  const pattern = /<p\b[^>]*>([\s\S]*?)<\/p>/gi
  const collected = Array.from(html.matchAll(pattern), (m) => m[1].trim())
  if (collected.length === 0) {
    return html.replace(/<\/?p\b[^>]*>/gi, '')
  }
  const FONT_SIZE_RE = /font-size:\s*([\d.]+(?:px|em|rem|pt|%))/i
  return collected
    .filter(Boolean)
    .map((line) => {
      const match = line.match(FONT_SIZE_RE)
      const sizeDecl = match ? `;font-size:${match[1]}` : ''
      return `<span style="display:block;line-height:1${sizeDecl}">${line}</span>`
    })
    .join('')
}

// Process `**...**` / `*...*` patterns that survived inside HTML
// strings (e.g. users typed asterisks into the rich editor and
// Tiptap stored them as literal text). Mirrors the regex pass the
// public site does so preview === live view.
function inlineMarkdownToHtml(
  html: string,
  opts: { boldStyle: string; italicStyle: string },
): string {
  return html
    .replace(
      /\*\*([^*<>\n]+)\*\*/g,
      `<span style="${opts.boldStyle}">$1</span>`,
    )
    .replace(
      /(^|[^*])\*([^*<>\n]+)\*(?!\*)/g,
      `$1<span style="${opts.italicStyle}">$2</span>`,
    )
}

// Render a string of trusted-source HTML safely. Caller is
// responsible for ensuring `html` came from a DOMPurify pass.
// Kept as a single named component so the (intentional)
// dangerouslySetInnerHTML usage lives in one explicit place.
function SanitizedHtml({
  html,
  as: As = 'div',
  style,
  markdown,
}: {
  html: string
  as?: 'div' | 'h3' | 'p'
  style?: React.CSSProperties
  markdown?: { boldStyle: string; italicStyle: string }
}) {
  // Route through sanitizeKeepStyles so Tiptap-saved inline
  // styles (font-size, color, font-weight) survive intact and
  // the preview matches the public site one-to-one.
  const sanitized = sanitizeKeepStyles(html, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'b', 'i', 'u', 's', 'span',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a',
    ],
    ALLOWED_ATTR: ['style', 'class', 'href', 'target', 'rel'],
  })
  const unwrapped = stripOuterParagraphs(sanitized)
  const processed = markdown ? inlineMarkdownToHtml(unwrapped, markdown) : unwrapped
  return <As style={style} dangerouslySetInnerHTML={{ __html: processed }} />
}

// Render children at the user's ACTUAL browser viewport content
// width (innerWidth − 104, mirroring the public site's 52px
// horizontal section padding), then scale the whole subtree down
// with CSS transform to fit the admin's preview card. The inner
// content area is identical to what the public renders at the
// current viewport — so vw/clamp typography, line wrapping, and
// proportions all resolve the same way. The transform just
// shrinks the result so it fits the dashboard panel.
function PublicViewportSimulator({ children }: { children: React.ReactNode }) {
  const outerRef = useRef<HTMLDivElement>(null)
  const innerRef = useRef<HTMLDivElement>(null)
  const [contentWidth, setContentWidth] = useState(1336) // 1440 − 104 fallback
  const [scale, setScale] = useState(1)
  const [scaledHeight, setScaledHeight] = useState(0)

  useEffect(() => {
    const outer = outerRef.current
    const inner = innerRef.current
    if (!outer || !inner) return

    const update = () => {
      const viewportWidth = window.innerWidth
      // 52px section padding on each side of the public site.
      const newContentWidth = Math.max(640, viewportWidth - 104)
      const outerWidth = outer.offsetWidth
      const newScale = outerWidth > 0 ? Math.min(1, outerWidth / newContentWidth) : 1
      const innerHeight = inner.offsetHeight

      setContentWidth(newContentWidth)
      setScale(newScale)
      setScaledHeight(innerHeight * newScale)
    }

    update()
    // Window resize changes the simulated viewport; ResizeObserver
    // on the inner element catches font-load / text-change reflows
    // that change the rendered height.
    const ro = new ResizeObserver(update)
    ro.observe(outer)
    ro.observe(inner)
    window.addEventListener('resize', update)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div
      ref={outerRef}
      style={{ width: '100%', height: scaledHeight, overflow: 'hidden' }}
    >
      <div
        ref={innerRef}
        style={{
          width: contentWidth,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  )
}

function StoryHeadlinePreview({
  heading,
  paragraph,
}: {
  heading: string
  paragraph: string
}) {
  const headingIsHtml = looksLikeHtml(heading)
  const paragraphIsHtml = looksLikeHtml(paragraph)

  // Public site styles, used VERBATIM inside the simulated 1440px
  // viewport below. Because the simulator scales the entire subtree
  // by the same factor, clamp/vw values resolve once at 1440 and
  // then the result is uniformly downscaled — so what the admin
  // sees matches what visitors will see at the same viewport.
  const headingStyle: React.CSSProperties = {
    margin: 0,
    fontFamily: '"Open Sauce Sans", sans-serif',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '-0.012em',
    lineHeight: 0.94,
    color: '#fff',
    fontSize: 'clamp(40px, 7vw, 132px)',
    maxWidth: 'none',
    marginLeft: 'auto',
    marginRight: 'auto',
  }
  const paragraphStyle: React.CSSProperties = {
    margin: '24px auto 0',
    fontFamily: '"Open Sauce Sans", sans-serif',
    maxWidth: 'none',
    fontSize: 'clamp(18px, 1.8vw, 26px)',
    lineHeight: 1.6,
    letterSpacing: '-0.01em',
    color: 'rgba(240,244,255,0.78)',
  }

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
        Live preview · sesuai tampilan public site
      </div>
      <PublicViewportSimulator>
        {headingIsHtml ? (
          <SanitizedHtml
            html={heading}
            as="h3"
            style={headingStyle}
            markdown={{
              boldStyle: 'color:#0B3DE7;font-weight:900',
              italicStyle:
                'font-family:Georgia,serif;font-style:italic;font-weight:500;letter-spacing:-0.01em;color:rgba(240,244,255,0.92)',
            }}
          />
        ) : (
          <h3 style={headingStyle}>
            {renderHeadlineMarkdown(heading, {
              boldColor: '#0B3DE7',
              allowBreaks: true,
            })}
          </h3>
        )}
        {paragraphIsHtml ? (
          <SanitizedHtml
            html={paragraph}
            as="p"
            style={paragraphStyle}
            markdown={{
              boldStyle: 'color:#fff;font-weight:600',
              italicStyle:
                'font-family:Georgia,serif;font-style:italic;font-weight:500;letter-spacing:-0.01em;color:rgba(240,244,255,0.9)',
            }}
          />
        ) : (
          <p style={paragraphStyle}>
            {renderHeadlineMarkdown(paragraph, { boldColor: '#fff' })}
          </p>
        )}
      </PublicViewportSimulator>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Combined live preview for the three Vision/Mission/Edge rows.
// Wraps the entire section in PublicViewportSimulator so the
// admin sees a pixel-perfect scaled mirror of how the public site
// will render — same alternating layout, same image placement,
// same paragraph styling (including any inline font-size / color
// the editor sets via the per-card RichTextEditor).
// ─────────────────────────────────────────────────────────────────
type PhilosophyPreviewItem = {
  label: string
  num: string
  text: string
  imageUrl: string | null
  /** Optional unitless CSS line-height for the description.
   *  Defaults to 1.55 (the public site's baseline). */
  lineHeight?: number
}

function PhilosophyPreview({ items }: { items: PhilosophyPreviewItem[] }) {
  // Mirror the public site's paragraph styling exactly: clamp
  // typography, soft-white color, tight letter-spacing, max width
  // for readable line length. Inline font-size / color set by the
  // editor still wins via cascade because span-level styles take
  // priority over this element-level rule.
  const paragraphStyle: React.CSSProperties = {
    margin: 0,
    // CRITICAL: match the public site's font stack exactly.
    // Admin's Tailwind sans is "Segoe UI" while public's is
    // "Open Sauce Sans" — different glyph widths break line
    // wrapping parity, which is the bug we keep chasing.
    fontFamily: '"Open Sauce Sans", sans-serif',
    fontSize: 'clamp(20px, 1.8vw, 28px)',
    color: 'rgba(255,255,255,0.85)',
    lineHeight: 1.55,
    letterSpacing: '-0.01em',
    // No max-width cap — text fills the full text column,
    // matching the public site exactly.
    maxWidth: 'none',
  }

  return (
    <div
      style={{
        position: 'relative',
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(11,61,231,0.14) 0%, transparent 60%), linear-gradient(180deg, #08090d 0%, #04060c 100%)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        padding: '24px 24px 36px',
        marginBottom: 4,
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
          textAlign: 'center',
        }}
      >
        Live preview · sesuai tampilan public site
      </div>
      <PublicViewportSimulator>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 128 }}>
          {items.map((item, i) => {
            const reversed = i % 2 === 1
            const isHtml = looksLikeHtml(item.text)

            // Paragraph default styling. Per-selection line-height
            // (set via RichTextEditor's "Spacing baris" dropdown)
            // is stored as inline style on the span itself and
            // overrides this default automatically through normal
            // CSS cascade.
            const styledParagraph: React.CSSProperties = paragraphStyle
            const textColumn = (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: reversed ? 'flex-end' : 'flex-start',
                  textAlign: reversed ? 'right' : 'left',
                  gridColumn: reversed ? 2 : 1,
                }}
              >
                {isHtml ? (
                  <SanitizedHtml
                    html={item.text}
                    as="p"
                    style={styledParagraph}
                    markdown={{
                      boldStyle: 'color:#fff;font-weight:600',
                      italicStyle:
                        'font-family:Georgia,serif;font-style:italic;font-weight:500;letter-spacing:-0.01em;color:rgba(240,244,255,0.9)',
                    }}
                  />
                ) : (
                  <p style={styledParagraph}>
                    {renderHeadlineMarkdown(item.text, { boldColor: '#fff' })}
                  </p>
                )}
              </div>
            )

            const visualColumn = (
              <div style={{ gridColumn: reversed ? 1 : 2 }}>
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={item.label}
                    style={{
                      width: '100%',
                      height: 'auto',
                      display: 'block',
                      borderRadius: 16,
                      boxShadow: '0 30px 80px -30px rgba(0,0,0,0.6)',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      gap: 12,
                      justifyContent: reversed ? 'flex-end' : 'flex-start',
                      paddingLeft: reversed ? 0 : 32,
                      paddingRight: reversed ? 32 : 0,
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 700,
                        color: '#0B3DE7',
                        lineHeight: 1,
                        letterSpacing: '-0.02em',
                        fontSize: 'clamp(120px, 16vw, 240px)',
                      }}
                    >
                      {item.num}
                    </span>
                    <span
                      style={{
                        display: 'inline-block',
                        width: 64,
                        height: 1,
                        background: '#0B3DE7',
                      }}
                    />
                  </div>
                )}
              </div>
            )

            return (
              <div
                key={item.label}
                // Match the public site's responsive grid gap
                // (gap-10 / md:gap-12 / lg:gap-20). The simulator
                // renders at the user's actual browser viewport,
                // so the same Tailwind breakpoints apply and the
                // column widths land on the same pixels as public.
                className="grid grid-cols-2 items-center gap-10 md:gap-12 lg:gap-20"
              >
                {textColumn}
                {visualColumn}
              </div>
            )
          })}
        </div>
      </PublicViewportSimulator>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Compact list view of Vision/Mission/Edge with per-row "Edit"
// buttons. Each row shows a 4:3 thumbnail + a one-line text
// preview so the editor can see what's currently saved at a
// glance, without taking up vertical space for three full
// editors. Clicking Edit opens PhilosophyEditDialog, which holds
// the actual rich-text editor, image uploader, and live preview.
// ─────────────────────────────────────────────────────────────────
type PhilosophyListItem = {
  key: string
  label: string
  num: string
  text: string
  imageUrl: string | null
  onTextChange: (v: string) => void
  onImageChange: (url: string | null) => void
  placeholder?: string
}

function PhilosophyList({ items }: { items: PhilosophyListItem[] }) {
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const editingItem = items.find((it) => it.key === editingKey) ?? null

  // Strip HTML to plain text for the one-line preview snippet.
  // We only need a glanceable summary in the list row; full
  // rich-text rendering lives inside the dialog preview.
  const stripHtml = (html: string) =>
    html
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim()

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {items.map((item) => {
          const snippet = stripHtml(item.text)
          return (
            <div
              key={item.key}
              style={{
                display: 'flex',
                alignItems: 'stretch',
                gap: 14,
                background: 'var(--bg2)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 14,
                transition: 'border-color 0.18s ease',
              }}
            >
              {/* Thumbnail — 4:3 to mirror the public site frame. */}
              <div
                style={{
                  position: 'relative',
                  width: 120,
                  aspectRatio: '4 / 3',
                  flexShrink: 0,
                  background: 'var(--bg3)',
                  borderRadius: 8,
                  overflow: 'hidden',
                }}
              >
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.imageUrl}
                    alt={`${item.label} preview`}
                    style={{
                      position: 'absolute',
                      inset: 0,
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                    }}
                  />
                ) : (
                  <div
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 32,
                      fontWeight: 800,
                      color: 'rgba(11,61,231,0.6)',
                      letterSpacing: '-0.02em',
                    }}
                  >
                    {item.num}
                  </div>
                )}
              </div>

              {/* Label + text snippet */}
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.16em',
                    textTransform: 'uppercase',
                    color: 'var(--text)',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    lineHeight: 1.5,
                    color: 'var(--text2)',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {snippet || (
                    <span style={{ fontStyle: 'italic', opacity: 0.6 }}>
                      Belum diisi — klik Edit untuk menambah deskripsi.
                    </span>
                  )}
                </div>
              </div>

              {/* Action */}
              <button
                type="button"
                onClick={() => setEditingKey(item.key)}
                style={{
                  alignSelf: 'center',
                  padding: '8px 16px',
                  background: 'var(--accent)',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 8,
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'opacity 0.18s ease, transform 0.18s ease',
                }}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.85'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.opacity = '1'
                }}
              >
                Edit
              </button>
            </div>
          )
        })}
      </div>

      {editingItem && (
        <PhilosophyEditDialog
          item={editingItem}
          onClose={() => setEditingKey(null)}
        />
      )}
    </>
  )
}

// ─────────────────────────────────────────────────────────────────
// Modal editor for one Vision/Mission/Edge row. Hosts the live
// preview (single-row mirror of the public layout), the
// RichTextEditor for the description copy, and a FileUploader
// for the 4:3 image. Saves back into the parent form on every
// keystroke via the `onTextChange` / `onImageChange` callbacks,
// so closing the modal is equivalent to "OK" — there's no
// separate save step at this level.
// ─────────────────────────────────────────────────────────────────
function PhilosophyEditDialog({
  item,
  onClose,
}: {
  item: PhilosophyListItem
  onClose: () => void
}) {
  // Snapshot the row's text + image at the moment the modal
  // opens so the Cancel button can roll back to it. Edits flow
  // straight into the parent form state on each keystroke
  // (auto-save) — Cancel reverses that flow by writing the
  // snapshot back through the same callbacks.
  const initialRef = useRef({ text: item.text, imageUrl: item.imageUrl })

  const handleCancel = () => {
    item.onTextChange(initialRef.current.text)
    item.onImageChange(initialRef.current.imageUrl)
    onClose()
  }

  // Escape key + backdrop click both behave like Cancel — safer
  // default since the user might dismiss accidentally.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Lock body scroll while the modal is open so the backdrop
  // overlay actually behaves as a modal and not a transparent
  // overlay over a scrollable page.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      onClick={handleCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(6px)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        padding: '40px 20px',
        overflow: 'auto',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: 980,
          background: 'var(--bg)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 28,
          display: 'flex',
          flexDirection: 'column',
          gap: 20,
          boxShadow: '0 30px 80px -20px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header — title + close button */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h3 style={{ margin: 0, fontSize: 22, fontWeight: 700 }}>
            {item.label}
          </h3>
          <DialogCloseButton onClick={handleCancel} />
        </div>

        {/* Live preview — single row of the public layout */}
        <PhilosophyPreview
          items={[
            {
              label: item.label,
              num: item.num,
              text: item.text,
              imageUrl: item.imageUrl,
            },
          ]}
        />

        {/* Editors — text on the left, image on the right */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 280px',
            gap: 20,
            alignItems: 'start',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--text2)',
              }}
            >
              Deskripsi
            </label>
            {/* Spacing antar baris is now a toolbar dropdown inside
                RichTextEditor itself ("Spacing baris" button) —
                applied as an inline style on the selected span,
                so it scopes per-selection instead of per-row. */}
            <RichTextEditor
              value={item.text}
              onChange={item.onTextChange}
              placeholder={item.placeholder}
              minHeight={220}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'var(--text2)',
              }}
            >
              Image
            </label>
            <FileUploader
              value={item.imageUrl}
              onChange={(url) => item.onImageChange(url)}
              prefix="about-philosophy"
              accept="image"
              previewHeight={180}
              hint="4:3 ratio · 1200×900 px"
            />
          </div>
        </div>

        {/* Footer — Cancel reverts to snapshot, Save just closes
            (edits are already in form state; persisting to DB
            happens via the global Save Changes button at the
            bottom of the page). */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 10,
            paddingTop: 16,
            borderTop: '1px solid var(--border)',
          }}
        >
          <button
            type="button"
            onClick={handleCancel}
            style={{
              padding: '10px 22px',
              background: 'transparent',
              color: 'var(--text)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.18s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--bg2)'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '10px 24px',
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'opacity 0.18s ease',
            }}
            onMouseEnter={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.opacity = '0.88'
            }}
            onMouseLeave={(e) => {
              ;(e.currentTarget as HTMLButtonElement).style.opacity = '1'
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Multi-image uploader for the About story carousel. Renders the
// already-uploaded URLs as a wrap-friendly row of thumbnail tiles
// with reorder + delete affordances per tile, plus an Upload
// dropzone at the end that appends new images to the array.
//
// The order in the array IS the order of the marquee on the
// public site, so users can drag the thumbnails left/right to
// re-sequence the posters.
// ─────────────────────────────────────────────────────────────────
function CarouselUploader({
  urls,
  onChange,
}: {
  urls: string[]
  onChange: (next: string[]) => void
}) {
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const abortRef = useRef<(() => void) | null>(null)

  async function handleAdd() {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.multiple = true
    input.onchange = async () => {
      const files = Array.from(input.files ?? [])
      if (files.length === 0) return
      setUploading(true)
      setProgress(0)
      const supabase = getSupabase()
      const uploadedUrls: string[] = []
      try {
        for (let i = 0; i < files.length; i++) {
          const file = files[i]
          const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
          const path = `about-carousel/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
          const { error } = await supabase.storage
            .from('bsi-website')
            .upload(path, file, {
              cacheControl: '3600',
              upsert: false,
              contentType: file.type || undefined,
            })
          if (error) throw new Error(error.message)
          const { data: pub } = supabase.storage
            .from('bsi-website')
            .getPublicUrl(path)
          uploadedUrls.push(pub.publicUrl)
          setProgress(Math.round(((i + 1) / files.length) * 100))
        }
        onChange([...urls, ...uploadedUrls])
      } catch (err) {
        alert(`Upload gagal: ${err instanceof Error ? err.message : String(err)}`)
      } finally {
        setUploading(false)
        setProgress(0)
        abortRef.current = null
      }
    }
    input.click()
  }

  function handleRemove(idx: number) {
    onChange(urls.filter((_, i) => i !== idx))
  }

  function handleDragStart(idx: number) {
    setDragIndex(idx)
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === idx) return
    const next = [...urls]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(idx, 0, moved)
    setDragIndex(idx)
    onChange(next)
  }

  function handleDragEnd() {
    setDragIndex(null)
  }

  return (
    <div>
      {urls.length === 0 ? (
        <button
          type="button"
          onClick={handleAdd}
          disabled={uploading}
          style={{
            width: '100%',
            height: 160,
            background: 'var(--bg3)',
            border: `2px dashed ${uploading ? 'var(--accent)' : 'var(--border)'}`,
            borderRadius: 10,
            color: 'var(--text2)',
            fontSize: 13,
            cursor: uploading ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
          }}
        >
          {uploading ? `Mengupload ${progress}%` : '+ Pilih beberapa gambar sekaligus (multi-select)'}
        </button>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
            gap: 10,
          }}
        >
          {urls.map((url, idx) => (
            <div
              key={`${idx}-${url}`}
              draggable
              onDragStart={() => handleDragStart(idx)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDragEnd={handleDragEnd}
              style={{
                position: 'relative',
                aspectRatio: '4 / 5',
                borderRadius: 8,
                overflow: 'hidden',
                background: 'var(--bg3)',
                border: `1px solid ${dragIndex === idx ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'grab',
                opacity: dragIndex !== null && dragIndex !== idx ? 0.5 : 1,
                transition: 'border-color 0.15s, opacity 0.15s',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  pointerEvents: 'none',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  top: 6,
                  left: 6,
                  padding: '2px 7px',
                  fontSize: 10,
                  fontWeight: 700,
                  background: 'rgba(0,0,0,0.7)',
                  backdropFilter: 'blur(6px)',
                  color: '#fff',
                  borderRadius: 4,
                  letterSpacing: '0.04em',
                }}
              >
                #{idx + 1}
              </span>
              <button
                type="button"
                onClick={() => handleRemove(idx)}
                aria-label="Hapus"
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  width: 24,
                  height: 24,
                  padding: 0,
                  background: 'rgba(255,107,107,0.18)',
                  border: '1px solid rgba(255,107,107,0.4)',
                  borderRadius: 5,
                  color: '#ff6b6b',
                  fontSize: 14,
                  lineHeight: 1,
                  cursor: 'pointer',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                ×
              </button>
            </div>
          ))}

          {/* Add-more tile lives at the end of the grid so users
              can drop more posters at any time without scrolling
              to a separate button. */}
          <button
            type="button"
            onClick={handleAdd}
            disabled={uploading}
            style={{
              aspectRatio: '4 / 5',
              background: 'var(--bg3)',
              border: `2px dashed ${uploading ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 8,
              color: 'var(--text2)',
              fontSize: 12,
              cursor: uploading ? 'wait' : 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              padding: 8,
              textAlign: 'center',
            }}
          >
            {uploading ? (
              <>
                <span style={{ fontSize: 16, fontWeight: 700 }}>{progress}%</span>
                <span>Mengupload…</span>
              </>
            ) : (
              <>
                <span style={{ fontSize: 22, fontWeight: 400 }}>+</span>
                <span>Tambah</span>
              </>
            )}
          </button>
        </div>
      )}

      {urls.length > 0 && (
        <p style={{ margin: '10px 0 0', fontSize: 11, color: 'var(--text2)', opacity: 0.7 }}>
          Drag thumbnail untuk reorder · klik × untuk hapus · gambar urut #1 → #N akan
          tampil dari kiri ke kanan di marquee public site.
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Auto-compress big images before upload. Phone-camera photos are
// typically 4-12 MB at 4000+ px — way over the Supabase bucket
// file_size_limit, and pointless since the public site only
// renders these at ~600 px wide. We resize to a 2400 px ceiling
// and re-encode as JPEG quality 0.85 which lands most uploads
// well under 1 MB.
//
// Pass-through cases (return original file):
//   • non-image / GIF (preserve animation)
//   • already small (<2 MB) AND already <2400 px on both sides
// ─────────────────────────────────────────────────────────────────
async function compressImageIfLarge(file: File): Promise<File> {
  if (!file.type.startsWith('image/') && file.type !== '') return file
  if (file.type === 'image/gif') return file

  // BRUTAL preset — always compress every image to ≤ 300 KB
  // regardless of source. Public site only ever renders these
  // at ~600 px wide, so a 1200 px ceiling at q0.75 is plenty
  // sharp and stays comfortably under any conceivable Supabase
  // bucket limit (free, pro, or self-hosted).
  const MAX_DIM = 1200
  const TARGET_BYTES = 200 * 1024
  const QUALITY_STEPS = [0.8, 0.7, 0.55, 0.4]

  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('Gagal membaca dimensi gambar'))
      i.src = url
    })

    const { naturalWidth: w, naturalHeight: h } = img
    const initialScale = Math.min(1, MAX_DIM / Math.max(w, h))

    // Nested loop: outer iterates dimension, inner iterates JPEG
    // quality. We try gentle compression first; if it overshoots,
    // we shrink the canvas and lower quality together.
    let scale = initialScale
    let blob: Blob | null = null
    let finalW = 0
    let finalH = 0
    let finalQuality = QUALITY_STEPS[0]

    for (let dimStep = 0; dimStep < 6; dimStep++) {
      finalW = Math.max(1, Math.round(w * scale))
      finalH = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = finalW
      canvas.height = finalH
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(img, 0, 0, finalW, finalH)

      let underTarget = false
      for (const q of QUALITY_STEPS) {
        finalQuality = q
        blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/jpeg', q),
        )
        if (!blob) return file
        if (blob.size <= TARGET_BYTES) {
          underTarget = true
          break
        }
      }
      if (underTarget) break
      scale *= 0.65 // shrink dimensions and try again
    }
    if (!blob) return file

    const baseName = file.name.replace(/\.[^.]+$/, '') || 'image'
    const compressed = new File([blob], `${baseName}.jpg`, { type: 'image/jpeg' })
    // eslint-disable-next-line no-console
    console.log(
      `[compress] ${file.name} ${(file.size / 1024).toFixed(0)} KB → ${(compressed.size / 1024).toFixed(0)} KB (${w}×${h} → ${finalW}×${finalH} @ q${finalQuality})`,
    )
    return compressed
  } finally {
    URL.revokeObjectURL(url)
  }
}

// ─────────────────────────────────────────────────────────────────
// Card editor for one philosophy row. Mirrors the Services-list
// card aesthetic: media plate on top (image or empty-state slot),
// badged with the 01/02/03 numeral, body below holds label + the
// editable textarea. Three of these tile side-by-side on desktop,
// stack on mobile.
// ─────────────────────────────────────────────────────────────────
function PhilosophyCard({
  num,
  label,
  text,
  onTextChange,
  imageUrl,
  onImageChange,
  placeholder,
}: {
  num: string
  label: string
  text: string
  onTextChange: (v: string) => void
  imageUrl: string | null
  onImageChange: (url: string | null) => void
  placeholder?: string
}) {
  const hasImage = !!imageUrl
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  // Holds the abort handle from uploadFileWithProgress so the
  // user can cancel an in-flight XHR via the "Batalkan" button.
  // Cleared in the upload finally block.
  const abortRef = useRef<(() => void) | null>(null)

  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--bg2)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'border-color 0.18s ease, transform 0.18s ease',
      }}
      onMouseEnter={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = 'rgba(11,61,231,0.45)'
      }}
      onMouseLeave={(e) => {
        ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
      }}
    >
      {/* Media plate — fills card width at a fixed 4:3 aspect to
          mirror the public site's philosophy row image frame.
          Image inside uses object-contain so nothing is cropped
          in the preview even if the upload deviates from 4:3. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          aspectRatio: '4 / 3',
          background: 'var(--bg3)',
          overflow: 'hidden',
        }}
      >
        {hasImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={imageUrl!}
            alt={`${label} preview`}
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              background: 'var(--bg3)',
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
              gap: 6,
              color: 'var(--text2)',
              fontSize: 12,
              letterSpacing: '0.04em',
              padding: 12,
              textAlign: 'center',
            }}
          >
            <span>Belum ada gambar</span>
            <span style={{ fontSize: 10, opacity: 0.75 }}>
              Rasio 4:3 landscape · ±1200×900 px
            </span>
          </div>
        )}

        {/* Numeral badge — matches the Services VIDEO badge
            position; uses brand cyan to echo the public site's
            oversized "01/02/03" numerals. */}
        <span
          style={{
            position: 'absolute',
            top: 10,
            left: 10,
            padding: '3px 9px',
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            color: 'var(--accent)',
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: '0.08em',
            borderRadius: 4,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {num}
        </span>

        {/* Action buttons overlay — sit top-right so they don't
            collide with the numeral badge on the left. Always
            visible (not hover-only) so the affordance is obvious. */}
        <div
          style={{
            position: 'absolute',
            top: 10,
            right: 10,
            display: 'flex',
            gap: 6,
            alignItems: 'center',
          }}
        >
          {uploading && (
            <span
              style={{
                fontSize: 11,
                color: '#fff',
                background: 'rgba(0,0,0,0.7)',
                padding: '4px 9px',
                borderRadius: 6,
                fontWeight: 600,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {progress}%
            </span>
          )}
          {uploading ? (
            <PlateActionButton
              label="Batalkan"
              tone="danger"
              onClick={() => {
                abortRef.current?.()
              }}
            />
          ) : (
            <>
              <PlateActionButton
                label={hasImage ? 'Ganti' : 'Upload'}
                onClick={() => {
                  const input = document.createElement('input')
                  input.type = 'file'
                  input.accept = 'image/jpeg,image/png,image/webp,image/gif'
                  input.onchange = async () => {
                    const file = input.files?.[0]
                    if (!file) return

                    // Client-side hard cap at 200 MB. Beyond this
                    // the upload would always fail anyway and
                    // tying up bandwidth helps nobody.
                    const MAX_BYTES = 200 * 1024 * 1024
                    if (file.size > MAX_BYTES) {
                      alert(
                        `File terlalu besar (${(file.size / 1024 / 1024).toFixed(1)} MB). Maksimum 200 MB.`,
                      )
                      return
                    }

                    setUploading(true)
                    setProgress(0)
                    let cancelled = false
                    abortRef.current = () => {
                      cancelled = true
                    }
                    try {
                      // NO COMPRESSION — upload raw file as-is.
                      const supabase = getSupabase()
                      const ext = file.name.split('.').pop()?.toLowerCase() || 'bin'
                      const path = `about-philosophy/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`

                      // eslint-disable-next-line no-console
                      console.log('[upload] start', {
                        name: file.name,
                        sizeBytes: file.size,
                        sizeMB: (file.size / 1024 / 1024).toFixed(2),
                        type: file.type,
                        path,
                      })

                      setProgress(50)
                      const { error: uploadErr } = await supabase.storage
                        .from('bsi-website')
                        .upload(path, file, {
                          cacheControl: '3600',
                          upsert: false,
                          contentType: file.type || undefined,
                        })
                      if (cancelled) return
                      if (uploadErr) {
                        // eslint-disable-next-line no-console
                        console.error('[upload] supabase error', uploadErr)

                        // Server rejected. The most common cause
                        // is the bucket's file_size_limit (NOT a
                        // tier limit — Supabase respects bucket
                        // settings on every tier). Tell the user
                        // exactly which knob to turn.
                        const lower = (uploadErr.message || '').toLowerCase()
                        if (
                          lower.includes('exceeded') ||
                          lower.includes('maximum allowed size') ||
                          lower.includes('payload too large')
                        ) {
                          const sizeMB = (file.size / 1024 / 1024).toFixed(2)
                          throw new Error(
                            `Bucket "bsi-website" menolak file ${sizeMB} MB. ` +
                              `Naikkan file_size_limit di Supabase: ` +
                              `Dashboard → Storage → bsi-website → ⚙ Edit bucket → File size limit. ` +
                              `Pastikan project Supabase yang aktif benar (cek URL .env.local).`,
                          )
                        }
                        throw new Error(uploadErr.message)
                      }
                      setProgress(100)
                      const { data: pub } = supabase.storage
                        .from('bsi-website')
                        .getPublicUrl(path)
                      onImageChange(pub.publicUrl)
                    } catch (err) {
                      if (cancelled) return
                      const msg = err instanceof Error ? err.message : String(err)
                      alert(`Upload gagal: ${msg}`)
                    } finally {
                      abortRef.current = null
                      setUploading(false)
                      setProgress(0)
                    }
                  }
                  input.click()
                }}
              />
              {hasImage && (
                <PlateActionButton
                  label="Hapus"
                  tone="danger"
                  onClick={() => onImageChange(null)}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* Body — label header, then a full RichTextEditor for the
          description copy. The editor lets editors tweak font
          size, weight, color, italic, etc. per-word; everything
          stored as inline-styled HTML that the public site renders
          verbatim via `sanitizeKeepStyles`. */}
      <div
        style={{
          padding: 16,
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          flex: 1,
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: 'var(--text)',
          }}
        >
          {label}
        </div>

        <div style={{ flex: 1, minHeight: 160 }}>
          <RichTextEditor
            value={text}
            onChange={onTextChange}
            placeholder={placeholder}
            minHeight={140}
          />
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
            fontSize: 10,
            color: 'var(--text2)',
            letterSpacing: '0.04em',
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '2px 7px',
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 4,
              fontWeight: 600,
              color: 'var(--text)',
              whiteSpace: 'nowrap',
            }}
          >
            4:3 · 1200×900
          </span>
        </div>
      </div>
    </div>
  )
}

function PlateActionButton({
  label,
  onClick,
  tone = 'default',
  disabled = false,
}: {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}) {
  const isDanger = tone === 'danger'
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        height: 28,
        padding: '0 11px',
        fontSize: 11,
        fontWeight: 600,
        background: isDanger ? 'rgba(255,107,107,0.16)' : 'rgba(0,0,0,0.7)',
        backdropFilter: 'blur(8px)',
        color: isDanger ? '#ff6b6b' : '#fff',
        border: `1px solid ${isDanger ? 'rgba(255,107,107,0.4)' : 'rgba(255,255,255,0.18)'}`,
        borderRadius: 6,
        cursor: disabled ? 'wait' : 'pointer',
        opacity: disabled ? 0.7 : 1,
        letterSpacing: '0.02em',
        transition: 'background 0.15s, border-color 0.15s, transform 0.12s',
      }}
      onMouseEnter={(e) => {
        if (disabled) return
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-1px)'
        el.style.background = isDanger ? 'rgba(255,107,107,0.24)' : 'rgba(0,0,0,0.85)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(0)'
        el.style.background = isDanger ? 'rgba(255,107,107,0.16)' : 'rgba(0,0,0,0.7)'
      }}
    >
      {label}
    </button>
  )
}

function StatsEditor({ stats, onChange }: { stats: Stat[]; onChange: (s: Stat[]) => void }) {
  function update(idx: number, key: keyof Stat, value: string) {
    onChange(stats.map((s, i) => (i === idx ? { ...s, [key]: value } : s)))
  }
  function add() {
    onChange([...stats, { label: '', value: '' }])
  }
  function remove(idx: number) {
    onChange(stats.filter((_, i) => i !== idx))
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {stats.map((s, idx) => (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 2fr auto', gap: 8 }}>
          <input
            style={inputStyle}
            placeholder="Value (contoh: 50+)"
            value={s.value}
            onChange={(e) => update(idx, 'value', e.target.value)}
          />
          <input
            style={inputStyle}
            placeholder="Label (contoh: Brands Served)"
            value={s.label}
            onChange={(e) => update(idx, 'label', e.target.value)}
          />
          <button
            onClick={() => remove(idx)}
            style={{
              width: 36,
              height: 36,
              background: 'var(--bg3)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              color: '#ff6b6b',
              fontSize: 14,
              cursor: 'pointer',
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        onClick={add}
        style={{
          height: 36,
          background: 'var(--bg3)',
          border: '1px dashed var(--border)',
          borderRadius: 8,
          color: 'var(--text2)',
          fontSize: 12,
          cursor: 'pointer',
        }}
      >
        + Tambah Stat
      </button>
    </div>
  )
}

function ValuesEditor({ values, onChange }: { values: Value[]; onChange: (v: Value[]) => void }) {
  function updateField<K extends keyof Value>(idx: number, key: K, value: Value[K]) {
    onChange(values.map((v, i) => (i === idx ? { ...v, [key]: value } : v)))
  }
  // Six Principles is locked at exactly six values — the public
  // grid renders a fixed 3×2 layout, so adding/removing entries
  // would break the bento. Only the inline name/icon/description
  // fields are editable.
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {values.map((v, idx) => (
        <div
          key={idx}
          style={{
            padding: 14,
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 220px', gap: 8 }}>
            <input
              style={inputStyle}
              placeholder="Name (e.g. Think Global)"
              value={v.name}
              onChange={(e) => updateField(idx, 'name', e.target.value)}
            />
            <select
              style={inputStyle as React.CSSProperties}
              value={v.icon}
              onChange={(e) => updateField(idx, 'icon', e.target.value as AboutValueIcon)}
            >
              {ICON_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <textarea
            style={textareaStyle}
            placeholder="Description — short explanation (1-2 sentences)"
            value={v.desc}
            onChange={(e) => updateField(idx, 'desc', e.target.value)}
          />
        </div>
      ))}
    </div>
  )
}

/**
 * Hero grid editor — manages the ordered list of image URLs that
 * render between the "Born in Indonesia" hero and the rest of the
 * About story. Editors upload via FileUploader; the list supports
 * reordering (up/down) and per-row removal.
 */
function HeroGridEditor({
  urls,
  onChange,
}: {
  urls: string[]
  onChange: (next: string[]) => void
}) {
  const move = (idx: number, dir: -1 | 1) => {
    const next = [...urls]
    const target = idx + dir
    if (target < 0 || target >= next.length) return
    ;[next[idx], next[target]] = [next[target], next[idx]]
    onChange(next)
  }
  const remove = (idx: number) => {
    onChange(urls.filter((_, i) => i !== idx))
  }
  const add = (url: string | null) => {
    if (!url) return
    onChange([...urls, url])
  }
  const updateAt = (idx: number, url: string | null) => {
    if (!url) {
      remove(idx)
      return
    }
    const next = [...urls]
    next[idx] = url
    onChange(next)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {urls.length === 0 && (
        <div
          style={{
            padding: 16,
            background: 'var(--bg2)',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            color: 'var(--text2)',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          Belum ada foto. Tambah satu di bawah.
        </div>
      )}

      {urls.map((url, idx) => (
        <div
          key={`${url}-${idx}`}
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            alignItems: 'center',
            padding: 12,
            background: 'var(--bg2)',
            border: '1px solid var(--border)',
            borderRadius: 8,
          }}
        >
          <FileUploader
            label={`Foto #${idx + 1}`}
            value={url}
            onChange={(next) => updateAt(idx, next)}
            prefix="about-hero-grid"
            accept="image"
            previewHeight={120}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <button
              type="button"
              onClick={() => move(idx, -1)}
              disabled={idx === 0}
              title="Pindah ke atas"
              style={{
                width: 32,
                height: 28,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 14,
                cursor: idx === 0 ? 'not-allowed' : 'pointer',
                opacity: idx === 0 ? 0.4 : 1,
              }}
            >
              ↑
            </button>
            <button
              type="button"
              onClick={() => move(idx, 1)}
              disabled={idx === urls.length - 1}
              title="Pindah ke bawah"
              style={{
                width: 32,
                height: 28,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: 'var(--text)',
                fontSize: 14,
                cursor: idx === urls.length - 1 ? 'not-allowed' : 'pointer',
                opacity: idx === urls.length - 1 ? 0.4 : 1,
              }}
            >
              ↓
            </button>
            <button
              type="button"
              onClick={() => remove(idx)}
              title="Hapus"
              style={{
                width: 32,
                height: 28,
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 6,
                color: '#ff6b6b',
                fontSize: 14,
                cursor: 'pointer',
              }}
            >
              ×
            </button>
          </div>
        </div>
      ))}

      <FileUploader
        label="+ Tambah foto"
        value={null}
        onChange={add}
        prefix="about-hero-grid"
        accept="image"
        previewHeight={120}
      />
    </div>
  )
}

/**
 * Shared circular ✕ button for dialog headers. Matches the look of the
 * close control used by ModalShell so the visual language stays
 * consistent across every admin modal.
 */
function DialogCloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Tutup"
      title="Tutup"
      style={{
        width: 32,
        height: 32,
        background: 'var(--bg3)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        color: 'var(--text2)',
        fontSize: 16,
        lineHeight: 1,
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 0.18s ease, color 0.18s ease',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'var(--bg-hover)'
        el.style.color = 'var(--text)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLButtonElement
        el.style.background = 'var(--bg3)'
        el.style.color = 'var(--text2)'
      }}
    >
      ×
    </button>
  )
}
