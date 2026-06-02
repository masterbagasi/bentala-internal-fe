import { NextResponse } from 'next/server'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'

// Stream a previously-rendered MP4 back to the client. Files live in OS tmpdir
// — they get cleaned up when the OS rotates /tmp. For production you'd swap
// this for a Supabase Storage signed URL.
export const runtime = 'nodejs'

export async function GET(
  _req: Request,
  { params }: { params: { name: string } },
) {
  const safe = path.basename(params.name) // strip any path traversal attempt
  const filePath = path.join(os.tmpdir(), 'bentala-renders', safe)

  try {
    const data = await fs.readFile(filePath)
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Length': String(data.length),
        'Content-Disposition': `attachment; filename="${safe}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch {
    return NextResponse.json({ error: 'File not found atau sudah di-clean' }, { status: 404 })
  }
}
