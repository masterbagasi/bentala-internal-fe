// Type definitions for bsi_* (website) tables.
// These mirror the Supabase schema in schema_website.sql.

export type TextTransform = 'none' | 'uppercase' | 'lowercase' | 'capitalize'
export type FontStyle = 'normal' | 'italic'
export type BackgroundType = 'image' | 'video'

export interface BsiHero {
  id: string
  headline: string
  subtitle: string
  cta_text: string
  cta_url: string

  background_type: BackgroundType
  background_image_url: string | null
  /** Mobile-only background image, used at viewport widths below
      the `md` breakpoint. Falls back to background_image_url /
      video_urls when null. */
  background_image_url_mobile: string | null
  video_urls: string[]
  poster_url: string | null

  headline_color: string
  headline_font_size_px: number
  headline_font_weight: number
  headline_font_style: FontStyle
  headline_text_transform: TextTransform
  headline_letter_spacing_em: number

  subtitle_color: string
  subtitle_font_size_px: number
  subtitle_font_weight: number
  subtitle_font_style: FontStyle
  subtitle_text_transform: TextTransform

  is_active: boolean
  lead_whatsapp_number: string
  lead_email: string

  // Landscape header image rendered at the top of the Portfolio
  // section on the public site, replacing the plain text heading.
  // Filter tabs sit below this image.
  portfolio_header_image_url: string | null

  // Logo rendered in the navbar on every public-site page. When
  // null, the public site falls back to /logo.png in /public.
  logo_url: string | null

  // Per-route navbar visibility toggles. `true` removes the link
  // from the public Navbar without affecting the underlying route.
  nav_home_hidden: boolean | null
  nav_about_hidden: boolean | null
  nav_news_hidden: boolean | null

  created_at: string
  updated_at: string
}

// Single post row in the /news public feed (Instagram + TikTok
// content from Bentala Project Indonesia). Account values follow
// "{brand}_{platform}" — e.g. "bpi_ig", "bpi_tt".
export interface BsiNewsFeed {
  id: string
  account: string
  media_url: string
  media_type: string
  thumbnail_url: string | null
  caption: string
  permalink: string
  like_count: number
  comments_count: number
  posted_at: string
  is_published: boolean
  sort_order: number
  created_at?: string
  updated_at?: string
}

export type PortfolioCategory = 'video' | 'photo' | 'design' | 'intl'

export interface BsiPortfolio {
  id: string
  title: string
  /** Legacy single-category column. Kept in sync with categories[0]
   *  so older readers (and any row that hasn't been migrated yet)
   *  still resolve to a sensible value. */
  category: PortfolioCategory
  /** Multi-category array. A portfolio item can live under more
   *  than one filter tab on the public site (e.g. an Instagram
   *  reel that's also social-media). When null/empty/missing on
   *  legacy rows, callers should fall back to [category]. */
  categories?: PortfolioCategory[] | null
  tag: string
  media_url: string
  media_type: 'image' | 'video'
  thumbnail_url: string | null
  aspect_ratio: string
  is_published: boolean
  sort_order: number
  created_at: string
}

export interface BsiCollaboration {
  id: string
  brand_name: string
  logo_svg: string
  tint_color: string
  is_published: boolean
  sort_order: number
  created_at: string
}

export interface BsiTripLocation {
  name: string
  image_url: string
  description?: string | null
}

export interface BsiAbroadProduction {
  id: string
  image_url: string
  country: string
  /** ISO date (YYYY-MM-DD). Stored as a Postgres DATE column. */
  departure_date: string
  /** Optional ISO date for the return trip. When set the public detail
   *  page renders a date range; null falls back to departure only. */
  return_date: string | null
  /** Optional short tag rendered above the date on the public card,
   *  e.g. "Eropa Trip 2026" / "Asia Window". */
  note: string | null
  /** Legacy field — was the external URL the banner click used to
   *  open in a new tab. The home banner now routes to an internal
   *  /abroad-production/[slug] detail page instead, so this field
   *  is optional / unused by new flows but kept on the row for
   *  backwards compatibility. */
  service_link_url: string
  is_published: boolean
  sort_order: number
  created_at: string
  /** Long-form headline rendered on the detail page. Falls back to
   *  `country` when empty. */
  title: string | null
  /** Body copy rendered under the headline on the detail page. */
  description: string | null
  /** URL-safe identifier used in /abroad-production/[slug]. The admin
   *  auto-generates it from `country` and may then edit it. */
  slug: string | null
  /** Destinations the production crew will visit during the trip.
   *  JSONB array; defaults to []. Rendered as the "Destinations
   *  We'll Visit" gallery on the public detail page. */
  locations: BsiTripLocation[]
  /** Free-form terms & conditions copy (Syarat & Ketentuan). Line
   *  breaks are preserved on the public site. */
  terms_conditions: string | null
  /** Secondary image rendered in the side-by-side block on the
   *  public detail page (under the hero banner). Optional — when
   *  null the public page falls back to the main `image_url`. */
  secondary_image_url: string | null
}

/** One structured Terms & Conditions clause — title shown in the
 *  public list card, body expands into a popup when the visitor
 *  clicks the row. */
export interface BsiAbroadTermItem {
  title: string
  body: string
}

/** Singleton settings row for the Abroad-Production area. Holds the
 *  universal T&C copy rendered on every /abroad-production/[slug]
 *  detail page. Always id=1; updates only, never inserts (the SQL
 *  seed creates the row).
 *
 *  Public renderer prefers the STRUCTURED fields:
 *    • terms_description : intro paragraph (left column).
 *    • terms_items       : array of { title, body } clauses (right
 *      column card with clickable popups).
 *  Falls back to parsing the legacy free-form `terms_conditions`
 *  TEXT field when `terms_items` is empty — keeps old data working
 *  until the admin re-saves with the structured editor. */
export interface BsiAbroadSettings {
  id: number
  terms_description: string | null
  terms_items: BsiAbroadTermItem[]
  /** Legacy free-form T&C text. Kept for backward compat; new edits
   *  flow through `terms_description` + `terms_items` instead. */
  terms_conditions: string | null
  updated_at: string
}

/** One row of the universal Abroad-Production services list. Rendered
 *  in the "Services We Offer" section on every /abroad-production/[slug]
 *  detail page. `preview_url` + `preview_type` drive the right-side
 *  panel — a per-service video reel (preferred) or a still image. */
export interface BsiAbroadService {
  id: string
  sort_order: number
  title: string
  description: string | null
  preview_url: string | null
  preview_type: 'video' | 'image'
  /** Optional accent override for the preview panel's radial wash.
   *  Leave null to inherit the brand Bentala blue. */
  accent_color: string | null
  /** Optional sticker-card background override. Leave null to inherit
   *  a deterministic tint from the brand palette keyed off sort_order. */
  card_bg_color: string | null
  is_published: boolean
  created_at: string
}

export interface BsiService {
  id: string
  name: string
  /** Body copy shown beneath the service heading on the public site. */
  description: string | null
  /** Primary CTA label + url (e.g. "Start a Project" → WhatsApp). */
  cta_text: string | null
  cta_url: string | null
  /** Secondary "learn more" anchor (e.g. portfolio filter link). */
  learn_more_text: string | null
  learn_more_url: string | null
  /** Image or video shown alongside the text column on the public
      site. Either a Supabase Storage URL or an empty value (no
      media row). */
  media_url: string | null
  media_type: 'image' | 'video'
  is_published: boolean
  sort_order: number
  created_at: string
}

export interface BsiSocialLink {
  id: string
  platform: 'ig' | 'tiktok' | 'whatsapp'
  handle: string
  url: string
  is_published: boolean
  created_at: string
}

/** Icon keys recognised by the public ValuesGrid renderer. Keep
 *  in sync with `iconMap` in components/about/ValuesGrid.tsx. */
export type AboutValueIcon = 'globe' | 'film' | 'star' | 'users' | 'check' | 'refresh'

/** Anchor points for the editorial overlay image in the About
 *  hero. Each position has its own size + rotation + z-index in
 *  the public PageHero so the image reads as an intentional
 *  composition piece rather than a floating sticker. */
export type AboutHeroImagePosition =
  | 'top-left'
  | 'top-right'
  | 'mid-left'
  | 'mid-right'
  | 'bottom-left'
  | 'bottom-right'

export interface BsiAbout {
  id: string
  /** First line of the editorial hero — e.g. "OUR\nVISION".
   *  Newlines render as <br> in the public hero. */
  story_title: string
  /** Cover-line / subtitle paragraph beneath the giant headline. */
  story_body: string
  /** Optional CTA target (WhatsApp, mailto, etc) for the hero
   *  Start-Collaboration button. */
  story_cta_url: string
  /** Editorial copy for the "Our Story" section. Supports a tiny
   *  markdown subset: `**word**` (cyan in heading / bold white
   *  in paragraph), `*word*` (italic-serif in heading), `\n`
   *  for line breaks in the heading. */
  story_eyebrow: string | null
  story_heading: string | null
  story_paragraph: string | null
  /** Optional 16:9 cinematic video rendered full-bleed between
   *  the caption paragraph and the entity cards on the About
   *  Our Story section. */
  story_video_url: string | null
  /** Optional decorative image rendered as an overlay tile in
   *  the hero (anchored via hero_overlay_position). When null,
   *  the hero renders without the overlay — text-only composition. */
  hero_overlay_image_url: string | null
  hero_overlay_position: AboutHeroImagePosition | null
  /** Logos rendered on the two "entity" cards (Bentala Project &
   *  Bentala Studio) in the About story section. When null, the
   *  public site falls back to bundled assets in /public. */
  entity_1_logo_url: string | null
  entity_2_logo_url: string | null
  /** Body copy on each entity card. When null/empty, the public
   *  site falls back to the bundled default sentence. */
  entity_1_desc: string | null
  entity_2_desc: string | null
  vision_text: string
  mission_text: string
  edge_text: string
  /** Admin-editable email shown in the About-page CTA band.
   *  Clicking the address opens Gmail compose with this as
   *  the recipient. */
  contact_email: string | null
  /** Admin-editable CSS line-height (unitless) for each
   *  Vision/Mission/Edge description on the public site. */
  vision_text_line_height: number | null
  mission_text_line_height: number | null
  edge_text_line_height: number | null
  /** Optional image rendered in place of the giant numeral on each
   *  philosophy row of the public About page. When null, the
   *  numeral is shown. */
  vision_image_url: string | null
  mission_image_url: string | null
  edge_image_url: string | null
  /** Editorial photo strip rendered between the "Born in Indonesia"
   *  hero and the rest of the About story. */
  hero_grid_image_urls: string[]
  /** Optional full-bleed banner image for the About hero. When
   *  set, replaces the text headline + description in the pinned
   *  hero. */
  hero_banner_image_url: string | null
  /** Optional mobile-specific hero banner. Shown on phone-width
   *  viewports where the wide desktop banner would crop. Falls back
   *  to hero_banner_image_url when null. */
  hero_banner_image_url_mobile: string | null
  stats: Array<{ label: string; value: string }>
  /** Aligned with public ValuesGrid schema. `icon` keys must match
   *  one of AboutValueIcon — anything else falls back to `globe`. */
  values: Array<{ name: string; desc: string; icon: AboutValueIcon }>
  /** Heading above the Six Principles grid. Supports the public
   *  markdown subset: `*word*` italic-serif blue, `**word**`
   *  outline-stroke blue, `\n` line break. Null falls back to the
   *  bundled default ("The Six Principles"). */
  principles_title: string | null
  /** Oversized headline inside the closing CTA band. Same markdown
   *  subset as `principles_title`. Null falls back to the bundled
   *  default ("Ready to *create*\nsomething **great**?"). */
  cta_title: string | null
  updated_at: string
}

export type TeamGalleryRatio = '16:9' | '9:16' | '4:5'

export interface BsiTeamGallery {
  id: string
  image_url: string
  caption: string
  alt_text: string
  sort_order: number
  is_published: boolean
  /** Public-site crop ratio. Editors pick one of three fixed
   *  ratios so uploads target a predictable shape. */
  display_ratio: TeamGalleryRatio
  /** Focal point inside the photo (0–100% from top-left). The
   *  public crop uses these as object-position so the visible
   *  portion stays anchored to the editor's chosen framing. */
  focal_x: number
  focal_y: number
  /** Magnification at the focal point (1.0 = native, 3.0 = 3×). */
  zoom: number
  created_at: string
  updated_at: string
}

export interface BsiTeamMember {
  id: string
  name: string
  title: string
  role_description: string
  initials: string
  avatar_color: string
  tags: string[]
  is_published: boolean
  sort_order: number
  created_at: string
}

export interface BsiNewsItem {
  id: string
  account: 'bpi_ig' | 'bpi_tt'
  media_url: string
  media_type: 'image' | 'video'
  thumbnail_url: string | null
  caption: string
  permalink: string
  like_count: number
  comments_count: number
  posted_at: string
  is_published: boolean
  sort_order: number
  created_at: string
}

export interface BsiSeo {
  id: string
  page: string
  meta_title: string
  meta_description: string
  og_image_url: string | null
  updated_at: string
}

export interface BsiVisitor {
  id: string
  visitor_id: string
  first_seen_at: string
  last_seen_at: string
  user_agent: string | null
  device_type: string | null
  os: string | null
  browser: string | null
  country: string | null
  city: string | null
  total_sessions: number
  total_pageviews: number
  total_events: number
  is_lead: boolean
  lead_id: string | null
  created_at: string
}

export interface BsiSession {
  id: string
  session_id: string
  visitor_id: string
  started_at: string
  last_activity_at: string
  ended_at: string | null
  referrer: string | null
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  utm_term: string | null
  utm_content: string | null
  landing_path: string
  exit_path: string | null
  pageview_count: number
  event_count: number
  duration_seconds: number | null
  created_at: string
}

export interface BsiPageview {
  id: string
  visitor_id: string
  session_id: string
  path: string
  title: string | null
  referrer: string | null
  viewed_at: string
  time_on_page_seconds: number | null
  created_at: string
}

export interface BsiEvent {
  id: string
  visitor_id: string
  session_id: string
  event_type: string
  target: string | null
  path: string | null
  metadata: Record<string, unknown>
  occurred_at: string
  created_at: string
}

export interface BsiLead {
  id: string
  full_name: string
  brand_name: string
  contact_type: 'whatsapp' | 'email'
  contact_value: string
  project_type: string
  notes: string
  utm_source: string | null
  utm_medium: string | null
  utm_campaign: string | null
  referrer: string | null
  user_agent: string | null
  submitted_at: string
  status: 'new' | 'contacted' | 'qualified' | 'closed' | 'spam'
  created_at: string
}
