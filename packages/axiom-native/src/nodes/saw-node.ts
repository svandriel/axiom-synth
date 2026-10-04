import type { WorkletMessage } from '../shared/worklet-message';

export interface SawOscillatorOptions {
  frequency: number;
}
export class SawOscillatorNode {
  private readonly node: AudioWorkletNode;

  constructor(
    ctxt: AudioContext,
    wasmBytes: ArrayBuffer,
    options: Partial<SawOscillatorOptions> = {},
  ) {
    const message: WorkletMessage = {
      type: 'INIT_WASM',
      wasmBytes,
      sampleRate: ctxt.sampleRate,
      frequency: options?.frequency,
    };

    this.node = new AudioWorkletNode(ctxt, 'saw-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
      parameterData: { frequency: options?.frequency ?? 440 },
    });
    this.node.port.postMessage(message);
  }

  // get frequency(): AudioParam {

  // }
  connect(destination: AudioNode): void;
  connect(destination: AudioParam): void;
  connect(destination: AudioParam | AudioNode): void {
    if (destination instanceof AudioNode) {
      this.node.connect(destination);
    } else {
      this.node.connect(destination);
    }
  }
}
