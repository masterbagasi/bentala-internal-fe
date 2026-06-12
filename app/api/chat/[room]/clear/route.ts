import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
/* eslint-disable @typescript-eslint/no-explicit-any */

// POST { ids:[...] } → hard-delete those (RLS limits to allowed rows).
// POST { all:true } → empty the whole room (super admin only).
export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const p = await req.json().catch(() => ({}))

  const isAll = p.all === true
  const ids = Array.isArray(p.ids) ? p.ids.filter((x: unknown) => typeof x === 'string') : []
  if (isAll) {
    if (!g.isSuper) return NextResponse.json({ error: 'super admin only' }, { status: 403 })
  } else if (ids.length === 0) {
    return NextResponse.json({ error: 'nothing to clear' }, { status: 400 })
  }

  // Collect attachment paths first so we can purge storage after the delete.
  let sel = (g.supabase as any).from('chat_messages').select('attachment_path').eq('room', params.room)
  if (!isAll) sel = sel.in('id', ids)
  const { data: rows } = await sel

  let del = (g.supabase as any).from('chat_messages').delete().eq('room', params.room)
  if (!isAll) del = del.in('id', ids)
  const { error } = await del
  if (error) return NextResponse.json({ error: error.message }, { status: 403 })

  const paths = ((rows as any[]) ?? []).map(r => r.attachment_path).filter(Boolean)
  if (paths.length) await (g.supabase as any).storage.from('chat-attachments').remove(paths)
  return NextResponse.json({ ok: true })
}
