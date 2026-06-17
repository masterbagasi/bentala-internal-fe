import { NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/chat/<room>/members → accounts that can access this room (for @mentions).
export async function GET(_req: Request, { params }: { params: { room: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const admin = createSupabaseAdmin() as any

  // email → granted sections (one row per user).
  const { data: maRows } = await admin.from('menu_access').select('email, sections')
  const sectionsByEmail = new Map<string, string[]>()
  for (const r of (maRows ?? []) as Array<{ email?: string; sections?: unknown }>) {
    if (r.email) sectionsByEmail.set(String(r.email).toLowerCase(), normaliseSections(r.sections))
  }

  const members: { email: string; name: string; avatarUrl: string | null }[] = []
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error || !data) break
    for (const u of data.users as any[]) {
      if (!u.email) continue
      const role = u.app_metadata?.role
      const allowed = sectionsByEmail.get(String(u.email).toLowerCase()) ?? []
      if (isEffectiveSuperAdmin(u.email, role) || canAccessChat(allowed, params.room)) {
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>
        members.push({
          email: u.email,
          name: (meta.full_name as string) || (meta.name as string) || u.email.split('@')[0],
          avatarUrl: (meta.avatar_url as string) ?? null,
        })
      }
    }
    if (data.users.length < 200) break
    page += 1
  }
  members.sort((a, b) => a.name.localeCompare(b.name))
  return NextResponse.json({ members })
}
