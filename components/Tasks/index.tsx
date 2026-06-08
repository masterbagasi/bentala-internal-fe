'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { TASK_STATUS_LABELS, PRIORITY_COLORS, TEAM } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { StatusBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { useLogActivity } from '@/hooks/useData'
import type { Task, TaskPriority, TaskStatus, Project } from '@/lib/types'

const TASK_COLS = [
  { key: 'todo',     label: 'To Do',       color: '#8b8fa8' },
  { key: 'progress', label: 'In Progress',  color: '#5b9bd5' },
  { key: 'review',   label: 'Review',       color: '#ffc542' },
  { key: 'done',     label: 'Done',         color: '#43d9a2' },
]

export function TasksPage() {
  const t = useT()
  const { tasks, projects, taskFilter, setTaskFilter } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [dragTaskId, setDragTaskId] = useState<string | null>(null)
  const logActivity = useLogActivity()

  const filtered = taskFilter === 'all' ? tasks : tasks.filter(t => t.assignee === taskFilter)

  async function handleDrop(newStatus: string) {
    if (!dragTaskId) return
    const supabase = getSupabase()
    await supabase.from('tasks').update({ status: newStatus }).eq('id', dragTaskId)
    setDragTaskId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm(t('Hapus task ini?'))) return
    const supabase = getSupabase()
    await supabase.from('tasks').delete().eq('id', id)
    logActivity('Task dihapus')
  }

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <button
          onClick={() => setTaskFilter('all')}
          style={{ padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12, background: taskFilter === 'all' ? 'var(--accent)' : 'var(--bg2)', color: taskFilter === 'all' ? '#fff' : 'var(--text2)', borderColor: taskFilter === 'all' ? 'var(--accent)' : 'var(--border)' }}
        >
          {t('Semua')}
        </button>
        {TEAM.map(m => (
          <button key={m.name}
            onClick={() => setTaskFilter(m.name)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '5px 12px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12,
              background: taskFilter === m.name ? m.color + '22' : 'var(--bg2)',
              color: taskFilter === m.name ? m.color : 'var(--text2)',
              borderColor: taskFilter === m.name ? m.color : 'var(--border)',
            }}
          >
            <TeamAvatar name={m.name} size={18} />
            {m.name}
          </button>
        ))}
        <button
          onClick={() => { setEditTask(null); setShowModal(true) }}
          style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
        >
          + {t('Tambah Task')}
        </button>
      </div>

      {/* Kanban */}
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 8, alignItems: 'flex-start' }}>
        {TASK_COLS.map(col => {
          const colTasks = filtered.filter(t => t.status === col.key)
          return (
            <div key={col.key}
              style={{
                minWidth: 265, maxWidth: 265,
                background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12,
                padding: '14px 12px 10px', flexShrink: 0,
                display: 'flex', flexDirection: 'column',
                maxHeight: 'calc(100vh - 200px)',
              }}
              onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'move' }}
              onDrop={() => handleDrop(col.key)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexShrink: 0 }}>
                <span style={{ fontWeight: 600, color: col.color, fontSize: 14 }}>{col.label}</span>
                <span style={{ fontSize: 12, color: col.color, background: col.color + '22', borderRadius: 20, padding: '1px 7px' }}>{colTasks.length}</span>
              </div>

              <div className="drop-hint">{t('Drop di sini')}</div>

              <div style={{ overflowY: 'auto', flex: 1 }}>
                {colTasks.map(t => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    project={projects.find(p => p.id === t.project_id)}
                    onDragStart={() => setDragTaskId(t.id)}
                    onEdit={() => { setEditTask(t); setShowModal(true) }}
                    onDelete={() => handleDelete(t.id)}
                  />
                ))}
              </div>

              <button
                onClick={() => { setEditTask(null); setShowModal(true) }}
                style={{
                  width: '100%', background: 'none', border: 'none', color: 'var(--text2)',
                  fontSize: 13, padding: '7px 4px', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: 7, borderRadius: 6, marginTop: 4, flexShrink: 0,
                }}
                onMouseOver={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(108,99,255,0.08)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)' }}
                onMouseOut={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text2)' }}
              >
                <span style={{ fontSize: 15, color: 'var(--accent)' }}>+</span> {t('Tambah task')}
              </button>
            </div>
          )
        })}
      </div>

      {showModal && (
        <TaskModal
          open={showModal}
          task={editTask}
          projects={projects}
          onClose={() => { setShowModal(false); setEditTask(null) }}
        />
      )}
    </div>
  )
}

function TaskCard({ task, project, onDragStart, onEdit, onDelete }: {
  task: Task
  project?: { name: string }
  onDragStart: () => void
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="kanban-card"
      draggable
      onDragStart={onDragStart}
      style={{
        background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8,
        padding: '10px 12px', marginBottom: 8,
        transition: 'border-color 0.15s, box-shadow 0.15s',
        cursor: 'grab',
      }}
      onMouseOver={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'rgba(108,99,255,0.4)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = '0 2px 8px rgba(0,0,0,0.25)'
      }}
      onMouseOut={e => {
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
        ;(e.currentTarget as HTMLElement).style.boxShadow = ''
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.4, flex: 1 }}>{task.title}</div>
        <span style={{
          fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px',
          padding: '2px 6px', borderRadius: 4,
          background: PRIORITY_COLORS[task.priority] + '22',
          color: PRIORITY_COLORS[task.priority],
          flexShrink: 0,
        }}>
          {task.priority}
        </span>
      </div>
      {project && (
        <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 4 }}>📁 {project.name}</div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {task.assignee && <TeamAvatar name={task.assignee} size={20} />}
          {task.due && <span style={{ fontSize: 11, color: 'var(--text2)' }}>{formatDate(task.due)}</span>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button onClick={e => { e.stopPropagation(); onEdit() }}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, padding: '2px 4px', borderRadius: 4 }}
            onMouseOver={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg2)'}
            onMouseOut={e => (e.currentTarget as HTMLElement).style.background = 'none'}
          >✏️</button>
          <button onClick={e => { e.stopPropagation(); onDelete() }}
            style={{ background: 'none', border: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 13, padding: '2px 4px', borderRadius: 4 }}
            onMouseOver={e => { (e.currentTarget as HTMLElement).style.color = '#ff6b6b'; (e.currentTarget as HTMLElement).style.background = '#ff6b6b18' }}
            onMouseOut={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text2)'; (e.currentTarget as HTMLElement).style.background = 'none' }}
          >✕</button>
        </div>
      </div>
    </div>
  )
}

function TaskModal({ open, task, projects, onClose }: {
  open: boolean
  task: Task | null
  projects: Project[]
  onClose: () => void
}) {
  const t = useT()
  const logActivity = useLogActivity()
  const [form, setForm] = useState({
    title:      task?.title || '',
    project_id: task?.project_id || '',
    assignee:   task?.assignee || '',
    priority:   task?.priority || 'medium',
    status:     task?.status || 'todo',
    due:        task?.due || '',
    notes:      task?.notes || '',
  })
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    if (!form.title.trim()) { alert(t('Judul task wajib diisi!')); return }
    setLoading(true)
    const supabase = getSupabase()
    const data = {
      title:      form.title.trim(),
      project_id: form.project_id || null,
      assignee:   form.assignee,
      priority:   form.priority,
      status:     form.status,
      due:        form.due || null,
      notes:      form.notes,
    }
    if (task) {
      await supabase.from('tasks').update(data).eq('id', task.id)
      logActivity(`Task diupdate: "${form.title}"`)
    } else {
      await supabase.from('tasks').insert(data)
      logActivity(`Task baru: "${form.title}"`)
    }
    setLoading(false)
    onClose()
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title={task ? t('Edit Task') : t('Tambah Task Baru')}
      footer={<><BtnSecondary onClick={onClose}>{t('Batal')}</BtnSecondary><BtnPrimary onClick={handleSave} loading={loading}>{t('Simpan')}</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FG label={t('Judul Task *')}>
          <input type="text" value={form.title} onChange={e => setForm(f=>({...f,title:e.target.value}))} placeholder={t('Nama task...')} />
        </FG>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FG label="Project">
            <select value={form.project_id} onChange={e => setForm(f=>({...f,project_id:e.target.value}))}>
              <option value="">{t('— Tanpa Project —')}</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </FG>
          <FG label="Assignee">
            <select value={form.assignee} onChange={e => setForm(f=>({...f,assignee:e.target.value}))}>
              <option value="">{t('— Tidak ada —')}</option>
              {TEAM.map(m => <option key={m.name} value={m.name}>{m.name} ({m.role})</option>)}
            </select>
          </FG>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <FG label={t('Prioritas')}>
            <select value={form.priority} onChange={e => setForm(f=>({...f,priority:e.target.value as TaskPriority}))}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </FG>
          <FG label="Status">
            <select value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value as TaskStatus}))}>
              {Object.entries(TASK_STATUS_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FG>
          <FG label="Deadline">
            <input type="date" value={form.due} onChange={e => setForm(f=>({...f,due:e.target.value}))} />
          </FG>
        </div>
        <FG label={t('Catatan')}>
          <textarea value={form.notes} onChange={e => setForm(f=>({...f,notes:e.target.value}))} placeholder={t('Catatan...')} />
        </FG>
      </div>
    </Modal>
  )
}

function FG({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  )
}
