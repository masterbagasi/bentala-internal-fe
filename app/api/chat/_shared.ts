import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { isEffectiveSuperAdmin, canAccessChat, normaliseSections } from '@/lib/access'
/* eslint-disable @typescript-eslint/no-explicit-any */

// A per-task chat ("task.<slug>.<postId>") is open to the accounts TAGGED on the
// task even without the project grant. Authorization is by verified email only —
// `created_by` is a free-text display name and must never drive an authz check
// (it is spoofable via user_metadata). Mirrors the can_access_chat_room() DB
// policy so the API never rejects a send the database would have accepted.
export async function isTaskChatParticipant(supabase: any, room: string, user: any): Promise<boolean> {
  if (!room.startsWith('task.')) return false
  const email = (user?.email || '').toLowerCase()
  if (!email) return false
  const postId = room.split('.')[2]
  if (!postId) return false
  const { data } = await supabase.from('posts').select('tagged').eq('id', postId).maybeSingle()
  if (!data) return false
  const tagged = ((data.tagged as string[] | null) || []).map(x => (x || '').toLowerCase())
  return tagged.includes(email)
}

// Resolve the caller and whether they may access `room`. Shared by the chat
// mutation routes (upload, file, [id], clear). Mirrors the gate in [room]/route.ts.
export async function chatGate(room: string) {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const isSuper = isEffectiveSuperAdmin(user.email, (user as any).app_metadata?.role)
  if (isSuper) return { supabase, user, isSuper }
  const { data } = await (supabase as any).from('menu_access').select('sections').eq('email', user.email).maybeSingle()
  const allowed = normaliseSections((data as { sections?: unknown } | null)?.sections)
  if (!canAccessChat(allowed, room) && !(await isTaskChatParticipant(supabase, room, user))) {
    return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { supabase, user, isSuper }
}
