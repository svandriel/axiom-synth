import type { BuildIndices } from '../types';

export const OSCILLATOR_COUNT = 4 as const;
export type OscillatorCount = typeof OSCILLATOR_COUNT;
export type OscillatorIndex = BuildIndices<OscillatorCount>;
