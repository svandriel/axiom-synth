import type { BuildIndices } from '../types';

export const OSCILLATOR_COUNT = 3 as const;
export type OscillatorCount = typeof OSCILLATOR_COUNT;
export type OscillatorIndex = BuildIndices<OscillatorCount>;

export const LFO_COUNT = 4 as const;
export type LfoCount = typeof LFO_COUNT;
export type LfoIndex = BuildIndices<LfoCount>;

export const LFO_TARGET_COUNT = 6 as const;
export type LfoTargetCount = typeof LFO_TARGET_COUNT;
