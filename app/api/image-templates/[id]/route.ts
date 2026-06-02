import { NextResponse } from 'next/server'
import { deleteTemplate } from '@/lib/image-templates-store'

export const runtime = 'nodejs'

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  try {
    const ok = await deleteTemplate(params.id)
    if (!ok) return NextResponse.json({ error: 'Template not found' }, { status: 404 })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error(`[/api/image-templates/${params.id}] DELETE`, err)
    const msg = err instanceof Error ? err.message : 'Failed to delete template'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
