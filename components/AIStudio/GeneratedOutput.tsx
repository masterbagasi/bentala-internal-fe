'use client'

import { useState } from 'react'
import { useT } from '@/lib/i18n/LanguageProvider'
import { getSupabase } from '@/lib/supabase'

interface GeneratedData {
  caption: string
  hashtags: string
  script: string
  posting_time: string
}

interface Props {
  data: GeneratedData
  platform: string
  inputText: string
}

export default function GeneratedOutput({ data, platform, inputText }: Props) {
  const t = useT()
  const [exporting, setExporting] = useState<'bpi' | 'bsi' | null>(null)
  const [exported, setExported] = useState<string | null>(null)

  async function exportTo(entity: 'bpi' | 'bsi') {
    setExporting(entity)
    const supabase = getSupabase()
    const platforms = platform === 'keduanya' ? ['ig', 'tiktok'] : [platform]

    const { data: post } = await (supabase as any)
      .from('posts')
      .insert({
        entity,
        title: inputText.slice(0, 80),
        platforms,
        caption: data.caption,
        hashtags: data.hashtags,
        status: 'todo',
        pics: [],
        content_types: [],
        video_link: '',
        design_link: '',
        video_file_url: '',
        design_file_url: '',
        notes: `Script: ${data.script}`,
      })
      .select('id')
      .single()

    if (post) {
      await (supabase as any).from('ai_generations').insert({
        idea_id: null,
        input_text: inputText,
        platform,
        caption: data.caption,
        hashtags: data.hashtags,
        script: data.script,
        posting_time: data.posting_time,
        exported_to: entity,
        exported_post_id: post.id,
        user_name: 'AI Studio',
      })
      setExported(entity.toUpperCase())
    }
    setExporting(null)
  }

  function copyAll() {
    const text = `${data.caption}\n\n${data.hashtags}`
    navigator.clipboard.writeText(text)
  }

  const fieldStyle: React.CSSProperties = {
    background: 'var(--bg3)',
    border: '1px solid var(--border)',
    borderRadius: 8,
    padding: '12px 14px',
    fontSize: 13,
    color: 'var(--text)',
    lineHeight: 1.6,
    whiteSpace: 'pre-wrap',
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Caption</div>
        <div style={fieldStyle}>{data.caption}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>Hashtag</div>
        <div style={{ ...fieldStyle, color: 'var(--accent)', fontSize: 12 }}>{data.hashtags}</div>
      </div>
      <div>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>{t('Script Video')}</div>
        <div style={fieldStyle}>{data.script}</div>
      </div>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: 'rgba(108,99,255,0.08)',
        border: '1px solid rgba(108,99,255,0.2)',
        borderRadius: 8,
        fontSize: 13,
        color: 'var(--text2)',
      }}>
        <span>🕐</span>
        <span>{t('Waktu terbaik:')} <strong style={{ color: 'var(--text)' }}>{data.posting_time}</strong></span>
      </div>

      {exported && (
        <div style={{ padding: '10px 14px', background: 'rgba(67,217,162,0.1)', border: '1px solid var(--accent3)', borderRadius: 8, color: 'var(--accent3)', fontSize: 13, fontWeight: 600 }}>
          ✓ {t('Berhasil dikirim ke')} {exported} {t('sebagai draft post')}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button
          onClick={() => exportTo('bpi')}
          disabled={!!exporting || !!exported}
          style={{
            padding: '9px 18px',
            background: exporting === 'bpi' ? 'var(--bg3)' : 'rgba(108,99,255,0.12)',
            border: '1px solid var(--accent)',
            borderRadius: 8,
            color: 'var(--accent)',
            fontSize: 13,
            fontWeight: 700,
            cursor: exporting || exported ? 'not-allowed' : 'pointer',
          }}
        >
          {exporting === 'bpi' ? t('Mengirim...') : t('Kirim ke BPI')}
        </button>
        <button
          onClick={() => exportTo('bsi')}
          disabled={!!exporting || !!exported}
          style={{
            padding: '9px 18px',
            background: exporting === 'bsi' ? 'var(--bg3)' : 'rgba(67,217,162,0.12)',
            border: '1px solid var(--accent3)',
            borderRadius: 8,
            color: 'var(--accent3)',
            fontSize: 13,
            fontWeight: 700,
            cursor: exporting || exported ? 'not-allowed' : 'pointer',
          }}
        >
          {exporting === 'bsi' ? t('Mengirim...') : t('Kirim ke BSI')}
        </button>
        <button
          onClick={copyAll}
          style={{
            padding: '9px 18px',
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            color: 'var(--text2)',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          {t('Salin Caption + Hashtag')}
        </button>
      </div>
    </div>
  )
}
