import { PageHeader } from '@/components/shared/PageHeader'
import { ContentCalendar } from '@/components/BSI/Calendar'

export default function BSICalendarPage() {
  return (
    <>
      <PageHeader title="Content Calendar" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <ContentCalendar entity="bsi" />
      </div>
    </>
  )
}
