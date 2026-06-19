import { POST_STATUS_LABELS } from './constants'

// One row of the posts change-log (written by DB triggers on posts +
// file_attachments). The Activity tab and the per-section detail markers are
// both derived from this stream so they're always consistent and realtime.
export interface HistoryRow {
  id: string
  post_id: string
  entity: string
  pics: string[] | null
  title: string
  action: 'created' | 'updated' | 'deleted' | 'restored' | 'purged'
  changes: Record<string, { from: unknown; to: unknown }> | null
  actor: string | null
  created_at: string
}

// Indonesian labels for changed post fields.
export const FIELD_LABEL: Record<string, string> = {
  title: 'Judul', date: 'Tanggal', status: 'Status', platforms: 'Platform',
  pics: 'PIC', caption: 'Caption', hashtags: 'Hashtag', content_types: 'Tipe konten',
  video_link: 'Link video', design_link: 'Link desain', video_file_url: 'File video',
  design_file_url: 'File desain', notes: 'Catatan', tagged: 'Tag', ratio: 'Rasio',
  files: 'Lampiran', brief: 'Brief', headline: 'Headline',
}

// Fields that count as an "attachment" change (drive the Lampiran section mark).
export const ATTACH_FIELDS = ['files', 'video_file_url', 'design_file_url', 'video_link', 'design_link']

export function fmtHistoryTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function fmtVal(field: string, v: unknown): string {
  if (v == null || v === '') return '(kosong)'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '(kosong)'
  if (field === 'status') return POST_STATUS_LABELS[String(v)] ?? String(v)
  return String(v)
}

/** Short one-line summary of a history row (e.g. "Status, Brief diubah"). */
export function describeHistory(r: HistoryRow): string {
  switch (r.action) {
    case 'created': return 'Membuat task ini'
    case 'deleted': return 'Menghapus task'
    case 'restored': return 'Memulihkan task'
    case 'purged': return 'Menghapus permanen'
    case 'updated': {
      const fields = Object.keys(r.changes ?? {}).map(k => FIELD_LABEL[k] ?? k)
      if (!fields.length) return 'Memperbarui task'
      return `${fields.join(', ')} diubah`
    }
    default: return r.action
  }
}

/** Per-field before → after detail for an 'updated' row. */
export function historyDetails(r: HistoryRow): { label: string; from: string; to: string }[] {
  if (r.action !== 'updated' || !r.changes) return []
  return Object.entries(r.changes).map(([k, v]) => ({
    label: FIELD_LABEL[k] ?? k, from: fmtVal(k, v.from), to: fmtVal(k, v.to),
  }))
}

/**
 * Set of field keys changed by SOMEONE ELSE since the viewer last opened the
 * task — used to mark the matching sections (Brief, Lampiran, …) in the detail.
 */
export function fieldsChangedSince(
  rows: HistoryRow[],
  sinceMs: number,
  meEmail: string | null,
): Set<string> {
  const out = new Set<string>()
  // Until we know who the viewer is, mark nothing — otherwise the viewer's own
  // edits (which we can't yet exclude) would flash as marks.
  if (!meEmail) return out
  const me = meEmail.toLowerCase()
  for (const r of rows) {
    const at = Date.parse(r.created_at)
    if (Number.isNaN(at) || at <= sinceMs) continue
    const actor = (r.actor ?? '').toLowerCase()
    // Only trust rows whose actor is a real email. Legacy rows stored the
    // creator's NAME (not the editor's email), so they can't be reliably
    // attributed — and counting them lit up every field the viewer themselves
    // had ever edited. Ignoring them means a field marks ONLY for a genuine
    // change by someone ELSE (whose email we can see), never a false positive.
    if (!actor.includes('@')) continue
    if (actor === me) continue
    if (r.action === 'updated' && r.changes) {
      for (const k of Object.keys(r.changes)) out.add(k)
    }
  }
  return out
}

/** Does any of `keys` appear in the changed-since set? */
export function sectionMarked(changed: Set<string>, keys: string[]): boolean {
  return keys.some(k => changed.has(k))
}

/**
 * URLs of attachments ADDED by someone else since the viewer last opened the
 * task. Derived from the same change-log as fieldsChangedSince (same actor/time
 * guards), so the per-file "new" outline marks ONLY genuinely-new files from
 * others — never the viewer's own uploads, and never pre-existing files. A
 * row's `to` array minus its `from` array is exactly what that change added.
 */
export function attachmentsAddedSince(
  rows: HistoryRow[],
  sinceMs: number,
  meEmail: string | null,
): Set<string> {
  const out = new Set<string>()
  if (!meEmail) return out
  const me = meEmail.toLowerCase()
  const asUrls = (v: unknown): string[] =>
    Array.isArray(v)
      ? v.filter((x): x is string => typeof x === 'string')
      : typeof v === 'string' && v ? [v] : []
  for (const r of rows) {
    const at = Date.parse(r.created_at)
    if (Number.isNaN(at) || at <= sinceMs) continue
    const actor = (r.actor ?? '').toLowerCase()
    if (!actor.includes('@') || actor === me) continue
    if (r.action !== 'updated' || !r.changes) continue
    for (const k of ATTACH_FIELDS) {
      const ch = r.changes[k]
      if (!ch) continue
      const before = new Set(asUrls(ch.from))
      for (const u of asUrls(ch.to)) if (!before.has(u)) out.add(u)
    }
  }
  return out
}
