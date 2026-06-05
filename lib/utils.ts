import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'
import { format, formatDistanceToNow, parseISO, isValid } from 'date-fns'
import { id } from 'date-fns/locale'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

export function formatDate(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (!isValid(d)) return dateStr
    return format(d, 'dd MMM yyyy', { locale: id })
  } catch {
    return dateStr
  }
}

export function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return '—'
  try {
    const d = parseISO(dateStr)
    if (!isValid(d)) return dateStr
    return format(d, 'dd MMM yyyy HH:mm', { locale: id })
  } catch {
    return dateStr
  }
}

export function timeAgo(dateStr: string): string {
  try {
    const d = parseISO(dateStr)
    return formatDistanceToNow(d, { addSuffix: true, locale: id })
  } catch {
    return dateStr
  }
}

export function formatRupiah(value: number): string {
  return 'Rp ' + value.toLocaleString('id-ID')
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1048576).toFixed(1) + ' MB'
}

export function getInitials(name: string): string {
  return name.slice(0, 2).toUpperCase()
}

export function normArr<T>(val: T | T[] | undefined): T[] {
  if (!val) return []
  if (Array.isArray(val)) return val
  return [val]
}

export function generateInvoiceNum(count: number): string {
  const year = new Date().getFullYear()
  return `INV-${year}-${String(count + 1).padStart(3, '0')}`
}

export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate()
}

export function getFileIcon(mimeType: string, fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  if (mimeType.startsWith('image/') || ['jpg','jpeg','png','gif','webp','svg'].includes(ext)) return '🖼️'
  if (mimeType.startsWith('video/') || ['mp4','mov','avi','mkv'].includes(ext)) return '🎬'
  if (['pdf'].includes(ext)) return '📄'
  if (['psd','ai'].includes(ext)) return '🎨'
  if (['fig','sketch','xd'].includes(ext)) return '✏️'
  return '📁'
}

export function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith('image/')
}

export function isVideoFile(mimeType: string): boolean {
  return mimeType.startsWith('video/')
}

export function colorToAlpha(hex: string, alpha: number): string {
  // Convert hex to rgba
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/**
 * Comparator: sort posts by posting date ascending — the nearest/soonest date
 * on top, furthest below. Posts without a date sort last.
 */
export function byPostDateAsc(a: { date?: string | null }, b: { date?: string | null }): number {
  const da = a.date ? new Date(a.date).getTime() : Infinity
  const db = b.date ? new Date(b.date).getTime() : Infinity
  return da - db
}
