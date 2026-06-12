import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
/* eslint-disable @typescript-eslint/no-explicit-any */

// Authorization is done HERE (author or super admin), then the write uses the
// service-role client — so edit/retract/delete work regardless of whether the
// chat_messages UPDATE/DELETE RLS policies were applied.

// PATCH { body } → edit (author only); { action:'retract' } → soft delete (author or super).
export async function PATCH(req: NextRequest, { params }: { params: { room: string; id: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const admin = createSupabaseAdmin() as any

  const { data: msg } = await admin.from('chat_messages')
    .select('author_email').eq('id', params.id).eq('room', params.room).maybeSingle()
  if (!msg) return NextResponse.json({ error: 'not found' }, { status: 404 })
  const isAuthor = msg.author_email === g.user.email

  const p = await req.json().catch(() => ({}))
  if (p.action === 'retract') {
    if (!isAuthor && !g.isSuper) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    const { data, error } = await admin.from('chat_messages')
      .update({ deleted_at: new Date().toISOString(), body: '', attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null })
      .eq('id', params.id).eq('room', params.room).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ message: data })
  }

  // Edit body — author only.
  if (!isAuthor) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const text = String(p.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const { data, error } = await admin.from('chat_messages')
    .update({ body: text.slice(0, 4000), edited_at: new Date().toISOString() })
    .eq('id', params.id).eq('room', params.room).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data })
}

// DELETE → hard-delete one message (author or super admin).
export async function DELETE(_req: NextRequest, { params }: { params: { room: string; id: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const admin = createSupabaseAdmin() as any

  const { data: msg } = await admin.from('chat_messages')
    .select('author_email, attachment_path').eq('id', params.id).eq('room', params.room).maybeSingle()
  if (!msg) return NextResponse.json({ error: 'not found' }, { status: 404 })
  if (msg.author_email !== g.user.email && !g.isSuper) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await admin.from('chat_messages').delete().eq('id', params.id).eq('room', params.room)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (msg.attachment_path) await admin.storage.from('chat-attachments').remove([msg.attachment_path])
  return NextResponse.json({ ok: true })
}
