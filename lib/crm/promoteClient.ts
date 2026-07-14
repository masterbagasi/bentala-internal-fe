import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import type { Contact, CrmProject, CrmInvoice } from '@/lib/types'

// Project statuses that count as "sudah jalan" (work has started or finished).
const RUNNING_STATUSES = ['BERJALAN', 'REVIEW', 'ON_HOLD', 'SELESAI']

/** A contact becomes a Client only once BOTH are true: an invoice has been paid
 *  (partial or full) AND a contract/project is on progress. */
export function contactQualifiesAsClient(
  contactId: string,
  projects: Pick<CrmProject, 'contact_id' | 'status'>[],
  invoices: Pick<CrmInvoice, 'contact_id' | 'status' | 'paid_amount'>[],
): boolean {
  const paidInvoice = invoices.some(i =>
    i.contact_id === contactId && (i.status === 'LUNAS' || i.status === 'SEBAGIAN' || (i.paid_amount || 0) > 0))
  const runningProject = projects.some(p =>
    p.contact_id === contactId && RUNNING_STATUSES.includes(p.status))
  return paidInvoice && runningProject
}

/** Promote a LEAD contact to CLIENT (optimistic store + DB write) — but only when
 *  it qualifies (paid invoice AND running project). Only upgrades from LEAD, so a
 *  manual Vendor/Partner or existing Client is never overridden. Safe to call
 *  repeatedly and from any trigger point — a no-op until both conditions hold. */
export async function promoteContactToClient(contactId: string | null | undefined) {
  if (!contactId) return
  const store = useStore.getState()
  const c = store.contacts.find(x => x.id === contactId)
  if (!c || c.category !== 'LEAD') return
  if (!contactQualifiesAsClient(contactId, store.crmProjects, store.crmInvoices)) return
  store.upsertContact({ ...c, category: 'CLIENT' } as Contact)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (getSupabase() as any).from('contacts').update({ category: 'CLIENT' }).eq('id', contactId)
  if (error) store.upsertContact(c) // rollback on failure
}
