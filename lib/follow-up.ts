/** Local calendar date as YYYY-MM-DD (follow-up dates are date-only). */
export function todayISODate(): string {
  const d = new Date()
  const m = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(y, m - 1, d + days)
  const mm = `${dt.getMonth() + 1}`.padStart(2, '0')
  const dd = `${dt.getDate()}`.padStart(2, '0')
  return `${dt.getFullYear()}-${mm}-${dd}`
}

/** overdue = before today; due = today..+2 days; else none. Compares date-only strings. */
export function followUpTone(dateISO: string, todayISO: string): 'overdue' | 'due' | 'none' {
  if (dateISO < todayISO) return 'overdue'
  if (dateISO <= addDaysISO(todayISO, 2)) return 'due'
  return 'none'
}
