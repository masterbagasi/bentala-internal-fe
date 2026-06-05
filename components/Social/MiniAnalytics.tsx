'use client'

import { Card, StatCard, SectionTitle, PlatformChip, fmtNum } from './ui'

export interface MiniPost { title: string; date: string; likes: number; comments: number; kind: 'reel' | 'feed' }
export interface MiniAccount {
  name: string
  username: string
  asOf: string
  followers: number
  following: number
  mediaCount: number
  videoCount: number
  designCount: number
  reach28: number
  views28: number
  interactions28: number
  posts: MiniPost[]
}

// Compact, real overview for accounts where Instagram doesn't expose per-post
// insights / demographics (business accounts under ~1.000 followers).
export function MiniAnalytics({ account }: { account: MiniAccount }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Data asli <strong style={{ color: 'var(--text)' }}>@{account.username}</strong> via Composio · per {account.asOf}.
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 16 }}>
        <StatCard label="Total Followers" value={fmtNum(account.followers)} />
        <StatCard
          label="Konten"
          value={fmtNum(account.mediaCount)}
          breakdown={
            <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 11.5, color: 'var(--text2)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#c4393a' }} />
                <strong style={{ color: 'var(--text)' }}>{account.videoCount}</strong> video
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#8845c0' }} />
                <strong style={{ color: 'var(--text)' }}>{account.designCount}</strong> design
              </span>
            </div>
          }
        />
        <StatCard label="Reach (28 hari)" value={fmtNum(account.reach28)} />
        <StatCard label="Views (28 hari)" value={fmtNum(account.views28)} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14, marginBottom: 16 }}>
        <StatCard label="Interaksi (28 hari)" value={fmtNum(account.interactions28)} />
        <StatCard label="Mengikuti" value={fmtNum(account.following)} />
        <StatCard label="Total Post" value={fmtNum(account.mediaCount)} />
      </div>

      <Card style={{ marginBottom: 16 }}>
        <SectionTitle>Postingan Terbaru</SectionTitle>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {account.posts.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0',
              borderBottom: i < account.posts.length - 1 ? '1px solid var(--border)' : 'none',
            }}>
              <PlatformChip platform="instagram" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--text3)' }}>{p.date} · {p.kind === 'reel' ? 'Reel' : 'Post'}</div>
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text2)', whiteSpace: 'nowrap' }}>
                ♥ {fmtNum(p.likes)} · 💬 {fmtNum(p.comments)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div style={{
        padding: '12px 14px', borderRadius: 10, fontSize: 12, lineHeight: 1.6,
        background: 'var(--bg3)', color: 'var(--text3)', border: '1px solid var(--border)',
      }}>
        Akun ini di bawah 1.000 followers, sehingga Instagram belum menyediakan <strong>reach/views per-post</strong> dan
        <strong> demografi audiens</strong>. Metrik lengkap (seperti pada Bentala Project) otomatis tersedia setelah akun mencapai ≥1.000 followers.
      </div>
    </div>
  )
}
