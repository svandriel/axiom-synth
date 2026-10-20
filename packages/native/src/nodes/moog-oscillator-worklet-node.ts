import type { WasmWorkletOptions } from '../shared/wasm-worklet-options';
import type {
  WorkletDestroyMessage,
  WorkletMessage,
} from '../shared/worklet-messages';

export interface MoogOscillatorOptions {
  // empty for now
}

export class MoogOscillatorWorkletNode {
  private readonly node: AudioWorkletNode;
  private destroyed = false;
  private started = false;
  private stopped = false;
  private ended = false;
  onended: (() => void) | null = null;

  constructor(
    ctxt: AudioContext,
    wasmModule: WebAssembly.Module,
    _options: Partial<MoogOscillatorOptions> = {},
  ) {
    this.node = new AudioWorkletNode(ctxt, 'moog-oscillator-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {},
      processorOptions: {
        wasmModule,
      },
    } satisfies WasmWorkletOptions);

    this.node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      switch (event.data.type) {
        case 'REPORT_RENDER_TIME':
          const sampleRate = ctxt.sampleRate;
          const blockSize = 128;
          const blockSizeMs = (blockSize / sampleRate) * 1_000;
          const speed = blockSizeMs / event.data.renderTimeMs;
          console.log(
            `Average render time: ${Math.round(event.data.renderTimeMs * 1000)} μs (${Math.round(speed)}x real-time)`,
          );
          break;
        case 'ENDED':
          if (!this.ended) {
            this.ended = true;
            console.log('Moog oscillator worklet node ended');
            this.onended?.();
          }
          break;
        default:
          console.warn(`Unrecognized message: ${event.data.type}`);
      }
    };
  }

  get frequency(): AudioParam {
    return this.node.parameters.get('frequency')!;
  }

  get detune(): AudioParam {
    return this.node.parameters.get('detune')!;
  }

  get waveform(): AudioParam {
    return this.node.parameters.get('waveform')!;
  }

  connect(destination: AudioNode): void;
  connect(destination: AudioParam): void;
  connect(destination: AudioParam | AudioNode): void {
    this.node.connect(destination as AudioNode);
  }

  disconnect(): void;
  disconnect(destination: AudioNode): void;
  disconnect(destination: AudioParam): void;
  disconnect(destination?: null | AudioNode | AudioParam): void {
    if (destination === undefined || destination === null) {
      this.node.disconnect();
    } else {
      this.node.disconnect(destination as AudioNode);
    }
  }

  start(when: number): void {
    if (this.started || this.destroyed) {
      return;
    }
    this.started = true;
    this.node.port.postMessage({
      type: 'START',
      when,
    } satisfies WorkletMessage);
  }

  stop(when: number): void {
    if (this.stopped || this.destroyed) {
      return;
    }
    this.stopped = true;
    this.node.port.postMessage({
      type: 'STOP',
      when,
    } satisfies WorkletMessage);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.node.port.postMessage({
      type: 'DESTROY',
    } satisfies WorkletDestroyMessage);
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.onended = null;
  }
}
