'use client'

import { useEffect, useState, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { useT } from '@/lib/i18n/LanguageProvider'
import { PLATFORM_META, type Platform, type ConnStatus, type SubjectType, type Connection } from './mock'
import { Card, PlatformChip, StatusDot, SubjectTypeBadge, fmtNum } from './ui'

// Untyped client — `social_accounts` isn't in the generated Database types.
const sb = () => getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient

interface SocialAccount {
  id: string
  brand: string
  name: string
  type: SubjectType
  connections: Connection[]
  created_at: string
}

const PLATFORM_KEYS = Object.keys(PLATFORM_META) as Platform[]
const STATUS_KEYS: ConnStatus[] = ['connected', 'pending', 'public', 'error']

export function AccountsView({ brand, brandName }: { brand: string; brandName?: string }) {
  const t = useT()
  const [accounts, setAccounts] = useState<SocialAccount[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [connections, setConnections] = useState<{ username: string | null; status: string; ig_user_id: string | null }[]>([])

  const load = useCallback(async () => {
    // Retry a couple of times: Supabase's gotrue navigator lock can throw a
    // transient AbortError ("Lock was stolen") when several auth consumers run
    // at once. Always clear the loading state so the UI never hangs.
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const { data, error } = await sb()
          .from('social_accounts')
          .select('*')
          .eq('brand', brand)
          .order('created_at', { ascending: true })
        if (error) throw error
        setAccounts((data as SocialAccount[] | null) ?? [])
        setLoading(false)
        return
      } catch {
        await new Promise(r => setTimeout(r, 200 * (attempt + 1)))
      }
    }
    setLoading(false)
  }, [brand])

  const loadConnections = useCallback(async () => {
    const { data } = await sb().from('social_connections').select('username,status,ig_user_id').eq('brand', brand)
    setConnections((data as typeof connections | null) ?? [])
  }, [brand])

  useEffect(() => {
    setLoading(true)
    load()
    loadConnections()
  }, [brand, load, loadConnections])

  async function removeAccount(id: string) {
    if (!confirm(t('Hapus akun ini?'))) return
    setAccounts(prev => prev.filter(a => a.id !== id)) // optimistic
    await sb().from('social_accounts').delete().eq('id', id)
  }

  // OAuth-connect an Instagram account for this brand via Composio. Opens the
  // Composio authorize page in a popup, polls until ACTIVE, then triggers a sync.
  async function connectInstagram() {
    if (connecting) return
    setConnecting(true)
    try {
      const r = await fetch('/api/social/instagram/connect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brand }),
      })
      if (!r.ok) throw new Error('connect failed')
      const { redirectUrl, connectedAccountId, userId } = await r.json()
      if (redirectUrl) window.open(redirectUrl, 'composio-instagram', 'width=600,height=760')
      const qs = `brand=${encodeURIComponent(brand)}&connectedAccountId=${encodeURIComponent(connectedAccountId)}&userId=${encodeURIComponent(userId)}`
      const started = Date.now()
      const poll = setInterval(async () => {
        // Give up after ~3 minutes so the spinner never hangs forever.
        if (Date.now() - started > 180_000) { clearInterval(poll); setConnecting(false); return }
        try {
          const s = await (await fetch(`/api/social/instagram/connect/status?${qs}`)).json()
          if (s.status === 'ACTIVE') {
            clearInterval(poll)
            await fetch(`/api/social/instagram/sync?brand=${encodeURIComponent(brand)}`, { method: 'POST' })
            setConnecting(false)
            load()
            loadConnections()
          }
        } catch { /* keep polling */ }
      }, 2500)
    } catch {
      setConnecting(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18, gap: 10 }}>
        <button
          onClick={connectInstagram}
          disabled={connecting}
          style={{
            marginLeft: 'auto', background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: connecting ? 'default' : 'pointer',
            whiteSpace: 'nowrap', opacity: connecting ? 0.7 : 1,
          }}
        >
          {connecting ? t('Menghubungkan…') : t('Hubungkan Instagram')}
        </button>
        <button
          onClick={() => setAdding(true)}
          style={{
            background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          + {t('Tambah Akun')}
        </button>
      </div>

      {connections.length > 0 && (
        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text2)', fontWeight: 700, marginBottom: 8 }}>{t('Akun Terhubung')}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {connections.map(c => (
              <Card key={`${c.ig_user_id}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
                <span style={{ width: 32, height: 32, borderRadius: 9, background: 'linear-gradient(135deg,#c4399a,#c47a1f)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, color: '#fff' }}>IG</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>@{c.username ?? '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>Instagram · {c.ig_user_id}</div>
                </div>
                <span style={{ fontSize: 11.5, fontWeight: 700, color: c.status === 'connected' ? 'var(--accent3)' : 'var(--text3)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: c.status === 'connected' ? 'var(--accent3)' : 'var(--text3)' }} />
                  {c.status === 'connected' ? t('Terhubung') : c.status}
                </span>
              </Card>
            ))}
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Memuat akun…')}</div>
      ) : accounts.length === 0 && connections.length === 0 ? (
        <Card style={{ padding: 40, textAlign: 'center' }}>
          <div style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 6 }}>{t('Belum ada akun socmed')}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>{t('Klik')} <strong>+ {t('Tambah Akun')}</strong> {t('untuk menambahkan akun pertama brand ini.')}</div>
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
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>{acc.connections.length} {t('platform terhubung')}</div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SubjectTypeBadge type={acc.type} />
                  <button
                    onClick={() => removeAccount(acc.id)}
                    title={t('Hapus akun')}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: 8, padding: '5px 8px', fontSize: 12, cursor: 'pointer' }}
                  >
                    🗑
                  </button>
                </div>
              </div>

              {acc.connections.length === 0 ? (
                <div style={{ padding: '14px 18px', fontSize: 12.5, color: 'var(--text3)' }}>{t('Belum ada platform.')}</div>
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

      {adding && <AddAccountModal brand={brand} brandName={brandName} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load() }} />}
    </div>
  )
}

interface DraftConn { platform: Platform; handle: string; followers: string; status: ConnStatus }

function AddAccountModal({ brand, brandName, onClose, onSaved }: { brand: string; brandName?: string; onClose: () => void; onSaved: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const [type, setType] = useState<SubjectType>('owned')
  const [conns, setConns] = useState<DraftConn[]>([{ platform: 'instagram', handle: '', followers: '', status: 'connected' }])
  const [saving, setSaving] = useState(false)

  function updateConn(i: number, patch: Partial<DraftConn>) {
    setConns(prev => prev.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }

  async function save() {
    if (!name.trim()) { alert(t('Nama akun wajib diisi!')); return }
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
          {t('Tambah Akun')} — {brandName || brand}
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={label}>{t('Nama Akun')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('mis. Bentala Project Indonesia')} style={inputStyle} autoFocus />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>{t('Tipe')}</label>
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
                  <button onClick={() => setConns(prev => prev.filter((_, idx) => idx !== i))} title={t('Hapus platform')}
                    style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text3)', borderRadius: 8, padding: '7px 9px', cursor: 'pointer' }}>×</button>
                )}
              </div>
            </div>
          ))}
        </div>
        <button onClick={() => setConns(prev => [...prev, { platform: 'tiktok', handle: '', followers: '', status: 'connected' }])}
          style={{ background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text2)', borderRadius: 8, padding: '8px 12px', fontSize: 12.5, cursor: 'pointer', marginBottom: 18 }}>
          + {t('Tambah platform')}
        </button>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} disabled={saving} style={{ background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>{t('Batal')}</button>
          <button onClick={save} disabled={saving} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 9, padding: '9px 18px', fontSize: 13, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? t('Menyimpan…') : t('Simpan')}
          </button>
        </div>
      </div>
    </>
  )
}
