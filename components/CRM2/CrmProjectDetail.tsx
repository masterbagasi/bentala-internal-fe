'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useStore } from '@/hooks/useStore'
import { useShallow } from 'zustand/react/shallow'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { formatRupiah, formatDate } from '@/lib/utils'
import { PROJECT_STATUS_LABEL, PROJECT_STATUS_COLOR, PROJECT_STATUSES, TASK_STATUSES, TASK_STATUS_LABEL, TASK_STATUS_COLOR, invoiceTotals } from '@/lib/crm/schema'
import { POST_STATUS_LABELS, POST_STATUS_COLORS } from '@/lib/constants'
import { StageBadge, inStyle } from './ui'
import { CrmProjectFormModal } from './CrmProjectFormModal'
import { InvoiceFormModal } from './InvoiceFormModal'
import { PostPreviewModal } from '@/components/BPI/PostPreviewModal'
import { PostModal } from '@/components/BPI/PostModal'
import { ConfirmDialog } from '@/components/shared/Modal'
import type { CrmTask, CrmProject } from '@/lib/types'

export function CrmProjectDetail({ id }: { id: string }) {
  const t = useT()
  const router = useRouter()
  const { crmProjects, crmTasks, contacts, deals, posts, crmInvoices, crmInvoiceItems, meName, upsertCrmTask, removeCrmTask, upsertCrmProject, removeCrmProject } = useStore(useShallow(s => ({
    crmProjects: s.crmProjects, crmTasks: s.crmTasks, contacts: s.contacts, deals: s.deals, posts: s.posts,
    crmInvoices: s.crmInvoices, crmInvoiceItems: s.crmInvoiceItems, meName: s.meName,
    upsertCrmTask: s.upsertCrmTask, removeCrmTask: s.removeCrmTask, upsertCrmProject: s.upsertCrmProject, removeCrmProject: s.removeCrmProject,
  })))
  // Edit-task access mirrors the SMM board: the task's creator OR a super admin.
  const [isSuper, setIsSuper] = useState(false)
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(getSupabase() as any).auth.getUser().then(({ data }: any) => setIsSuper(isEffectiveSuperAdmin(data.user?.email, data.user?.app_metadata?.role)))
  }, [])
  const project = crmProjects.find(p => p.id === id)
  const [edit, setEdit] = useState(false)
  const [invoice, setInvoice] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)
  const [delBusy, setDelBusy] = useState(false)
  const [previewId, setPreviewId] = useState<string | null>(null) // SMM task detail popup
  const [editPostId, setEditPostId] = useState<string | null>(null) // edit form from the preview
  const [taskName, setTaskName] = useState('')
  const tasks = useMemo(() => crmTasks.filter(tk => tk.project_id === id), [crmTasks, id])

  if (!project) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--text2)' }}>{t('Project tidak ditemukan.')}</div>
  const contact = contacts.find(c => c.id === project.contact_id)
  const deal = deals.find(d => d.id === project.deal_id)

  // Contract value is derived, not the stale stored figure: sum the project's
  // invoice totals (what's actually billed); fall back to the linked deal's
  // pipeline value, then to the stored value.
  const projInvoices = crmInvoices.filter(i => i.project_id === project.id)
  const invoiceTotal = projInvoices.reduce((sum, inv) => {
    const items = crmInvoiceItems.filter(it => it.invoice_id === inv.id)
    return sum + invoiceTotals(items, inv.discount ?? 0, !!inv.tax_enabled).total
  }, 0)
  const contractValue = invoiceTotal > 0 ? invoiceTotal : (deal?.value || project.contract_value || 0)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = () => getSupabase() as any

  async function addTask() {
    const name = taskName.trim()
    if (!name) return
    setTaskName('')
    const { data } = await sb().from('crm_tasks').insert({ project_id: id, name, status: 'TODO' }).select().single()
    if (data) upsertCrmTask(data as CrmTask)
  }
  async function setTaskStatus(task: CrmTask, status: string) {
    upsertCrmTask({ ...task, status } as CrmTask)
    await sb().from('crm_tasks').update({ status }).eq('id', task.id)
  }
  async function delTask(task: CrmTask) {
    removeCrmTask(task.id)
    await sb().from('crm_tasks').delete().eq('id', task.id)
  }
  // Delete this contract. Its manual tasks go too; linked invoices are unlinked
  // (project_id → null via FK), not deleted, so financial records are kept.
  async function deleteContract() {
    if (!project) return
    setDelBusy(true)
    const s = sb()
    await s.from('crm_tasks').delete().eq('project_id', project.id)
    const { error } = await s.from('crm_projects').delete().eq('id', project.id)
    setDelBusy(false)
    if (error) { alert(t('Gagal menghapus contract') + ': ' + error.message); return }
    removeCrmProject(project.id)
    setConfirmDel(false)
    router.push('/crm/projects')
  }
  async function setStatus(status: string) {
    const p = project as CrmProject
    upsertCrmProject({ ...p, status } as CrmProject)
    await sb().from('crm_projects').update({ status }).eq('id', p.id)
  }

  const done = tasks.filter(tk => tk.status === 'DONE').length
  // Posts being worked on in the linked SMM board (entity = brand slug) surface
  // here so client-project tracking mirrors the SMM pipeline.
  const linkedBrand = !!project.socmed_slug
  const smmPosts = linkedBrand
    ? posts.filter(p => p.entity === project.socmed_slug && !p.deleted_at)
        .sort((a, b) => (b.updated_at || '').localeCompare(a.updated_at || ''))
    : []
  const smmDone = smmPosts.filter(p => p.status === 'published' || p.status === 'done').length
  const progTotal = linkedBrand ? smmPosts.length : tasks.length
  const progDone = linkedBrand ? smmDone : done
  const pct = progTotal ? Math.round((progDone / progTotal) * 100) : 0
  const statusColor = PROJECT_STATUS_COLOR[project.status]
  const team = Array.from(new Set([project.manager_email, ...(project.member_emails || [])].filter(Boolean) as string[]))
  const today = new Date().toISOString().slice(0, 10)
  const overdue = !!project.deadline && project.deadline < today && project.status !== 'SELESAI' && project.status !== 'BATAL'
  const services = project.services || []

  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16, minHeight: '100%', boxSizing: 'border-box' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <Link href="/crm/projects" style={{ fontSize: 12.5, color: 'var(--text3)', textDecoration: 'none' }}>← {t('Order List')}</Link>
        <span style={{ flex: 1 }} />
        <select value={project.status} onChange={e => setStatus(e.target.value)} style={{ ...inStyle, width: 'auto', height: 36, cursor: 'pointer' }}>
          {PROJECT_STATUSES.map(s => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
        </select>
        <button onClick={() => setEdit(true)} style={btnGhost}>{t('Edit')}</button>
        <button onClick={() => setConfirmDel(true)} style={{ ...btnGhost, color: '#ff6b6b', borderColor: 'color-mix(in srgb, #ff6b6b 45%, var(--border))' }}>{t('Hapus')}</button>
      </div>

      {/* Hero header — status-tinted left rail */}
      <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderLeft: `3px solid ${statusColor}`, borderRadius: 12, padding: 20 }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--text3)' }}>{t('Project')}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginTop: 5 }}>
          <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.15 }}>{project.name}</div>
          <StageBadge label={PROJECT_STATUS_LABEL[project.status]} color={statusColor} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
          {contact && <Link href={`/contacts/${contact.id}`} style={chipLink}>👤 {contact.company_name || contact.name}</Link>}
          {deal && <Link href="/pipeline" style={chipLink}>🔗 {t('Deal')}: {deal.name}</Link>}
          {project.socmed_slug && <Link href={`/smm/${project.socmed_slug}`} style={{ ...chipLink, color: 'var(--link)' }}>📣 {t('Buka tracking')}</Link>}
        </div>
      </div>

      {/* Stat strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
        <Stat label={t('Nilai Kontrak')}>
          <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{formatRupiah(contractValue)}</span>
        </Stat>
        <Stat label={linkedBrand ? t('Progress SMM') : t('Progress Task')}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 20, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{progDone}/{progTotal}</span>
            <span style={{ fontSize: 12, color: 'var(--text3)' }}>{pct}%</span>
          </div>
          <div style={{ height: 6, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden', marginTop: 8 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: '#43d9a2', transition: 'width 0.2s' }} />
          </div>
        </Stat>
        <Stat label="Timeline">
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>
            {project.start_date ? formatDate(project.start_date) : '—'} <span style={{ color: 'var(--text3)', fontWeight: 400 }}>→</span> <span style={{ color: overdue ? '#ff6b6b' : 'var(--text)' }}>{project.deadline ? formatDate(project.deadline) : '—'}</span>
          </div>
          {overdue && <div style={{ fontSize: 11, color: '#ff6b6b', marginTop: 5, fontWeight: 600 }}>⚠ {t('Melewati deadline')}</div>}
        </Stat>
        <Stat label={t('Tim')}>
          {team.length === 0 ? <span style={{ fontSize: 13, color: 'var(--text3)' }}>—</span> : (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {team.slice(0, 5).map((e, i) => (
                <span key={e} title={e} style={{ width: 28, height: 28, borderRadius: '50%', marginLeft: i ? -8 : 0, background: 'var(--bg3)', border: '2px solid var(--bg2)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, color: 'var(--text2)' }}>{initial(e)}</span>
              ))}
              {team.length > 5 && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginLeft: 6 }}>+{team.length - 5}</span>}
            </div>
          )}
        </Stat>
      </div>

      {/* Work area — Tasks (grows) + Detail panel */}
      <div style={{ display: 'flex', gap: 16, alignItems: 'stretch', flex: 1, minHeight: 0, flexWrap: 'wrap' }}>
        {/* Tasks */}
        <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{t('Tasks')}</span>
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--text3)', background: 'var(--bg3)', borderRadius: 20, padding: '1px 8px', fontVariantNumeric: 'tabular-nums' }}>{progDone}/{progTotal}</span>
            {progTotal > 0 && (
              <div style={{ marginLeft: 'auto', width: 120, height: 6, borderRadius: 3, background: 'var(--bg3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: '#43d9a2' }} />
              </div>
            )}
          </div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14, flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {/* Tasks come from the linked SMM board (Idea → Brief → … pipeline). */}
            {!linkedBrand ? (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text3)', fontSize: 12.5, border: '1px dashed var(--border)', borderRadius: 10, minHeight: 140, textAlign: 'center', padding: 16 }}>
                <div><div style={{ fontSize: 26, marginBottom: 6 }}>📣</div>{t('Pindahkan project ke On Progress untuk menautkan brand — task dari board SMM akan muncul di sini.')}</div>
              </div>
            ) : smmPosts.length === 0 ? (
              <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--text3)', fontSize: 12.5, border: '1px dashed var(--border)', borderRadius: 10, minHeight: 140, textAlign: 'center', padding: 16 }}>
                <div><div style={{ fontSize: 26, marginBottom: 6 }}>✅</div>{t('Belum ada task di board SMM. Tambahkan lewat "Buka board".')}</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {smmPosts.map(p => {
                  const col = POST_STATUS_COLORS[p.status] || '#8b8fa8'
                  return (
                    <button key={p.id} onClick={() => setPreviewId(p.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, cursor: 'pointer' }}>
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: col, flexShrink: 0 }} />
                      <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title || t('Tanpa judul')}</span>
                      {p.date && <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{formatDate(p.date)}</span>}
                      <span style={{ fontSize: 10.5, fontWeight: 700, color: col, background: `color-mix(in srgb, ${col} 16%, var(--bg2))`, border: `1px solid color-mix(in srgb, ${col} 40%, var(--border))`, borderRadius: 20, padding: '2px 8px', whiteSpace: 'nowrap', flexShrink: 0 }}>{POST_STATUS_LABELS[p.status] || p.status}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detail panel */}
        <div style={{ flex: '0 0 320px', maxWidth: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden', alignSelf: 'flex-start' }}>
          <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
            {t('Detail Project')}
            <span style={{ flex: 1 }} />
            <button onClick={() => setInvoice(true)} style={{ background: 'none', border: 'none', fontSize: 11.5, fontWeight: 600, color: 'var(--link)', cursor: 'pointer' }}>+ {t('Buat Invoice')}</button>
          </div>
          <div style={{ padding: 16 }}>
            <Info label={t('Tanggal Mulai')} value={project.start_date ? formatDate(project.start_date) : '—'} />
            <Info label="Deadline" value={project.deadline ? formatDate(project.deadline) : '—'} />
            <Info label={t('Manager')} value={project.manager_email || '—'} />
            <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>{t('Anggota Tim')}</div>
              {(project.member_emails || []).length === 0 ? <span style={{ fontSize: 13, color: 'var(--text3)' }}>—</span> : (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {(project.member_emails || []).map(m => <span key={m} style={pill}>{m}</span>)}
                </div>
              )}
            </div>
            <div style={{ padding: '9px 0', borderBottom: '1px solid var(--border)' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>{t('Layanan')}</div>
              {services.length === 0 ? <span style={{ fontSize: 13, color: 'var(--text3)' }}>—</span> : (
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                  {services.map(s => <span key={s} style={pill}>{s}</span>)}
                </div>
              )}
            </div>
            <div style={{ padding: '10px 0 2px' }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text3)', marginBottom: 6 }}>{t('Scope')}</div>
              <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>{project.scope || '—'}</div>
            </div>
          </div>
        </div>
      </div>

      {edit && <CrmProjectFormModal open project={project} onClose={() => setEdit(false)} />}
      <ConfirmDialog
        open={confirmDel}
        danger
        title={t('Hapus contract?')}
        message={projInvoices.length > 0
          ? t('Contract ini punya invoice terkait. Invoice tidak ikut terhapus, hanya dilepas dari contract ini. Lanjut hapus?')
          : t('Contract ini akan dihapus permanen. Lanjut?')}
        confirmLabel={delBusy ? t('Menghapus…') : t('Hapus')}
        onConfirm={deleteContract}
        onCancel={() => { if (!delBusy) setConfirmDel(false) }}
      />
      {invoice && <InvoiceFormModal open prefillProject={project} onClose={() => setInvoice(false)} onSaved={inv => router.push(`/crm/invoices/${inv.id}`)} />}
      {previewId && (() => {
        // Same rule as the SMM board: only the task's creator (created_by is a
        // display name) or a super admin can open the full "Edit Task" form.
        const pp = posts.find(p => p.id === previewId)
        const myName = (meName || '').trim().toLowerCase()
        const canEditTask = !!pp && (!pp.created_by || myName === (pp.created_by || '').trim().toLowerCase() || isSuper)
        return <PostPreviewModal open postId={previewId} canEditTask={canEditTask} onClose={() => setPreviewId(null)} onEdit={pid => { setPreviewId(null); setEditPostId(pid) }} />
      })()}
      {editPostId && <PostModal open editId={editPostId} entity={project.socmed_slug || ''} onClose={() => setEditPostId(null)} />}
    </div>
  )
}

const chipLink: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '4px 11px', textDecoration: 'none' }
const pill: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, color: 'var(--text2)', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 9px' }
const initial = (v?: string | null) => (v && v.trim() ? v.trim()[0]!.toUpperCase() : '?')

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  )
}

const btnGhost: React.CSSProperties = { background: 'transparent', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 14px', fontSize: 12.5, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }
const btnPrimary: React.CSSProperties = { background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 12.5, fontWeight: 600, color: '#fff', cursor: 'pointer', whiteSpace: 'nowrap' }

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span style={{ flex: '0 0 100px', fontSize: 12, fontWeight: 600, color: 'var(--text3)' }}>{label}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 13, wordBreak: 'break-word' }}>{value}</span>
    </div>
  )
}
