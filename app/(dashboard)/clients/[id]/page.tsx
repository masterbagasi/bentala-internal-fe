import { ClientProfile } from '@/components/CRM/ClientProfile'

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <ClientProfile id={id} />
}
