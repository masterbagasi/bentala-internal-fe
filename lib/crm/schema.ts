import { z } from 'zod'

// ── Contact ──────────────────────────────────────────────────
export const CONTACT_TYPES = ['INDIVIDU', 'PERUSAHAAN'] as const
export const CONTACT_CATEGORIES = ['LEAD', 'CLIENT', 'VENDOR', 'PARTNER'] as const
export const CONTACT_SOURCES = ['INSTAGRAM', 'WHATSAPP', 'WEBSITE', 'REFERRAL', 'EVENT', 'ADS', 'MARKETPLACE', 'LAINNYA'] as const

export const CATEGORY_LABEL: Record<string, string> = {
  LEAD: 'Lead', CLIENT: 'Client', VENDOR: 'Vendor', PARTNER: 'Partner',
}
export const CATEGORY_COLOR: Record<string, string> = {
  LEAD: '#5b9bd5', CLIENT: '#43d9a2', VENDOR: '#ffc542', PARTNER: '#a78bfa',
}
export const SOURCE_LABEL: Record<string, string> = {
  INSTAGRAM: 'Instagram', WHATSAPP: 'WhatsApp', WEBSITE: 'Website', REFERRAL: 'Referral',
  EVENT: 'Event', ADS: 'Ads', MARKETPLACE: 'Marketplace', LAINNYA: 'Lainnya',
}
export const CLIENT_TIERS = ['UMKM', 'Small Business', 'Mid Market', 'Enterprise'] as const
export const INDUSTRIES = [
  'F&B', 'Retail', 'Fashion', 'Beauty', 'Technology', 'Education', 'Healthcare', 'Property',
  'Finance', 'Automotive', 'Media', 'Manufacturing', 'Hospitality', 'Government', 'NGO', 'Services', 'Other',
] as const

export const contactSchema = z.object({
  name: z.string().trim().min(1, 'Nama wajib diisi'),
  type: z.enum(CONTACT_TYPES),
  company_name: z.string().trim().default(''),
  category: z.enum(CONTACT_CATEGORIES),
  job_title: z.string().trim().default(''),
  email: z.string().trim().email('Email tidak valid').or(z.literal('')).default(''),
  phone: z.string().trim().default(''),
  instagram: z.string().trim().default(''),
  source: z.enum(CONTACT_SOURCES),
  owner_email: z.string().trim().default(''),
  client_tier: z.string().trim().default(''),
  industry: z.string().trim().default(''),
  address: z.string().trim().default(''),
  city: z.string().trim().default(''),
  province: z.string().trim().default(''),
  country: z.string().trim().default('Indonesia'),
  tags: z.array(z.string()).default([]),
  notes: z.string().trim().default(''),
}).refine(v => v.type !== 'PERUSAHAAN' || v.company_name.trim().length > 0, {
  message: 'Nama perusahaan wajib untuk tipe Perusahaan', path: ['company_name'],
})
export type ContactInput = z.infer<typeof contactSchema>

// ── Deal ─────────────────────────────────────────────────────
// Deal funnel — same 9 stages as the legacy CRM pipeline (labels + colours match).
export const DEAL_STAGES = ['prospect', 'contacted', 'qualified', 'discovery', 'proposal', 'negotiation', 'won', 'lost', 'client'] as const
export const DEAL_OPEN_STAGES = ['prospect', 'contacted', 'qualified', 'discovery', 'proposal', 'negotiation'] as const
export const DEAL_LOST_REASONS = ['HARGA', 'TIMING', 'KOMPETITOR', 'NO_RESPONSE', 'LAINNYA'] as const

export const STAGE_LABEL: Record<string, string> = {
  prospect: 'Prospect', contacted: 'Contacted', qualified: 'Qualified', discovery: 'Discovery Meeting',
  proposal: 'Proposal Sent', negotiation: 'Negotiation', won: 'Won', lost: 'Lost', client: 'Client',
}
export const STAGE_COLOR: Record<string, string> = {
  prospect: '#8b8fa8', contacted: '#6c8fd5', qualified: '#5b9bd5', discovery: '#7e6bd5',
  proposal: '#a78bfa', negotiation: '#ffc542', won: '#43d9a2', lost: '#ff6b6b', client: '#2bb673',
}
export const LOST_REASON_LABEL: Record<string, string> = {
  HARGA: 'Harga', TIMING: 'Timing', KOMPETITOR: 'Kompetitor', NO_RESPONSE: 'No Response', LAINNYA: 'Lainnya',
}

export const dealSchema = z.object({
  name: z.string().trim().min(1, 'Nama deal wajib diisi'),
  contact_id: z.string().uuid('Contact wajib dipilih'),
  services: z.array(z.string()).min(1, 'Minimal 1 layanan'),
  value: z.number({ message: 'Nilai wajib angka' }).nonnegative('Nilai tidak boleh negatif'),
  stage: z.enum(DEAL_STAGES).default('prospect'),
  expected_close_date: z.string().trim().default(''),
  owner_email: z.string().trim().default(''),
  source: z.string().trim().default(''),
  description: z.string().trim().default(''),
})
export type DealInput = z.infer<typeof dealSchema>

export const lostSchema = z.object({
  lost_reason: z.enum(DEAL_LOST_REASONS),
  lost_notes: z.string().trim().default(''),
})

/** Common service options — free entry still allowed via the form. */
export const SERVICE_OPTIONS = [
  'Social Media Management', 'Content Production', 'Branding', 'Website', 'Ads / Paid Media',
  'Photography', 'Videography', 'Copywriting', 'Konsultasi',
] as const

// ── CRM Project + Task ───────────────────────────────────────
export const PROJECT_STATUSES = ['BELUM_MULAI', 'BERJALAN', 'REVIEW', 'SELESAI', 'ON_HOLD', 'BATAL'] as const
export const PROJECT_STATUS_LABEL: Record<string, string> = {
  BELUM_MULAI: 'Belum Mulai', BERJALAN: 'Berjalan', REVIEW: 'Review', SELESAI: 'Selesai', ON_HOLD: 'On Hold', BATAL: 'Batal',
}
export const PROJECT_STATUS_COLOR: Record<string, string> = {
  BELUM_MULAI: '#8b8fa8', BERJALAN: '#5b9bd5', REVIEW: '#ffc542', SELESAI: '#43d9a2', ON_HOLD: '#c084fc', BATAL: '#ff6b6b',
}
export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const
export const TASK_STATUS_LABEL: Record<string, string> = { TODO: 'To Do', IN_PROGRESS: 'In Progress', DONE: 'Done' }
export const TASK_STATUS_COLOR: Record<string, string> = { TODO: '#8b8fa8', IN_PROGRESS: '#5b9bd5', DONE: '#43d9a2' }

export const projectSchema = z.object({
  name: z.string().trim().min(1, 'Nama project wajib diisi'),
  contact_id: z.string().uuid().nullable().optional(),
  deal_id: z.string().uuid().nullable().optional(),
  services: z.array(z.string()).default([]),
  contract_value: z.number().nonnegative('Nilai tidak boleh negatif'),
  start_date: z.string().trim().min(1, 'Tanggal mulai wajib'),
  deadline: z.string().trim().min(1, 'Deadline wajib'),
  manager_email: z.string().trim().min(1, 'Manager wajib dipilih'),
  member_emails: z.array(z.string()).default([]),
  scope: z.string().trim().min(1, 'Scope wajib diisi'),
  status: z.enum(PROJECT_STATUSES).default('BELUM_MULAI'),
})
export type ProjectInput = z.infer<typeof projectSchema>

export const taskSchema = z.object({
  name: z.string().trim().min(1, 'Nama task wajib diisi'),
  assignee_email: z.string().trim().default(''),
  due_date: z.string().trim().default(''),
  status: z.enum(TASK_STATUSES).default('TODO'),
})
export type TaskInput = z.infer<typeof taskSchema>

// ── Invoice ──────────────────────────────────────────────────
export const INVOICE_STATUSES = ['DRAFT', 'TERKIRIM', 'SEBAGIAN', 'LUNAS', 'JATUH_TEMPO'] as const
export const INVOICE_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft', TERKIRIM: 'Terkirim', SEBAGIAN: 'Sebagian', LUNAS: 'Lunas', JATUH_TEMPO: 'Jatuh Tempo',
}
export const INVOICE_STATUS_COLOR: Record<string, string> = {
  DRAFT: '#8b8fa8', TERKIRIM: '#5b9bd5', SEBAGIAN: '#ffc542', LUNAS: '#43d9a2', JATUH_TEMPO: '#ff6b6b',
}
// Statuses a user can set manually — JATUH_TEMPO is derived, never stored.
export const INVOICE_STATUSES_MANUAL = ['DRAFT', 'TERKIRIM', 'SEBAGIAN', 'LUNAS'] as const
/** True when an unpaid, non-draft invoice is past its due date. */
export function isInvoiceOverdue(status: string, dueDate: string | null | undefined, today: string): boolean {
  return status !== 'LUNAS' && status !== 'DRAFT' && !!dueDate && dueDate < today
}
/** Status to DISPLAY: overdue unpaid invoices surface as JATUH_TEMPO everywhere,
 *  from one rule — the stored status stays DRAFT/TERKIRIM/SEBAGIAN/LUNAS. */
export function effectiveInvoiceStatus(status: string, dueDate: string | null | undefined, today: string): string {
  return isInvoiceOverdue(status, dueDate, today) ? 'JATUH_TEMPO' : status
}

export const INVOICE_TERMINS = ['FULL', 'DP_50', 'NET_14', 'NET_30', 'CUSTOM'] as const
export const TERMIN_LABEL: Record<string, string> = {
  FULL: 'Bayar Penuh', DP_50: 'DP 50%', NET_14: 'Net 14 hari', NET_30: 'Net 30 hari', CUSTOM: 'Custom',
}
export const TAX_RATE = 0.11 // PPN 11%

export interface InvoiceLine { description: string; qty: number; unit_price: number }
/** subtotal, tax and grand total (never stored — always derived). */
export function invoiceTotals(items: InvoiceLine[], discount: number, taxEnabled: boolean) {
  const subtotal = items.reduce((n, i) => n + (i.qty || 0) * (i.unit_price || 0), 0)
  const afterDisc = Math.max(0, subtotal - (discount || 0))
  const tax = taxEnabled ? Math.round(afterDisc * TAX_RATE) : 0
  return { subtotal, tax, total: afterDisc + tax }
}

export const invoiceSchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  invoice_date: z.string().trim().min(1, 'Tanggal invoice wajib'),
  due_date: z.string().trim().min(1, 'Jatuh tempo wajib'),
  discount: z.number().nonnegative().default(0),
  tax_enabled: z.boolean().default(false),
  termin: z.enum(INVOICE_TERMINS).default('FULL'),
  bank_account: z.string().trim().default(''),
  status: z.enum(INVOICE_STATUSES).default('DRAFT'),
  notes: z.string().trim().default(''),
})
export type InvoiceInput = z.infer<typeof invoiceSchema>

/** Turn Zod issues into a { field: message } map for inline form errors. */
export function zodErrors(err: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const i of err.issues) {
    const key = String(i.path[0] ?? '_')
    if (!out[key]) out[key] = i.message
  }
  return out
}
