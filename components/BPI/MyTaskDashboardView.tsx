'use client'

import { useMemo } from 'react'
import { TaskDashboard } from '@/components/BPI/TaskDashboard'
import { useBoardFilter, isAccountTask } from '@/components/BPI'
import { useStore } from '@/hooks/useStore'
import type { DateRange } from '@/components/Social/DateRangePicker'
import type { Post } from '@/lib/types'

// Keep a post only if its date falls within the selected range. Undated tasks
// belong to no period, so counting them would make the range totals invalid.
function inRange(p: Post, r: DateRange): boolean {
  const d = (p.date || '').slice(0, 10)
  return !!d && d >= r.from && d <= r.to
}

/**
 * The personal "My Task" dashboard. Shared by the My Task page's dashboard tab
 * and the standalone `/my-task/dashboard` route (promoted for personal-only
 * accounts) so the two never drift. The date range is driven by the header's
 * date filter via the store; this view only reads it.
 */
export function MyTaskDashboardView({ me }: { me: { email: string; name: string } }) {
  const posts = useStore(s => s.posts)
  const dateRange = useStore(s => s.dateRange)
  const bf = useBoardFilter('all')

  // Only briefed tasks enter the worksheet (an 'todo'/Idea hasn't entered yet),
  // matching the board so the summary stays in sync.
  const myPosts = useMemo(
    () => posts.filter(p => !p.deleted_at && p.status !== 'todo' && isAccountTask(p, me)),
    [posts, me],
  )
  const dashPosts = useMemo(() => myPosts.filter(p => inRange(p, dateRange)), [myPosts, dateRange])

  return <TaskDashboard posts={dashPosts} allPosts={myPosts} projects={bf.projects} />
}
