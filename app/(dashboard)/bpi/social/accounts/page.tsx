import { PageHeader } from '@/components/shared/PageHeader'
import { AccountsView } from '@/components/Social/AccountsView'

export default function Page() {
  return (
    <>
      <PageHeader title="Bentala Project — Accounts" />
      <div className="flex-1 overflow-y-auto min-h-0" style={{ padding: 24 }}>
        <AccountsView />
      </div>
    </>
  )
}
