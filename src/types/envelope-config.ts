export interface EnvelopeConfig {
  attackSeconds: number;
  attackCurve: EnvelopeCurve;
  decaySeconds: number;
  decayCurve: EnvelopeCurve;
  sustainLevel: number;
  releaseSeconds: number;
  releaseCurve: EnvelopeCurve;
}
export type EnvelopeCurve = 'linear' | 'exponential' | 'analog';
