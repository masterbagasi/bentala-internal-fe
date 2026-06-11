// Pure helpers that isolate Composio's Instagram response shapes. Composio's
// own pitfall notes warn the metric value can live at values[0].value or
// total_value.value, media is double-wrapped under data.data, and the cursor
// is under data.paging.cursors.after. Everything here is defensive.

/* eslint-disable @typescript-eslint/no-explicit-any */

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? parseFloat(v) : (v as number)
  return Number.isFinite(n) ? n : null
}

// Insight/media-insight responses may be double-wrapped: res.data.data is the
// metric array; sometimes res.data is already the array.
export function metricRows(res: any): any[] {
  const d = res?.data
  if (Array.isArray(d?.data)) return d.data
  if (Array.isArray(d)) return d
  return []
}

// A single metric's value: total_value.value | total_value | last values[].value.
export function metricValue(m: any): number | null {
  const tv = m?.total_value
  if (tv && typeof tv === 'object' && 'value' in tv) return num(tv.value)
  if (tv != null && typeof tv !== 'object') return num(tv)
  const vals = m?.values
  if (Array.isArray(vals) && vals.length) return num(vals[vals.length - 1]?.value)
  return null
}

// name -> value map from an insights metric array.
export function metricMap(res: any): Record<string, number | null> {
  const out: Record<string, number | null> = {}
  for (const m of metricRows(res)) {
    const name = m?.name
    if (name) out[name] = metricValue(m)
  }
  return out
}

// Media list is under res.data.data; cursor under res.data.paging.cursors.after.
export function mediaPage(res: any): { items: any[]; after: string | null } {
  const data = res?.data ?? {}
  const items = Array.isArray(data?.data) ? data.data : []
  const paging = data?.paging ?? {}
  const after = paging?.next ? (paging?.cursors?.after ?? null) : null
  return { items, after }
}

// follower_demographics returns nested breakdown buckets; flatten to {bucket,value}[].
export function demographicBuckets(res: any): { bucket: string; value: number }[] {
  const out: { bucket: string; value: number }[] = []
  for (const m of metricRows(res)) {
    const breakdowns = m?.total_value?.breakdowns ?? []
    for (const b of breakdowns) {
      for (const r of (b?.results ?? [])) {
        const key = Array.isArray(r?.dimension_values)
          ? r.dimension_values.join(' / ')
          : String(r?.dimension_values ?? '')
        const v = num(r?.value)
        if (key && v != null) out.push({ bucket: key, value: v })
      }
    }
  }
  return out
}
