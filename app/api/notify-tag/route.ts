import { NextRequest, NextResponse } from 'next/server'
import { TEAM } from '@/lib/constants'

// Sends an email to a team member when they're tagged on a post.
// Requires RESEND_API_KEY (and optionally RESEND_FROM) in the environment.
// If the key isn't set, it no-ops gracefully so saving a post never breaks.
//
// Security:
//  - The route sits behind the auth middleware (unauthenticated requests are
//    redirected to /login and never reach this handler).
//  - The recipient is resolved server-side from the trusted TEAM allowlist by
//    name — a `to` address is never accepted from the request body, so this
//    can't be used as an open email relay.
//  - All interpolated values are HTML-escaped; the subject is CRLF-stripped.

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string),
  )
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

  let body: { name?: string; postTitle?: string; taggedBy?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid body' }, { status: 400 })
  }

  const name = String(body.name ?? '')
  const postTitle = String(body.postTitle ?? '')
  const taggedBy = String(body.taggedBy ?? '')

  // Recipient is resolved from the trusted allowlist, never from the client.
  const member = TEAM.find(m => m.name === name)
  if (!member?.email) {
    return NextResponse.json({ ok: false, error: 'unknown recipient' }, { status: 400 })
  }
  const to = member.email

  const eName = escapeHtml(name || 'tim')
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
