'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createSession, upsertSession, deleteHistoryItem, getHistoryByTool, formatHistoryDate, HistoryItem, Message } from '@/lib/aiHistory'

const SUGGESTED_PROMPTS = [
  'Buatkan 5 ide konten TikTok untuk brand fashion Indonesia minggu ini',
  'Tulis caption Instagram untuk foto OOTD dengan tone yang fun dan relatable',
  'Apa tren fashion Indonesia yang sedang viral bulan ini?',
  'Bantu saya buat strategi hashtag untuk konten reels fashion',
  'Buatkan hook TikTok yang catchy untuk konten mukbang',
  'Saran editing style untuk video fashion yang cinematic',
]

export default function ChatInterface() {
  const [sessions, setSessions] = useState<HistoryItem[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const refreshSessions = useCallback(() => {
    setSessions(getHistoryByTool('chat'))
  }, [])

  useEffect(() => {
    refreshSessions()
  }, [refreshSessions])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  function startNewChat() {
    const session = createSession('chat')
    setActiveId(session.id)
    setMessages([])
    setError(null)
    setSessions(getHistoryByTool('chat'))
  }

  function loadSession(item: HistoryItem) {
    setActiveId(item.id)
    const data = item.data as { messages: Message[] }
    setMessages(data.messages ?? [])
    setError(null)
  }

  function handleDelete(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    deleteHistoryItem(id)
    if (activeId === id) {
      setActiveId(null)
      setMessages([])
    }
    setSessions(getHistoryByTool('chat'))
  }

  function autoResize() {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  async function send(text?: string) {
    const content = (text ?? input).trim()
    if (!content || loading) return

    // create session if none active
    let sessionId = activeId
    if (!sessionId) {
      const session = createSession('chat')
      sessionId = session.id
      setActiveId(session.id)
      setSessions(getHistoryByTool('chat'))
    }

    const newMessages: Message[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)
    setError(null)
    if (textareaRef.current) textareaRef.current.style.height = 'auto'

    // update title from first user message
    if (messages.length === 0) {
      upsertSession(sessionId, { title: content.slice(0, 60) })
      setSessions(getHistoryByTool('chat'))
    }

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? 'Gagal mendapatkan respons')

      const finalMessages: Message[] = [...newMessages, { role: 'assistant', content: data.content }]
      setMessages(finalMessages)
      upsertSession(sessionId, { data: { messages: finalMessages } })
      setSessions(getHistoryByTool('chat'))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan')
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const isEmpty = messages.length === 0

  return (
    <div style={{ display: 'flex', height: '100%' }}>
      {/* Sidebar */}
      <div style={{ width: 240, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', flexShrink: 0, background: 'var(--bg)' }}>
        <div style={{ padding: '12px 12px 8px' }}>
          <button
            onClick={startNewChat}
            style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--bg2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, transition: 'border-color 0.15s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#6c63ff55')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <span style={{ fontSize: 16 }}>✏️</span> Chat Baru
          </button>
        </div>

        <div style={{ padding: '4px 16px 6px', fontSize: 10, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: 1 }}>
          Recents
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {sessions.length === 0 && (
            <div style={{ padding: '12px 8px', fontSize: 12, color: 'var(--text2)', opacity: 0.6 }}>Belum ada chat</div>
          )}
          {sessions.map(item => {
            const isActive = item.id === activeId
            const msgCount = (item.data as { messages: Message[] }).messages?.length ?? 0
            return (
              <div
                key={item.id}
                onClick={() => loadSession(item)}
                style={{
                  padding: '8px 10px', borderRadius: 8, cursor: 'pointer',
                  background: isActive ? 'rgba(108,99,255,0.12)' : 'transparent',
                  border: `1px solid ${isActive ? '#6c63ff33' : 'transparent'}`,
                  display: 'flex', alignItems: 'center', gap: 6,
                  transition: 'background 0.1s',
                  position: 'relative',
                }}
                onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'var(--bg2)' }}
                onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, color: isActive ? '#a99fff' : 'var(--text)', fontWeight: isActive ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.title}
                  </div>
                  <div style={{ fontSize: 10, color: 'var(--text2)', opacity: 0.7, marginTop: 1 }}>
                    {formatHistoryDate(item.updatedAt)} · {Math.floor(msgCount / 2)} pesan
                  </div>
                </div>
                <button
                  onClick={e => handleDelete(e, item.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--text2)', fontSize: 14, cursor: 'pointer', padding: '2px 4px', opacity: 0, flexShrink: 0, lineHeight: 1, borderRadius: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.color = '#ff6b6b' }}
                  onMouseLeave={e => { e.currentTarget.style.opacity = '0'; e.currentTarget.style.color = 'var(--text2)' }}
                  className="delete-btn"
                >×</button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: isEmpty ? '0' : '24px 0', display: 'flex', flexDirection: 'column' }}>
          {isEmpty ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 32px', gap: 28 }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 52, height: 52, borderRadius: 14, background: 'linear-gradient(135deg, #6c63ff22, #6c63ff44)', border: '1px solid #6c63ff44', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: 22 }}>✦</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Tanya apa saja</div>
                <div style={{ fontSize: 13, color: 'var(--text2)', maxWidth: 360, lineHeight: 1.6 }}>
                  Asisten kreatif Bentala siap bantu dengan ide konten, caption, strategi, brief, atau apapun.
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, width: '100%', maxWidth: 560 }}>
                {SUGGESTED_PROMPTS.map((p, i) => (
                  <button key={i} onClick={() => send(p)} style={{ padding: '11px 13px', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 10, color: 'var(--text)', fontSize: 12, textAlign: 'left', cursor: 'pointer', lineHeight: 1.5, transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#6c63ff55')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >{p}</button>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 720, width: '100%', margin: '0 auto', padding: '0 28px' }}>
              {messages.map((msg, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: msg.role === 'user' ? '#6c63ff33' : '#43d9a222', border: `1px solid ${msg.role === 'user' ? '#6c63ff44' : '#43d9a233'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>
                    {msg.role === 'user' ? '👤' : '✦'}
                  </div>
                  <div style={{ maxWidth: '80%', padding: '11px 15px', borderRadius: msg.role === 'user' ? '12px 4px 12px 12px' : '4px 12px 12px 12px', background: msg.role === 'user' ? '#6c63ff18' : 'var(--bg2)', border: `1px solid ${msg.role === 'user' ? '#6c63ff33' : 'var(--border)'}`, color: 'var(--text)', fontSize: 14, lineHeight: 1.7, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: '#43d9a222', border: '1px solid #43d9a233', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>✦</div>
                  <div style={{ padding: '11px 15px', borderRadius: '4px 12px 12px 12px', background: 'var(--bg2)', border: '1px solid var(--border)', display: 'flex', gap: 5, alignItems: 'center' }}>
                    {[0, 1, 2].map(j => <div key={j} style={{ width: 6, height: 6, borderRadius: '50%', background: '#43d9a2', animation: 'pulse 1.4s ease-in-out infinite', animationDelay: `${j * 0.2}s` }} />)}
                  </div>
                </div>
              )}
              {error && <div style={{ padding: '10px 14px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff6b6b', fontSize: 13 }}>{error}</div>}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: '14px 28px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', gap: 10, alignItems: 'flex-end', background: 'var(--bg2)', border: '1px solid var(--border)', borderRadius: 12, padding: '10px 10px 10px 16px' }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={e => { setInput(e.target.value); autoResize() }}
              onKeyDown={handleKeyDown}
              placeholder="Ketik pesan... (Enter kirim, Shift+Enter baris baru)"
              rows={1}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 14, lineHeight: 1.6, resize: 'none', fontFamily: 'inherit', padding: 0, maxHeight: 160, overflowY: 'auto' }}
            />
            <button onClick={() => send()} disabled={!input.trim() || loading}
              style={{ width: 34, height: 34, borderRadius: 8, flexShrink: 0, background: input.trim() && !loading ? '#6c63ff' : 'var(--bg3)', border: 'none', cursor: input.trim() && !loading ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', justifyContent: 'center', color: input.trim() && !loading ? '#fff' : 'var(--text2)', fontSize: 15 }}>↑</button>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 6, opacity: 0.4, textAlign: 'center' }}>Powered by Claude · Bentala AI</div>
        </div>
      </div>

      <style>{`
        @keyframes pulse { 0%,80%,100%{transform:scale(0.7);opacity:0.4}40%{transform:scale(1);opacity:1} }
        div:hover .delete-btn { opacity: 1 !important; }
      `}</style>
    </div>
  )
}
