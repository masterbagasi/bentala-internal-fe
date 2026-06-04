'use client'

import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

// Dead-end for a logged-in account that has not been granted any menu section.
// Reachable while authenticated (middleware never gates it) so access-less
// accounts land here instead of bouncing in a redirect loop.
export default function NoAccessPage() {
  const router = useRouter()

  async function logout() {
    await getSupabase().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'var(--bg)',
        padding: 24,
      }}
    >
      <div
        style={{
          maxWidth: 420,
          width: '100%',
          background: 'var(--bg2)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: 32,
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'rgba(239,68,68,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 18px',
          }}
        >
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 8 }}>
          Belum ada akses
        </div>
        <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 24 }}>
          Akun Anda belum diberi akses ke menu apa pun. Silakan hubungi admin
          untuk meminta hak akses.
        </div>
        <button
          onClick={logout}
          style={{
            padding: '10px 20px',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'var(--bg3)',
            color: 'var(--text)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Keluar
        </button>
      </div>
    </div>
  )
}
