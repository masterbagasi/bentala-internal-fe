import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
/* eslint-disable @typescript-eslint/no-explicit-any */

// PATCH { body } → edit; { action:'retract' } → soft delete.
export async function PATCH(req: NextRequest, { params }: { params: { room: string; id: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const p = await req.json().catch(() => ({}))
  if (p.action === 'retract') {
    const { data, error } = await (g.supabase as any).from('chat_messages')
      .update({ deleted_at: new Date().toISOString(), body: '', attachment_path: null, attachment_name: null, attachment_type: null, attachment_size: null })
      .eq('id', params.id).eq('room', params.room).select('*').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 403 })
    return NextResponse.json({ message: data })
  }
  const text = String(p.body ?? '').trim()
  if (!text) return NextResponse.json({ error: 'empty' }, { status: 400 })
  const { data, error } = await (g.supabase as any).from('chat_messages')
    .update({ body: text.slice(0, 4000), edited_at: new Date().toISOString() })
    .eq('id', params.id).eq('room', params.room).select('*').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  return NextResponse.json({ message: data })
}

// DELETE → hard-delete one message (and its attachment object).
export async function DELETE(_req: NextRequest, { params }: { params: { room: string; id: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const { data: row } = await (g.supabase as any).from('chat_messages')
    .select('attachment_path').eq('id', params.id).eq('room', params.room).maybeSingle()
  const { error } = await (g.supabase as any).from('chat_messages')
    .delete().eq('id', params.id).eq('room', params.room)
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })
  if (row?.attachment_path) await (g.supabase as any).storage.from('chat-attachments').remove([row.attachment_path])
  return NextResponse.json({ ok: true })
}
