export interface FilterConfig {
  frequency: number;
  /**
   * The quality factor of the filter, controlling the resonance peak.
   * Range: 0.5-20 (in practice)
   */
  q: number;
  envAmount: number;
}
