export interface OscillatorConfig {
  label?: string;
  waveform: WaveFormType;
  pitch: number;
  detune: number;
  gain: number;
}

export type WaveFormType = 'saw' | 'sine' | 'square' | 'triangle' | 'pulse';
