import { NextResponse } from 'next/server'
import { getAllFeatureStatus } from '@/lib/ai-features'
import { getAllProviderStatus } from '@/lib/ai-config'

// GET /api/settings/features
// Returns: { features: FeatureStatus[], providers: ProviderStatus[] }
// Both shipped in one response so the UI can show feature config + provider
// credentials side-by-side without a second request.
export async function GET() {
  try {
    const [features, providers] = await Promise.all([
      getAllFeatureStatus(),
      getAllProviderStatus(),
    ])
    return NextResponse.json({ features, providers })
  } catch (err) {
    console.error('[/api/settings/features] GET', err)
    return NextResponse.json({ error: 'Failed to fetch feature settings' }, { status: 500 })
  }
}
