import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { status } = await req.json()
    if (!status) return NextResponse.json({ error: 'status required' }, { status: 400 })

    const supabase = getSupabase()

    // Update this brief's status
    const { data: brief, error: briefErr } = await (supabase as any)
      .from('production_briefs')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', params.id)
      .select('pipeline_id')
      .single()
    if (briefErr) throw briefErr
    if (!brief) {
      return NextResponse.json({ error: 'Brief not found' }, { status: 404 })
    }

    // If done, check whether all briefs for this pipeline are done
    if (status === 'done') {
      const { data: allBriefs } = await supabase
        .from('production_briefs')
        .select('status')
        .eq('pipeline_id', brief.pipeline_id)

      const allDone = (allBriefs ?? []).every((b: { status: string }) => b.status === 'done')
      if (allDone) {
        const { error: stageErr } = await (supabase as any)
          .from('content_pipeline')
          .update({ stage: 'caption', updated_at: new Date().toISOString() })
          .eq('id', brief.pipeline_id)
        if (stageErr) console.error('[auto-advance pipeline stage]', stageErr)
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('[PATCH /api/pipeline/briefs/[id]]', err)
    return NextResponse.json({ error: 'Failed to update brief' }, { status: 500 })
  }
}
