import { NextRequest, NextResponse } from 'next/server'
import { chatGate } from '../../_shared'
/* eslint-disable @typescript-eslint/no-explicit-any */

// GET /api/chat/<room>/file?path=<storage-path>
// Verifies room access, then redirects to a short-lived signed URL so the
// private bucket can back <img src> and download links over the session cookie.
export async function GET(req: NextRequest, { params }: { params: { room: string } }) {
  const g = await chatGate(params.room)
  if ('error' in g) return g.error
  const path = new URL(req.url).searchParams.get('path') || ''
  if (!path.startsWith(`${params.room}/`)) return NextResponse.json({ error: 'bad path' }, { status: 400 })
  const { data, error } = await (g.supabase as any).storage.from('chat-attachments').createSignedUrl(path, 60)
  if (error || !data?.signedUrl) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.redirect(data.signedUrl)
}
