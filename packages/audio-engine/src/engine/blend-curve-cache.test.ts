import { describe, expect, it } from 'vitest';

import { BlendCurveCache } from './blend-curve-cache';

const CURVE_SAMPLES = 1024;

describe('BlendCurveCache', () => {
  it('returns cached data for repeated voice role lookup', () => {
    expect(BlendCurveCache.curveFor(5, 2)).toBe(BlendCurveCache.curveFor(5, 2));
  });

  it.each([
    [1, 0],
    [17, 0],
    [3, -1],
    [3, 3],
  ])('rejects invalid role (%i, %i)', (voices, index) => {
    expect(() => BlendCurveCache.curveFor(voices, index)).toThrow(RangeError);
  });

  it('matches the blend equation at the first, midpoint, and last samples', () => {
    const curve = BlendCurveCache.curveFor(3, 1);

    for (const sampleIndex of [0, 512, CURVE_SAMPLES - 1]) {
      const blend = sampleIndex / (CURVE_SAMPLES - 1);
      const rolePosition = 0;
      const roleWeight = 1 / (1 + Math.abs(rolePosition));
      const rawGain = roleWeight + blend * (1 - roleWeight);
      const totalPower = [-1, 0, 1].reduce((sum, position) => {
        const weight = 1 / (1 + Math.abs(position));
        const gain = weight + blend * (1 - weight);
        return sum + gain * gain;
      }, 0);

      expect(curve[sampleIndex]).toBeCloseTo(
        rawGain / Math.sqrt(totalPower),
        5,
      );
    }
  });
});
