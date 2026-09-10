export interface OscillatorConfig {
  waveform: WaveFormType;
  octave: number;
  semi: number;
  detune: number;
  gain: number;
}

export type WaveFormType = 'saw' | 'sine' | 'square' | 'triangle' | 'pulse';
