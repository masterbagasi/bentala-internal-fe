import { PageHeader } from '@/components/shared/PageHeader'
import { AccountsView } from '@/components/Social/AccountsView'

export default function SocialAccountsPage() {
  return (
    <>
      <PageHeader title="Social Media — Accounts" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <AccountsView />
      </div>
    </>
  )
}
