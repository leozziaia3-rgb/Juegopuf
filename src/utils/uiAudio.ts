/**
 * uiAudio.ts - Procedural Web Audio synthesizer for AAA UI sounds
 * Creates crisp mechanical clicks, mode selection chimes, and realistic engine starter roars.
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (AudioContextClass) {
      audioCtx = new AudioContextClass();
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/** Crisp, high-end mechanical tactile button click */
export function playUiClick(freq = 800) {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.04);

    gain.gain.setValueAtTime(0.18, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.04);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.045);
  } catch {
    // Audio safe fallback
  }
}

/** Subtle high-tech tick for hovering key interactive elements */
export function playUiHover() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1400, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(800, ctx.currentTime + 0.02);

    gain.gain.setValueAtTime(0.04, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.02);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.025);
  } catch {
    // Audio safe fallback
  }
}

/** Mode confirmation chime */
export function playModeSelectChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const t = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t + i * 0.04);

      gain.gain.setValueAtTime(0, t + i * 0.04);
      gain.gain.linearRampToValueAtTime(0.1, t + i * 0.04 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.04 + 0.18);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t + i * 0.04);
      osc.stop(t + i * 0.04 + 0.2);
    });
  } catch {
    // Audio safe fallback
  }
}

/** Cinematic V8/V10 Engine Ignition Roar for Title Screen Enter */
export function playEngineIgnitionRoar() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    // 1. Starter motor cranking pulses
    for (let i = 0; i < 3; i++) {
      const crankOsc = ctx.createOscillator();
      const crankGain = ctx.createGain();
      crankOsc.type = 'sawtooth';
      crankOsc.frequency.setValueAtTime(45 + i * 5, now + i * 0.12);
      crankGain.gain.setValueAtTime(0.12, now + i * 0.12);
      crankGain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.09);
      crankOsc.connect(crankGain);
      crankGain.connect(ctx.destination);
      crankOsc.start(now + i * 0.12);
      crankOsc.stop(now + i * 0.12 + 0.1);
    }

    // 2. High-rev throttle surge at ignition (from t = 0.4s to 1.8s)
    const fireTime = now + 0.38;

    // Sub-bass thump
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(140, fireTime);
    subOsc.frequency.exponentialRampToValueAtTime(45, fireTime + 0.8);
    subGain.gain.setValueAtTime(0.35, fireTime);
    subGain.gain.exponentialRampToValueAtTime(0.001, fireTime + 0.9);
    subOsc.connect(subGain);
    subGain.connect(ctx.destination);
    subOsc.start(fireTime);
    subOsc.stop(fireTime + 0.95);

    // Engine harmonic roar
    const roarOsc = ctx.createOscillator();
    const roarGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, fireTime);
    filter.frequency.linearRampToValueAtTime(2600, fireTime + 0.35);
    filter.frequency.exponentialRampToValueAtTime(650, fireTime + 1.2);

    roarOsc.type = 'sawtooth';
    roarOsc.frequency.setValueAtTime(110, fireTime);
    roarOsc.frequency.linearRampToValueAtTime(320, fireTime + 0.35);
    roarOsc.frequency.exponentialRampToValueAtTime(130, fireTime + 1.2);

    roarGain.gain.setValueAtTime(0.01, fireTime);
    roarGain.gain.linearRampToValueAtTime(0.25, fireTime + 0.1);
    roarGain.gain.exponentialRampToValueAtTime(0.001, fireTime + 1.3);

    roarOsc.connect(filter);
    filter.connect(roarGain);
    roarGain.connect(ctx.destination);

    roarOsc.start(fireTime);
    roarOsc.stop(fireTime + 1.35);
  } catch {
    // Audio safe fallback
  }
}
