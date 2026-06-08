import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdmin, isEffectiveSuperAdmin, normaliseSections, ACCESS_SECTIONS } from '@/lib/access'

// Per-account menu access management. Super-admin only.
//
//   GET  /api/access  → list every login account merged with its saved
//                       sections (for the /settings/access admin page).
//   POST /api/access  → upsert one account's allowed sections.
//
// Security:
//  - Both handlers verify the CALLER is a super admin via their session
//    (createServerSupabase reads the auth cookie). Non-super-admins get 403.
//  - Listing users + writing rows uses the service role (createSupabaseAdmin),
//    which must never be exposed to the client. The middleware already blocks
//    /settings/access for non-super-admins, but the API re-checks server-side
//    so it can't be hit directly.

interface AccessRow {
  email: string
  sections: string[] | null
}

async function requireSuperAdmin(): Promise<{ email: string } | NextResponse> {
  const supabase = createServerSupabase()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  // Role lives in app_metadata (service-role-only; not user-writable).
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return { email: user.email! }
}

export async function GET() {
  const auth = await requireSuperAdmin()
  if (auth instanceof NextResponse) return auth

  try {
    const admin = createSupabaseAdmin()

    // All login accounts (service role). Page through to be safe on larger orgs.
    interface AccountInfo {
      email: string; name: string; avatarUrl: string | null
      phone: string; position: string; language: string
      notif: { email: boolean; inApp: boolean; push: boolean }
      active: boolean; createdAt: string | null; lastSignInAt: string | null
      metaRole: string | null
    }
    const accounts: AccountInfo[] = []
    let page = 1
    const now = Date.now()
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
      if (error) throw error
      for (const u of data.users) {
        if (!u.email) continue
        const meta = (u.user_metadata ?? {}) as Record<string, unknown>
        const appMeta = (u.app_metadata ?? {}) as Record<string, unknown>
        const notif = (meta.notif ?? {}) as Record<string, unknown>
        const bannedUntil = (u as { banned_until?: string }).banned_until
        accounts.push({
          email: u.email,
          name:
            (meta.full_name as string) ||
            (meta.name as string) ||
            u.email.split('@')[0],
          avatarUrl: (meta.avatar_url as string) ?? null,
          phone: (meta.phone as string) ?? '',
          position: (meta.position as string) ?? '',
          language: (meta.language as string) ?? 'id',
          notif: {
            email: notif.email !== false,
            inApp: notif.inApp !== false,
            push: notif.push === true,
          },
          active: !(bannedUntil && new Date(bannedUntil).getTime() > now),
          createdAt: u.created_at ?? null,
          lastSignInAt: u.last_sign_in_at ?? null,
          metaRole: (appMeta.role as string) ?? null,
        })
      }
      if (data.users.length < 200) break
      page += 1
    }

    // Saved access rows, keyed by lowercased email.
    const { data: rows, error: rowsErr } = await admin
      .from('menu_access')
      .select('email, sections')
    if (rowsErr) throw rowsErr
    const byEmail = new Map<string, string[]>()
    for (const r of (rows ?? []) as AccessRow[]) {
      byEmail.set(r.email.toLowerCase(), normaliseSections(r.sections))
    }

    const users = accounts
      .map(a => {
        const hardcoded = isSuperAdmin(a.email)
        const role: 'super_admin' | 'admin' | 'user' = hardcoded || a.metaRole === 'super_admin'
          ? 'super_admin'
          : a.metaRole === 'admin' ? 'admin' : 'user'
        const eff = role === 'super_admin'
        const { metaRole: _omit, ...rest } = a
        void _omit
        return {
          ...rest,
          role,
          locked: hardcoded, // hardcoded super admin — role can't be changed
          isSuperAdmin: eff,
          sections: eff ? ACCESS_SECTIONS.map(s => s.id) : byEmail.get(a.email.toLowerCase()) ?? [],
        }
      })
      .sort((a, b) => a.email.localeCompare(b.email))

    return NextResponse.json({
      users,
      sections: ACCESS_SECTIONS.map(s => ({ id: s.id, label: s.label, group: s.group, subgroup: s.subgroup })),
    })
  } catch (err) {
    console.error('[/api/access] GET', err)
    return NextResponse.json({ error: 'Failed to load access' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth instanceof NextResponse) return auth

  let body: { email?: string; sections?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const email = String(body.email ?? '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    return NextResponse.json({ error: 'Invalid email' }, { status: 400 })
  }
  // The hardcoded super admin's access is implicit (full) — saving is a no-op.
  if (isSuperAdmin(email)) {
    return NextResponse.json({ ok: true, email, sections: ACCESS_SECTIONS.map(s => s.id) })
  }

  const sections = normaliseSections(body.sections)

  try {
    const admin = createSupabaseAdmin()
    const { error } = await admin
      .from('menu_access')
      .upsert(
        {
          email,
          sections,
          updated_at: new Date().toISOString(),
          updated_by: auth.email,
        },
        { onConflict: 'email' },
      )
    if (error) throw error
    return NextResponse.json({ ok: true, email, sections })
  } catch (err) {
    console.error('[/api/access] POST', err)
    return NextResponse.json({ error: 'Failed to save access' }, { status: 500 })
  }
}
