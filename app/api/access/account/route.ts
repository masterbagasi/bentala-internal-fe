import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isSuperAdmin } from '@/lib/access'
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
  if (!user || !isSuperAdmin(user.email)) {
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

export async function PATCH(req: NextRequest) {
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
    const userId = await findUserIdByEmail(admin, email)
    if (!userId) return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 })

    const { error } = await admin.auth.admin.updateUserById(userId, { password })
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ ok: true, email })
  } catch (err) {
    console.error('[/api/access/account] PATCH', err)
    return NextResponse.json({ error: 'Gagal mengganti password' }, { status: 500 })
  }
}
