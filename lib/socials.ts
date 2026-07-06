// Social / contact platforms selectable on the invoice footer. Keys map to a
// simple monochrome glyph + brand colour rendered by the invoice PDF.
export const SOCIAL_PLATFORMS: { key: string; label: string }[] = [
  { key: 'instagram', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'facebook', label: 'Facebook' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'x', label: 'X (Twitter)' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'threads', label: 'Threads' },
  { key: 'website', label: 'Website' },
  { key: 'email', label: 'Email' },
]

export function socialLabel(key: string): string {
  return SOCIAL_PLATFORMS.find((p) => p.key === key)?.label ?? key
}
