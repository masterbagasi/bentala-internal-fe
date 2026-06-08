'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'
import { Modal, BtnPrimary, BtnSecondary } from '@/components/shared/Modal'
import { useT } from '@/lib/i18n/LanguageProvider'
import type { StageData } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'

interface AddPipelineModalProps {
  open: boolean
  member: 'Video Production' | 'Design Studio'
  stages: PipelineStage[]
  onClose: () => void
}

function makeEmptyStageData(): StageData {
  return { status: 'pending', notes: '', files: [], checklist: [], started_at: null, completed_at: null }
}

export function AddPipelineModal({ open, member, stages, onClose }: AddPipelineModalProps) {
  const t = useT()
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)

  function reset() { setTitle('') }
  function handleClose() { reset(); onClose() }

  async function handleSave() {
    if (!title.trim()) { alert(t('Judul wajib diisi!')); return }
    setLoading(true)

    try {
      const stagesData: Record<string, StageData> = {}
      stages.forEach(s => { stagesData[s.key] = makeEmptyStageData() })

      const supabase = getSupabase()
      const { error } = await (supabase as any).from('pipeline_items').insert({
        title: title.trim(),
        member,
        source_post_id: null,
        current_stage: stages[0].key,
        stages_data: stagesData,
      })

      if (error) {
        alert(t('Gagal membuat pipeline: ') + error.message)
        setLoading(false)
        return
      }

      handleClose()
    } catch (err) {
      alert(t('Terjadi kesalahan: ') + (err instanceof Error ? err.message : 'Unknown error'))
      setLoading(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={t('Tambah Konten Pipeline')}
      footer={
        <>
          <BtnSecondary onClick={handleClose}>{t('Batal')}</BtnSecondary>
          <BtnPrimary onClick={handleSave} loading={loading}>{t('Buat Pipeline')}</BtnPrimary>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text2)', marginBottom: 5 }}>
            {t('Judul Konten *')}
          </label>
          <input
            type="text"
            placeholder={t('Nama konten / campaign...')}
            value={title}
            onChange={e => setTitle(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
            autoFocus
          />
        </div>

        <div style={{
          background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px',
        }}>
          <div style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 8 }}>{t('Pipeline akan mulai dari:')}</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {stages.map((s, i) => (
              <span key={s.key} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span style={{ fontSize: 12, color: s.color, fontWeight: 600 }}>{s.label}</span>
                {i < stages.length - 1 && <span style={{ color: 'var(--text2)', fontSize: 12 }}>→</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  )
}
