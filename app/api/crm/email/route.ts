import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

// POST /api/crm/email — send a CRM email via Resend. Auth-gated; sends only
// (the browser logs the client_messages row from the response).
export async function POST(req: Request) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  const key = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!key || !from) return NextResponse.json({ ok: false, error: 'Email belum dikonfigurasi (RESEND_API_KEY/RESEND_FROM).' }, { status: 500 })

  let payload: { to?: string; subject?: string; body?: string }
  try { payload = await req.json() } catch { return NextResponse.json({ ok: false, error: 'Bad JSON' }, { status: 400 }) }
  const to = (payload.to || '').trim()
  if (!to) return NextResponse.json({ ok: false, error: 'Alamat email tujuan kosong.' }, { status: 400 })

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject: payload.subject || '(tanpa subjek)', text: payload.body || '' }),
    })
    const data = await res.json().catch(() => ({} as Record<string, unknown>))
    if (!res.ok) return NextResponse.json({ ok: false, error: (data as { message?: string }).message || `Resend error ${res.status}` })
    return NextResponse.json({ ok: true, id: (data as { id?: string }).id ?? null })
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'Network error' })
  }
}
