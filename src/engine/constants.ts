import type { BuildIndices } from '../types';

export const OSCILLATOR_COUNT = 3 as const;
export type OscillatorCount = typeof OSCILLATOR_COUNT;
export type OscillatorIndex = BuildIndices<OscillatorCount>;
