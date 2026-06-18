import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { projectGlyph } from '@/lib/project-glyph'

// GET /api/socmed-projects — list every socmed project (active + archived).
// Readable by any authenticated user (sidebar / board / access UI rely on it).
// Writes (POST/PATCH) are added in a later task.
export async function GET() {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase as any)
    .from('socmed_projects')
    .select('*')
    .order('sort_order', { ascending: true })

  if (error) {
    console.error('[/api/socmed-projects] GET', error)
    return NextResponse.json({ projects: [] })
  }
  return NextResponse.json({ projects: data ?? [] }, { headers: { 'Cache-Control': 'private, max-age=30' } })
}

async function requireSuperAdmin(): Promise<NextResponse | null> {
  const supabase = createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isEffectiveSuperAdmin(user.email, user.app_metadata?.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

function slugify(name: string): string {
  return name.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project'
}

// Free-text profile fields. Caps keep payloads sane; description is the longest.
const PROFILE_FIELDS = ['address', 'phone', 'email', 'pic', 'description', 'instagram', 'tiktok', 'website'] as const
function pickProfile(body: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of PROFILE_FIELDS) {
    if (typeof body[f] === 'string') out[f] = (body[f] as string).trim().slice(0, f === 'description' ? 2000 : 300)
  }
  return out
}

export async function POST(req: NextRequest) {
  const forbidden = await requireSuperAdmin()
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const glyph = String(body.glyph ?? '').trim().slice(0, 6) || projectGlyph(name)
  const color = /^#[0-9a-fA-F]{6}$/.test(String(body.color ?? '')) ? (body.color as string) : '#5a5a60'

  const admin = createSupabaseAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any
  const base = slugify(name)
  let slug = base
  for (let i = 2; i < 100; i++) {
    const { data: existing } = await sb.from('socmed_projects').select('slug').eq('slug', slug).maybeSingle()
    if (!existing) break
    slug = `${base}-${i}`
  }
  const { data: maxRow } = await sb.from('socmed_projects').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const sort_order = ((maxRow?.sort_order as number) ?? 0) + 1

  const { data, error } = await sb.from('socmed_projects')
    .insert({ slug, name, glyph, color, sort_order, active: true, ...pickProfile(body) }).select('*').single()
  if (error) { console.error('[/api/socmed-projects] POST', error); return NextResponse.json({ error: 'Failed to create' }, { status: 500 }) }
  return NextResponse.json({ project: data })
}

export async function PATCH(req: NextRequest) {
  const forbidden = await requireSuperAdmin()
  if (forbidden) return forbidden

  let body: Record<string, unknown>
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const slug = String(body.slug ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const patch: Record<string, unknown> = { ...pickProfile(body) }
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.glyph === 'string') patch.glyph = (body.glyph as string).trim().slice(0, 6)
  if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color as string)) patch.color = body.color
  if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order
  if (typeof body.active === 'boolean') patch.active = body.active
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = createSupabaseAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).from('socmed_projects').update(patch).eq('slug', slug).select('*').single()
  if (error) { console.error('[/api/socmed-projects] PATCH', error); return NextResponse.json({ error: 'Failed to update' }, { status: 500 }) }
  return NextResponse.json({ project: data })
}

// DELETE /api/socmed-projects  { slug }  → permanently remove a project.
// Blocked while it still has tasks (posts.entity FK is ON DELETE RESTRICT), so
// the caller gets a clear message instead of a constraint error. On success we
// also clean up the project's chat data and strip its access grants so nothing
// orphaned is left behind.
export async function DELETE(req: NextRequest) {
  const forbidden = await requireSuperAdmin()
  if (forbidden) return forbidden

  let body: { slug?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const slug = String(body.slug ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const admin = createSupabaseAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = admin as any

  // A project may be deleted once every (non-trashed) task is finished
  // (done/published). If any task is still in progress, block — finish, archive
  // or move it first. Finished tasks are removed together with the project.
  const FINISHED = ['done', 'published']
  const { count: activeTotal } = await sb.from('posts')
    .select('id', { count: 'exact', head: true }).eq('entity', slug).is('deleted_at', null)
  const { count: activeFinished } = await sb.from('posts')
    .select('id', { count: 'exact', head: true }).eq('entity', slug).is('deleted_at', null).in('status', FINISHED)
  const unfinished = (activeTotal ?? 0) - (activeFinished ?? 0)
  if (unfinished > 0) {
    return NextResponse.json(
      { error: `Tidak bisa dihapus: masih ada ${unfinished} task yang belum selesai. Selesaikan, arsipkan, atau pindahkan task-nya dulu.` },
      { status: 409 },
    )
  }

  // All tasks finished — remove them (comments & attachments cascade) so the
  // entity FK no longer blocks, then drop the project.
  const { error: delPostsErr } = await sb.from('posts').delete().eq('entity', slug)
  if (delPostsErr) { console.error('[/api/socmed-projects] DELETE posts', delPostsErr); return NextResponse.json({ error: 'Gagal menghapus task project' }, { status: 500 }) }

  // Best-effort cleanup of this project's chat room + access grants.
  try {
    await sb.from('chat_message_reactions').delete().eq('room', slug)
    await sb.from('chat_messages').delete().eq('room', slug)
    await sb.from('chat_reads').delete().eq('room', slug)
    await sb.from('chat_room_visibility').delete().eq('room', slug)
    const { data: rows } = await sb.from('menu_access').select('email, sections')
    for (const r of (rows ?? []) as { email: string; sections: string[] | null }[]) {
      const cur = r.sections ?? []
      const next = cur.filter(s => !s.startsWith(`smm.${slug}.`))
      if (next.length !== cur.length) await sb.from('menu_access').update({ sections: next }).eq('email', r.email)
    }
  } catch (e) { console.error('[/api/socmed-projects] DELETE cleanup', e) }

  const { error } = await sb.from('socmed_projects').delete().eq('slug', slug)
  if (error) { console.error('[/api/socmed-projects] DELETE', error); return NextResponse.json({ error: 'Failed to delete' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
