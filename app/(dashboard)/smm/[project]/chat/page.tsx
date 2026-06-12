'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PageHeader } from '@/components/shared/PageHeader'
import { ChatRoom } from '@/components/Chat/ChatRoom'
import { getSupabase } from '@/lib/supabase'
import { useSocmedProjects } from '@/lib/socmed-projects'
import { useT } from '@/lib/i18n/LanguageProvider'
import { isEffectiveSuperAdmin } from '@/lib/access'

export default function ChatPage() {
  const params = useParams()
  const slug = String(params.project)
  const t = useT()
  const projects = useSocmedProjects(false)
  const roomName = projects.find(p => p.slug === slug)?.name || slug
  const [email, setEmail] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [meSuper, setMeSuper] = useState(false)

  useEffect(() => {
    const sb = getSupabase() as unknown as import('@supabase/supabase-js').SupabaseClient
    sb.auth.getUser().then(({ data }) => {
      const u = data.user
      setEmail(u?.email ?? null)
      const m = (u?.user_metadata ?? {}) as Record<string, unknown>
      setName((m.full_name as string) || (m.name as string) || (u?.email ?? '').split('@')[0])
      setMeSuper(isEffectiveSuperAdmin(u?.email, (u?.app_metadata as Record<string, unknown> | undefined)?.role))
    })
  }, [])

  return (
    <>
      <PageHeader title={roomName} />
      <div className="flex-1 overflow-hidden min-h-0" style={{ padding: 24, display: 'flex', flexDirection: 'column' }}>
        {email
          ? <ChatRoom room={slug} roomName={roomName} meEmail={email} meName={name} meSuper={meSuper} />
          : <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 }}>{t('Memuat…')}</div>}
      </div>
    </>
  )
}
