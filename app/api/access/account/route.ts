import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdmin, isEffectiveSuperAdmin } from '@/lib/access'
import type { SupabaseClient } from '@supabase/supabase-js'

// Account management for the Hak Akses page. Super-admin only.
//
//   POST  /api/access/account  → create a new login account { email, password }
//   PATCH /api/access/account  → set an account's password  { email, password }
//
// Both use the service role (admin.auth.admin) and re-verify the caller is a
// super admin server-side, so they can't be hit by anyone else even though the
// middleware already blocks the /settings/access page.

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

function validatePassword(pw: unknown): string | null {
  if (typeof pw !== 'string' || pw.length < 6) return null
  return pw
}

function validateEmail(raw: unknown): string | null {
  const email = String(raw ?? '').trim().toLowerCase()
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null
  return email
}

// Find a user id by email via the admin API (paged, case-insensitive).
async function findUserIdByEmail(admin: SupabaseClient, email: string): Promise<string | null> {
  const target = email.toLowerCase()
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const match = data.users.find(u => (u.email ?? '').toLowerCase() === target)
    if (match) return match.id
    if (data.users.length < 200) return null
    page += 1
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth instanceof NextResponse) return auth

  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const email = validateEmail(body.email)
  if (!email) return NextResponse.json({ error: 'Email tidak valid' }, { status: 400 })
  const password = validatePassword(body.password)
  if (!password) {
    return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // no email verification flow for internal accounts
    })
    if (error) {
      const msg = /already|exist|registered/i.test(error.message)
        ? 'Email sudah terdaftar'
        : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }
    return NextResponse.json({ ok: true, email: data.user?.email ?? email })
  } catch (err) {
    console.error('[/api/access/account] POST', err)
    return NextResponse.json({ error: 'Gagal membuat akun' }, { status: 500 })
  }
}

interface ProfilePatch {
  full_name?: string
  phone?: string
  position?: string
  language?: string
  avatar_url?: string
  email?: string
  active?: boolean
  role?: 'super_admin' | 'admin' | 'user'
  notif?: { email?: boolean; inApp?: boolean; push?: boolean }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireSuperAdmin()
  if (auth instanceof NextResponse) return auth

  let body: { email?: string; password?: string; profile?: ProfilePatch }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const email = validateEmail(body.email)
  if (!email) return NextResponse.json({ error: 'Email tidak valid' }, { status: 400 })
  // Block edits to the super admin account.
  if (isSuperAdmin(email)) {
    return NextResponse.json({ error: 'Akun super admin tidak bisa diubah' }, { status: 400 })
  }

  try {
    const admin = createSupabaseAdmin()
    const userId = await findUserIdByEmail(admin, email)
    if (!userId) return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })

    // ── Password change ──
    if (body.password !== undefined) {
      const password = validatePassword(body.password)
      if (!password) return NextResponse.json({ error: 'Password minimal 6 karakter' }, { status: 400 })
      const { error } = await admin.auth.admin.updateUserById(userId, { password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true, email })
    }

    // ── Profile / status update ──
    const p = body.profile
    if (!p || typeof p !== 'object') {
      return NextResponse.json({ error: 'Tidak ada perubahan' }, { status: 400 })
    }

    const { data: cur } = await admin.auth.admin.getUserById(userId)
    const meta: Record<string, unknown> = { ...(cur.user?.user_metadata ?? {}) }
    if (typeof p.full_name === 'string') meta.full_name = p.full_name.trim()
    if (typeof p.phone === 'string') meta.phone = p.phone.trim()
    if (typeof p.position === 'string') meta.position = p.position.trim()
    if (typeof p.language === 'string') meta.language = p.language
    if (typeof p.avatar_url === 'string') meta.avatar_url = p.avatar_url
    if (p.notif && typeof p.notif === 'object') {
      meta.notif = { email: !!p.notif.email, inApp: !!p.notif.inApp, push: !!p.notif.push }
    }

    const updates: Parameters<typeof admin.auth.admin.updateUserById>[1] = { user_metadata: meta }

    // Role lives in app_metadata — only mutable via the service-role key here,
    // so it can NEVER be set by a user editing their own (user_)metadata.
    if (p.role === 'super_admin' || p.role === 'admin' || p.role === 'user') {
      updates.app_metadata = { ...(cur.user?.app_metadata ?? {}), role: p.role }
    }

    let newEmail: string | null = null
    if (typeof p.email === 'string') {
      const ne = validateEmail(p.email)
      if (!ne) return NextResponse.json({ error: 'Email baru tidak valid' }, { status: 400 })
      if (ne !== email) { newEmail = ne; updates.email = ne; updates.email_confirm = true }
    }
    if (typeof p.active === 'boolean') {
      updates.ban_duration = p.active ? 'none' : '876000h' // ~100y = nonaktif
    }

    const { error } = await admin.auth.admin.updateUserById(userId, updates)
    if (error) {
      const msg = /already|exist|registered/i.test(error.message) ? 'Email sudah dipakai akun lain' : error.message
      return NextResponse.json({ error: msg }, { status: 400 })
    }

    // Keep the menu_access row keyed to the new email so access isn't lost.
    if (newEmail) {
      await admin.from('menu_access').update({ email: newEmail }).eq('email', email)
    }

    return NextResponse.json({ ok: true, email: newEmail ?? email })
  } catch (err) {
    console.error('[/api/access/account] PATCH', err)
    return NextResponse.json({ error: 'Gagal menyimpan perubahan' }, { status: 500 })
  }
}
