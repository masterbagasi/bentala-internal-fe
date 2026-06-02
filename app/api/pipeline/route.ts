import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET() {
  try {
    const supabase = getSupabase()
    const { data, error } = await supabase
      .from('content_pipeline')
      .select('*')
      .order('updated_at', { ascending: false })
    if (error) throw error
    return NextResponse.json({ cards: data ?? [] })
  } catch (err) {
    console.error('[GET /api/pipeline]', err)
    return NextResponse.json({ error: 'Failed to fetch pipeline' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, entity, platform, idea_text } = await req.json()
    if (!title?.trim() || !entity || !platform) {
      return NextResponse.json({ error: 'title, entity, platform required' }, { status: 400 })
    }
    const VALID_ENTITIES = ['bpi', 'bsi'] as const
    const VALID_PLATFORMS = ['ig', 'tiktok', 'keduanya'] as const
    if (!(VALID_ENTITIES as readonly string[]).includes(entity)) {
      return NextResponse.json({ error: 'entity must be bpi or bsi' }, { status: 400 })
    }
    if (!(VALID_PLATFORMS as readonly string[]).includes(platform)) {
      return NextResponse.json({ error: 'platform must be ig, tiktok, or keduanya' }, { status: 400 })
    }
    const supabase = getSupabase()
    const { data, error } = await (supabase as any)
      .from('content_pipeline')
      .insert({ title: title.trim(), entity, platform, stage: 'ide', idea_text: idea_text ?? null })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ card: data })
  } catch (err) {
    console.error('[POST /api/pipeline]', err)
    return NextResponse.json({ error: 'Failed to create card' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, stage } = await req.json()
    if (!id || !stage) {
      return NextResponse.json({ error: 'id and stage required' }, { status: 400 })
    }
    const VALID_STAGES = ['ide', 'brief', 'caption', 'selesai'] as const
    if (!(VALID_STAGES as readonly string[]).includes(stage)) {
      return NextResponse.json({ error: 'Invalid stage value' }, { status: 400 })
    }
    const supabase = getSupabase()
    const { data, error } = await (supabase as any)
      .from('content_pipeline')
      .update({ stage, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json({ card: data })
  } catch (err) {
    console.error('[PATCH /api/pipeline]', err)
    return NextResponse.json({ error: 'Failed to update card' }, { status: 500 })
  }
}
