/**
 * migrateFromLocalStorage
 * ========================
 * Reads data from the old HTML app's localStorage keys and uploads
 * them to Supabase. Run this once after setting up the new app.
 *
 * Usage: call from the browser console or a one-time migration page.
 */
import { getSupabase } from './supabase'
import type { Post, Client, Invoice, Project, Task } from './types'

interface LegacyDB {
  posts?: unknown[]
  clients?: unknown[]
  invoices?: unknown[]
  projects?: unknown[]
  tasks?: unknown[]
  activity?: unknown[]
}

const STATUS_MAP: Record<string, string> = {
  idea:      'todo',
  edit:      'produksi',
  scheduled: 'ready',
}

function migratePostStatus(status: string): string {
  return STATUS_MAP[status] || status
}

export async function migrateFromLocalStorage(): Promise<{
  posts: number
  clients: number
  invoices: number
  projects: number
  tasks: number
  errors: string[]
}> {
  const supabase = getSupabase()
  const errors: string[] = []
  const counts = { posts: 0, clients: 0, invoices: 0, projects: 0, tasks: 0 }

  function readLS<T>(key: string): T[] {
    try {
      return JSON.parse(localStorage.getItem(key) || '[]') as T[]
    } catch {
      errors.push(`Failed to read localStorage key: ${key}`)
      return []
    }
  }

  const legacy: LegacyDB = {
    posts:    readLS('b_posts'),
    clients:  readLS('b_clients'),
    invoices: readLS('b_invoices'),
    projects: readLS('b_projects'),
    tasks:    readLS('b_tasks'),
    activity: readLS('b_activity'),
  }

  // ── Migrate Posts ──
  if (legacy.posts?.length) {
    const mapped = (legacy.posts as Record<string, unknown>[]).map((p) => ({
      id:             p.id as string,
      entity:         (p.entity as string) || 'bpi',
      title:          (p.title as string) || '',
      platforms:      Array.isArray(p.platforms) ? p.platforms :
                      p.platform ? [p.platform] : [],
      date:           (p.date as string) || null,
      status:         migratePostStatus((p.status as string) || 'todo'),
      pics:           Array.isArray(p.pics) ? p.pics :
                      p.pic ? [p.pic] : [],
      caption:        (p.caption as string) || '',
      hashtags:       (p.hashtags as string) || '',
      content_types:  Array.isArray(p.contentTypes) ? p.contentTypes :
                      Array.isArray(p.content_types) ? p.content_types : [],
      video_link:     (p.videoLink as string) || (p.video_link as string) || '',
      design_link:    (p.designLink as string) || (p.design_link as string) || '',
      video_file_url:  '',
      design_file_url: '',
      notes:          (p.notes as string) || '',
      created_at:     (p.createdAt as string) || new Date().toISOString(),
    }))

    const { error } = await supabase.from('posts').upsert(mapped, { onConflict: 'id' })
    if (error) errors.push(`Posts error: ${error.message}`)
    else counts.posts = mapped.length
  }

  // ── Migrate Clients ──
  if (legacy.clients?.length) {
    const mapped = (legacy.clients as Record<string, unknown>[]).map((c) => ({
      id:         c.id as string,
      name:       (c.name as string) || '',
      pic:        (c.pic as string) || '',
      contact:    (c.contact as string) || '',
      stage:      (c.stage as string) || 'lead',
      value:      Number(c.value) || 0,
      service:    (c.service as string) || 'smm',
      internal:   (c.internal as string) || '',
      notes:      (c.notes as string) || '',
      created_at: (c.createdAt as string) || new Date().toISOString(),
    }))

    const { error } = await supabase.from('clients').upsert(mapped, { onConflict: 'id' })
    if (error) errors.push(`Clients error: ${error.message}`)
    else counts.clients = mapped.length
  }

  // ── Migrate Invoices ──
  if (legacy.invoices?.length) {
    const mapped = (legacy.invoices as Record<string, unknown>[]).map((i) => ({
      id:         i.id as string,
      num:        (i.num as string) || '',
      client:     (i.client as string) || '',
      project:    (i.project as string) || '',
      value:      Number(i.value) || 0,
      due:        (i.due as string) || null,
      status:     (i.status as string) || 'pending',
      notes:      (i.notes as string) || '',
      created_at: (i.createdAt as string) || new Date().toISOString(),
    }))

    const { error } = await supabase.from('invoices').upsert(mapped, { onConflict: 'id' })
    if (error) errors.push(`Invoices error: ${error.message}`)
    else counts.invoices = mapped.length
  }

  // ── Migrate Projects ──
  if (legacy.projects?.length) {
    const mapped = (legacy.projects as Record<string, unknown>[]).map((p) => ({
      id:          p.id as string,
      name:        (p.name as string) || '',
      client:      (p.client as string) || '',
      type:        (p.type as string) || 'smm',
      deadline:    (p.deadline as string) || null,
      status:      (p.status as string) || 'active',
      team:        Array.isArray(p.team) ? p.team : [],
      description: (p.desc as string) || (p.description as string) || '',
      progress:    Number(p.progress) || 0,
      created_at:  (p.createdAt as string) || new Date().toISOString(),
    }))

    const { error } = await supabase.from('projects').upsert(mapped, { onConflict: 'id' })
    if (error) errors.push(`Projects error: ${error.message}`)
    else counts.projects = mapped.length
  }

  // ── Migrate Tasks ──
  if (legacy.tasks?.length) {
    const mapped = (legacy.tasks as Record<string, unknown>[]).map((t) => ({
      id:         t.id as string,
      title:      (t.title as string) || '',
      project_id: (t.project as string) || null,
      assignee:   (t.assignee as string) || '',
      priority:   (t.priority as string) || 'medium',
      status:     (t.status as string) || 'todo',
      due:        (t.due as string) || null,
      notes:      (t.notes as string) || '',
      created_at: (t.createdAt as string) || new Date().toISOString(),
    }))

    const { error } = await supabase.from('tasks').upsert(mapped, { onConflict: 'id' })
    if (error) errors.push(`Tasks error: ${error.message}`)
    else counts.tasks = mapped.length
  }

  // ── Migrate Activity Log ──
  if (legacy.activity?.length) {
    const mapped = (legacy.activity as Record<string, unknown>[]).map((a) => ({
      message:    (a.msg as string) || (a.message as string) || '',
      user_name:  '',
      created_at: (a.time as string) || new Date().toISOString(),
    }))

    // Insert all (no upsert since no IDs from old system)
    const { error } = await supabase.from('activity_log').insert(mapped)
    if (error) errors.push(`Activity error: ${error.message}`)
  }

  return { ...counts, errors }
}
