'use client'

import { useEffect, useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { isEffectiveSuperAdmin } from '@/lib/access'
import { useT } from '@/lib/i18n/LanguageProvider'
import { fetchSocmedProjects, invalidateSocmedProjects } from '@/lib/socmed-projects'
import type { SocmedProject } from '@/lib/types'

const PALETTE = ['#c46e1f', '#8845c0', '#1f5dca', '#2c9148', '#c4393a', '#2c85ad', '#c4a414', '#c4365a', '#4541b8', '#5a5a60']

export function ManageProjectsPanel() {
  const t = useT()
  const [isSuper, setIsSuper] = useState(false)
  const [projects, setProjects] = useState<SocmedProject[]>([])
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [glyph, setGlyph] = useState('')
  const [color, setColor] = useState(PALETTE[2])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getSupabase().auth.getUser().then(({ data }) => {
      setIsSuper(isEffectiveSuperAdmin(data.user?.email, data.user?.app_metadata?.role))
    })
  }, [])
  useEffect(() => { fetchSocmedProjects().then(setProjects) }, [])

  async function refresh() {
    invalidateSocmedProjects()
    setProjects(await fetchSocmedProjects(true))
  }

  async function create() {
    if (!name.trim() || busy) return
    setBusy(true); setError('')
    try {
      const r = await fetch('/api/socmed-projects', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, glyph, color }) })
      if (!r.ok) throw new Error((await r.json()).error || 'Gagal')
      setName(''); setGlyph(''); setColor(PALETTE[2]); setAdding(false)
      await refresh()
    } catch (e) { setError(e instanceof Error ? e.message : 'Gagal menambah project') }
    finally { setBusy(false) }
  }

  async function patch(slug: string, body: Partial<SocmedProject>) {
    await fetch('/api/socmed-projects', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, ...body }) })
    await refresh()
  }

  if (!isSuper) return null

  return (
    <div style={{ background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>{t('Kelola Project Socmed')}</span>
        <button onClick={() => setAdding(a => !a)} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
          + {t('Tambah Project')}
        </button>
      </div>

      {adding && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 10, padding: 12, marginBottom: 12 }}>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('Nama project')} style={{ flex: 1, minWidth: 160, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', color: 'var(--text)', fontSize: 13 }} />
          <input value={glyph} onChange={e => setGlyph(e.target.value)} placeholder={t('Badge (mis. bpx)')} maxLength={6} style={{ width: 120, background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 11px', color: 'var(--text)', fontSize: 13 }} />
          <div style={{ display: 'flex', gap: 5 }}>
            {PALETTE.map(c => (
              <button key={c} onClick={() => setColor(c)} title={c} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: color === c ? '2px solid #fff' : '1px solid var(--border)', cursor: 'pointer' }} />
            ))}
          </div>
          <button onClick={create} disabled={busy || !name.trim()} style={{ background: name.trim() ? 'var(--accent)' : 'var(--bg2)', color: name.trim() ? '#fff' : 'var(--text2)', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 600, cursor: name.trim() ? 'pointer' : 'not-allowed' }}>
            {busy ? t('Menyimpan…') : t('Simpan')}
          </button>
          {error && <span style={{ fontSize: 12, color: '#f87171', width: '100%' }}>{error}</span>}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {projects.map(p => (
          <div key={p.slug} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 9, opacity: p.active ? 1 : 0.55 }}>
            <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, background: p.color, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, color: '#fff', textTransform: 'lowercase' }}>{p.glyph || p.slug}</span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{p.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)' }}>/{p.slug}</span>
            <button onClick={() => patch(p.slug, { active: !p.active })} style={{ background: 'transparent', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text2)', cursor: 'pointer' }}>
              {p.active ? t('Arsipkan') : t('Aktifkan')}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
