import { NextResponse } from 'next/server'
import { getAllProviderStatus } from '@/lib/ai-config'

// GET /api/settings/ai — list all integration providers with status (no raw keys).
// Powers the cards on /settings/ai.
export async function GET() {
  try {
    const status = await getAllProviderStatus()
    return NextResponse.json({ providers: status })
  } catch (err) {
    console.error('[/api/settings/ai] GET', err)
    return NextResponse.json({ error: 'Failed to fetch settings' }, { status: 500 })
  }
}
