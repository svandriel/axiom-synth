import type { FilterType } from '../engine/filter';

export interface FilterConfig {
  /**
   * Filter shape and slope. Slope types chain biquad stages, each adding
   * 12 dB/octave of rolloff (e.g. 'lowpass24' = two chained lowpass stages).
   */
  type: FilterType;
  frequency: number;
  /**
   * The quality factor of the filter, controlling the resonance peak.
   * Range: 0.5-20 (in practice)
   */
  q: number;
  envAmount: number;
  /**
   * Keyboard tracking amount. 0 = no tracking, 1 = full 1:1 tracking,
   * 2 = over-tracking. At 100%, a note one octave above the reference
   * (C4) doubles the filter cutoff relative to the base knob position.
   */
  tracking: number;
}
