import { getSupabase } from '@/lib/supabase'
import { useStore } from '@/hooks/useStore'
import type { ContactDeleteSnapshot } from '@/lib/types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = () => getSupabase() as any

/** Everything under a contact — deals, contracts (projects) + their tasks, and
 *  invoices + their items — gathered from the live store so a delete can be
 *  captured whole and restored exactly. */
export function buildContactSnapshot(contactId: string): ContactDeleteSnapshot | null {
  const s = useStore.getState()
  const contact = s.contacts.find(c => c.id === contactId)
  if (!contact) return null
  const deals = s.deals.filter(d => d.contact_id === contactId)
  const projects = s.crmProjects.filter(p => p.contact_id === contactId)
  const projIds = new Set(projects.map(p => p.id))
  const tasks = s.crmTasks.filter(tk => projIds.has(tk.project_id))
  const invoices = s.crmInvoices.filter(i => i.contact_id === contactId || (i.project_id != null && projIds.has(i.project_id)))
  const invIds = new Set(invoices.map(i => i.id))
  const invoiceItems = s.crmInvoiceItems.filter(it => invIds.has(it.invoice_id))
  return { contact, deals, projects, tasks, invoices, invoiceItems }
}

/** Hard-delete a contact and all its CRM records (child → parent order so no FK
 *  blocks), updating the store optimistically. The snapshot is what gets logged
 *  to the activity feed for later restore. */
export async function hardDeleteContact(snap: ContactDeleteSnapshot) {
  const s = sb()
  const ids = <T extends { id: string }>(rows: T[]) => rows.map(r => r.id)
  if (snap.invoiceItems.length) { const { error } = await s.from('crm_invoice_items').delete().in('id', ids(snap.invoiceItems)); if (error) throw error }
  if (snap.invoices.length) { const { error } = await s.from('crm_invoices').delete().in('id', ids(snap.invoices)); if (error) throw error }
  if (snap.tasks.length) { const { error } = await s.from('crm_tasks').delete().in('id', ids(snap.tasks)); if (error) throw error }
  if (snap.projects.length) { const { error } = await s.from('crm_projects').delete().in('id', ids(snap.projects)); if (error) throw error }
  if (snap.deals.length) { const { error } = await s.from('deals').delete().in('id', ids(snap.deals)); if (error) throw error }
  { const { error } = await s.from('contacts').delete().eq('id', snap.contact.id); if (error) throw error }

  const st = useStore.getState()
  snap.invoiceItems.forEach(x => st.removeCrmInvoiceItem(x.id))
  snap.invoices.forEach(x => st.removeCrmInvoice(x.id))
  snap.tasks.forEach(x => st.removeCrmTask(x.id))
  snap.projects.forEach(x => st.removeCrmProject(x.id))
  snap.deals.forEach(x => st.removeDeal(x.id))
  st.removeContact(snap.contact.id)
}

/** Re-insert a snapshot (original ids preserved so every FK lines back up) and
 *  push it into the store. Restores contact + pipeline + contracts + invoices
 *  exactly as before the delete.
 *
 *  Uses upsert throughout so a retry after a partial failure is safe. Handles the
 *  deals ⇄ crm_projects cycle (deals.crm_project_id → crm_projects, and
 *  crm_projects.deal_id → deals) by inserting deals WITHOUT their crm_project_id
 *  first, then the projects, then re-linking the deals. */
export async function restoreContactSnapshot(snap: ContactDeleteSnapshot) {
  const s = sb()
  const st = useStore.getState()

  { const { error } = await s.from('contacts').upsert(snap.contact); if (error) throw error }

  if (snap.deals.length) {
    // Break the cycle: crm_project_id points at a project not yet restored.
    const dealsNoLink = snap.deals.map(d => ({ ...d, crm_project_id: null }))
    const { error } = await s.from('deals').upsert(dealsNoLink); if (error) throw error
  }
  if (snap.projects.length) { const { error } = await s.from('crm_projects').upsert(snap.projects); if (error) throw error }
  // Re-link deals to their crm_project now that the projects exist.
  for (const d of snap.deals) {
    if (d.crm_project_id) { const { error } = await s.from('deals').update({ crm_project_id: d.crm_project_id }).eq('id', d.id); if (error) throw error }
  }
  if (snap.tasks.length) { const { error } = await s.from('crm_tasks').upsert(snap.tasks); if (error) throw error }
  if (snap.invoices.length) { const { error } = await s.from('crm_invoices').upsert(snap.invoices); if (error) throw error }
  if (snap.invoiceItems.length) { const { error } = await s.from('crm_invoice_items').upsert(snap.invoiceItems); if (error) throw error }

  // Store reflects the final (fully-linked) state.
  st.upsertContact(snap.contact)
  snap.deals.forEach(st.upsertDeal)
  snap.projects.forEach(st.upsertCrmProject)
  snap.tasks.forEach(st.upsertCrmTask)
  snap.invoices.forEach(st.upsertCrmInvoice)
  snap.invoiceItems.forEach(st.upsertCrmInvoiceItem)
}

/** Flag an activity row as restored in the DB + store so its Pulihkan button
 *  turns into "Dipulihkan". (activity_log realtime is INSERT-only, so the store
 *  is updated directly.) */
export async function markActivityRestored(activityId: string) {
  const st = useStore.getState()
  const row = st.activity.find(a => a.id === activityId)
  const nextMeta = { ...(row?.meta ?? {}), restored: true }
  st.setActivity(st.activity.map(a => (a.id === activityId ? { ...a, meta: nextMeta } : a)))
  await sb().from('activity_log').update({ meta: nextMeta }).eq('id', activityId)
}
