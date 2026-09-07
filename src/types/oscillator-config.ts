export interface OscillatorConfig {
  waveform: WaveFormType;
  pitch: number;
  detune: number;
  gain: number;
}

export type WaveFormType = 'saw' | 'sine' | 'square' | 'triangle' | 'pulse';
