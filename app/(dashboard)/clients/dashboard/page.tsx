'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { ClientDashboard } from '@/components/CRM/ClientDashboard'
import { DateRangePicker, presetRange, type DateRange } from '@/components/Social/DateRangePicker'

export default function ClientDashboardPage() {
  // Default to all-time so the dashboard totals match the other client tabs
  // (Pipeline / Tasks / Invoices show everything); narrow with the picker.
  const [range, setRange] = useState<DateRange>(() => presetRange('Lifetime'))
  return (
    <>
      <PageHeader title="Dashboard Klien" action={<DateRangePicker value={range} onChange={setRange} allowFuture />} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <ClientDashboard range={range} />
      </div>
    </>
  )
}
