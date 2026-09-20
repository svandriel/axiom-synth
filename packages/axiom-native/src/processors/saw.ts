// MUST stay the first import: ESM evaluates imports in source order, so this
// side-effect module defines `TextDecoder`/`TextEncoder` on the worklet scope
// before the wasm-bindgen glue below evaluates (`new TextDecoder` at its top
// level). Upstream context: https://github.com/rustwasm/wasm-bindgen/issues/2367.
// Reordering breaks the worklet (see text-encoding-polyfill.ts).
import './text-encoding-polyfill';
import init, { SawOscillator } from '../../pkg/axiom_native';
import type { WorkletMessage } from '../shared/worklet-message';

class SawProcessor extends AudioWorkletProcessor {
  private oscillator: SawOscillator | null = null;
  private isReady = false;

  static get parameterDescriptors(): AudioParamDescriptor[] {
    return [
      {
        name: 'frequency',
        defaultValue: 440,
        minValue: 0,
        maxValue: 20000,
        automationRate: 'a-rate',
      },
    ];
  }

  constructor() {
    super();

    this.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      const message = event.data;
      if (message?.type === 'INIT_WASM') {
        void this.initialize(message);
      }
    };
  }

  process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    if (!this.isReady || !this.oscillator) {
      return true;
    }

    const frequency = parameters['frequency']?.[0];
    if (frequency !== undefined) {
      this.oscillator.set_frequency(frequency);
    }

    const output = outputs[0];
    const channelLeft = output?.[0];
    if (channelLeft) {
      this.oscillator.process(channelLeft);

      const channelRight = output?.[1];
      if (channelRight) {
        channelRight.set(channelLeft);
      }
    }

    return true;
  }

  private async initialize(message: WorkletMessage): Promise<void> {
    try {
      await init(message.wasmBytes);
      this.oscillator = new SawOscillator(
        message.sampleRate,
        message.frequency ?? 440,
      );
      this.isReady = true;
    } catch (error) {
      console.error('Failed to initialize WASM oscillator', error);
    }
  }
}

registerProcessor('saw-processor', SawProcessor);
