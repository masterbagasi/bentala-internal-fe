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

export async function POST(req: NextRequest) {
  const forbidden = await requireSuperAdmin()
  if (forbidden) return forbidden

  let body: { name?: string; glyph?: string; color?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
  const glyph = String(body.glyph ?? '').trim().slice(0, 6) || projectGlyph(name)
  const color = /^#[0-9a-fA-F]{6}$/.test(body.color ?? '') ? body.color! : '#5a5a60'

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
    .insert({ slug, name, glyph, color, sort_order, active: true }).select('*').single()
  if (error) { console.error('[/api/socmed-projects] POST', error); return NextResponse.json({ error: 'Failed to create' }, { status: 500 }) }
  return NextResponse.json({ project: data })
}

export async function PATCH(req: NextRequest) {
  const forbidden = await requireSuperAdmin()
  if (forbidden) return forbidden

  let body: { slug?: string; name?: string; glyph?: string; color?: string; sort_order?: number; active?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Invalid body' }, { status: 400 }) }
  const slug = String(body.slug ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  const patch: Record<string, unknown> = {}
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim()
  if (typeof body.glyph === 'string') patch.glyph = body.glyph.trim().slice(0, 6)
  if (typeof body.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.color)) patch.color = body.color
  if (typeof body.sort_order === 'number') patch.sort_order = body.sort_order
  if (typeof body.active === 'boolean') patch.active = body.active
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const admin = createSupabaseAdmin()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (admin as any).from('socmed_projects').update(patch).eq('slug', slug).select('*').single()
  if (error) { console.error('[/api/socmed-projects] PATCH', error); return NextResponse.json({ error: 'Failed to update' }, { status: 500 }) }
  return NextResponse.json({ project: data })
}
