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

export function playSfx(_cue: AudioCue): void {
  // Phase 1.5 Contract stub — implemented with Web Audio synth in feat/p1-5-v12-audio-polish.
}

export function syncAmbientAudio(_state: AmbientAudioState): void {
  // Phase 1.5 Contract stub — implemented with Web Audio ambient synthesis in feat/p1-5-v12-audio-polish.
}
