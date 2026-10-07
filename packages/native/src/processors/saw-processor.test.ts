import { describe, expect, it, vi } from 'vitest';

class FakeAudioWorkletProcessor {}

Object.assign(globalThis, {
  AudioWorkletProcessor: FakeAudioWorkletProcessor,
  sampleRate: 4,
  registerProcessor: vi.fn(),
});

const { SawProcessor } = await import('./saw-processor');

describe('SawProcessor', () => {
  it('registers the processor', () => {
    expect(globalThis.registerProcessor).toHaveBeenCalledWith(
      'saw-processor',
      expect.any(Function),
    );
  });
  it('exposes frequency as an a-rate parameter', () => {
    expect(SawProcessor.parameterDescriptors).toEqual([
      {
        automationRate: 'a-rate',
        defaultValue: 440,
        minValue: 0,
        name: 'frequency',
      },
    ]);
  });

  it('generates a bipolar saw wave from the per-sample frequency', () => {
    const processor = new SawProcessor();
    const output = new Float32Array(4);
    const process = processor.process.bind(processor) as (
      inputs: Float32Array[][],
      outputs: Float32Array[][],
      parameters: Record<string, Float32Array>,
    ) => boolean;
    const keepAlive = process([], [[output]], {
      frequency: new Float32Array([1, 1, 1, 1]),
    });

    expect(Array.from(output)).toEqual([-1, -0.5, 0, 0.5]);
    expect(keepAlive).toBe(true);
  });
});
