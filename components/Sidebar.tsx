'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useState, useEffect, useMemo, useRef } from 'react'
import { initNotificationSound, playNotificationSound } from '@/lib/notificationSound'
import { getSupabase } from '@/lib/supabase'
import { AccountButton } from '@/components/shared/AccountButton'
import { isEffectiveSuperAdmin, normaliseSections, sectionForPath, canAccessChat, chatRoomFromPath, firstAllowedLanding } from '@/lib/access'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useSocmedProjects } from '@/lib/socmed-projects'

// ── Types ────────────────────────────────────────────────────

interface NavItem {
  type?: 'item'
  href: string
  label: string
  icon: React.ReactNode
  /** Hex color for the icon's rounded-square container, in macOS
   *  System Settings style. Defaults to neutral blue when omitted. */
  color?: string
}

// A collapsible sub-group inside a section. Renders as a header that toggles
// visibility of its items. Used to group page-level edits in the website section.
interface NavSubgroup {
  type: 'subgroup'
  id: string
  label: string
  icon?: React.ReactNode
  color?: string
  items: NavEntry[]
}

type NavEntry = NavItem | NavSubgroup

interface NavSection {
  id: string
  label?: string
  badge?: React.ReactNode
  fullLabel?: string
  items: NavEntry[]
}

// ── macOS palette (dark theme — lit) ────────────────────────
// Mid-tone bases so the IconBox gradient + inner highlight read
// as a *lit* tile (light from above, slight darkening below)
// rather than a flat muted square. Each shade still sits below
// fully-saturated original macOS colors so the sidebar doesn't
// scream.
const COLOR = {
  blue:    '#1f5dca',
  green:   '#2c9148',
  orange:  '#c46e1f',
  red:     '#c4393a',
  purple:  '#8845c0',
  pink:    '#c4365a',
  yellow:  '#c4a414',
  teal:    '#2c85ad',
  indigo:  '#4541b8',
  gray:    '#5a5a60',
} as const

// ── Icon helpers ────────────────────────────────────────────
// Icons are rendered in white inside a colored rounded-square
// container, mirroring macOS System Settings. Stroke width and
// proportions are tuned so the silhouette stays readable at 14px.

const iconStroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

const DashboardIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
)
const ListIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <rect x="5" y="2" width="14" height="20" rx="2" />
    <line x1="9" y1="7" x2="15" y2="7" /><line x1="9" y1="11" x2="15" y2="11" /><line x1="9" y1="15" x2="13" y2="15" />
  </svg>
)
const CalIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <rect x="3" y="4" width="18" height="18" rx="2" />
    <line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
  </svg>
)
const ImageIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" />
  </svg>
)
const PeopleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
)
const MoneyIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <line x1="12" y1="1" x2="12" y2="23" />
    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
  </svg>
)
const FolderIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
  </svg>
)
const TaskIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
)
const VideoIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
  </svg>
)
const DesignIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" />
  </svg>
)
const SparkIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" />
  </svg>
)
const WandIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M15 4V2m0 14v-2M8 11H2m14 0h-6M5.636 5.636l1.414 1.414M16.95 16.95l1.414 1.414M5.636 18.364l1.414-1.414M16.95 7.05l1.414-1.414" />
    <circle cx="11" cy="11" r="3" />
  </svg>
)
const GlobeIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <circle cx="12" cy="12" r="10" />
    <line x1="2" y1="12" x2="22" y2="12" />
    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
  </svg>
)
const ChartIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" />
    <line x1="6" y1="20" x2="6" y2="14" /><line x1="3" y1="20" x2="21" y2="20" />
  </svg>
)
const ShareIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
)
const ChatBubbleIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
  </svg>
)
const ReportIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
  </svg>
)
const AudioIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)
const PlugIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <path d="M9 2v6" /><path d="M15 2v6" />
    <rect x="6" y="8" width="12" height="6" rx="1" />
    <path d="M12 14v3a3 3 0 0 0 3 3h0a3 3 0 0 0 3-3v-1" />
  </svg>
)
const LockIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" {...iconStroke}>
    <rect x="3" y="11" width="18" height="11" rx="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
)
const ChevronIcon = ({ collapsed }: { collapsed: boolean }) => (
  <svg
    width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
    style={{ transition: 'transform 0.18s ease', transform: collapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}
  >
    <polyline points="6 9 12 15 18 9" />
  </svg>
)
const SearchIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" {...iconStroke}>
    <circle cx="11" cy="11" r="8" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
)

// ── Sidebar logo ────────────────────────────────────────────
//
// Reads the public-site brand logo from `bsi_hero.logo_url` and
// renders it at the top of the sidebar. This keeps the admin
// branding in lock-step with whatever the editor uploads via
// the Home → Hero settings page — change it there once, both
// surfaces update. Falls back to the bundled
// `/logo bentala.png` (PNG) if no remote URL is set yet, so the
// sidebar always has a brand mark.

const FALLBACK_LOGO_SRC = '/logo%20bentala.png'

function SidebarLogo({ isExpanded }: { isExpanded: boolean }) {
  const [logoUrl, setLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()
    supabase
      .from('bsi_hero')
      .select('logo_url')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return
        const url = (data?.logo_url as string | null) ?? null
        setLogoUrl(url && url.trim() !== '' ? url : FALLBACK_LOGO_SRC)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const heightPx = isExpanded ? 32 : 24

  // While the URL fetches, render a placeholder so the sidebar
  // layout doesn't jump.
  if (logoUrl === null) {
    return (
      <div
        style={{
          height: heightPx,
          transition: 'height 0.22s ease',
        }}
      />
    )
  }

  // The bundled fallback is a dark wordmark on transparent and
  // needs inverting to read white on the sidebar. Admin-uploaded
  // URLs are passed through as-is — editors are expected to
  // upload a light/white asset themselves.
  const isUsingFallback = logoUrl === FALLBACK_LOGO_SRC
  const filter = isUsingFallback ? 'brightness(0) invert(1)' : 'none'

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={logoUrl}
      alt="Bentala"
      style={{
        height: heightPx,
        width: 'auto',
        display: 'block',
        transition: 'height 0.22s ease',
        objectFit: 'contain',
        filter,
        flexShrink: 0,
      }}
    />
  )
}

// ── Sidebar ─────────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const t = useT()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [isExpanded, setIsExpanded] = useState(true)
  const [query, setQuery] = useState('')
  const smmProjects = useSocmedProjects(true)

  // ── Responsive: off-canvas drawer on mobile ──
  // Below 768px the fixed rail would shove the page off-screen, so the
  // sidebar becomes a slide-in drawer triggered from a compact top bar.
  const [isMobile, setIsMobile] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const apply = () => setIsMobile(mq.matches)
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [])
  // Navigating (tapping any link) closes the drawer.
  useEffect(() => { setMobileOpen(false) }, [pathname])
  // Lock body scroll behind the open drawer so the page doesn't move under it.
  useEffect(() => {
    if (!(isMobile && mobileOpen)) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [isMobile, mobileOpen])

  // The drawer always renders fully expanded (labels visible); the
  // collapse-to-rail affordance only makes sense on desktop.
  const expanded = isMobile ? true : isExpanded

  // ── Per-account menu access ──
  // Determines which sections this account may see. Super admin sees all.
  // `loading` keeps the nav blank until we know, so we never flash menus the
  // account can't open. Mirrors the DENY-by-default gate in middleware.ts.
  // `isSuper` = may manage access + the Manage-Access escape hatch.
  // `fullBypass` = super admin with NO menu_access row yet → sees everything
  // (not configured). Once an admin saves their access, they're gated by grants
  // like anyone else (so the toggles actually take effect on a super's own UI).
  const [access, setAccess] = useState<{
    loading: boolean
    isSuper: boolean
    fullBypass: boolean
    allowed: Set<string>
  }>({ loading: true, isSuper: false, fullBypass: false, allowed: new Set() })

  // My email — used to skip the notification sound for my own messages.
  const meEmailRef = useRef<string | null>(null)
  useEffect(() => { initNotificationSound() }, [])

  useEffect(() => {
    let cancelled = false
    const supabase = getSupabase()

    // Resolve the caller's access. Re-runnable so a realtime grant change can
    // refresh the whole nav without a reload.
    const loadAccess = async () => {
      const { data } = await supabase.auth.getUser()
      const email = data.user?.email
      meEmailRef.current = (email ?? '').toLowerCase() || null
      const isSuper = isEffectiveSuperAdmin(email, data.user?.app_metadata?.role)
      let row: { sections?: unknown } | null = null
      try {
        const res = await supabase.from('menu_access').select('sections').limit(1).maybeSingle()
        row = (res.data as { sections?: unknown } | null) ?? null
      } catch {
        row = null
      }
      // Super admin not yet configured (no row) → full access; otherwise gated by
      // their own grants like everyone else.
      const fullBypass = isSuper && row === null
      const allowed = normaliseSections(row?.sections)
      if (!cancelled) setAccess({ loading: false, isSuper, fullBypass, allowed: new Set(allowed) })
    }

    loadAccess()

    // Realtime: when an admin saves new grants for THIS account, re-evaluate
    // access immediately so the sidebar / accessible tabs update with no refresh.
    // menu_access RLS scopes to the caller's own row, so only their change
    // arrives. setAuth is required for the socket to receive RLS-gated events.
    let channel: ReturnType<typeof supabase.channel> | null = null
    supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const token = data.session?.access_token
      if (token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(token)
      channel = supabase
        .channel('menu-access:self')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'menu_access' }, () => loadAccess())
        .subscribe()
    })
    const authSub = supabase.auth.onAuthStateChange((_e, s) => {
      if (s?.access_token) (supabase.realtime as { setAuth: (t: string) => void }).setAuth(s.access_token)
    })

    return () => {
      cancelled = true
      authSub.data.subscription.unsubscribe()
      if (channel) supabase.removeChannel(channel)
    }
  }, [])

  // If a realtime grant change revokes access to the page the user is CURRENTLY
  // on, bounce them to their first allowed landing (mirrors middleware, which
  // only fires on navigation). Keeps "what you can access" in sync live.
  useEffect(() => {
    if (access.loading || access.fullBypass) return
    const isAccessPage = pathname === '/settings/access' || pathname.startsWith('/settings/access/')
    if (access.isSuper && isAccessPage) return // escape hatch — never bounce a super out of Manage Access
    const room = chatRoomFromPath(pathname)
    const ok = room !== null
      ? canAccessChat(access.allowed, room)
      : (() => { const sec = sectionForPath(pathname); return sec === null || access.allowed.has(sec) })()
    if (!ok) {
      const target = firstAllowedLanding(Array.from(access.allowed)) ?? '/no-access'
      if (target !== pathname) router.replace(target)
    }
  }, [access, pathname, router])

  // ── Chat unread counts ──
  // Per-room unread message counts, keyed by project slug. Seeded from the API
  // and kept live via a postgres_changes subscription on chat_messages: any
  // INSERT re-fetches the authoritative counts. Re-runs on pathname change so
  // entering a room (which marks it read) refreshes the badges.
  const [unread, setUnread] = useState<Record<string, number>>({})
  useEffect(() => {
    let cancelled = false
    const load = () => fetch('/api/chat/unread')
      .then(r => (r.ok ? r.json() : { counts: {} }))
      .then((d: { counts?: Record<string, number> }) => { if (!cancelled) setUnread(d.counts ?? {}) })
      .catch(() => {})
    load()
    const supabase = getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient
    const channel = supabase
      .channel('chat:unread')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages' }, (payload) => {
        load()
        // Ring the notification chime for an incoming message from someone else.
        const row = payload.new as { author_email?: string | null } | undefined
        const author = (row?.author_email ?? '').toLowerCase()
        if (author && author !== meEmailRef.current) playNotificationSound()
      })
      .subscribe()
    return () => { cancelled = true; supabase.removeChannel(channel) }
  }, [pathname])

  function toggleSection(id: string) {
    setCollapsed(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const sections: NavSection[] = useMemo(() => [
    {
      id: 'overview',
      items: [
        { href: '/', label: 'Dashboard', icon: <DashboardIcon />, color: COLOR.blue },
        // Unified chat — a top-level item right under Dashboard (not nested in a
        // section). Lists every Socmed Management room the user can access.
        { href: '/chat', label: 'Chat', icon: <ChatBubbleIcon />, color: COLOR.blue },
      ],
    },
    {
      id: 'website',
      badge: <BrandBadge text="web." />,
      fullLabel: 'Website',
      items: [
        { href: '/website/home',     label: 'Home Page',  icon: <GlobeIcon />,     color: COLOR.indigo },
        { href: '/website/about',    label: 'About Page', icon: <ListIcon />,      color: COLOR.orange },
        { href: '/website/news',     label: 'News Page',  icon: <ListIcon />,      color: COLOR.red },
        { href: '/website/seo',      label: 'SEO',        icon: <WandIcon />,      color: COLOR.purple },
        { href: '/website/navbar',   label: 'Setting',    icon: <ListIcon />,      color: COLOR.purple },
      ],
    },
    {
      id: 'smm',
      badge: <BrandBadge text="smm" />,
      fullLabel: 'Socmed Management',
      items: [
        // "All Project" combined board — gated by the `smm.all` access grant
        // (super admins see it implicitly; others need it granted).
        { href: '/projects-all', label: 'All Project', icon: <FolderIcon />, color: COLOR.blue },
        ...smmProjects.map(p => ({
          type: 'subgroup' as const,
          id: `smm-${p.slug}`,
          label: p.name,
          icon: <BrandGlyph text={p.glyph || p.slug} />,
          color: p.color,
          items: [
            { href: `/smm/${p.slug}/social`, label: 'Social Media', icon: <ShareIcon />, color: COLOR.teal },
            { href: `/smm/${p.slug}`,        label: 'Projects',     icon: <ListIcon />,  color: p.color },
          ],
        })),
      ],
    },
    {
      id: 'social',
      badge: <BrandBadge text="sm." />,
      fullLabel: 'Social Media',
      items: [
        { href: '/social/accounts',  label: 'Accounts',  icon: <PeopleIcon />, color: COLOR.blue },
        { href: '/social/analytics', label: 'Analytics', icon: <ChartIcon />,  color: COLOR.teal },
        { href: '/social/reports',   label: 'Reports',   icon: <ReportIcon />, color: COLOR.orange },
        { href: '/social/plan',      label: 'Plan',      icon: <CalIcon />,    color: COLOR.purple },
      ],
    },
    {
      id: 'client',
      badge: <BrandBadge text="client" />,
      fullLabel: 'Client',
      items: [
        { href: '/website/leads', label: 'Leads',           icon: <MoneyIcon />,  color: COLOR.green },
        { href: '/clients',       label: 'CRM Pipeline',    icon: <PeopleIcon />, color: COLOR.blue },
        { href: '/invoices',      label: 'Invoice & Bayar', icon: <MoneyIcon />,  color: COLOR.green },
      ],
    },
    {
      id: 'projects',
      badge: <BrandBadge text="proj." />,
      fullLabel: 'Projects',
      items: [
        { href: '/projects',     label: 'All Projects',     icon: <FolderIcon />, color: COLOR.orange },
        { href: '/tasks',        label: 'Task Board',       icon: <TaskIcon />,   color: COLOR.green },
        { href: '/bpi-faizal',   label: 'Video Production', icon: <VideoIcon />,  color: COLOR.red },
        { href: '/bpi-reinaldi', label: 'Design Studio',    icon: <DesignIcon />, color: COLOR.purple },
      ],
    },
    {
      id: 'ai',
      badge: <BrandBadge text="ai" />,
      fullLabel: 'AI Studio',
      items: [
        { href: '/ai/chat',         label: 'Chat AI',          icon: <SparkIcon />, color: COLOR.teal },
        { href: '/ai/ideas',        label: 'Pencari Ide',      icon: <WandIcon />,  color: COLOR.yellow },
        { href: '/ai/image',        label: 'Generator Gambar', icon: <ImageIcon />, color: COLOR.pink },
        { href: '/ai/templates',    label: 'Template Gambar',  icon: <ImageIcon />, color: COLOR.pink },
        { href: '/ai/video',        label: 'Script Video',     icon: <VideoIcon />, color: COLOR.red },
        { href: '/ai/video/render', label: 'Video Render',     icon: <VideoIcon />, color: COLOR.red },
        { href: '/ai/audio',        label: 'Generator Audio',  icon: <AudioIcon />, color: COLOR.orange },
        { href: '/ai/bpi',          label: 'BPI Intelligence', icon: <GlobeIcon />, color: COLOR.indigo },
      ],
    },
    {
      id: 'team',
      badge: <BrandBadge text="team" />,
      fullLabel: 'Team',
      items: [
        { href: '/team', label: 'Team & Roles', icon: <PeopleIcon />, color: COLOR.blue },
      ],
    },
    {
      id: 'settings',
      badge: <BrandBadge text="set." />,
      fullLabel: 'Settings',
      items: [
        { href: '/settings/ai', label: 'AI Integrations', icon: <PlugIcon />, color: COLOR.gray },
        // Access management — only the super admin can open it, so only show it
        // to them (the route is super-admin-gated in middleware regardless).
        ...(access.isSuper
          ? [{ href: '/settings/access', label: 'Hak Akses', icon: <LockIcon />, color: COLOR.gray }]
          : []),
      ],
    },
  ], [access.isSuper, smmProjects])

  // Search filter — case-insensitive match. Two paths:
  //  1) Section title (label / fullLabel / badge text — e.g. "bentala
  //     project", "client", "ai") matches → show ALL items in that
  //     section so the user lands on the whole group at once.
  //  2) Otherwise, filter items inside the section by label.
  // Sections with zero matches drop out entirely.
  // Restrict to sections this account may access before any search filtering.
  // Super admin sees all. While access is still loading, show nothing so we
  // never flash a menu the account can't open.
  // Access is now per leaf item: keep only items whose route maps to a granular
  // section the account is allowed. Drop empty subgroups and empty sections.
  const accessibleSections = useMemo(() => {
    if (access.loading) return []
    // Unconfigured super (no row) sees everything; everyone else (incl. configured
    // super admins) is gated by their grants.
    if (access.fullBypass) return sections
    const filterItems = (items: NavEntry[]): NavEntry[] => {
      const out: NavEntry[] = []
      for (const e of items) {
        if ('type' in e && e.type === 'subgroup') {
          const kids = filterItems(e.items)
          if (kids.length) out.push({ ...e, items: kids })
        } else {
          const href = (e as NavItem).href
          if (href === '/settings/access') {
            // Escape hatch: super admins can ALWAYS reach Manage Access, so they
            // can never lock themselves out by editing their own grants.
            if (access.isSuper) out.push(e)
            continue
          }
          if (href === '/chat') {
            // Unified Chat tab — visible if the user can chat in ANY project.
            if (smmProjects.some(p => canAccessChat(access.allowed, p.slug))) out.push(e)
            continue
          }
          const chatRoom = chatRoomFromPath(href)
          if (chatRoom !== null) {
            // Chat = explicit chat grant OR any project access (social/projects).
            if (canAccessChat(access.allowed, chatRoom)) out.push(e)
          } else {
            const secId = sectionForPath(href)
            // Routes with no managed section aren't gated; otherwise require grant.
            if (secId === null || access.allowed.has(secId)) out.push(e)
          }
        }
      }
      return out
    }
    return sections
      .map(sec => ({ ...sec, items: filterItems(sec.items) }))
      .filter(sec => sec.items.length > 0)
  }, [sections, access, smmProjects])

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return accessibleSections
    return accessibleSections
      .map(sec => {
        const sectionTitle = `${sec.fullLabel ?? ''} ${sec.label ?? ''} ${sec.id}`.toLowerCase()
        if (sectionTitle.includes(q)) return sec
        const filteredItems = sec.items.filter(entry => {
          if ('type' in entry && entry.type === 'subgroup') {
            return (
              entry.label.toLowerCase().includes(q) ||
              entry.items.some(child => child.label.toLowerCase().includes(q))
            )
          }
          return (entry as NavItem).label.toLowerCase().includes(q)
        })
        return { ...sec, items: filteredItems }
      })
      .filter(sec => sec.items.length > 0)
  }, [accessibleSections, query])

  // Compute the single active href for the current pathname. We
  // pick the LONGEST registered href that the path starts with so
  // nested entries (e.g. /website + /website/home + /website/home/hero)
  // only highlight the deepest match — never multiple at once.
  // Root '/' is special-cased to exact match so every page doesn't
  // accidentally highlight Dashboard.
  const activeHref = useMemo(() => {
    const all: string[] = []
    for (const sec of sections) all.push(...collectHrefs(sec.items))
    let best = ''
    for (const href of all) {
      if (href === '/') {
        if (pathname === '/' && best.length === 0) best = '/'
        continue
      }
      if (pathname === href || pathname.startsWith(href + '/')) {
        if (href.length > best.length) best = href
      }
    }
    return best
  }, [sections, pathname])

  function isActive(href: string) {
    return href === activeHref
  }

  useEffect(() => {
    const main = document.getElementById('main-content')
    if (!main) return
    main.style.transition = 'margin-left 0.22s ease, margin-top 0.22s ease'
    if (isMobile) {
      // Drawer floats over the page — content is full-width and only has
      // to clear the fixed top bar (52px + the iOS safe-area inset). Add a
      // matching 10px left gutter the desktop margin normally supplies.
      main.style.marginLeft = '0px'
      main.style.marginTop = 'calc(52px + env(safe-area-inset-top, 0px))'
      main.style.paddingLeft = '10px'
      // CRITICAL: `main` is h-screen (100vh). With the 52px top-bar margin on
      // top, a full 100vh would push main's bottom *below* the visible
      // viewport — hiding the bottom of every page (e.g. the chat composer)
      // behind the browser chrome, and leaving 52px of page that scrolls (so
      // sticky page headers drift). Pin main to the real visible height using
      // dvh (which tracks the browser's show/hide chrome) minus the top bar,
      // so each page's internal scroller is the ONLY thing that scrolls.
      main.style.height = 'calc(100dvh - 52px - env(safe-area-inset-top, 0px))'
      main.style.paddingBottom = 'calc(10px + env(safe-area-inset-bottom, 0px))'
      return
    }
    // Desktop: clear the floating rail's width PLUS the 10px gap on each
    // side (10 inset + 10 breathing space) so the two never visually fuse.
    const w = isExpanded ? 'var(--sidebar-w)' : 'var(--sidebar-collapsed)'
    main.style.marginLeft = `calc(${w} + 20px)`
    main.style.marginTop = '0px'
    main.style.paddingLeft = '0px'
    // Restore the h-screen height + default bottom padding for desktop.
    main.style.height = ''
    main.style.paddingBottom = '10px'
  }, [isExpanded, isMobile])

  function toggleSidebar() {
    setIsExpanded(e => !e)
  }

  return (
    <>
      {/* Mobile top bar — fixed strip with the hamburger that opens the
          drawer. Only rendered on small screens; hidden on desktop where
          the rail is always present. */}
      {isMobile && (
        <header
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            height: 'calc(52px + env(safe-area-inset-top, 0px))',
            paddingTop: 'env(safe-area-inset-top, 0px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            padding: '0 14px',
            zIndex: 60,
            background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 70%), var(--bg2)',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          {/* Logo — top-left corner */}
          <SidebarLogo isExpanded />
          {/* Menu trigger — top-right corner */}
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            style={{
              width: 36, height: 36, borderRadius: 9, flexShrink: 0,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.05)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text)', cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </header>
      )}

      {/* Scrim behind the open drawer — tap to dismiss. */}
      {isMobile && (
        <div
          onClick={() => setMobileOpen(false)}
          aria-hidden
          style={{
            position: 'fixed', inset: 0, zIndex: 80,
            background: 'rgba(0,0,0,0.55)',
            backdropFilter: 'blur(2px)',
            opacity: mobileOpen ? 1 : 0,
            pointerEvents: mobileOpen ? 'auto' : 'none',
            transition: 'opacity 0.28s ease',
          }}
        />
      )}

    <nav
      id="sidebar"
      className="fixed flex flex-col overflow-hidden"
      style={{
        // Mobile: full-height drawer pinned to the left edge that slides in
        // from off-canvas. Desktop: floating panel inset 10px from every
        // viewport edge so all four corners are visible and roundable,
        // matching the macOS System Settings window aesthetic.
        top: isMobile ? 0 : 10,
        left: isMobile ? 0 : 10,
        bottom: isMobile ? 0 : 10,
        width: isMobile ? 'min(82vw, var(--sidebar-w))' : (isExpanded ? 'var(--sidebar-w)' : 'var(--sidebar-collapsed)'),
        paddingTop: isMobile ? 'env(safe-area-inset-top, 0px)' : 0,
        transform: isMobile ? (mobileOpen ? 'translateX(0)' : 'translateX(-110%)') : 'none',
        zIndex: isMobile ? 90 : 50,
        // Solid dark base with a subtle top-down gradient sheen so the
        // panel doesn't read as flat black.
        background: 'linear-gradient(180deg, rgba(255,255,255,0.02) 0%, transparent 60%), var(--bg2)',
        // 1px hairline outline on every side (was border-right only)
        // so the floating panel reads as a self-contained surface.
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: isMobile ? '0 16px 16px 0' : 14,
        // Soft shadow lifts the panel off the page background, the way
        // macOS settings window casts a subtle drop shadow.
        boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
        transition: 'width 0.22s ease, transform 0.28s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {/* Top region — brand logo + toggle + search. Padding-top
          ≥14 so the search pill's top edge (incl. its 1px border
          + subtle shadow) never gets clipped by the nav's
          overflow:hidden. */}
      <div
        className="flex-shrink-0"
        style={{
          padding: expanded ? '14px 12px 10px 12px' : '14px 0 10px 0',
          transition: 'padding 0.22s ease',
        }}
      >
        {/* Brand logo + toggle — same row so the two controls sit
            on a shared horizontal axis. Logo anchors the left
            edge, toggle the right; the gap between them flexes
            via `justify-between`. Collapsed: logo hidden, toggle
            stays centred (the entire rail collapses to a 64px
            strip, no room for both). */}
        <div
          className="flex items-center"
          style={{
            justifyContent: expanded ? 'space-between' : 'center',
            marginBottom: expanded ? 10 : 0,
            gap: 8,
          }}
        >
          {expanded && <SidebarLogo isExpanded={expanded} />}
          <button
            onClick={isMobile ? () => setMobileOpen(false) : toggleSidebar}
            aria-label={isMobile ? 'Close menu' : (isExpanded ? 'Collapse sidebar' : 'Expand sidebar')}
            style={{
              width: 28,
              height: 28,
              borderRadius: 7,
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text2)',
              transition: 'background 0.15s, color 0.15s',
            }}
            onMouseEnter={e => {
              ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text)'
            }}
            onMouseLeave={e => {
              ;(e.currentTarget as HTMLElement).style.background = 'transparent'
              ;(e.currentTarget as HTMLElement).style.color = 'var(--text2)'
            }}
          >
            {isMobile ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="15" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            )}
          </button>
        </div>

        {/* Search pill — collapsed strip drops it out via display so it
            doesn't reserve clipped vertical space; expanded shows the
            full pill with no maxHeight cap so the top edge never gets
            cut by an overflow ancestor. */}
        {expanded && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 10px',
              borderRadius: 8,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.06)',
            }}
          >
            <span style={{ color: 'var(--text2)', display: 'inline-flex', flexShrink: 0 }}>
              <SearchIcon />
            </span>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('Search')}
              aria-label={t('Cari menu')}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                color: 'var(--text)',
                fontSize: 13,
                fontFamily: 'inherit',
                padding: 0,
                lineHeight: 1.3,
              }}
            />
          </div>
        )}
      </div>

      {/* Nav sections */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden" style={{ padding: '4px 8px 8px 8px' }}>
        {filteredSections.map((sec, secIdx) => {
          const isCollapsedSec = !!collapsed[sec.id]
          const showHeader = !!sec.badge || !!sec.label
          return (
            <div key={sec.id} style={{ marginTop: secIdx === 0 ? 0 : 14 }}>
              {/* Section divider — a subtle hairline above each section
                  except the first, so groups read as separate clusters
                  the way macOS System Settings renders them. */}
              {showHeader && secIdx !== 0 && (
                <div
                  style={{
                    height: 1,
                    background: 'rgba(255,255,255,0.05)',
                    margin: '0 8px 10px 8px',
                  }}
                />
              )}

              {/* Section header */}
              {showHeader && (
                <button
                  type="button"
                  onClick={() => toggleSection(sec.id)}
                  className="flex items-center w-full select-none"
                  style={{
                    background: 'transparent',
                    border: 'none',
                    padding: expanded ? '4px 12px 8px' : '4px 0 8px',
                    color: 'var(--text2)',
                    cursor: 'pointer',
                    justifyContent: expanded ? 'space-between' : 'center',
                    gap: 8,
                  }}
                >
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {sec.badge && <span style={{ flexShrink: 0 }}>{sec.badge}</span>}
                    {(sec.label || sec.fullLabel) && (
                      <span
                        style={{
                          fontSize: 11,
                          textTransform: 'uppercase',
                          letterSpacing: '0.08em',
                          fontWeight: 600,
                          color: 'var(--text2)',
                          whiteSpace: 'nowrap',
                          maxWidth: expanded ? 190 : 0,
                          opacity: expanded ? 1 : 0,
                          overflow: 'hidden',
                          transition: 'max-width 0.22s ease, opacity 0.15s ease',
                        }}
                      >
                        {t(sec.label || sec.fullLabel || '')}
                      </span>
                    )}
                  </span>
                  <span
                    style={{
                      color: 'var(--text2)',
                      maxWidth: expanded ? 16 : 0,
                      opacity: expanded ? 1 : 0,
                      overflow: 'hidden',
                      transition: 'max-width 0.22s ease, opacity 0.15s ease',
                    }}
                  >
                    <ChevronIcon collapsed={isCollapsedSec} />
                  </span>
                </button>
              )}

              {/* Items */}
              {!isCollapsedSec && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {sec.items.map((entry, idx) => {
                    if ('type' in entry && entry.type === 'subgroup') {
                      return (
                        <Subgroup
                          key={entry.id}
                          group={entry}
                          isExpanded={expanded}
                          isActive={isActive}
                          collapsed={collapsed}
                          toggleSection={toggleSection}
                          unread={unread}
                        />
                      )
                    }
                    const item = entry as NavItem
                    return (
                      <NavLink
                        key={item.href + idx}
                        item={item}
                        isExpanded={expanded}
                        active={isActive(item.href)}
                        unread={unread}
                      />
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}

        {filteredSections.length === 0 && query.trim() && (
          <div
            style={{
              padding: '20px 16px',
              fontSize: 12,
              color: 'var(--text2)',
              textAlign: 'center',
            }}
          >
            {t('Tidak ada menu yang cocok.')}
          </div>
        )}
      </div>

      {/* Account button at the bottom */}
      <AccountButton isExpanded={expanded} />
    </nav>
    </>
  )
}

// ── Subcomponents ────────────────────────────────────────────

/** Brand wordmark rendered inside an IconBox tile (used for the
 *  Bentala Project / Studio sub-group logos). Stays visible — and aligned
 *  with the item icons — even when the sidebar is collapsed to the icon rail. */
function BrandGlyph({ text }: { text: string }) {
  return (
    <span style={{ fontSize: 8.5, fontWeight: 800, color: '#fff', lineHeight: 1, letterSpacing: '0.02em', textTransform: 'lowercase' }}>
      {text}
    </span>
  )
}

function BrandBadge({ text }: { text: string }) {
  return (
    <span
      style={{
        fontSize: 9,
        fontWeight: 800,
        color: 'var(--text)',
        lineHeight: 1,
        textTransform: 'lowercase',
      }}
    >
      {text}
    </span>
  )
}

/** macOS-style icon container — *lit* rounded square. The base
 *  accent color is layered with a top-down white→transparent→black
 *  gradient so the tile reads as if it's lit from above; an inner
 *  highlight line + soft outer shadow give edge definition. White
 *  glyph keeps contrast across every shade. */
function IconBox({
  color,
  children,
  active = false,
}: {
  color: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <span
      style={{
        width: 26,
        height: 26,
        borderRadius: 7,
        // Active rows get the full macOS-style luminous tile (colored
        // gradient wash + lifted shadow). Inactive rows render as a
        // muted neutral tile so the sidebar reads as a calm list and
        // the active row pops as the clear focus point.
        backgroundImage: active
          ? `linear-gradient(180deg, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0.06) 45%, rgba(0,0,0,0.18) 100%)`
          : 'none',
        backgroundColor: active ? color : 'rgba(255,255,255,0.06)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: active ? '#fff' : 'var(--text2)',
        flexShrink: 0,
        boxShadow: active
          ? 'inset 0 1px 0 rgba(255,255,255,0.35), inset 0 -1px 0 rgba(0,0,0,0.22), 0 2px 6px rgba(0,0,0,0.35)'
          : 'inset 0 0 0 1px rgba(255,255,255,0.06)',
        transition: 'background-color 0.15s ease, color 0.15s ease',
      }}
    >
      {children}
    </span>
  )
}

function NavLink({
  item,
  isExpanded,
  active,
  unread,
}: {
  item: NavItem
  isExpanded: boolean
  active: boolean
  unread?: Record<string, number>
}) {
  const t = useT()
  const color = item.color ?? COLOR.blue
  return (
    <Link
      href={item.href}
      prefetch={false}
      className={cn('relative flex items-center cursor-pointer transition-colors duration-150')}
      style={{
        padding: isExpanded ? '9px 12px' : '9px 0',
        margin: 0,
        borderRadius: 8,
        fontSize: 14,
        justifyContent: isExpanded ? 'flex-start' : 'center',
        gap: isExpanded ? 12 : 0,
        // Active uses the macOS-style translucent fill instead of the
        // old left-border + accent-text combo, so the row reads as a
        // selected pill.
        background: active ? 'rgba(255,255,255,0.08)' : 'transparent',
        textDecoration: 'none',
        color: 'var(--text)',
        overflow: 'hidden',
        boxSizing: 'border-box',
      }}
      onMouseEnter={e => {
        if (active) return
        ;(e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)'
      }}
      onMouseLeave={e => {
        if (active) return
        ;(e.currentTarget as HTMLElement).style.background = 'transparent'
      }}
    >
      <IconBox color={color} active={active}>{item.icon}</IconBox>
      <span
        style={{
          whiteSpace: 'nowrap',
          maxWidth: isExpanded ? 160 : 0,
          opacity: isExpanded ? 1 : 0,
          overflow: 'hidden',
          transition: 'max-width 0.22s ease, opacity 0.15s ease',
          fontWeight: active ? 500 : 400,
          letterSpacing: '0.005em',
        }}
      >
        {t(item.label)}
      </span>
      {isExpanded && (() => {
        // Unified Chat tab shows the SUM of unread across every room; a normal
        // per-room chat link shows just its own count.
        const room = chatRoomFromPath(item.href)
        const n = item.href === '/chat'
          ? Object.values(unread ?? {}).reduce((a, b) => a + (b || 0), 0)
          : room ? (unread?.[room] ?? 0) : 0
        if (!n) return null
        return (
          <span style={{ marginLeft: 'auto', minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, background: 'var(--accent2)', color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            {n > 9 ? '9+' : n}
          </span>
        )
      })()}
    </Link>
  )
}

function Subgroup({
  group,
  isExpanded,
  isActive,
  collapsed,
  toggleSection,
  unread,
}: {
  group: NavSubgroup
  isExpanded: boolean
  isActive: (href: string) => boolean
  collapsed: Record<string, boolean>
  toggleSection: (id: string) => void
  unread?: Record<string, number>
}) {
  const t = useT()
  const hasActiveChild = subgroupHasActive(group.items, isActive)
  const userCollapsedKey = `subgroup:${group.id}`
  const isCollapsed = collapsed[userCollapsedKey] === true && !hasActiveChild

  return (
    <div>
      <button
        type="button"
        onClick={() => toggleSection(userCollapsedKey)}
        className="flex items-center w-full cursor-pointer select-none transition-colors duration-150"
        style={{
          padding: isExpanded ? '7px 12px' : '7px 0',
          background: 'transparent',
          border: 'none',
          color: 'var(--text2)',
          justifyContent: isExpanded ? 'flex-start' : 'center',
          gap: isExpanded ? 10 : 0,
          width: '100%',
        }}
        title={group.label}
      >
        {group.icon && (
          <IconBox color={group.color ?? COLOR.blue} active={false}>
            {group.icon}
          </IconBox>
        )}
        <span
          style={{
            whiteSpace: 'nowrap',
            maxWidth: isExpanded ? 160 : 0,
            opacity: isExpanded ? 1 : 0,
            overflow: 'hidden',
            transition: 'max-width 0.22s ease, opacity 0.15s ease',
            fontSize: 11,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            fontWeight: 600,
            color: 'var(--text2)',
          }}
        >
          {t(group.label)}
        </span>
        <span
          style={{
            marginLeft: 'auto',
            color: 'var(--text2)',
            display: 'inline-flex',
            maxWidth: isExpanded ? 16 : 0,
            opacity: isExpanded ? 0.7 : 0,
            overflow: 'hidden',
            transition: 'max-width 0.22s ease, opacity 0.15s ease',
          }}
        >
          <ChevronIcon collapsed={isCollapsed} />
        </span>
      </button>
      {!isCollapsed && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingLeft: isExpanded ? 8 : 0 }}>
          {group.items.map((entry) => {
            if ('type' in entry && entry.type === 'subgroup') {
              return (
                <Subgroup
                  key={entry.id}
                  group={entry}
                  isExpanded={isExpanded}
                  isActive={isActive}
                  collapsed={collapsed}
                  toggleSection={toggleSection}
                  unread={unread}
                />
              )
            }
            const item = entry as NavItem
            return (
              <NavLink
                key={item.href}
                item={item}
                isExpanded={isExpanded}
                active={isActive(item.href)}
                unread={unread}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// Flatten all hrefs from items (recursing into nested subgroups).
function collectHrefs(items: NavEntry[]): string[] {
  const out: string[] = []
  for (const e of items) {
    if ('type' in e && e.type === 'subgroup') out.push(...collectHrefs(e.items))
    else out.push((e as NavItem).href)
  }
  return out
}

// Recursively checks whether any descendant link is the active route.
function subgroupHasActive(items: NavEntry[], isActive: (href: string) => boolean): boolean {
  return items.some(e =>
    'type' in e && e.type === 'subgroup'
      ? subgroupHasActive(e.items, isActive)
      : isActive((e as NavItem).href),
  )
}
