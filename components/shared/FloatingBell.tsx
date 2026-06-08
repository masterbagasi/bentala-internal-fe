'use client'

import { NotificationBell } from '@/components/shared/NotificationBell'

// For pages that render their own full-bleed layout without a shared header
// (e.g. AI Studio hub, Image Templates, Social Analytics). Pins the
// notification bell to the top-right so notifications are reachable everywhere.
export function FloatingBell() {
  return (
    <div style={{ position: 'fixed', top: 18, right: 26, zIndex: 60 }}>
      <NotificationBell />
    </div>
  )
}
