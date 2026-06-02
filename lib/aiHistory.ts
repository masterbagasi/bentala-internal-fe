export type AITool = 'chat' | 'image' | 'video'

export interface Message {
  role: 'user' | 'assistant'
  content: string
}

export interface ChatSession {
  id: string
  title: string
  messages: Message[]
  createdAt: string
  updatedAt: string
}

export interface ImageHistoryData {
  deskripsi: string
  style: string
  provider: string
  imageUrl: string
  mjPrompt: string | null
}

export interface VideoHistoryData {
  judul: string
  platform: string
  duration: string
  tone: string
  result: {
    duration: string
    format: string
    tone: string
    editing_style: string
    hook: string
    script: {
      timecode: string
      label: string
      dialog: string
      direction: string
      talking_points: string[]
    }[]
  }
}

export interface HistoryItem {
  id: string
  tool: AITool
  title: string
  createdAt: string
  updatedAt: string
  data: { messages: Message[] } | ImageHistoryData | VideoHistoryData
}

const STORAGE_KEY = 'bentala_ai_history'
const MAX_PER_TOOL = 50

function load(): HistoryItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function save(items: HistoryItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {}
}

export function createSession(tool: AITool): HistoryItem {
  const now = new Date().toISOString()
  const item: HistoryItem = {
    id: `${tool}_${Date.now()}`,
    tool,
    title: 'Chat baru',
    createdAt: now,
    updatedAt: now,
    data: tool === 'chat' ? { messages: [] } : { messages: [] },
  }
  const all = load()
  save([item, ...all])
  return item
}

export function upsertSession(id: string, updates: Partial<Pick<HistoryItem, 'title' | 'data'>>) {
  const all = load()
  const idx = all.findIndex(h => h.id === id)
  if (idx === -1) return
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() }
  // move to top within its tool
  const item = all.splice(idx, 1)[0]
  const sameToolIdx = all.findIndex(h => h.tool === item.tool)
  all.splice(sameToolIdx === -1 ? 0 : sameToolIdx, 0, item)
  save(all)
}

export function addHistoryItem(item: Omit<HistoryItem, 'id' | 'createdAt' | 'updatedAt'>) {
  const all = load()
  const now = new Date().toISOString()
  const newItem: HistoryItem = { ...item, id: `${item.tool}_${Date.now()}`, createdAt: now, updatedAt: now }
  const filtered = all.filter(h => h.tool !== item.tool)
  const sameTools = all.filter(h => h.tool === item.tool)
  save([newItem, ...sameTools, ...filtered].slice(0, MAX_PER_TOOL * 3))
  return newItem
}

export function getHistoryByTool(tool: AITool): HistoryItem[] {
  return load()
    .filter(h => h.tool === tool)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
}

export function deleteHistoryItem(id: string) {
  save(load().filter(h => h.id !== id))
}

export function clearHistoryByTool(tool: AITool) {
  save(load().filter(h => h.tool !== tool))
}

export function formatHistoryDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Baru saja'
  if (diffMins < 60) return `${diffMins} menit lalu`
  if (diffHours < 24) return `${diffHours} jam lalu`
  if (diffDays === 1) return 'Kemarin'
  if (diffDays < 7) return `${diffDays} hari lalu`
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}
