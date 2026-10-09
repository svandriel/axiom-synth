import type { SawProcessorOptions } from '../shared/processor-options';
import type {
  WorkletDestroyMessage,
  WorkletMessage,
} from '../shared/worklet-messages';

export interface SawOscillatorOptions {
  // empty for now
}
export class SawOscillatorNode {
  private readonly node: AudioWorkletNode;
  private destroyed = false;

  constructor(
    ctxt: AudioContext,
    wasmModule: WebAssembly.Module,
    _options: Partial<SawOscillatorOptions> = {},
  ) {
    this.node = new AudioWorkletNode(ctxt, 'saw-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {},
      processorOptions: {
        wasmModule,
      },
    } satisfies SawProcessorOptions);

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
        default:
          console.warn(`Unrecognized message: ${event.data.type}`);
      }
    };
  }

  get frequency(): AudioParam {
    return this.node.parameters.get('frequency')!;
  }

  connect(destination: AudioNode): void;
  connect(destination: AudioParam): void;
  connect(destination: AudioParam | AudioNode): void {
    this.node.connect(destination as AudioNode);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.node.port.postMessage({
      type: 'DESTROY',
    } satisfies WorkletDestroyMessage);
    this.node.disconnect();
  }
}
