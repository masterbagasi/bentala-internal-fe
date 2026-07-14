'use client'

import { useState } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { CrmDashboard } from '@/components/CRM2/CrmDashboard'
import { DateRangePicker, presetRange, type DateRange } from '@/components/Social/DateRangePicker'

export default function CrmDashboardPage() {
  const [range, setRange] = useState<DateRange>(() => presetRange('Lifetime'))
  return (
    <>
      <PageHeader title="Dashboard" action={<DateRangePicker value={range} onChange={setRange} allowFuture />} />
      <div className="flex-1 overflow-y-auto min-h-0">
        <CrmDashboard range={range} />
      </div>
    </>
  )
}
