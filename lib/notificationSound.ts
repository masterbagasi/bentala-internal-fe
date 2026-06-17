// A short, pleasant notification chime synthesised with the Web Audio API —
// no audio asset to ship. Browsers block audio until the user has interacted
// with the page, so `initNotificationSound()` unlocks/creates the AudioContext
// on the first gesture; `playNotificationSound()` then plays on demand.

let ctx: AudioContext | null = null
let unlockBound = false
let lastPlay = 0

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return null
    try { ctx = new AC() } catch { return null }
  }
  return ctx
}

/** Register one-time gesture listeners that create + resume the AudioContext,
 *  so the first real notification can actually make sound. Idempotent. */
export function initNotificationSound(): void {
  if (typeof window === 'undefined' || unlockBound) return
  unlockBound = true
  const unlock = () => {
    const c = getCtx()
    if (c && c.state === 'suspended') c.resume().catch(() => {})
  }
  window.addEventListener('pointerdown', unlock, { once: true })
  window.addEventListener('keydown', unlock, { once: true })
  window.addEventListener('touchstart', unlock, { once: true })
}

/** Play the notification chime. Throttled so a burst of events makes one sound. */
export function playNotificationSound(): void {
  const c = getCtx()
  if (!c) return
  const now = Date.now()
  if (now - lastPlay < 1200) return
  lastPlay = now
  if (c.state === 'suspended') c.resume().catch(() => {})

  const t0 = c.currentTime
  // Two soft sine notes (A5 → E6) — a gentle "ding-dong" rise.
  const notes: Array<{ f: number; at: number }> = [
    { f: 880, at: 0 },
    { f: 1318.51, at: 0.085 },
  ]
  for (const { f, at } of notes) {
    const osc = c.createOscillator()
    const gain = c.createGain()
    osc.type = 'sine'
    osc.frequency.value = f
    const start = t0 + at
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.linearRampToValueAtTime(0.16, start + 0.012)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.3)
    osc.connect(gain).connect(c.destination)
    osc.start(start)
    osc.stop(start + 0.32)
  }
}
