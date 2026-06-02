import { PageHeader } from '@/components/shared/PageHeader'
import { PostTracker } from '@/components/BSI/PostTracker'

export default function BSIPostsPage() {
  return (
    <>
      <PageHeader title="Bentala Studio Indonesia — Post Tracker" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <PostTracker entity="bsi" />
      </div>
    </>
  )
}
