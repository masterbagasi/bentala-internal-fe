'use client'

import { useStore } from '@/hooks/useStore'
import { useT } from '@/lib/i18n/LanguageProvider'
import { TEAM } from '@/lib/constants'

export function TeamPage() {
  const t = useT()
  const { projects, tasks, posts } = useStore()

  return (
    <div>
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 20 }}>Team & Roles</div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
        {TEAM.map(m => {
          const myTasks = tasks.filter(t => t.assignee === m.name && t.status !== 'done')
          const myProjs = projects.filter(p => (p.team || []).includes(m.name) && p.status === 'active')
          const myPosts = posts.filter(p => (p.pics || []).includes(m.name))
          const donePosts = myPosts.filter(p => p.status === 'published' || p.status === 'done')

          return (
            <div key={m.name}
              style={{
                background: 'var(--bg2)', border: `1px solid ${m.color}44`, borderRadius: 12, padding: 20,
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
              onMouseOver={e => {
                (e.currentTarget as HTMLElement).style.borderColor = m.color
                ;(e.currentTarget as HTMLElement).style.boxShadow = `0 4px 20px ${m.color}22`
              }}
              onMouseOut={e => {
                (e.currentTarget as HTMLElement).style.borderColor = m.color + '44'
                ;(e.currentTarget as HTMLElement).style.boxShadow = ''
              }}
            >
              {/* Avatar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: `linear-gradient(135deg, ${m.color}, ${m.color}88)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 20, fontWeight: 700, color: '#fff',
                  boxShadow: `0 4px 12px ${m.color}44`,
                }}>
                  {m.initials}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)' }}>
                    {m.fullName || m.name}
                  </div>
                  <div style={{ fontSize: 12, marginTop: 2, color: m.color, fontWeight: 500 }}>{m.role}</div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                {[
                  { label: 'Tasks',    value: myTasks.length,      color: m.color },
                  { label: 'Projects', value: myProjs.length,      color: m.color },
                  { label: 'Posts',    value: donePosts.length,     color: m.color },
                ].map(s => (
                  <div key={s.label}
                    style={{ background: 'var(--bg3)', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
                    <div style={{ fontSize: 22, fontWeight: 700, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 10, color: 'var(--text2)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Active tasks */}
              {myTasks.length > 0 && (
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 600 }}>
                    Active Tasks
                  </div>
                  {myTasks.slice(0, 3).map(t => (
                    <div key={t.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, fontSize: 12 }}>
                      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.color, flexShrink: 0 }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    </div>
                  ))}
                  {myTasks.length > 3 && (
                    <div style={{ fontSize: 11, color: 'var(--text2)' }}>+{myTasks.length - 3} {t('lainnya')}</div>
                  )}
                </div>
              )}

              {myTasks.length === 0 && (
                <div style={{ fontSize: 12, color: 'var(--text2)', textAlign: 'center', padding: '8px 0' }}>
                  {t('Tidak ada task aktif 🎉')}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
