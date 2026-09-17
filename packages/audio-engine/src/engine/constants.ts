import type { BuildIndices } from '../types';
import type { LfoTarget } from '../types/lfo-config';

export const OSCILLATOR_COUNT = 3 as const;
export type OscillatorCount = typeof OSCILLATOR_COUNT;
export type OscillatorIndex = BuildIndices<OscillatorCount>;

export const LFO_COUNT = 4 as const;
export type LfoCount = typeof LFO_COUNT;
export type LfoIndex = BuildIndices<LfoCount>;

export const LFO_TARGET_COUNT = 6 as const;
export type LfoTargetCount = typeof LFO_TARGET_COUNT;
export type LfoTargetIndex = BuildIndices<LfoTargetCount>;

export const LFO_TARGETS: readonly LfoTarget[] = [
  'osc1',
  'osc2',
  'osc3',
  'cutoff',
  'amp',
  'drive',
];

export const LFO_TARGET_INDEX: Record<LfoTarget, LfoTargetIndex> = {
  osc1: 0,
  osc2: 1,
  osc3: 2,
  cutoff: 3,
  amp: 4,
  drive: 5,
};
