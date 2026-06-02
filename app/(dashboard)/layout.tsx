import { Sidebar } from '@/components/Sidebar'
import { DataProvider } from '@/components/shared/DataProvider'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DataProvider>
      <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg)' }}>
        <Sidebar />
        <main
          id="main-content"
          className="flex flex-col flex-1 min-w-0 h-screen overflow-hidden transition-all duration-[220ms]"
          style={{
            marginLeft: 'calc(var(--sidebar-collapsed) + 20px)',
            paddingTop: 10,
            paddingRight: 10,
            paddingBottom: 10,
          }}
        >
          {/* Unified content card — every dashboard page renders inside
              this rounded floating panel so the visual chrome is the
              same regardless of which header (PageGroupShell, PageHeader,
              or WebsiteAdminHeader) the page mounts. The card matches
              the sidebar's vocabulary (radius 14, hairline border,
              soft shadow, bg-bg2) so the two read as paired panels. */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              minHeight: 0,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 14,
              overflow: 'hidden',
              boxShadow: '0 8px 32px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)',
            }}
          >
            {children}
          </div>
        </main>
      </div>
    </DataProvider>
  )
}
