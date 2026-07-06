'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { findBank } from '@/lib/banks'
import type { InvoiceSettings } from '@/lib/types'

const toDataUrl = (blob: Blob) =>
  new Promise<string>((res, rej) => {
    const fr = new FileReader()
    fr.onload = () => res(fr.result as string)
    fr.onerror = rej
    fr.readAsDataURL(blob)
  })

/** Loads everything the invoice PDF needs (company settings, studio logo, bank
 *  logo) so any screen can print an invoice, not just the Invoices page. */
export function useInvoiceAssets() {
  const [settings, setSettings] = useState<InvoiceSettings | null>(null)
  const [logoUrl, setLogoUrl] = useState<string | null>(null)
  const [bankLogoUrl, setBankLogoUrl] = useState<string | null>(null)

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).from('invoice_settings').select('*').limit(1).maybeSingle()
      .then(({ data }: { data: InvoiceSettings | null }) => setSettings(data))
    fetch(`/logos/${encodeURIComponent('Logo Bentala Studio Landscape Black.png')}`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('logo'))))
      .then(toDataUrl).then(setLogoUrl).catch(() => setLogoUrl(null))
  }, [])

  useEffect(() => {
    const bank = findBank(settings?.bank_name)
    if (!bank) { setBankLogoUrl(null); return }
    let cancelled = false
    fetch(`/banks/${bank.slug}.png`)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error('bank logo'))))
      .then(toDataUrl)
      .then((u) => { if (!cancelled) setBankLogoUrl(u) })
      .catch(() => { if (!cancelled) setBankLogoUrl(null) })
    return () => { cancelled = true }
  }, [settings])

  return { settings, logoUrl, bankLogoUrl }
}
