'use client'

import { useState } from 'react'
import { migrateFromLocalStorage } from '@/lib/migrate'
import { useT } from '@/lib/i18n/LanguageProvider'

export default function MigratePage() {
  const t = useT()
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')
  const [result, setResult] = useState<Awaited<ReturnType<typeof migrateFromLocalStorage>> | null>(null)

  async function handleMigrate() {
    setStatus('running')
    try {
      const res = await migrateFromLocalStorage()
      setResult(res)
      setStatus(res.errors.length > 0 ? 'error' : 'done')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setResult({ posts: 0, clients: 0, invoices: 0, projects: 0, tasks: 0, errors: [msg] })
      setStatus('error')
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 560, width: '100%', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 14, padding: 32 }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>🔄 {t('Migrasi Data')}</h1>
        <p style={{ fontSize: 14, color: 'var(--text2)', marginBottom: 24, lineHeight: 1.6 }}>
          {t('Tool ini membaca data dari')} <code style={{ background: 'var(--bg3)', padding: '1px 6px', borderRadius: 4, fontFamily: 'monospace' }}>localStorage</code>{' '}
          {t('aplikasi HTML lama dan menguploadnya ke Supabase.')}
        </p>
        <p style={{ fontSize: 13, color: '#ffc542', background: '#2a1f1044', border: '1px solid #ffc54244', borderRadius: 8, padding: '10px 14px', marginBottom: 24 }}>
          ⚠️ <strong>{t('Jalankan hanya sekali.')}</strong> {t('Pastikan kamu membuka halaman ini di browser yang sama tempat aplikasi HTML lama dipakai (agar localStorage tersedia).')}
        </p>

        <button
          onClick={handleMigrate}
          disabled={status === 'running'}
          style={{
            width: '100%', padding: '12px', borderRadius: 8, border: 'none',
            background: status === 'running' ? 'var(--border)' : 'var(--accent)',
            color: '#fff', fontSize: 14, fontWeight: 600, cursor: status === 'running' ? 'not-allowed' : 'pointer',
            marginBottom: 20,
          }}
        >
          {status === 'running' ? `⏳ ${t('Sedang migrasi...')}` : `🚀 ${t('Mulai Migrasi')}`}
        </button>

        {result && (
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
              {status === 'done' ? `✅ ${t('Migrasi berhasil!')}` : `⚠️ ${t('Migrasi selesai dengan error:')}`}
            </div>
            <div style={{ background: 'var(--bg3)', borderRadius: 8, padding: 16, fontSize: 13 }}>
              {[
                { label: 'Posts',    count: result.posts },
                { label: 'Clients',  count: result.clients },
                { label: 'Invoices', count: result.invoices },
                { label: 'Projects', count: result.projects },
                { label: 'Tasks',    count: result.tasks },
              ].map(r => (
                <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ color: 'var(--text2)' }}>{r.label}</span>
                  <span style={{ color: 'var(--accent3)', fontWeight: 600 }}>{r.count} records</span>
                </div>
              ))}
              {result.errors.length > 0 && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                  <div style={{ color: '#ff6b6b', marginBottom: 6 }}>Errors:</div>
                  {result.errors.map((e, i) => (
                    <div key={i} style={{ color: '#ff6b6b', fontSize: 12, marginBottom: 4 }}>• {e}</div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>
          {t('Setelah migrasi selesai, kamu bisa kembali ke')}{' '}
          <a href="/" style={{ color: 'var(--accent)', textDecoration: 'none' }}>{t('halaman utama')}</a>.
        </div>
      </div>
    </div>
  )
}
