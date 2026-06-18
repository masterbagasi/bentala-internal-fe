import type { TeamMember } from './types'

// ============================================================
// CONSTANTS
// ============================================================

export const TEAM: TeamMember[] = [
  { name: 'Dandi',            role: 'CEO',            color: '#6c63ff', initials: 'Da', email: 'dandi@masterbagasi.com' },
  { name: 'Naufal',           role: 'CCO',            color: '#43d9a2', initials: 'Na', email: 'naufal@masterbagasi.com' },
  { name: 'Design Studio',    role: 'Graphic Design', color: '#ffc542', initials: 'DS', email: 'design@masterbagasi.com' },
  { name: 'Video Production', role: 'Video',          color: '#ff6b6b', initials: 'VP', email: 'video@masterbagasi.com' },
]

// Social platforms a post can target. `bg` is the chip background tint.
export const POST_PLATFORMS = [
  { key: 'ig',       label: 'Instagram', short: 'IG', color: '#e1306c', bg: '#2a1028' },
  { key: 'tiktok',   label: 'TikTok',    short: 'TT', color: '#69c9d0', bg: '#0a1a1a' },
  { key: 'youtube',  label: 'YouTube',   short: 'YT', color: '#ff4d4f', bg: '#2a0e0e' },
  { key: 'x',        label: 'X',         short: 'X',  color: '#d6d9dc', bg: '#1a1a1a' },
  { key: 'linkedin', label: 'LinkedIn',  short: 'IN', color: '#3b9ad9', bg: '#0d1a24' },
] as const

// Content aspect ratios (complete set for social formats).
export const POST_RATIOS = [
  { key: '1:1',    label: '1:1',    hint: 'Square' },
  { key: '4:5',    label: '4:5',    hint: 'Portrait' },
  { key: '3:4',    label: '3:4',    hint: 'Portrait' },
  { key: '2:3',    label: '2:3',    hint: 'Portrait' },
  { key: '9:16',   label: '9:16',   hint: 'Story / Reel / Short' },
  { key: '16:9',   label: '16:9',   hint: 'Landscape / YouTube' },
  { key: '1.91:1', label: '1.91:1', hint: 'Link / Landscape' },
] as const

export const POST_STATUS_LABELS: Record<string, string> = {
  todo:      'Idea',
  brief:     'Brief',
  produksi:  'Production',
  revisi:    'Revisi',
  review:    'Review',
  ready:     'Ready to Post',
  published: 'Published',
  done:      'Done',
  // legacy
  idea:      'Idea',
  edit:      'Production',
  scheduled: 'Ready to Post',
}

export const POST_STATUS_COLORS: Record<string, string> = {
  todo:      '#8b8fa8',
  brief:     '#64b5f6',
  produksi:  '#5b9bd5',
  revisi:    '#a78bfa',
  review:    '#ffc542',
  ready:     '#43d9a2',
  published: '#22c55e',
  done:      '#43d9a2',
}

// BPI Board columns (Naufal view)
export const BPI_STATUS_COLS = [
  { key: 'todo',      label: 'Idea',          color: '#8b8fa8' },
  { key: 'brief',     label: 'Brief',         color: '#64b5f6' },
  { key: 'produksi',  label: 'Production',    color: '#5b9bd5' },
  { key: 'revisi',    label: 'Revisi',        color: '#a78bfa' },
  { key: 'review',    label: 'Review',        color: '#ffc542', locked: true },
  { key: 'ready',     label: 'Ready to Post', color: '#43d9a2' },
  { key: 'published', label: 'Published',     color: '#22c55e' },
] as const

// Socmed Management "Projects" board — single Revisi column (a post in revision
// on either track sits here). The per-track state (which discipline is in
// revision / review / production) is shown via status chips on the card instead.
export const SMM_STATUS_COLS = [
  { key: 'todo',      label: 'Idea',          color: '#8b8fa8' },
  { key: 'brief',     label: 'Brief',         color: '#64b5f6' },
  { key: 'produksi',  label: 'Production',    color: '#5b9bd5' },
  { key: 'revisi',    label: 'Revisi',        color: '#a78bfa' },
  { key: 'review',    label: 'Review',        color: '#ffc542' },
  { key: 'ready',     label: 'Ready to Post', color: '#43d9a2' },
  { key: 'published', label: 'Published',     color: '#22c55e' },
] as const

// WS Board columns (Video Production / Design Studio)
export const WS_STATUS_COLS = [
  // "To Do List" maps to BPI's "Brief" — a post enters the production worksheet
  // once it's briefed. While at 'todo' (BPI "Idea") it must NOT appear here.
  { key: 'brief',     label: 'To Do List',  color: '#8b8fa8' },
  { key: 'revisi',    label: 'Revisi',      color: '#a78bfa', locked: true },
  { key: 'produksi',  label: 'Production',  color: '#5b9bd5' },
  { key: 'review',    label: 'Review',      color: '#ffc542' },
  { key: 'done',      label: 'Done',        color: '#43d9a2' },
] as const

export const STAGE_LABELS: Record<string, string> = {
  lead:     'Lead',
  pitch:    'Pitching',
  close:    'Closed',
  invoice:  'Invoice',
  inactive: 'Inactive',
}

export const CRM_STAGES = [
  { key: 'lead',    label: 'Lead / Prospek', color: '#8b8fa8' },
  { key: 'pitch',   label: 'Pitching',       color: '#5b9bd5' },
  { key: 'close',   label: 'Closed',         color: '#43d9a2' },
  { key: 'invoice', label: 'Invoice',        color: '#ffc542' },
] as const

export const PROJ_TYPE: Record<string, string> = {
  smm:      'SMM',
  content:  'One-off',
  ads:      'Ads',
  kol:      'KOL',
  internal: 'Internal',
}

export const PROJ_STATUS_CLASS: Record<string, string> = {
  active:    'text-accent3 bg-[#1a3330]',
  hold:      'text-accent4 bg-[#2a1f10]',
  done:      'text-accent3 bg-[#1a3330]',
  cancelled: 'text-text2 bg-bg3',
}

export const TASK_STATUS_LABELS: Record<string, string> = {
  todo:     'To Do',
  progress: 'In Progress',
  review:   'Review',
  done:     'Done',
}

export const INV_STATUS_LABELS: Record<string, string> = {
  pending: 'Menunggu',
  dp:      'DP',
  paid:    'Lunas',
  overdue: 'Overdue',
}

export const SERVICE_OPTIONS = [
  { value: 'smm',     label: 'Social Media Management' },
  { value: 'content', label: 'Content Production' },
  { value: 'ads',     label: 'Advertising' },
  { value: 'kol',     label: 'KOL Management' },
  { value: 'full',    label: 'Full Package' },
]

export const PRIORITY_COLORS: Record<string, string> = {
  low:    '#8b8fa8',
  medium: '#5b9bd5',
  high:   '#ffc542',
  urgent: '#ff6b6b',
}

export const PAGE_TITLES: Record<string, string> = {
  dashboard:     'Dashboard',
  bpi:           'Bentala Project Indonesia',
  'bpi-analytics': 'Bentala Project Indonesia — Analytics',
  'bpi-faizal':  'Video Production',
  'bpi-reinaldi':'Design Studio',
  'bsi-calendar':'Bentala Studio Indonesia — Content Calendar',
  'bsi-posts':   'Bentala Studio Indonesia — Post Tracker',
  clients:       'CRM Pipeline',
  invoices:      'Invoice & Pembayaran',
  projects:      'All Projects',
  tasks:         'Task Board',
}

// ── Pipeline stages ─────────────────────────────────────────────

export const VP_STAGES = [
  { key: 'ide',    label: 'Ide',    color: '#8b8fa8' },
  { key: 'script', label: 'Script', color: '#5b9bd5' },
  { key: 'audio',  label: 'Audio',  color: '#ffc542' },
  { key: 'video',  label: 'Video',  color: '#6c63ff' },
  { key: 'upload', label: 'Upload', color: '#43d9a2' },
] as const

export const DS_STAGES = [
  { key: 'ide',    label: 'Ide',    color: '#8b8fa8' },
  { key: 'brief',  label: 'Brief',  color: '#5b9bd5' },
  { key: 'design', label: 'Design', color: '#ffc542' },
  { key: 'review', label: 'Review', color: '#ff6b6b' },
  { key: 'upload', label: 'Upload', color: '#43d9a2' },
] as const

export type PipelineStage = { key: string; label: string; color: string }

// ── AI Studio constants ─────────────────────────────────────────

export const AI_TONES = [
  { key: 'informatif', label: 'Informatif' },
  { key: 'fun',        label: 'Fun & Santai' },
  { key: 'inspiratif', label: 'Inspiratif' },
  { key: 'viral',      label: 'Viral / Hook' },
] as const

export const AI_PLATFORMS = [
  { key: 'ig',       label: 'Instagram' },
  { key: 'tiktok',   label: 'TikTok' },
  { key: 'keduanya', label: 'IG + TikTok' },
] as const

// ── Content Pipeline constants ──────────────────────────────────

export const PIPELINE_STAGES = [
  { key: 'ide',     label: 'Ide',     color: '#6c63ff' },
  { key: 'brief',   label: 'Brief',   color: '#f59e0b' },
  { key: 'caption', label: 'Caption', color: '#43d9a2' },
  { key: 'selesai', label: 'Selesai', color: '#8b8fa8' },
] as const
