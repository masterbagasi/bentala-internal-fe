import { PageHeader } from '@/components/shared/PageHeader'
import VideoRenderClient from './VideoRenderClient'

export const metadata = { title: 'Video Render — AI Studio' }

export default function VideoRenderPage() {
  return (
    <>
      <PageHeader title="Video Render (Remotion)" />
      <div className="flex-1 overflow-y-auto">
        <VideoRenderClient />
      </div>
    </>
  )
}
