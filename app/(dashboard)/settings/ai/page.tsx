import { PageHeader } from '@/components/shared/PageHeader'
import AISettingsClient from './AISettingsClient'
import { Section } from '@/components/website/Section'

export const metadata = { title: 'AI Integrations — Settings' }

export default function AISettingsPage() {
  return (
    <>
      <PageHeader title="AI Integrations" />
      <div className="flex-1 overflow-y-auto" style={{ padding: 24 }}>
        <Section title="AI Integrations">
          <AISettingsClient />
        </Section>
      </div>
    </>
  )
}
