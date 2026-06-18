// Default logo glyph for a socmed project: the first letter of each word,
// uppercased (e.g. "Master Bagasi" → "MB", "Bentala Trip Project" → "BTP").
// A single-word name falls back to its first two letters ("Bentala" → "Be")
// so the tile never shows a lonely single character. Capped at 3 letters.
//
// Server- and client-safe (no 'use client') so the create API and the UI share
// one rule — add a project and its logo is correct with no manual glyph entry.
export function projectGlyph(name: string): string {
  const words = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return words.map(w => w[0]).join('').slice(0, 3).toUpperCase()
}
