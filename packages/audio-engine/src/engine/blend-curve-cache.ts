const CURVE_SAMPLES = 1024;
const MAX_VOICES = 16;

const curves = new Map<string, Float32Array>();

export class BlendCurveCache {
  static curveFor(voiceCount: number, index: number): Float32Array {
    if (
      !Number.isInteger(voiceCount) ||
      voiceCount < 2 ||
      voiceCount > MAX_VOICES ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= voiceCount
    ) {
      throw new RangeError('Invalid blend curve voice role');
    }

    const key = `${voiceCount}:${index}`;
    const cachedCurve = curves.get(key);
    if (cachedCurve !== undefined) {
      return cachedCurve;
    }

    const curve = new Float32Array(CURVE_SAMPLES);
    const position = -1 + (2 * index) / (voiceCount - 1);
    const weight = 1 / (1 + Math.abs(position));

    for (let sampleIndex = 0; sampleIndex < CURVE_SAMPLES; sampleIndex++) {
      const blend = sampleIndex / 1023;
      const rawGain = weight + blend * (1 - weight);
      let totalPower = 0;

      for (let voiceIndex = 0; voiceIndex < voiceCount; voiceIndex++) {
        const voicePosition = -1 + (2 * voiceIndex) / (voiceCount - 1);
        const voiceWeight = 1 / (1 + Math.abs(voicePosition));
        const voiceRawGain = voiceWeight + blend * (1 - voiceWeight);
        totalPower += voiceRawGain * voiceRawGain;
      }

      curve[sampleIndex] = rawGain / Math.sqrt(totalPower);
    }

    curves.set(key, curve);
    return curve;
  }
}
