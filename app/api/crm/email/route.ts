import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

// POST /api/crm/email — send a CRM email via Resend. Auth-gated; sends only
// (the browser logs the client_messages row from the response).

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Header-injection / control chars (incl. CR, LF, tab).
const CONTROL_RE = /[\x00-\x1f]/g

// Per-user, per-server-instance rate limit so a single (possibly compromised)
// account can't use the company's verified sender as a spam relay.
const RATE_MAX = 20
const RATE_WINDOW_MS = 60_000
const hits = new Map<string, number[]>()
function rateLimited(userId: string): boolean {
  const now = Date.now()
  const arr = (hits.get(userId) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  hits.set(userId, arr)
  if (arr.length >= RATE_MAX) return true
  arr.push(now)
  return false
}

export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!key || !from) return NextResponse.json({ ok: false, error: 'Email belum dikonfigurasi (RESEND_API_KEY/RESEND_FROM).' }, { status: 500 })

  let payload: { to?: string; subject?: string; body?: string; clientId?: string }
  try { payload = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 }) }

  // Strict recipient validation + reject control/header-injection chars.
  // (Resend's JSON API doesn't expose raw headers, but reject them anyway.)
  const to = (payload.to || '').trim()
  if (!EMAIL_RE.test(to) || CONTROL_RE.test(to)) return NextResponse.json({ ok: false, error: 'Alamat email tidak valid.' }, { status: 400 })

  // Bind the send to an existing CRM client so this endpoint can't be used as a
  // blind mailer. Any internal user may read clients (shared CRM), so this only
  // proves the email belongs to a real client context and keeps it auditable.
  const clientId = (payload.clientId || '').trim()
  if (!clientId) return NextResponse.json({ ok: false, error: 'Konteks client tidak ada.' }, { status: 400 })
  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ ok: false, error: 'Client tidak ditemukan.' }, { status: 404 })

  if (rateLimited(user.id)) return NextResponse.json({ ok: false, error: 'Terlalu banyak email. Coba lagi sebentar.' }, { status: 429 })

  // Strip control chars from the subject (header-injection defence); cap lengths.
  const subject = (payload.subject || '(tanpa subjek)').replace(CONTROL_RE, ' ').slice(0, 200)
  const text = (payload.body || '').slice(0, 50_000)

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, text }),
    })
    const data = await res.json().catch(() => ({} as Record<string, unknown>))
    if (!res.ok) return NextResponse.json({ ok: false, error: (data as { message?: string }).message || `Resend error ${res.status}` })
    return NextResponse.json({ ok: true, id: (data as { id?: string }).id ?? null })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Network error' })
  }
}
