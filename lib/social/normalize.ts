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

// A daily time-series metric (period='day'): each metric carries values[] with
// an end_time + value. Used for follower_count (daily follower gains).
export function dailySeries(res: any): { day: string; value: number }[] {
  const out: { day: string; value: number }[] = []
  for (const m of metricRows(res)) {
    for (const v of (m?.values ?? [])) {
      const day = typeof v?.end_time === 'string' ? v.end_time.slice(0, 10) : null
      const val = num(v?.value)
      if (day && val != null) out.push({ day, value: val })
    }
  }
  return out
}

// Reconstruct an absolute daily follower trend from IG's follower_count series
// (which reports per-day GAINS, not totals) anchored to the known current total.
// abs[day d] = currentTotal − (sum of gains on days after d). IG omits unfollows,
// so the historical tail is approximate, but the curve is pinned to today's real
// total. Returns ascending-by-day; always includes a `today` point at the total.
export function reconstructFollowerSeries(
  dailyGains: { day: string; value: number }[],
  currentTotal: number,
  today: string,
): { day: string; value: number }[] {
  const gains = [...dailyGains].filter(g => g.day <= today).sort((a, b) => (a.day < b.day ? -1 : 1))
  const suffix: number[] = new Array(gains.length).fill(0)
  for (let i = gains.length - 2; i >= 0; i--) suffix[i] = suffix[i + 1] + gains[i + 1].value
  const series = gains.map((g, i) => ({ day: g.day, value: currentTotal - suffix[i] }))
  if (!series.some(p => p.day === today)) series.push({ day: today, value: currentTotal })
  return series
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
