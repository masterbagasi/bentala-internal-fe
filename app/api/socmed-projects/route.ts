import { NextResponse } from 'next/server'
import { createServerSupabase } from '@/lib/supabase-server'

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
