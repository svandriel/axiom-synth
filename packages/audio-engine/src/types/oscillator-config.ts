export interface UnisonConfig {
  voices: number;
  detune: number;
  depth: number;
  blend: number;
}

export interface OscillatorConfig {
  waveform: WaveFormType;
  octave: number;
  semi: number;
  detune: number;
  gain: number;
  unison: UnisonConfig;
}

export type WaveFormType = 'sawtooth' | 'sine' | 'square' | 'triangle';
