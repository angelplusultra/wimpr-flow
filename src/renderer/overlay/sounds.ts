/** Short synthesized cues, so there are no audio assets to ship. */
export function playCue(ctx: AudioContext, kind: 'start' | 'stop'): void {
  const notes = kind === 'start' ? [660, 880] : [880, 660]
  const t0 = ctx.currentTime
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const t = t0 + i * 0.07
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, t)
    gain.gain.linearRampToValueAtTime(0.06, t + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.09)
    osc.connect(gain).connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.1)
  })
}
