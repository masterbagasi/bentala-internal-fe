'use client'

import {
  OBJECTIVES, OBJECTIVE_META, PLATFORMS, PLATFORM_META, TIERS, TIER_META, MODE_META,
  type DeepConfig, type Objective, type Platform, type AnalysisMode,
} from '../data'
import { C, card, sectionLabel, btnPrimary, disabledStyle, inputStyle } from '../theme'
import { Pill, PlatformIcon } from '../ui'

const MODES: AnalysisMode[] = ['A', 'B']

export function Step1Config({ config, setConfig, onNext }: {
  config: DeepConfig
  setConfig: (c: DeepConfig) => void
  onNext: () => void
}) {
  const toggleObjective = (o: Objective) => {
    const has = config.objectives.includes(o)
    setConfig({ ...config, objectives: has ? config.objectives.filter((x) => x !== o) : [...config.objectives, o] })
  }
  const valid = !!config.platform && !!config.tier && !!config.username.trim() && config.objectives.length > 0 && !!config.mode

  return (
    <div style={{ ...card, maxWidth: 760 }}>
      <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Konfigurasi Awal</div>
      <p style={{ fontSize: 12.5, color: 'var(--text2)', margin: '0 0 22px' }}>Satu platform, satu tier, satu akun — boleh pilih lebih dari satu tujuan agar analisa lebih lengkap.</p>

      {/* 1. Platform — single */}
      <Field label="Platform" required hint="Pilih satu">
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {PLATFORMS.map((p: Platform) => (
            <Pill key={p} active={config.platform === p} onClick={() => setConfig({ ...config, platform: p })}>
              <PlatformIcon platform={p} size={15} /> {PLATFORM_META[p].label}
            </Pill>
          ))}
        </div>
      </Field>

      {/* 2. Tier — single */}
      <Field label="Tier klien" required>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {TIERS.map((t) => (
            <Pill key={t} active={config.tier === t} onClick={() => setConfig({ ...config, tier: t })}>{TIER_META[t].label}</Pill>
          ))}
        </div>
      </Field>

      {/* 3. Username */}
      <Field label="Username akun klien" required>
        <input value={config.username} onChange={(e) => setConfig({ ...config, username: e.target.value })} placeholder="@username" style={{ ...inputStyle, maxWidth: 360 }} />
      </Field>

      {/* 4. Tujuan — multi */}
      <Field label="Tujuan kolaborasi" required hint="Bisa pilih lebih dari satu">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {OBJECTIVES.map((o) => (
            <CheckOption key={o} active={config.objectives.includes(o)} onClick={() => toggleObjective(o)}
              title={OBJECTIVE_META[o].label} desc={OBJECTIVE_META[o].desc} />
          ))}
        </div>
      </Field>

      {/* 5. Mode Analisa — single */}
      <Field label="Mode analisa" required hint="Menentukan cara aspek manual diisi">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {MODES.map((m) => (
            <RadioOption key={m} active={config.mode === m} onClick={() => setConfig({ ...config, mode: m })}
              title={MODE_META[m].label} desc={MODE_META[m].desc} />
          ))}
        </div>
      </Field>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
        <button type="button" onClick={() => valid && onNext()} disabled={!valid} style={{ ...btnPrimary, ...disabledStyle(!valid) }}>Lanjut →</button>
      </div>
    </div>
  )
}

function RadioOption({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} style={optStyle(active)}>
      <span style={{ width: 16, height: 16, borderRadius: '50%', flexShrink: 0, border: `2px solid ${active ? C.accent : 'var(--text2)'}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {active && <span style={{ width: 7, height: 7, borderRadius: '50%', background: C.accent }} />}
      </span>
      <OptText title={title} desc={desc} active={active} />
    </button>
  )
}
function CheckOption({ active, onClick, title, desc }: { active: boolean; onClick: () => void; title: string; desc: string }) {
  return (
    <button type="button" onClick={onClick} style={optStyle(active)}>
      <span style={{ width: 16, height: 16, borderRadius: 5, flexShrink: 0, border: `2px solid ${active ? C.accent : 'var(--text2)'}`, background: active ? C.accent : 'transparent', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        {active && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={C.onAccent} strokeWidth="3.5"><polyline points="20 6 9 17 4 12" /></svg>}
      </span>
      <OptText title={title} desc={desc} active={active} />
    </button>
  )
}
function OptText({ title, desc, active }: { title: string; desc: string; active: boolean }) {
  return (
    <span>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: active ? C.accent : 'var(--text)' }}>{title}</span>
      <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text2)', marginTop: 1 }}>{desc}</span>
    </span>
  )
}
function optStyle(active: boolean): React.CSSProperties {
  return { display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, textAlign: 'left', background: active ? C.accentSoft : 'var(--bg3)', border: `1px solid ${active ? C.accentBorder : 'var(--border)'}`, cursor: 'pointer' }
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ ...sectionLabel, marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span>{label}{required && <span style={{ color: C.danger, marginLeft: 4 }}>*</span>}</span>
        {hint && <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 400, fontSize: 11, color: 'var(--text2)' }}>· {hint}</span>}
      </div>
      {children}
    </div>
  )
}
