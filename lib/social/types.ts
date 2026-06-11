// Shared types for the Instagram live connect + read feature.

export interface SocialConnection {
  id: string
  brand: string
  platform: 'instagram'
  composio_user_id: string
  connected_account_id: string
  ig_user_id: string | null
  username: string | null
  status: 'connected' | 'pending' | 'error'
  connected_at: string | null
}

// One normalized analytics payload the Social views consume.
export interface IgAnalytics {
  followers: number | null
  overview: { reach: number | null; views: number | null; interactions: number | null; engaged: number | null }
  followersByDay: { day: string; value: number }[]
  posts: {
    id: string; caption: string | null; permalink: string | null; type: string | null
    timestamp: string | null; likes: number; comments: number
    reach: number | null; views: number | null; saved: number | null; shares: number | null
  }[]
  demographics: { kind: string; breakdown: string; buckets: { bucket: string; value: number }[] }[]
  lastSyncedAt: string | null
}
