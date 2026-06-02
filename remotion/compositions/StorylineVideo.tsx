import { AbsoluteFill, Sequence, interpolate, useCurrentFrame, useVideoConfig } from 'remotion'

// One scene = one card with a label, dialog text, and visual description.
// Maps directly from the /api/ai/storyline output shape so storylines
// generated via Claude/GPT can be piped into a video without transformation.
export interface StorylineScene {
  no: number
  label: string         // "HOOK", "ISI", "CTA", etc.
  dialog: string         // word-for-word narration
  visual: string         // description shown as smaller subtitle
  durationInFrames: number
  bgColor?: string       // optional per-scene tint
}

export type StorylineProps = {
  title: string
  scenes: StorylineScene[]
  brandLabel: string     // e.g., "bentala project"
  // Index signature so Remotion's Composition<…> generic constraint
  // (Props extends Record<string, unknown>) is satisfied.
  [key: string]: unknown
}

// Default props used by `npx remotion preview` and as initial render values
// when the studio opens. Replaced at runtime by Player/render inputProps.
export const defaultStoryline: StorylineProps = {
  title: 'Storyline Demo',
  brandLabel: 'bentala project',
  scenes: [
    {
      no: 1, label: 'HOOK',
      dialog: 'Pernah bayangin Indonesia mendunia lewat satu klik?',
      visual: 'Wide shot Jakarta skyline + transition zoom into laptop screen',
      durationInFrames: 90,
      bgColor: '#0B3DE7',
    },
    {
      no: 2, label: 'ISI',
      dialog: 'Generasi muda sekarang punya tools yang bikin konten kelas dunia bisa dibuat di kamar kos.',
      visual: 'Quick cuts: editing apps, ring light, creator at desk',
      durationInFrames: 120,
      bgColor: '#0a0a0a',
    },
    {
      no: 3, label: 'CTA',
      dialog: 'Saatnya cerita Indonesia ke dunia. Mulai sekarang.',
      visual: 'Closing card with brand mark, social handle',
      durationInFrames: 90,
      bgColor: '#0B3DE7',
    },
  ],
}

const FONT = "'Open Sauce One', 'Open Sauce Sans', 'Segoe UI', system-ui, sans-serif"

export function StorylineVideo({ title, scenes, brandLabel }: StorylineProps) {
  let cursor = 0
  return (
    <AbsoluteFill style={{ background: '#0a0a0a', fontFamily: FONT }}>
      {scenes.map(scene => {
        const start = cursor
        cursor += scene.durationInFrames
        return (
          <Sequence
            key={scene.no}
            from={start}
            durationInFrames={scene.durationInFrames}
            name={`Scene ${scene.no} — ${scene.label}`}
          >
            <SceneCard scene={scene} title={title} brandLabel={brandLabel} />
          </Sequence>
        )
      })}
    </AbsoluteFill>
  )
}

function SceneCard({ scene, title, brandLabel }: { scene: StorylineScene; title: string; brandLabel: string }) {
  const frame = useCurrentFrame()
  const { fps, durationInFrames } = useVideoConfig()

  // Fade in over first 12 frames (~0.4s @ 30fps)
  const opacity = interpolate(frame, [0, 12], [0, 1], { extrapolateRight: 'clamp' })
  // Fade out over last 12 frames
  const fadeOut = interpolate(frame, [durationInFrames - 12, durationInFrames], [1, 0], { extrapolateLeft: 'clamp' })
  // Subtle zoom from 1.02 → 1.0 over scene duration
  const scale = interpolate(frame, [0, durationInFrames], [1.02, 1.0], { extrapolateRight: 'clamp' })

  const bg = scene.bgColor ?? '#0a0a0a'

  return (
    <AbsoluteFill style={{
      background: bg,
      opacity: Math.min(opacity, fadeOut),
      transform: `scale(${scale})`,
      padding: '120px 80px',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      color: '#fff',
    }}>
      {/* Top bar: brand + scene label */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.022em', lineHeight: 0.94 }}>
          {brandLabel.split(' ').map((word, i) => (
            <div key={i}>{word}</div>
          ))}
        </div>
        <div style={{
          padding: '12px 22px',
          background: 'rgba(255,255,255,0.16)',
          border: '1px solid rgba(255,255,255,0.28)',
          borderRadius: 999,
          fontSize: 24,
          fontWeight: 700,
          letterSpacing: '0.06em',
        }}>
          {scene.label}
        </div>
      </div>

      {/* Center: dialog text — large, readable */}
      <div style={{
        fontSize: 76,
        fontWeight: 800,
        lineHeight: 1.18,
        letterSpacing: '-0.024em',
        textShadow: '0 4px 24px rgba(0,0,0,0.32)',
      }}>
        {scene.dialog}
      </div>

      {/* Bottom: visual direction (smaller, dimmer) + scene number */}
      <div>
        <div style={{
          fontSize: 26, fontWeight: 500, lineHeight: 1.4,
          color: 'rgba(255,255,255,0.78)',
          letterSpacing: '-0.005em',
          marginBottom: 14,
          maxWidth: '85%',
        }}>
          {scene.visual}
        </div>
        <div style={{
          fontSize: 20, fontWeight: 700,
          color: 'rgba(255,255,255,0.52)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}>
          Scene {scene.no} · {Math.round(scene.durationInFrames / fps)}s · {title}
        </div>
      </div>
    </AbsoluteFill>
  )
}
