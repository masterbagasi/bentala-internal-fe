import { NextRequest, NextResponse } from 'next/server'
import { TEAM } from '@/lib/constants'
import { createSupabaseAdmin } from '@/lib/supabase-admin'

// Sends an email to an account when they're tagged on a post.
// Requires RESEND_API_KEY (and optionally RESEND_FROM) in the environment.
// If the key isn't set, it no-ops gracefully so saving a post never breaks.
//
// Security:
//  - The route sits behind the auth middleware (unauthenticated requests are
//    redirected to /login and never reach this handler).
//  - The recipient is resolved server-side: an `email` is only accepted if it
//    belongs to a registered Supabase account, and a legacy `name` is resolved
//    from the trusted TEAM allowlist. A raw `to` address is never accepted, so
//    this can't be used as an open email relay.
//  - All interpolated values are HTML-escaped; the subject is CRLF-stripped.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )
}

// Look up a registered account by email (paged, case-insensitive). Returns the
// canonical email + display name, or null when no such account exists.
async function findAccountByEmail(email: string): Promise<{ email: string; name: string } | null> {
  const target = email.toLowerCase()
  const admin = createSupabaseAdmin()
  let page = 1
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const u = data.users.find(x => (x.email ?? '').toLowerCase() === target)
    if (u && u.email) {
      const meta = (u.user_metadata ?? {}) as Record<string, unknown>
      return {
        email: u.email,
        name: (meta.full_name as string) || (meta.name as string) || u.email.split('@')[0],
      }
    }
    if (data.users.length < 200) return null
    page += 1
  }
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM || 'Bentala Internal <onboarding@resend.dev>'
  const rawAppUrl = process.env.NEXT_PUBLIC_APP_URL || ''
  const appUrl = /^https:\/\/[^\s"'<>]+$/i.test(rawAppUrl) ? rawAppUrl : ''

  if (!apiKey) {
    // Not configured yet — succeed silently so the post still saves.
    return NextResponse.json({ ok: false, skipped: 'RESEND_API_KEY not set' })
  }

  let body: { email?: string; name?: string; postTitle?: string; taggedBy?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  const emailInput = String(body.email ?? '').trim().toLowerCase()
  const nameInput = String(body.name ?? '')
  const postTitle = String(body.postTitle ?? '')
  const taggedBy = String(body.taggedBy ?? '')

  // Resolve the recipient + display name server-side. An email is only honored
  // if it belongs to a registered account; otherwise fall back to the legacy
  // name→TEAM lookup. A raw "to" is never accepted.
  let to = ''
  let displayName = ''
  if (emailInput) {
    try {
      const account = await findAccountByEmail(emailInput)
      if (!account) {
        return NextResponse.json({ ok: false, error: 'unknown recipient' }, { status: 400 })
      }
      to = account.email
      displayName = account.name
    } catch {
      return NextResponse.json({ ok: false, error: 'lookup failed' }, { status: 500 })
    }
  } else {
    const member = TEAM.find(m => m.name === nameInput)
    if (!member?.email) {
      return NextResponse.json({ ok: false, error: 'unknown recipient' }, { status: 400 })
    }
    to = member.email
    displayName = member.name
  }

  const eName = escapeHtml(displayName || 'tim')
  const eBy = escapeHtml(taggedBy)
  const eTitle = escapeHtml(postTitle || '(tanpa judul)')
  // Subject is a mail header — strip CR/LF to prevent header injection.
  const subject = `Kamu di-tag pada post "${postTitle.replace(/[\r\n]+/g, ' ').slice(0, 120)}"`

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1d2e">
      <h2 style="margin:0 0 8px;font-size:18px">Halo ${eName} 👋</h2>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5168">
        ${eBy ? `<strong>${eBy}</strong> me-` : 'Kamu di-'}tag kamu pada sebuah post di <strong>Bentala Internal System</strong>.
      </p>
      <div style="background:#f4f5fa;border:1px solid #d5d8ea;border-radius:8px;padding:14px 16px;margin-bottom:20px">
        <div style="font-size:12px;color:#6b7280;margin-bottom:4px">POST</div>
        <div style="font-size:15px;font-weight:600">${eTitle}</div>
      </div>
      ${appUrl ? `<a href="${appUrl}" style="display:inline-block;background:#0B3DE7;color:#fff;text-decoration:none;font-size:14px;font-weight:600;padding:10px 18px;border-radius:8px">Buka di Web Internal</a>` : ''}
      <p style="margin:24px 0 0;font-size:12px;color:#9aa0b4">Email otomatis dari Bentala Internal System.</p>
    </div>`

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to, subject, html }),
    })
    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ ok: false, error: err }, { status: 502 })
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
