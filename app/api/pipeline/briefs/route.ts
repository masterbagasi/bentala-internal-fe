import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get('type')
    const supabase = getSupabase()

    let query = supabase
      .from('production_briefs')
      .select('*, pipeline:content_pipeline(*)')
      .order('created_at', { ascending: false })

    if (type === 'design' || type === 'video') {
      query = query.eq('type', type)
    }

    const { data, error } = await query
    if (error) throw error
    return NextResponse.json({ briefs: data ?? [] })
  } catch (err) {
    console.error('[GET /api/pipeline/briefs]', err)
    return NextResponse.json({ error: 'Failed to fetch briefs' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { pipeline_id, type, content, images } = await req.json()
    if (!pipeline_id || !type || !content) {
      return NextResponse.json({ error: 'pipeline_id, type, content required' }, { status: 400 })
    }
    const VALID_TYPES = ['design', 'video'] as const
    if (!(VALID_TYPES as readonly string[]).includes(type)) {
      return NextResponse.json({ error: 'type must be design or video' }, { status: 400 })
    }
    const supabase = getSupabase()

    // Check for duplicate
    const { data: existing } = await supabase
      .from('production_briefs')
      .select('id')
      .eq('pipeline_id', pipeline_id)
      .eq('type', type)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ error: `Brief ${type} untuk konten ini sudah ada` }, { status: 409 })
    }

    const { data, error } = await (supabase as any)
      .from('production_briefs')
      .insert({ pipeline_id, type, content, images: images ?? [] })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ brief: data })
  } catch (err) {
    console.error('[POST /api/pipeline/briefs]', err)
    return NextResponse.json({ error: 'Failed to save brief' }, { status: 500 })
  }
}
