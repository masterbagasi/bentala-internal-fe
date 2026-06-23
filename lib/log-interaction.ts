import { getSupabase } from './supabase'
import { STAGE_LABELS } from './constants'

/** Append a stage-change entry to a client's interaction timeline. */
export async function logStageChange(clientId: string, from: string, to: string, note?: string): Promise<void> {
  if (from === to) return
  const supabase = getSupabase()
  const { data: u } = await supabase.auth.getUser()
  const meta = u.user?.user_metadata ?? {}
  const base = `Stage: ${STAGE_LABELS[from] ?? from} → ${STAGE_LABELS[to] ?? to}`
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).from('client_interactions').insert({
    client_id: clientId,
    type: 'stage_change',
    summary: note ? `${base} — ${note}` : base,
    occurred_at: new Date().toISOString(),
    author_email: u.user?.email ?? null,
    author_name: meta.full_name ?? meta.name ?? u.user?.email?.split('@')[0] ?? null,
  })
}
