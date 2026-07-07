'use client'

import { useState, useEffect } from 'react'
import { PageHeader } from '@/components/shared/PageHeader'
import { MyTaskDashboardView } from '@/components/BPI/MyTaskDashboardView'
import { getSupabase } from '@/lib/supabase'
import { PostHistoryButton } from '@/components/shared/PostHistory'

// Standalone personal dashboard. Promoted to a top-level sidebar item for
// personal-only accounts (no general Dashboard grant, no project board), so it
// becomes their home. Ungated — the same view the My Task dashboard tab renders
// for everyone else. Add/edit lives on the My Task board (/my-task).
export default function MyTaskDashboardPage() {
  const [me, setMe] = useState<{ email: string; name: string } | null>(null)

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const meta = u.user_metadata ?? {}
      setMe({
        email: (u.email ?? '').toLowerCase(),
        name: meta.full_name ?? meta.name ?? u.email?.split('@')[0] ?? '',
      })
    })
  }, [])

  return (
    <>
      <PageHeader
        title="Dashboard"
        showDateFilter
        dateAllowFuture
        action={me ? <PostHistoryButton scope={{ mine: me }} /> : undefined}
      />
      <div className="flex-1 overflow-y-auto min-h-0">
        {me && <MyTaskDashboardView me={me} />}
      </div>
    </>
  )
}
