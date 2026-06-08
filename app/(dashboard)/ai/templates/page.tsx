import TemplatesClient from './TemplatesClient'
import { FloatingBell } from '@/components/shared/FloatingBell'

export const metadata = { title: 'Template Gambar — AI Studio' }

export default function TemplatesPage() {
  return (
    <>
      <FloatingBell />
      <TemplatesClient />
    </>
  )
}
