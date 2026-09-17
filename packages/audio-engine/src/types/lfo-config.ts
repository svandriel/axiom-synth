import type { FixedArray } from './fixed-array';
import type { LfoTargetCount } from '../engine/constants';

export type LfoTarget = 'osc1' | 'osc2' | 'osc3' | 'cutoff' | 'amp' | 'drive';

export type LfoWaveformType = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface LfoConfig {
  rateHz: number;
  waveform: LfoWaveformType;
  depths: FixedArray<number, LfoTargetCount>;
}
