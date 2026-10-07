const PHASE_LENGTH = 1;
const SAW_MINIMUM = -1;
const SAW_RANGE = 2;

export class SawProcessor extends AudioWorkletProcessor {
  private phase = 0;

  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        automationRate: 'a-rate',
        defaultValue: 0,
        minValue: 0,
        name: 'frequency',
      },
    ];
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    const output = outputs[0]?.[0];

    if (!output) {
      return true;
    }

    const frequencyValues = parameters.frequency;

    for (let sampleIndex = 0; sampleIndex < output.length; sampleIndex++) {
      const frequency =
        frequencyValues?.[sampleIndex] ?? frequencyValues?.[0] ?? 0;

      output[sampleIndex] = SAW_MINIMUM + SAW_RANGE * this.phase;
      this.phase = (this.phase + frequency / sampleRate) % PHASE_LENGTH;
    }

    return true;
  }
}

registerProcessor('saw-processor', SawProcessor);
