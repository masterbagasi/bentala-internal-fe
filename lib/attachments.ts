// Shared attachment-link helpers (used by PostModal + CRM interaction logger).
export const DANGEROUS_SCHEME = /^\s*(javascript|data|vbscript|file|blob):/i
/** A storage upload lives in our Supabase bucket; anything else is a pasted link. */
export const isUploadedFile = (u: string) => u.includes('/storage/v1/object/public/')
/** Normalise to an http(s) href; inert '#' for anything else (guards XSS + legacy rows). */
export const linkHref = (u: string) => {
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`
  try { const p = new URL(withScheme); return p.protocol === 'http:' || p.protocol === 'https:' ? p.toString() : '#' } catch { return '#' }
}
