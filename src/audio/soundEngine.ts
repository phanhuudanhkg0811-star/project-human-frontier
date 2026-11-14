import type { DonkiLevel } from '../types/index.ts';

export type AudioCue =
  | 'click'
  | 'confirm'
  | 'alert'
  | 'phase-advance'
  | 'end-sol'
  | 'victory'
  | 'defeat';

export interface AmbientAudioState {
  readonly isLunarNight: boolean;
  readonly weatherLevel: DonkiLevel;
  readonly muted: boolean;
}

type BrowserAudioContext = AudioContext & { resume(): Promise<void> };

let context: BrowserAudioContext | null = null;
let masterGain: GainNode | null = null;
let ambientGain: GainNode | null = null;
let ambientTone: OscillatorNode | null = null;
let ambientNoise: AudioBufferSourceNode | null = null;
let currentState: AmbientAudioState = { isLunarNight: false, weatherLevel: 'quiet', muted: false };

function audioContextConstructor(): (new () => BrowserAudioContext) | null {
  if (typeof window === 'undefined') return null;
  const candidate = window as typeof window & { webkitAudioContext?: new () => BrowserAudioContext };
  return (window.AudioContext as new () => BrowserAudioContext) ?? candidate.webkitAudioContext ?? null;
}

function createNoiseBuffer(ctx: AudioContext): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * 2));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const channel = buffer.getChannelData(0);
  let seed = 0x2050;
  for (let index = 0; index < channel.length; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    channel[index] = ((seed / 0xffffffff) * 2 - 1) * 0.18;
  }
  return buffer;
}

function updateAmbient(ctx: AudioContext, state: AmbientAudioState): void {
  if (!ambientGain || !ambientTone) return;
  const now = ctx.currentTime;
  const weatherGain: Record<DonkiLevel, number> = {
    quiet: 0.018,
    moderate: 0.024,
    storm: 0.035,
    extreme: 0.045,
  };
  const weatherPitch: Record<DonkiLevel, number> = {
    quiet: 54,
    moderate: 58,
    storm: 64,
    extreme: 72,
  };
  ambientTone.frequency.cancelScheduledValues(now);
  ambientTone.frequency.linearRampToValueAtTime(
    weatherPitch[state.weatherLevel] - (state.isLunarNight ? 8 : 0),
    now + 0.8,
  );
  ambientGain.gain.cancelScheduledValues(now);
  ambientGain.gain.linearRampToValueAtTime(state.muted ? 0 : weatherGain[state.weatherLevel], now + 0.35);
}

function ensureContext(): BrowserAudioContext | null {
  if (context) {
    if (context.state === 'suspended') void context.resume().catch(() => undefined);
    return context;
  }
  const AudioContextCtor = audioContextConstructor();
  if (!AudioContextCtor) return null;
  try {
    const ctx = new AudioContextCtor();
    const master = ctx.createGain();
    const ambient = ctx.createGain();
    const tone = ctx.createOscillator();
    const noise = ctx.createBufferSource();
    const noiseFilter = ctx.createBiquadFilter();

    master.gain.value = currentState.muted ? 0 : 0.72;
    ambient.gain.value = 0;
    tone.type = 'sine';
    tone.frequency.value = 54;
    noise.buffer = createNoiseBuffer(ctx);
    noise.loop = true;
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 180;
    noiseFilter.Q.value = 0.7;

    tone.connect(ambient);
    noise.connect(noiseFilter).connect(ambient);
    ambient.connect(master).connect(ctx.destination);
    tone.start();
    noise.start();

    context = ctx;
    masterGain = master;
    ambientGain = ambient;
    ambientTone = tone;
    ambientNoise = noise;
    updateAmbient(ctx, currentState);
    void ctx.resume().catch(() => undefined);
    return ctx;
  } catch {
    return null;
  }
}

const CUE_NOTES: Record<AudioCue, ReadonlyArray<{ frequency: number; duration: number; gain: number; type?: OscillatorType }>> = {
  click: [{ frequency: 520, duration: 0.045, gain: 0.08 }],
  confirm: [
    { frequency: 520, duration: 0.07, gain: 0.1 },
    { frequency: 760, duration: 0.1, gain: 0.08 },
  ],
  alert: [
    { frequency: 420, duration: 0.12, gain: 0.12, type: 'square' },
    { frequency: 310, duration: 0.16, gain: 0.1, type: 'square' },
  ],
  'phase-advance': [
    { frequency: 440, duration: 0.08, gain: 0.09 },
    { frequency: 660, duration: 0.1, gain: 0.09 },
  ],
  'end-sol': [
    { frequency: 330, duration: 0.12, gain: 0.09 },
    { frequency: 494, duration: 0.14, gain: 0.09 },
    { frequency: 659, duration: 0.2, gain: 0.08 },
  ],
  victory: [
    { frequency: 523, duration: 0.14, gain: 0.1 },
    { frequency: 659, duration: 0.14, gain: 0.1 },
    { frequency: 784, duration: 0.28, gain: 0.11 },
  ],
  defeat: [
    { frequency: 392, duration: 0.18, gain: 0.1, type: 'triangle' },
    { frequency: 294, duration: 0.22, gain: 0.1, type: 'triangle' },
    { frequency: 196, duration: 0.32, gain: 0.09, type: 'triangle' },
  ],
};

export function playSfx(cue: AudioCue): void {
  if (currentState.muted) return;
  const ctx = ensureContext();
  if (!ctx || !masterGain) return;
  let offset = 0;
  for (const note of CUE_NOTES[cue]) {
    const oscillator = ctx.createOscillator();
    const envelope = ctx.createGain();
    const start = ctx.currentTime + offset;
    oscillator.type = note.type ?? 'sine';
    oscillator.frequency.setValueAtTime(note.frequency, start);
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(note.gain, start + 0.008);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);
    oscillator.connect(envelope).connect(masterGain);
    oscillator.start(start);
    oscillator.stop(start + note.duration + 0.02);
    offset += note.duration * 0.72;
  }
}

export function syncAmbientAudio(state: AmbientAudioState): void {
  currentState = state;
  if (!context || !masterGain) return;
  const now = context.currentTime;
  masterGain.gain.cancelScheduledValues(now);
  masterGain.gain.linearRampToValueAtTime(state.muted ? 0 : 0.72, now + 0.12);
  updateAmbient(context, state);
}

export function disposeSoundEngine(): void {
  try {
    ambientTone?.stop();
    ambientNoise?.stop();
    void context?.close();
  } catch {
    // Audio nodes may already be stopped by the browser.
  }
  context = null;
  masterGain = null;
  ambientGain = null;
  ambientTone = null;
  ambientNoise = null;
}
