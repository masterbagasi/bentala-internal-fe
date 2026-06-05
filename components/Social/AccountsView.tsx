'use client'

import { SUBJECTS, PLATFORM_META } from './mock'
import {
  Card, PlatformChip, StatusDot, SubjectTypeBadge, fmtNum,
} from './ui'

export function AccountsView() {
  return (
    <div>

      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
        <p style={{ fontSize: 13, color: 'var(--text2)', margin: 0 }}>
          Kelola akun yang dianalisis. Akun <strong style={{ color: 'var(--text)' }}>Owned</strong> tersambung via
          Composio (auth sekali); akun <strong style={{ color: 'var(--text)' }}>Prospect</strong> hanya data publik.
        </p>
        <button
          style={{
            marginLeft: 'auto', background: 'var(--accent)', color: '#fff', border: 'none',
            borderRadius: 9, padding: '9px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Tambah Akun
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {SUBJECTS.map(subject => (
          <Card key={subject.id} style={{ padding: 0, overflow: 'hidden' }}>
            {/* Header */}
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div
                style={{
                  width: 38, height: 38, borderRadius: 10, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', background: 'var(--bg3)', fontSize: 15, fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                {subject.name.charAt(0)}
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 600, color: 'var(--text)' }}>{subject.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text3)' }}>
                  {subject.connections.length} platform terhubung
                </div>
              </div>
              <div style={{ marginLeft: 'auto' }}>
                <SubjectTypeBadge type={subject.type} />
              </div>
            </div>

            {/* Connections */}
            <div>
              {subject.connections.map((c, i) => (
                <div
                  key={c.platform}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px',
                    borderBottom: i < subject.connections.length - 1 ? '1px solid var(--border)' : 'none',
                  }}
                >
                  <PlatformChip platform={c.platform} />
                  <div style={{ minWidth: 160 }}>
                    <div style={{ fontSize: 13, color: 'var(--text)' }}>{PLATFORM_META[c.platform].label}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)' }}>{c.handle}</div>
                  </div>
                  <div style={{ minWidth: 120 }}>
                    <StatusDot status={c.status} />
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                    {c.followers > 0 ? `${fmtNum(c.followers)} followers` : '—'}
                  </div>
                  <button
                    style={{
                      marginLeft: 'auto', background: 'var(--bg3)', color: 'var(--text2)',
                      border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px',
                      fontSize: 12, fontWeight: 500, cursor: 'pointer',
                    }}
                  >
                    {c.status === 'connected' ? 'Sync' : c.status === 'public' ? 'Refresh' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}
