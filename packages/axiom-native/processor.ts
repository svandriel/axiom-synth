import init, { SawOscillator } from './pkg/axiom_native';

interface InitMessage {
  type: 'INIT_WASM';
  wasmBytes: ArrayBuffer;
  sampleRate: number;
  frequency?: number;
}

type WorkletMessage = InitMessage;

class SawProcessor extends AudioWorkletProcessor {
  private oscillator: SawOscillator | null = null;
  private isReady: boolean = false;

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

    this.port.onmessage = async (event: MessageEvent<WorkletMessage>) => {
      if (event.data.type === 'INIT_WASM') {
        const { wasmBytes, sampleRate, frequency } = event.data;

        // Initialize WASM inside the Worklet thread scope
        await init(wasmBytes);
        this.oscillator = new SawOscillator(sampleRate, frequency || 440);
        this.isReady = true;
      }
    };
  }

  override process(
    _inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean {
    if (!this.isReady || !this.oscillator) {
      return true;
    }

    const output = outputs[0];
    const channelLeft = output[0];
    const freqParam = parameters['frequency'];

    if (channelLeft) {
      // Pass the audio buffer and frequency AudioParam array to Rust WASM
      this.oscillator.process(channelLeft, freqParam);

      // Mirror left to right channel for stereo
      if (output.length > 1) {
        output[1].set(channelLeft);
      }
    }

    return true;
  }
}

registerProcessor('saw-processor', SawProcessor);
