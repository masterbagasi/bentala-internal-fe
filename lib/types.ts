// ============================================================
// TYPE DEFINITIONS — Bentala Internal System
// ============================================================

export type PostStatus =
  | 'todo' | 'brief' | 'produksi' | 'revisi'
  | 'review' | 'ready' | 'published' | 'done'

// Project slug a post belongs to (e.g. 'bpi', 'bsi', or a custom one). 'ws' is
// the workspace pseudo-entity. Free-form string since projects are now dynamic.
export type PostEntity = string
export type PostPlatform = 'ig' | 'tiktok' | 'youtube' | 'x' | 'linkedin'

export interface SocmedProject {
  slug: string
  name: string
  glyph: string
  color: string
  sort_order: number
  active: boolean
  created_at?: string
  // Profile fields (Settings → Project Socmed). Optional; default '' in the DB.
  address?: string
  phone?: string
  email?: string
  pic?: string
  description?: string
  instagram?: string
  tiktok?: string
  website?: string
}

// Which discipline a revision is addressed to. Mirrors the two content tracks.
export type RevisionTrack = 'video' | 'design'

// One uploaded reference file on a revision.
export interface RevisionFile {
  url: string
  name: string
}

// A revision request attached to a post (stored in posts.revisions jsonb). Shown
// in the post-detail "Detail Revisi" section; editable from Socmed Management.
export interface PostRevision {
  id: string
  tracks: RevisionTrack[]    // Video Production / Design Studio (can be both)
  detail: string             // revision instructions
  reference_links?: string[] // pasted reference URLs (can be many)
  reference_link?: string    // legacy single reference URL (older rows)
  files?: RevisionFile[]     // uploaded reference files (can be many)
  file_url?: string          // legacy single-file URL (older rows)
  file_name?: string         // legacy single-file name (older rows)
  author_name: string
  author_email: string
  created_at: string
  updated_at: string
}

/** Normalise a revision's files (new `files[]` + any legacy single file). */
export function revisionFiles(rev: PostRevision): RevisionFile[] {
  const out = [...(rev.files ?? [])]
  if (rev.file_url) out.push({ url: rev.file_url, name: rev.file_name || rev.file_url })
  return out
}

/** Normalise a revision's reference links (new `reference_links[]` + legacy single). */
export function revisionLinks(rev: PostRevision): string[] {
  const out = [...(rev.reference_links ?? [])]
  if (rev.reference_link && !out.includes(rev.reference_link)) out.push(rev.reference_link)
  return out
}

export interface Post {
  id: string
  entity: PostEntity
  title: string
  platforms: PostPlatform[]
  date?: string
  status: PostStatus
  pics: string[]          // ['Video Production', 'Design Studio']
  caption: string
  headline: string        // headline copy for the content
  brief: string           // content brief / instructions
  video_status: string    // independent Video Production track status
  design_status: string   // independent Design Studio track status
  hashtags: string
  content_types: string[] // ['video', 'design']
  video_link: string
  design_link: string
  video_file_url: string
  design_file_url: string
  notes: string
  tagged: string[]        // tagged team members (by name), notified on save
  created_by: string      // name of the user who created the post
  ratio: string           // content aspect ratio, e.g. '1:1', '9:16'
  files: string[]         // uploaded attachment URLs (any file type)
  revisions?: PostRevision[] // revision requests (Socmed Management)
  created_at: string
  updated_at: string
  deleted_at?: string | null  // soft-delete timestamp; null/absent = active
  last_actor?: string | null      // email of whoever made the most recent change
  last_change_at?: string | null  // when that change happened (unread markers)
}

export type ClientStage = 'lead' | 'pitch' | 'close' | 'invoice' | 'inactive'

export interface Client {
  id: string
  name: string
  pic: string
  contact: string
  stage: ClientStage
  value: number
  service: string
  internal: string
  notes: string
  created_at: string
  updated_at: string
}

export type InvoiceStatus = 'pending' | 'dp' | 'paid' | 'overdue'

export interface Invoice {
  id: string
  num: string
  client: string
  client_id?: string | null
  project: string
  value: number
  due?: string
  status: InvoiceStatus
  notes: string
  created_at: string
  updated_at: string
}

export type ProjectType = 'smm' | 'content' | 'ads' | 'kol' | 'internal'
export type ProjectStatus = 'active' | 'hold' | 'done' | 'cancelled'

export interface Project {
  id: string
  name: string
  client: string
  client_id?: string | null
  type: ProjectType
  deadline?: string
  status: ProjectStatus
  team: string[]
  description: string
  progress: number
  created_at: string
  updated_at: string
}

export type TaskStatus = 'todo' | 'progress' | 'review' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface Task {
  id: string
  title: string
  project_id?: string
  assignee: string
  priority: TaskPriority
  status: TaskStatus
  due?: string
  notes: string
  created_at: string
  updated_at: string
  // joined
  project?: Project
}

export interface ActivityLog {
  id: string
  message: string
  user_name: string
  created_at: string
}

export interface FileAttachment {
  id: string
  post_id: string
  category: 'video' | 'design'
  file_name: string
  file_size: number
  file_type: string
  storage_path: string
  created_at: string
}

export interface TeamMember {
  name: string
  role: string
  color: string
  fullName?: string
  sub?: string
  initials: string
  email?: string
}

// Zustand store types
export interface AppState {
  // Data
  posts: Post[]
  clients: Client[]
  invoices: Invoice[]
  projects: Project[]
  tasks: Task[]
  activity: ActivityLog[]

  // UI state
  currentPage: string

  // Actions
  setPosts: (posts: Post[]) => void
  setClients: (clients: Client[]) => void
  setInvoices: (invoices: Invoice[]) => void
  setProjects: (projects: Project[]) => void
  setTasks: (tasks: Task[]) => void
  setActivity: (activity: ActivityLog[]) => void
  setCurrentPage: (page: string) => void
}

// ── Pipeline types ──────────────────────────────────────────────

export type StageStatus = 'pending' | 'in_progress' | 'done'

export interface StageData {
  status: StageStatus
  notes: string
  files: { label: string; url: string }[]
  checklist: { id: string; text: string; done: boolean }[]
  started_at: string | null
  completed_at: string | null
}

export interface PipelineItem {
  id: string
  title: string
  member: 'Video Production' | 'Design Studio'
  source_post_id: string | null
  current_stage: string
  stages_data: Record<string, StageData>
  created_at: string
  updated_at: string
}

// ── AI Studio types ──────────────────────────────────────────────

export interface IdeaItem {
  id: string
  title: string
  concept: string
  hook: string
  angle: string
  format_saran: string
  referensi_inspirasi?: string
  saved: boolean
}

export interface ContentBrief {
  judul: string
  objective: string
  target_audiens: string
  platform: string
  format: string
  talent: string
  properti: string[]
  mood_board: string
  key_messages: string[]
  cta: string
  referensi_gaya: string
  notes: string
}

export interface StorylineScene {
  no: number
  timecode: string
  label: string
  visual: string
  dialog: string
  direction: string
  bgm: string
}

export interface Storyline {
  total_durasi: string
  format: string
  scenes: StorylineScene[]
}

export interface AudioTimingSection {
  section: string
  duration: string
  text: string
  tone_guidance: string
}

export interface AudioScript {
  judul: string
  estimated_duration: string
  script_narasi: string
  timing_guide: AudioTimingSection[]
  recording_tips: string[]
  recommended_bgm: string
  voice_character: string
}

export interface AIGeneration {
  id: string
  idea_id: string | null
  input_text: string
  platform: string
  caption: string
  hashtags: string
  script: string
  posting_time: string
  exported_to: string | null
  exported_post_id: string | null
  user_name: string
  created_at: string
}

export type NewsCategory = 'diaspora' | 'budaya' | 'prestasi' | 'viral' | 'internasional' | 'video'

export interface NewsItem {
  id: string
  source: string
  source_type: 'international' | 'indonesia' | 'social'
  category: NewsCategory
  title: string
  summary: string
  url: string
  published_at: string
  fetched_at: string
  relevance_score: number | null
  video_id?: string
  channel_title?: string
}

// ── Content Pipeline types ────────────────────────────────────────

export type PipelineStageKey = 'ide' | 'brief' | 'caption' | 'selesai'
export type BriefType = 'design' | 'video'
export type BriefStatus = 'pending' | 'in_progress' | 'done'
export type PipelineCardPlatform = 'ig' | 'tiktok' | 'keduanya'

export interface PipelineCard {
  id: string
  title: string
  entity: 'bpi' | 'bsi'
  platform: PipelineCardPlatform
  stage: PipelineStageKey
  idea_text: string | null
  created_at: string
  updated_at: string
}

export interface DesignBrief {
  format: string
  tone: string
  palette: { name: string; hex: string }[]
  typography: { headline: string; subtext: string; cta: string }
  composition: string
  midjourney_prompt: string
  dalle_prompt: string
}

export interface ScriptScene {
  timecode: string
  label: string
  dialog: string
  direction: string
  talking_points: string[]
}

export interface VideoBrief {
  duration: string
  format: string
  tone: string
  editing_style: string
  script: ScriptScene[]
  storyboard_prompts: string[]
}

export interface ProductionBrief {
  id: string
  pipeline_id: string
  type: BriefType
  content: DesignBrief | VideoBrief
  images: string[]
  status: BriefStatus
  created_at: string
  updated_at: string
  pipeline?: PipelineCard
}

export type InteractionType =
  | 'call' | 'meeting' | 'whatsapp' | 'email' | 'note' | 'stage_change' | 'followup'

export interface ClientInteraction {
  id: string
  client_id: string
  type: InteractionType
  summary: string
  occurred_at: string
  next_follow_up: string | null
  follow_up_done: boolean
  files: string[]
  author_email: string | null
  author_name: string | null
  created_at: string
}

/** Lightweight projection used for badges / panel / bell. */
export interface OpenFollowUp {
  id: string
  client_id: string
  next_follow_up: string
}
