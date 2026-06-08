'use client'

import { useState } from 'react'
import type { StageData } from '@/lib/types'
import type { PipelineStage } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { useT } from '@/lib/i18n/LanguageProvider'

interface StageCardProps {
  stageDef: PipelineStage
  stageData: StageData
  isUnlocked: boolean   // previous stage is done (or this is first stage)
  onUpdate: (data: StageData) => void
}

export function StageCard({ stageDef, stageData, isUnlocked, onUpdate }: StageCardProps) {
  const t = useT()
  const [expanded, setExpanded] = useState(stageData.status === 'in_progress')
  const [newCheckText, setNewCheckText] = useState('')
  const [showFileForm, setShowFileForm] = useState(false)
  const [newFileLabel, setNewFileLabel] = useState('')
  const [newFileUrl, setNewFileUrl] = useState('')

  function handleStart() {
    onUpdate({ ...stageData, status: 'in_progress', started_at: new Date().toISOString() })
    setExpanded(true)
  }

  function handleComplete() {
    onUpdate({ ...stageData, status: 'done', completed_at: new Date().toISOString() })
    setExpanded(false)
  }

  function handleNotesBlur(notes: string) {
    if (notes !== stageData.notes) onUpdate({ ...stageData, notes })
  }

  function toggleCheck(id: string) {
    onUpdate({
      ...stageData,
      checklist: stageData.checklist.map(c => c.id === id ? { ...c, done: !c.done } : c),
    })
  }

  function addCheck() {
    if (!newCheckText.trim()) return
    onUpdate({
      ...stageData,
      checklist: [...stageData.checklist, { id: `${Date.now()}`, text: newCheckText.trim(), done: false }],
    })
    setNewCheckText('')
  }

  function removeCheck(id: string) {
    onUpdate({ ...stageData, checklist: stageData.checklist.filter(c => c.id !== id) })
  }

  function addFile() {
    if (!newFileLabel.trim() || !newFileUrl.trim()) return
    onUpdate({
      ...stageData,
      files: [...stageData.files, { label: newFileLabel.trim(), url: newFileUrl.trim() }],
    })
    setNewFileLabel(''); setNewFileUrl(''); setShowFileForm(false)
  }

  function removeFile(index: number) {
    onUpdate({ ...stageData, files: stageData.files.filter((_, i) => i !== index) })
  }

  const doneChecks = stageData.checklist.filter(c => c.done).length
  const totalChecks = stageData.checklist.length

  const borderColor = stageData.status === 'done'
    ? stageDef.color + '55'
    : stageData.status === 'in_progress'
    ? stageDef.color + '44'
    : 'var(--border)'

  const bgColor = stageData.status === 'in_progress'
    ? stageDef.color + '0a'
    : 'var(--bg2)'

  return (
    <div style={{
      border: `1px solid ${borderColor}`,
      borderRadius: 10,
      marginBottom: 10,
      background: bgColor,
      overflow: 'hidden',
      transition: 'border-color 0.2s',
    }}>
      {/* Header */}
      <div
        onClick={() => isUnlocked && setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '12px 16px',
          cursor: isUnlocked ? 'pointer' : 'default',
          borderBottom: expanded && isUnlocked ? '1px solid var(--border)' : 'none',
        }}
      >
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: stageDef.color, flexShrink: 0 }} />
        <span style={{ fontWeight: 600, fontSize: 14, flex: 1, color: 'var(--text)' }}>{stageDef.label}</span>

        {stageData.status === 'done' && (
          <span style={{ fontSize: 11, color: '#43d9a2', fontWeight: 600 }}>
            ✓ {t('Selesai')} {stageData.completed_at ? `· ${formatDate(stageData.completed_at.slice(0, 10))}` : ''}
          </span>
        )}
        {stageData.status === 'in_progress' && (
          <span style={{ fontSize: 11, color: '#ffc542', fontWeight: 600 }}>
            ⟳ {t('Berjalan')}
            {totalChecks > 0 && ` · ${doneChecks}/${totalChecks}`}
          </span>
        )}
        {stageData.status === 'pending' && isUnlocked && (
          <span style={{ fontSize: 11, color: 'var(--text2)' }}>○ {t('Belum mulai')}</span>
        )}

        {isUnlocked && (
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--text2)" strokeWidth="2.5"
            style={{ transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)', transition: 'transform 0.18s', flexShrink: 0 }}>
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        )}
      </div>

      {/* Locked */}
      {!isUnlocked && (
        <div style={{ padding: '8px 16px', fontSize: 12, color: 'var(--text2)', fontStyle: 'italic' }}>
          {t('Stage sebelumnya belum selesai')}
        </div>
      )}

      {/* Body */}
      {isUnlocked && expanded && (
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Notes */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 6 }}>
              {t('Catatan')}
            </div>
            <textarea
              key={stageData.notes}
              defaultValue={stageData.notes}
              onBlur={e => handleNotesBlur(e.target.value)}
              placeholder={t('Tambah catatan...')}
              rows={2}
              style={{ fontFamily: 'inherit', fontSize: 13, resize: 'vertical' }}
            />
          </div>

          {/* Checklist */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              Checklist {totalChecks > 0 && `(${doneChecks}/${totalChecks})`}
            </div>
            {stageData.checklist.map(c => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="checkbox"
                  checked={c.done}
                  onChange={() => toggleCheck(c.id)}
                  style={{ width: 15, height: 15, cursor: 'pointer', flexShrink: 0, accentColor: stageDef.color }}
                />
                <span style={{
                  flex: 1, fontSize: 13,
                  textDecoration: c.done ? 'line-through' : 'none',
                  color: c.done ? 'var(--text2)' : 'var(--text)',
                }}>
                  {c.text}
                </span>
                <button
                  onClick={() => removeCheck(c.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 16, padding: 0, lineHeight: 1 }}
                >×</button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
              <input
                value={newCheckText}
                onChange={e => setNewCheckText(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCheck() } }}
                placeholder={t('+ Tambah checklist (Enter untuk simpan)')}
                style={{ fontSize: 12, padding: '5px 8px' }}
              />
            </div>
          </div>

          {/* Files */}
          <div>
            <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8 }}>
              File & Link
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              {stageData.files.map((f, i) => (
                <span key={i} style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  fontSize: 11, padding: '4px 10px', borderRadius: 20,
                  background: 'var(--bg3)', border: '1px solid var(--border)',
                }}>
                  <a href={f.url} target="_blank" rel="noreferrer"
                    style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                    📎 {f.label}
                  </a>
                  <button
                    onClick={() => removeFile(i)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text2)', fontSize: 14, padding: 0, lineHeight: 1 }}
                  >×</button>
                </span>
              ))}
            </div>

            {showFileForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <input
                  value={newFileLabel}
                  onChange={e => setNewFileLabel(e.target.value)}
                  placeholder={t('Label (contoh: Script Doc)')}
                  style={{ fontSize: 12, padding: '5px 8px' }}
                />
                <input
                  value={newFileUrl}
                  onChange={e => setNewFileUrl(e.target.value)}
                  placeholder="URL (https://drive.google.com/...)"
                  style={{ fontSize: 12, padding: '5px 8px' }}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={addFile}
                    style={{ fontSize: 12, padding: '5px 14px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
                    {t('Tambah')}
                  </button>
                  <button onClick={() => { setShowFileForm(false); setNewFileLabel(''); setNewFileUrl('') }}
                    style={{ fontSize: 12, padding: '5px 14px', background: 'var(--bg3)', color: 'var(--text2)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer' }}>
                    {t('Batal')}
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowFileForm(true)}
                style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                {t('+ Tambah file / link')}
              </button>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
            {stageData.status === 'pending' && (
              <button
                onClick={handleStart}
                style={{
                  padding: '8px 18px', background: 'var(--bg3)',
                  border: `1px solid ${stageDef.color}55`, borderRadius: 8,
                  cursor: 'pointer', fontSize: 13, color: stageDef.color, fontWeight: 600,
                }}
              >
                {t('Mulai Stage')}
              </button>
            )}
            {stageData.status === 'in_progress' && (
              <button
                onClick={handleComplete}
                style={{
                  padding: '8px 18px', background: '#43d9a218',
                  border: '1px solid #43d9a244', borderRadius: 8,
                  cursor: 'pointer', fontSize: 13, color: '#43d9a2', fontWeight: 600,
                }}
              >
                ✓ {t('Tandai Selesai')}
              </button>
            )}
            {stageData.status === 'done' && (
              <button
                onClick={() => onUpdate({ ...stageData, status: 'in_progress', completed_at: null })}
                style={{
                  padding: '6px 14px', background: 'none',
                  border: '1px solid var(--border)', borderRadius: 8,
                  cursor: 'pointer', fontSize: 12, color: 'var(--text2)',
                }}
              >
                {t('Buka Kembali')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
