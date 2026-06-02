import path from 'path'
import { promises as fs } from 'fs'
import crypto from 'crypto'

// User-uploaded image templates. Stored as JSON metadata at the project root
// (gitignored) — each template's reference image is base64-encoded inline so
// we can serve it directly without separate file management.
//
// Trade-off: JSON file gets bigger (~200KB-2MB per template). Acceptable for
// dozens of templates; if it grows past 50MB, migrate to Supabase Storage.

export interface ImageTemplate {
  id: string
  brand: 'bpi' | 'bsi' | 'custom'
  name: string
  description: string
  prompt: string
  ratio: string                // e.g., '4:5'
  style: string                // matches STYLE_OPTIONS.key in image page
  /** data:image/...;base64,... — optional reference image */
  image_dataurl?: string | null
  created_at: string
}

const FILE_NAME = '.ai-image-templates.json'

interface StoreShape {
  templates: ImageTemplate[]
}

let cache: StoreShape | null = null

function filePath(): string {
  return path.join(process.cwd(), FILE_NAME)
}

async function readStore(): Promise<StoreShape> {
  if (cache) return cache
  try {
    const raw = await fs.readFile(filePath(), 'utf-8')
    const parsed = JSON.parse(raw) as StoreShape
    cache = parsed
    return parsed
  } catch {
    cache = { templates: [] }
    return cache
  }
}

async function writeStore(store: StoreShape): Promise<void> {
  cache = store
  await fs.writeFile(filePath(), JSON.stringify(store, null, 2) + '\n', 'utf-8')
}

export async function listTemplates(): Promise<ImageTemplate[]> {
  const s = await readStore()
  return s.templates
}

export async function getTemplate(id: string): Promise<ImageTemplate | null> {
  const s = await readStore()
  return s.templates.find(t => t.id === id) ?? null
}

export async function createTemplate(input: Omit<ImageTemplate, 'id' | 'created_at'>): Promise<ImageTemplate> {
  // Basic validation. Reject obviously bad input early so the JSON store stays clean.
  if (!input.name?.trim()) throw new Error('name required')
  if (!input.prompt?.trim()) throw new Error('prompt required')
  if (!['bpi', 'bsi', 'custom'].includes(input.brand)) throw new Error('invalid brand')

  // Cap image data URL size (~3MB raw → ~4MB base64) to avoid bloating the
  // JSON. Frontend should compress before upload but server enforces too.
  if (input.image_dataurl && input.image_dataurl.length > 5_000_000) {
    throw new Error('Reference image terlalu besar. Maksimum ~3.5MB. Compress dulu sebelum upload.')
  }

  const t: ImageTemplate = {
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    ...input,
  }
  const s = await readStore()
  s.templates.unshift(t) // newest first
  await writeStore(s)
  return t
}

export async function deleteTemplate(id: string): Promise<boolean> {
  const s = await readStore()
  const before = s.templates.length
  s.templates = s.templates.filter(t => t.id !== id)
  if (s.templates.length === before) return false
  await writeStore(s)
  return true
}
