import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
/* eslint-disable @typescript-eslint/no-explicit-any */

// POST { ids:[...] } → hard-delete those (own messages; super admin: any).
// POST { all:true } → empty the whole room (super admin only).
// Authorization here, write via service role (no dependency on DELETE RLS).
export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const admin = createSupabaseAdmin() as any
  const p = await req.json().catch(() => ({}))

  const isAll = p.all === true
  const ids = Array.isArray(p.ids) ? p.ids.filter((x: unknown) => typeof x === 'string') : []
  if (isAll) {
    if (!g.isSuper) return NextResponse.json({ error: 'super admin only' }, { status: 403 })
  } else if (ids.length === 0) {
    return NextResponse.json({ error: 'nothing to clear' }, { status: 400 })
  }

  // Resolve which rows we may delete (own, or any for super), collecting
  // attachment paths to purge from storage afterwards.
  let sel = admin.from('chat_messages').select('id, attachment_path').eq('room', params.room)
  if (!isAll) sel = sel.in('id', ids)
  if (!g.isSuper) sel = sel.eq('author_email', g.user.email)
  const { data: rows } = await sel
  const delIds = ((rows as any[]) ?? []).map(r => r.id)
  if (delIds.length === 0) return NextResponse.json({ ok: true })

  const { error } = await admin.from('chat_messages').delete().in('id', delIds)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const paths = ((rows as any[]) ?? []).map(r => r.attachment_path).filter(Boolean)
  if (paths.length) await admin.storage.from('chat-attachments').remove(paths)
  return NextResponse.json({ ok: true })
}
