'use client'

import { useState } from 'react'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useStore } from '@/hooks/useStore'
import { getSupabase } from '@/lib/supabase'
import { PROJ_TYPE, PROJ_STATUS_CLASS, TEAM } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { StatusBadge, TeamAvatar } from '@/components/shared/StatusBadge'
import { useLogActivity } from '@/hooks/useData'
import type { Project, ProjectType, ProjectStatus, Client } from '@/lib/types'

export function ProjectsPage() {
  const { projects, tasks, clients, projFilter, setProjFilter } = useStore()
  const [showModal, setShowModal] = useState(false)
  const [editProject, setEditProject] = useState<Project | null>(null)
  const logActivity = useLogActivity()

  const filtered = projFilter === 'all' ? projects : projects.filter(p => p.type === projFilter)

  async function handleDelete(id: string) {
    if (!confirm('Hapus project ini?')) return
    const supabase = getSupabase()
    await supabase.from('projects').delete().eq('id', id)
    logActivity('Project dihapus')
  }

  return (
    <div>
      {/* Filter + Add */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'Semua' },
          ...Object.entries(PROJ_TYPE).map(([k, v]) => ({ key: k, label: v })),
        ].map(f => (
          <button key={f.key}
            onClick={() => setProjFilter(f.key)}
            style={{
              padding: '5px 14px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer', fontSize: 12,
              background: projFilter === f.key ? 'var(--accent)' : 'var(--bg2)',
              color: projFilter === f.key ? '#fff' : 'var(--text2)',
              borderColor: projFilter === f.key ? 'var(--accent)' : 'var(--border)',
            }}
          >
            {f.label}
          </button>
        ))}
        <button
          onClick={() => { setEditProject(null); setShowModal(true) }}
          style={{ marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, padding: '7px 14px', cursor: 'pointer', fontSize: 13, fontWeight: 500 }}
        >
          + Tambah Project
        </button>
      </div>

      {/* Table */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
        <table>
          <thead>
            <tr>
              <th>Nama Project</th>
              <th>Client</th>
              <th>Tipe</th>
              <th>Team</th>
              <th>Deadline</th>
              <th>Status</th>
              <th>Progress</th>
              <th style={{ width: 80 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={8}>
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text2)' }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🗂</div>
                  Belum ada project.
                </div>
              </td></tr>
            ) : filtered.map(p => {
              const ptasks = tasks.filter(t => t.project_id === p.id)
              const done = ptasks.filter(t => t.status === 'done').length
              const prog = ptasks.length ? Math.round(done / ptasks.length * 100) : p.progress || 0

              return (
                <tr key={p.id}>
                  <td>
                    <div style={{ fontWeight: 500 }}>{p.name}</div>
                    {p.description && (
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{p.description.slice(0, 40)}{p.description.length > 40 ? '...' : ''}</div>
                    )}
                  </td>
                  <td style={{ color: p.client ? 'var(--text)' : 'var(--text2)' }}>{p.client || 'Internal'}</td>
                  <td>
                    <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, background: 'var(--bg3)', border: '1px solid var(--border)' }}>
                      {PROJ_TYPE[p.type] || p.type}
                    </span>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 3 }}>
                      {(p.team || []).map(m => <TeamAvatar key={m} name={m} size={22} />)}
                    </div>
                  </td>
                  <td style={{ color: 'var(--text2)', fontSize: 12 }}>{formatDate(p.deadline)}</td>
                  <td><StatusBadge status={p.status} type="proj" /></td>
                  <td style={{ minWidth: 100 }}>
                    <div style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 2 }}>
                      {prog}% ({done}/{ptasks.length} tasks)
                    </div>
                    <div style={{ background: 'var(--bg3)', borderRadius: 10, height: 5, overflow: 'hidden' }}>
                      <div style={{ height: '100%', borderRadius: 10, background: 'var(--accent)', width: `${prog}%` }} />
                    </div>
                  </td>
                  <td>
                    <button onClick={() => { setEditProject(p); setShowModal(true) }}
                      style={{ background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: 'var(--text)', marginRight: 4 }}>Edit</button>
                    <button onClick={() => handleDelete(p.id)}
                      style={{ background: 'var(--accent2)', border: 'none', borderRadius: 4, padding: '3px 8px', cursor: 'pointer', fontSize: 11, color: '#fff' }}>✕</button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {showModal && (
        <ProjectModal
          open={showModal}
          project={editProject}
          clients={clients}
          onClose={() => { setShowModal(false); setEditProject(null) }}
        />
      )}
    </div>
  )
}

function ProjectModal({ open, project, clients, onClose }: {
  open: boolean
  project: Project | null
  clients: Client[]
  onClose: () => void
}) {
  const logActivity = useLogActivity()
  const [form, setForm] = useState({
    name:        project?.name || '',
    client:      project?.client || '',
    type:        project?.type || 'smm',
    deadline:    project?.deadline || '',
    status:      project?.status || 'active',
    description: project?.description || '',
    team:        project?.team || [] as string[],
  })
  const [loading, setLoading] = useState(false)

  function toggleTeam(name: string) {
    setForm(f => ({
      ...f,
      team: f.team.includes(name) ? f.team.filter(x => x !== name) : [...f.team, name],
    }))
  }

  async function handleSave() {
    if (!form.name.trim()) { alert('Nama project wajib diisi!'); return }
    setLoading(true)
    const supabase = getSupabase()
    const data = {
      name:        form.name.trim(),
      client:      form.client,
      type:        form.type,
      deadline:    form.deadline || null,
      status:      form.status,
      team:        form.team,
      description: form.description,
      progress:    project?.progress || 0,
    }
    if (project) {
      await supabase.from('projects').update(data).eq('id', project.id)
      logActivity(`Project diupdate: "${form.name}"`)
    } else {
      await supabase.from('projects').insert(data)
      logActivity(`Project baru: "${form.name}" (${PROJ_TYPE[form.type]})`)
    }
    setLoading(false)
    onClose()
  }

  return (
    <Modal
      open={open} onClose={onClose}
      title={project ? 'Edit Project' : 'Tambah Project Baru'}
      footer={<><BtnSecondary onClick={onClose}>Batal</BtnSecondary><BtnPrimary onClick={handleSave} loading={loading}>Simpan</BtnPrimary></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <FG label="Nama Project *">
          <input type="text" value={form.name} onChange={e => setForm(f=>({...f,name:e.target.value}))} placeholder="Nama project..." />
        </FG>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FG label="Client">
            <select value={form.client} onChange={e => setForm(f=>({...f,client:e.target.value}))}>
              <option value="">— Internal —</option>
              {clients.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </FG>
          <FG label="Tipe">
            <select value={form.type} onChange={e => setForm(f=>({...f,type:e.target.value as ProjectType}))}>
              {Object.entries(PROJ_TYPE).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </FG>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <FG label="Deadline">
            <input type="date" value={form.deadline} onChange={e => setForm(f=>({...f,deadline:e.target.value}))} />
          </FG>
          <FG label="Status">
            <select value={form.status} onChange={e => setForm(f=>({...f,status:e.target.value as ProjectStatus}))}>
              <option value="active">Active</option>
              <option value="hold">On Hold</option>
              <option value="done">Done</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </FG>
        </div>
        <FG label="Team">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
            {TEAM.map(m => (
              <button key={m.name} type="button"
                onClick={() => toggleTeam(m.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 20,
                  border: `1px solid ${form.team.includes(m.name) ? m.color : 'var(--border)'}`,
                  background: form.team.includes(m.name) ? m.color + '22' : 'var(--bg3)',
                  color: form.team.includes(m.name) ? m.color : 'var(--text2)',
                  cursor: 'pointer', fontSize: 12,
                }}
              >
                <span style={{ width: 20, height: 20, borderRadius: '50%', background: m.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff' }}>
                  {m.initials}
                </span>
                {m.name}
              </button>
            ))}
          </div>
        </FG>
        <FG label="Deskripsi">
          <textarea value={form.description} onChange={e => setForm(f=>({...f,description:e.target.value}))} placeholder="Deskripsi project..." />
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
