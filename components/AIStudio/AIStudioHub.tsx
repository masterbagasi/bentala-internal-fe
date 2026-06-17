'use client'

import Link from 'next/link'
import { useT } from '@/lib/i18n/LanguageProvider'
import { useIsMobile } from '@/hooks/useIsMobile'

const TOOLS = [
  {
    href: '/ai/chat',
    icon: '💬',
    label: 'Chat AI',
    desc: 'Diskusi ide, brainstorm konten, dan minta saran kreatif bersama Claude',
    color: '#6c63ff',
    bg: 'rgba(108,99,255,0.08)',
    border: 'rgba(108,99,255,0.2)',
  },
  {
    href: '/ai/ideas',
    icon: '💡',
    label: 'Pencari Ide',
    desc: 'Generate ide konten dari keyword — lengkap dengan brief, storyline, dan referensi akun',
    color: '#f472b6',
    bg: 'rgba(244,114,182,0.08)',
    border: 'rgba(244,114,182,0.2)',
  },
  {
    href: '/ai/image',
    icon: '🖼️',
    label: 'Generator Gambar',
    desc: 'Generate Midjourney prompt yang detail dan siap pakai dari deskripsi visual',
    color: '#43d9a2',
    bg: 'rgba(67,217,162,0.08)',
    border: 'rgba(67,217,162,0.2)',
  },
  {
    href: '/ai/video',
    icon: '🎬',
    label: 'Script Video',
    desc: 'Generate script shot-by-shot lengkap untuk TikTok, Reels, dan YouTube Shorts',
    color: '#f59e0b',
    bg: 'rgba(245,158,11,0.08)',
    border: 'rgba(245,158,11,0.2)',
  },
  {
    href: '/ai/audio',
    icon: '🎙',
    label: 'Generator Audio',
    desc: 'Buat script narasi siap rekam dengan panduan timing, tone, dan tips recording',
    color: '#a78bfa',
    bg: 'rgba(167,139,250,0.08)',
    border: 'rgba(167,139,250,0.2)',
  },
  {
    href: '/ai/bpi',
    icon: '🌐',
    label: 'Bentala Intelligence',
    desc: 'Berita internasional relevan Indonesia dari media global & sosial media, lengkap dengan sumber',
    color: '#60a5fa',
    bg: 'rgba(96,165,250,0.08)',
    border: 'rgba(96,165,250,0.2)',
  },
]

function ToolCard({ tool }: { tool: typeof TOOLS[0] }) {
  const t = useT()
  return (
    <Link href={tool.href} style={{ textDecoration: 'none' }}>
      <div
        style={{
          background: tool.bg,
          border: `1px solid ${tool.border}`,
          borderRadius: 14,
          padding: '20px 20px 18px',
          cursor: 'pointer',
          transition: 'transform 0.15s, border-color 0.15s',
          display: 'flex',
          flexDirection: 'column',
          gap: 12,
          height: '100%',
          boxSizing: 'border-box',
        }}
        onMouseEnter={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.transform = 'translateY(-2px)'
          el.style.borderColor = tool.color + '55'
        }}
        onMouseLeave={e => {
          const el = e.currentTarget as HTMLDivElement
          el.style.transform = 'translateY(0)'
          el.style.borderColor = tool.border
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: tool.bg, border: `1px solid ${tool.color}33`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
            {tool.icon}
          </div>
          <div style={{ fontSize: 18, color: tool.color, opacity: 0.5 }}>→</div>
        </div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{t(tool.label)}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>{t(tool.desc)}</div>
        </div>
      </div>
    </Link>
  )
}

export default function AIStudioHub() {
  const t = useT()
  const isMobile = useIsMobile()
  return (
    <div style={{ padding: isMobile ? '32px 14px' : '32px 28px', maxWidth: 900, margin: '0 auto' }}>
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'linear-gradient(135deg, rgba(108,99,255,0.2), rgba(67,217,162,0.2))', border: '1px solid rgba(108,99,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>✦</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--text)', margin: 0 }}>AI Studio</h1>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text2)', margin: 0, paddingLeft: 52 }}>
          {t('Suite alat kreatif berbasis AI untuk tim Bentala')}
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {TOOLS.map(tool => <ToolCard key={tool.href} tool={tool} />)}
      </div>
    </div>
  )
}
