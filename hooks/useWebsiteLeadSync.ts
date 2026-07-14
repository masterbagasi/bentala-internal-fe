'use client'

import { useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useStore } from './useStore'
import { SERVICE_OPTIONS } from '@/lib/crm/schema'
import type { Contact, Deal } from '@/lib/types'

// Runs at most once per page load.
let hasSynced = false

// Dedup key: email if present, else phone + brand/name (so submissions sharing a
// phone but a different brand stay distinct, while a re-run of the SAME lead
// collapses to one — no duplicates on reload).
function dedupKey(email: string, phone: string, label: string): string {
  const e = email.trim().toLowerCase()
  if (e) return 'e:' + e
  const p = phone.trim()
  if (p) return 'p:' + p + '|' + label.trim().toLowerCase()
  return 'n:' + label.trim().toLowerCase()
}

/**
 * Auto-mirror public-website leads (bsi_leads, origin='website') into the NEW
 * CRM whenever the CRM is opened: for each lead not there yet, create a
 * `contacts` row (source='WEBSITE') + a 'prospect' deal — so website form
 * submissions land in the new Contacts tab and pipeline without any manual step.
 *
 * This is the app-side stand-in for the M5/M6 DB triggers (a production DB
 * migration is blocked from this environment). Fire-and-forget, once per load,
 * idempotent via the dedup key above.
 */
export function useWebsiteLeadSync() {
  const upsertContact = useStore(s => s.upsertContact)
  const upsertDeal = useStore(s => s.upsertDeal)

  useEffect(() => {
    if (hasSynced) return
    hasSynced = true
    ;(async () => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = getSupabase() as any
        const [leadsRes, contactsRes] = await Promise.all([
          // Only leads not yet handled (converted_client_id marks a lead as
          // already imported OR deleted — so a contact you delete never comes
          // back on the next open).
          sb.from('bsi_leads').select('*').eq('origin', 'website').is('deleted_at', null).is('converted_client_id', null),
          sb.from('contacts').select('id, email, phone, name, company_name'),
        ])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const leads = (leadsRes?.data as any[]) || []
        if (!leads.length) return

        const seen = new Set<string>()
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const c of (contactsRes?.data || []) as any[]) {
          seen.add(dedupKey(c.email || '', c.phone || '', c.company_name || c.name || ''))
        }

        // Oldest first, so pipeline order follows submission order.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        for (const l of [...leads].reverse() as any[]) {
          if ((l.status || '').toLowerCase() === 'spam') continue
          const email = l.contact_type === 'email' ? (l.contact_value || '').trim() : ''
          const phone = l.contact_type === 'whatsapp' ? (l.contact_value || '').trim() : ''
          const brand = (l.brand_name || '').trim()
          const fullName = (l.full_name || '').trim()
          const displayName = fullName || brand || 'Website Lead'
          const key = dedupKey(email, phone, brand || fullName)
          if (seen.has(key)) continue
          seen.add(key)

          const clean = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
          // The form fills project_type and may fill jenis_project. Only values
          // that match a real service become chips; free text (e.g. "discuss")
          // goes to the description so Services stays meaningful.
          const rawServices = [
            ...(Array.isArray(l.jenis_project) ? l.jenis_project : []),
            ...(clean(l.project_type) ? [String(l.project_type)] : []),
          ].map((s: unknown) => String(s).trim()).filter(Boolean)
          const canon = new Map(SERVICE_OPTIONS.map(s => [s.toLowerCase(), s]))
          const services = Array.from(new Set(
            rawServices.filter(s => canon.has(s.toLowerCase())).map(s => canon.get(s.toLowerCase()) as string),
          ))
          const otherProject = Array.from(new Set(rawServices.filter(s => !canon.has(s.toLowerCase()))))
          // Deal description = free-text project + whatever richer fields the form gave.
          const descParts = [
            otherProject.length ? `Jenis project: ${otherProject.join(', ')}` : '',
            l.budget_range ? `Budget: ${l.budget_range}` : '',
            l.timeline ? `Timeline: ${l.timeline}` : '',
            l.objektif ? `Objektif: ${l.objektif}` : '',
            l.brief_awal ? `Brief: ${l.brief_awal}` : '',
            clean(l.notes) ? `Catatan: ${l.notes}` : '',
          ].filter(Boolean)
          const dealDesc = descParts.length ? descParts.join('\n') : 'Prospek otomatis dari lead website.'

          const { data: contact } = await sb.from('contacts').insert({
            name: displayName,
            type: brand ? 'PERUSAHAAN' : 'INDIVIDU',
            company_name: brand || null,
            category: 'LEAD',
            job_title: clean(l.jabatan),
            email, phone,
            source: 'WEBSITE',
            industry: clean(l.industri),
            client_tier: clean(l.tier_klien),
            city: clean(l.kota),
            province: clean(l.provinsi),
            country: clean(l.negara) || 'Indonesia',
            address: clean(l.alamat_jalan),
            notes: clean(l.notes),
          }).select().single()
          if (!contact) continue
          upsertContact(contact as Contact)
          // Mark the source lead as handled so it's never re-imported (even if
          // this contact is later deleted).
          await sb.from('bsi_leads').update({ converted_client_id: contact.id }).eq('id', l.id)

          const { data: deal } = await sb.from('deals').insert({
            // Just the brand/name — never the service (that's the Services chips)
            // nor a "Website Lead" label (that's the Source field). No dupes.
            name: brand || fullName || 'Website Lead',
            contact_id: contact.id,
            services,
            value: 0,
            stage: 'prospect',
            source: 'WEBSITE',
            description: dealDesc,
          }).select().single()
          if (deal) upsertDeal(deal as Deal)
        }
      } catch {
        /* best-effort: a failed sync must never break the CRM view */
      }
    })()
  }, [upsertContact, upsertDeal])
}
