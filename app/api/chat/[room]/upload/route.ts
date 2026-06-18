import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
import { createSupabaseAdmin } from '@/lib/supabase-admin'
/* eslint-disable @typescript-eslint/no-explicit-any */

const MAX = 200 * 1024 * 1024

// Allowed MIME types. iOS shares photos as HEIC/HEIF and sometimes with an
// empty or `application/octet-stream` type, so we ALSO accept by extension
// (below) and re-derive a sensible content-type when the browser didn't send
// a usable one — otherwise a perfectly valid .jpg gets "type not allowed".
const OK_TYPES = new Set([
  // NOTE: SVG is intentionally NOT allowed — SVGs can embed <script> and
  // would be a stored-XSS vector when served inline from the bucket.
  'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif',
  'image/heic', 'image/heif', 'image/avif', 'image/bmp',
  'video/mp4', 'video/quicktime', 'video/webm',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip', 'application/x-zip-compressed',
  'text/plain', 'text/csv',
])

const EXT_MIME: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  heic: 'image/heic', heif: 'image/heif', avif: 'image/avif', bmp: 'image/bmp',
  mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
  pdf: 'application/pdf',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint', pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip', txt: 'text/plain', csv: 'text/csv',
}

export async function POST(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const form = await req.formData().catch(() => null)
  const file = form?.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })
  if (file.size > MAX) return NextResponse.json({ error: 'too large (max 200MB)' }, { status: 413 })

  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const extOk = Object.prototype.hasOwnProperty.call(EXT_MIME, ext)
  if (!OK_TYPES.has(file.type) && !extOk) {
    return NextResponse.json({ error: 'type not allowed' }, { status: 415 })
  }
  // Use the browser's type when it's usable; otherwise derive one from the
  // extension so the attachment still renders as an image/pdf in the client.
  const contentType =
    file.type && file.type !== 'application/octet-stream' && OK_TYPES.has(file.type)
      ? file.type
      : (EXT_MIME[ext] ?? 'application/octet-stream')

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120)
  const path = `${params.room}/${crypto.randomUUID()}-${safe}`
  const buf = Buffer.from(await file.arrayBuffer())
  // Room access is already enforced by chatGate. The private `chat-attachments`
  // bucket has no per-user storage RLS policies, so the user-scoped client
  // can't write to it — use the service-role admin client for the upload.
  const admin = createSupabaseAdmin() as any
  const { error } = await admin.storage.from('chat-attachments')
    .upload(path, buf, { contentType, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    attachment_path: path,
    attachment_name: file.name,
    attachment_type: contentType,
    attachment_size: file.size,
  })
}
