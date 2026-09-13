export interface OscillatorConfig {
  waveform: WaveFormType;
  octave: number;
  semi: number;
  detune: number;
  gain: number;
}

export type WaveFormType = 'sawtooth' | 'sine' | 'square' | 'triangle';
