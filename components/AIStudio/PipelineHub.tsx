'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { PipelineCard as PipelineCardType } from '@/lib/types'
import { PIPELINE_STAGES } from '@/lib/constants'
import PipelineCard from './PipelineCard'
import BriefGenerator from './BriefGenerator'
import { useT } from '@/lib/i18n/LanguageProvider'

const ENTITY_OPTIONS = [
  { key: 'bpi', label: 'BPI' },
  { key: 'bsi', label: 'BSI' },
]

const PLATFORM_OPTIONS = [
  { key: 'ig', label: 'Instagram' },
  { key: 'tiktok', label: 'TikTok' },
  { key: 'keduanya', label: 'IG + TikTok' },
]

export default function PipelineHub() {
  const t = useT()
  const router = useRouter()
  const [cards, setCards] = useState<PipelineCardType[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [briefCard, setBriefCard] = useState<PipelineCardType | null>(null)

  // New card form state
  const [newTitle, setNewTitle] = useState('')
  const [newEntity, setNewEntity] = useState<'bpi' | 'bsi'>('bpi')
  const [newPlatform, setNewPlatform] = useState('ig')
  const [newDeskripsi, setNewDeskripsi] = useState('')
  const [newTujuan, setNewTujuan] = useState('')
  const [newReferensi, setNewReferensi] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  const TUJUAN_OPTIONS = ['Awareness', 'Engagement', 'Konversi', 'Edukasi']

  const loadCards = useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch('/api/pipeline')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal memuat pipeline'))
      setCards(data.cards ?? [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : t('Gagal memuat pipeline'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadCards() }, [loadCards])

  async function createCard() {
    if (!newTitle.trim()) return
    setCreating(true)
    setCreateError(null)
    try {
      const parts: string[] = []
      if (newDeskripsi.trim()) parts.push(`Deskripsi: ${newDeskripsi.trim()}`)
      if (newTujuan) parts.push(`Tujuan: ${newTujuan}`)
      if (newReferensi.trim()) parts.push(`Referensi: ${newReferensi.trim()}`)
      const idea_text = parts.length > 0 ? parts.join('\n') : undefined

      const res = await fetch('/api/pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTitle, entity: newEntity, platform: newPlatform, idea_text }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? t('Gagal membuat konten'))
      setCards(prev => [data.card, ...prev])
      setNewTitle('')
      setNewDeskripsi('')
      setNewTujuan('')
      setNewReferensi('')
      setShowNewModal(false)
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : t('Terjadi kesalahan'))
    } finally {
      setCreating(false)
    }
  }

  function handleOpenBuilder(card: PipelineCardType) {
    const params = new URLSearchParams({ input_text: card.idea_text ?? card.title, platform: card.platform })
    router.push(`/ai/builder?${params.toString()}`)
  }

  function handleBriefDone(updatedCard: PipelineCardType) {
    setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c))
    setBriefCard(null)
  }

  const cardsByStage = (stage: string) => cards.filter(c => c.stage === stage)

  const chipStyle = (active: boolean): React.CSSProperties => ({
    padding: '4px 10px',
    borderRadius: 16,
    border: '1px solid',
    borderColor: active ? '#6c63ff' : 'var(--border)',
    background: active ? 'rgba(108,99,255,0.12)' : 'var(--bg3)',
    color: active ? '#6c63ff' : 'var(--text2)',
    fontSize: 11,
    cursor: 'pointer',
    fontWeight: active ? 600 : 400,
  })

  return (
    <>
      {/* Brief Generator overlay */}
      {briefCard && (
        <BriefGenerator
          card={briefCard}
          onClose={() => setBriefCard(null)}
          onDone={handleBriefDone}
        />
      )}

      {/* New content modal */}
      {showNewModal && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          onClick={e => { if (e.target === e.currentTarget) { setShowNewModal(false); setCreateError(null); setNewDeskripsi(''); setNewTujuan(''); setNewReferensi('') } }}
        >
          <div style={{
            background: 'var(--bg2)', border: '1px solid var(--border)',
            borderRadius: 12, padding: 24, width: 400,
            display: 'flex', flexDirection: 'column', gap: 16,
          }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{t('Konten Baru')}</div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>{t('Judul Konten')}</label>
              <input
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createCard()}
                placeholder={t('contoh: Tren fashion summer 2025...')}
                autoFocus
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Entity</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {ENTITY_OPTIONS.map(e => (
                  <button key={e.key} onClick={() => setNewEntity(e.key as 'bpi' | 'bsi')} style={chipStyle(newEntity === e.key)}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>Platform</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {PLATFORM_OPTIONS.map(p => (
                  <button key={p.key} onClick={() => setNewPlatform(p.key)} style={chipStyle(newPlatform === p.key)}>
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                {t('Deskripsi Konten')} <span style={{ fontWeight: 400, color: 'var(--text2)', opacity: 0.6 }}>{t('(opsional)')}</span>
              </label>
              <textarea
                value={newDeskripsi}
                onChange={e => setNewDeskripsi(e.target.value)}
                placeholder={t('Jelaskan konten ini lebih detail — topik, angle, pesan utama, dll.')}
                rows={3}
                style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit', fontSize: 13 }}
              />
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 8 }}>{t('Tujuan Konten')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {TUJUAN_OPTIONS.map(t => (
                  <button key={t} onClick={() => setNewTujuan(newTujuan === t ? '' : t)} style={chipStyle(newTujuan === t)}>
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontSize: 11, color: 'var(--text2)', fontWeight: 600, display: 'block', marginBottom: 6 }}>
                {t('Referensi')} <span style={{ fontWeight: 400, color: 'var(--text2)', opacity: 0.6 }}>{t('(opsional)')}</span>
              </label>
              <input
                value={newReferensi}
                onChange={e => setNewReferensi(e.target.value)}
                placeholder={t('contoh: @awkarin, gaya visual foodvlog, atau link referensi')}
                style={{ width: '100%', boxSizing: 'border-box' }}
              />
            </div>

            {createError && (
              <div style={{ padding: '8px 12px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 6, color: '#ff6b6b', fontSize: 12 }}>
                {createError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => { setShowNewModal(false); setCreateError(null); setNewDeskripsi(''); setNewTujuan(''); setNewReferensi('') }}
                style={{ padding: '8px 16px', background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text2)', fontSize: 13, cursor: 'pointer' }}
              >
                {t('Batal')}
              </button>
              <button
                onClick={createCard}
                disabled={creating || !newTitle.trim()}
                style={{
                  padding: '8px 16px',
                  background: creating || !newTitle.trim() ? 'var(--bg3)' : '#6c63ff',
                  border: 'none', borderRadius: 8,
                  color: creating || !newTitle.trim() ? 'var(--text2)' : '#fff',
                  fontSize: 13, fontWeight: 600,
                  cursor: creating || !newTitle.trim() ? 'not-allowed' : 'pointer',
                }}
              >
                {creating ? t('Membuat...') : t('Buat')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Kanban board */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: 'var(--text2)' }}>
            {cards.filter(c => c.stage !== 'selesai').length} {t('konten aktif')}
          </div>
          <button
            onClick={() => setShowNewModal(true)}
            style={{ padding: '8px 16px', background: '#6c63ff', border: 'none', borderRadius: 8, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
          >
            + {t('Konten Baru')}
          </button>
        </div>

        {/* Columns */}
        {loading ? (
          <div style={{ color: 'var(--text2)', fontSize: 13 }}>{t('Memuat pipeline...')}</div>
        ) : loadError ? (
          <div style={{ padding: '12px 16px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>
            {loadError}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, alignItems: 'start' }}>
            {PIPELINE_STAGES.map(stage => (
              <div key={stage.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Column header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: stage.color, textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    {stage.label}
                  </div>
                  <div style={{ background: `${stage.color}22`, borderRadius: 10, padding: '1px 7px', fontSize: 10, color: stage.color }}>
                    {cardsByStage(stage.key).length}
                  </div>
                </div>

                {/* Cards */}
                {cardsByStage(stage.key).length === 0 ? (
                  <div style={{ border: '1px dashed var(--border)', borderRadius: 8, padding: '16px 0', textAlign: 'center', fontSize: 11, color: 'var(--text2)' }}>
                    {t('Kosong')}
                  </div>
                ) : (
                  cardsByStage(stage.key).map(card => (
                    <PipelineCard
                      key={card.id}
                      card={card}
                      onGenerateBrief={setBriefCard}
                      onOpenBuilder={handleOpenBuilder}
                    />
                  ))
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  )
}
