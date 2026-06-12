import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX = 10 * 1024 * 1024
const OK = [
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed',
]

export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: 'too large (max 10MB)' }, { status: 413 })
  if (!OK.includes(file.type)) return NextResponse.json({ error: 'type not allowed' }, { status: 415 })
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
  const path = `${params.room}/${crypto.randomUUID()}-${safe}`
  const buf = Buffer.from(await file.arrayBuffer())
  const { error } = await (g.supabase as any).storage.from('chat-attachments')
    .upload(path, buf, { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    attachment_path: path,
    attachment_name: file.name,
    attachment_type: file.type,
    attachment_size: file.size,
  })
}
