'use client'

import { useEffect, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { PLATFORM_META, type Platform, type ConnStatus, type SubjectType, type Connection } from './mock'
import { Card, PlatformChip, StatusDot, SubjectTypeBadge, fmtNum } from './ui'

// Untyped client — `social_accounts` isn't in the generated Database types.
const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

interface SocialAccount {
  id: string
  brand: 'bpi' | 'bsi'
  name: string
  type: SubjectType
  connections: Connection[]
  created_at: string
}

const PLATFORM_KEYS = Object.keys(PLATFORM_META) as Platform[]
const STATUS_KEYS: ConnStatus[] = ['connected', 'pending', 'public', 'error']

export function AccountsView({ brand = 'bpi' }: { brand?: 'bpi' | 'bsi' }) {
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    const { data } = await sb()
      .from('social_accounts')
      .select('*')
      .eq('brand', brand)
      .order('created_at', { ascending: true })
    setAccounts((data as SocialAccount[] | null) ?? [])
    setLoading(false)
  }, [brand])

  useEffect(() => {
    setLoading(true)
    load()
  }, [brand, load])

  async function removeAccount(id: string) {
    if (!confirm('Hapus akun ini?')) return
    setAccounts(prev => prev.filter(a => a.id !== id)) // optimistic
    await sb().from('social_accounts').delete().eq('id', id)
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, gap: 12 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
          Akun socmed untuk <strong style={{ color: 'var(--text)' }}>{brand === 'bpi' ? 'Bentala Project' : 'Bentala Studio'}</strong>.
          Akun <strong style={{ color: 'var(--text)' }}>Owned</strong> milik sendiri/klien; <strong style={{ color: 'var(--text)' }}>Prospect</strong> hanya data publik.
        </p>
        <button
          onClick={() => setAdding(true)}
          style={{
            marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          + Tambah Akun
        </button>
      </div>

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>Memuat akun…</div>
      ) : accounts.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>Belum ada akun socmed</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>Klik <strong>+ Tambah Akun</strong> untuk menambahkan akun pertama brand ini.</div>
        </Card>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {accounts.map(acc => (
            <Card key={acc.id} style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg3)', fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                  {acc.name.charAt(0)}
                </div>
                <div>
                  <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{acc.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{acc.connections.length} platform terhubung</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SubjectTypeBadge type={acc.type} />
                  <button
                    onClick={() => removeAccount(acc.id)}
                    title="Hapus akun"
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}
                  >
                    🗑
                  </button>
                </div>
              </div>

              {acc.connections.length === 0 ? (
                <div style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--text3)' }}>Belum ada platform.</div>
              ) : (
                acc.connections.map((c, i) => (
                  <div key={`${c.platform}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < acc.connections.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <PlatformChip platform={c.platform} />
                    <div style={{ minWidth: 160 }}>
                      <div style={{ fontSize: 13, color: 'var(--text)' }}>{PLATFORM_META[c.platform].label}</div>
                      <div style={{ fontSize: 12, color: 'var(--text3)' }}>{c.handle}</div>
                    </div>
                    <div style={{ minWidth: 120 }}><StatusDot status={c.status} /></div>
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>{c.followers > 0 ? `${fmtNum(c.followers)} followers` : '—'}</div>
                  </div>
                ))
              )}
            </Card>
          ))}
        </div>
      )}

      {adding && <AddAccountModal brand={brand} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </div>
  )
}

interface DraftConn { platform: Platform; handle: string; followers: string; status: ConnStatus }

function AddAccountModal({ brand, onClose, onSaved }: { brand: 'bpi' | 'bsi'; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<SubjectType>('owned')
  const [conns, setConns] = useState<DraftConn[]>([{ platform: 'instagram', handle: '', followers: '', status: 'connected' }])
  const [saving, setSaving] = useState(false)

  function updateConn(i: number, patch: Partial<DraftConn>) {
    setConns(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  async function save() {
    if (!name.trim()) { alert('Nama akun wajib diisi!'); return }
    setSaving(true)
    const connections: Connection[] = conns
      .filter(c => c.handle.trim() || c.followers.trim())
      .map(c => ({ platform: c.platform, handle: c.handle.trim(), status: c.status, followers: parseInt(c.followers, 10) || 0 }))
    await sb().from('social_accounts').insert({ brand, name: name.trim(), type, connections })
    setSaving(false)
    onSaved()
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
    borderRadius: 8, padding: '8px 10px', fontSize: 13, width: '100%', boxSizing: 'border-box',
  }
  const label: React.CSSProperties = { fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', fontWeight: 700, marginBottom: 6, display: 'block' }

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', zIndex: 201,
        width: 'min(560px, 92vw)', maxHeight: '88vh', overflowY: 'auto',
        background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 22, boxShadow: '0 16px 48px rgba(0,0,0,0.55)',
      }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 16 }}>
          Tambah Akun — {brand === 'bpi' ? 'Bentala Project' : 'Bentala Studio'}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>Nama Akun</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="mis. Bentala Project Indonesia" style={inputStyle} autoFocus />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>Tipe</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['owned', 'prospect'] as SubjectType[]).map(t => (
              <button key={t} onClick={() => setType(t)} style={{
                flex: 1, padding: '8px 0', borderRadius: 8, fontSize: 13, cursor: 'pointer', fontWeight: 600,
                border: `1px solid ${type === t ? 'var(--accent)' : 'var(--border)'}`,
                background: type === t ? 'rgba(108,99,255,0.15)' : 'var(--bg3)',
                color: type === t ? 'var(--accent)' : 'var(--text2)',
              }}>{t === 'owned' ? 'Owned' : 'Prospect'}</button>
            ))}
          </div>
        </div>

        <label style={label}>Platform</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 12 }}>
          {conns.map((c, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr 1fr auto', gap: 8, alignItems: 'center' }}>
              <select value={c.platform} onChange={e => updateConn(i, { platform: e.target.value as Platform })} style={inputStyle}>
                {PLATFORM_KEYS.map(p => <option key={p} value={p}>{PLATFORM_META[p].label}</option>)}
              </select>
              <input value={c.handle} onChange={e => updateConn(i, { handle: e.target.value })} placeholder="@handle" style={inputStyle} />
              <input value={c.followers} onChange={e => updateConn(i, { followers: e.target.value.replace(/[^0-9]/g, '') })} placeholder="followers" inputMode="numeric" style={inputStyle} />
              <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <select value={c.status} onChange={e => updateConn(i, { status: e.target.value as ConnStatus })} style={{ ...inputStyle, padding: '8px 6px' }}>
                  {STATUS_KEYS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {conns.length > 1 && (
                  <button onClick={() => setConns(prev => prev.filter((_, idx) => idx !== i))} title="Hapus platform"
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer' }}>×</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setConns(prev => [...prev, { platform: 'tiktok', handle: '', followers: '', status: 'connected' }])}
          style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text2)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer', marginBottom: 18 }}>
          + Tambah platform
        </button>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>Batal</button>
          <button onClick={save} disabled={saving} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Menyimpan…' : 'Simpan'}
          </button>
        </div>
      </div>
    </>
  )
}
