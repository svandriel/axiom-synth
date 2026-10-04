import type { WorkletMessage } from './shared/worklet-message';
import workerUrl from './processors/saw?worker&url';
import wasmUrl from '../pkg/axiom_native_bg.wasm?url';
import { SawOscillatorNode } from './nodes/saw-node';

export async function initNativeModule(ctxt: AudioContext) {
  console.log('wasmUrl', wasmUrl);

  // Add worker
  await ctxt.audioWorklet.addModule(workerUrl);

  // Get WASM
  const wasmBytes = await (await fetch(wasmUrl)).arrayBuffer();

  return new NativeModule(ctxt, wasmBytes);
}

export class NativeModule {
  private readonly ctxt: AudioContext;
  private readonly wasmBytes: ArrayBuffer;

  constructor(ctxt: AudioContext, wasmBytes: ArrayBuffer) {
    this.ctxt = ctxt;
    this.wasmBytes = wasmBytes;
  }

  createSawOscillator(): SawOscillatorNode {
    return new SawOscillatorNode(this.ctxt, this.wasmBytes);
  }
}

export interface SawWorkletOptions {
  frequency: number;
}

const defaultWorkletOptions: SawWorkletOptions = {
  frequency: 440,
};

export async function createSawWorkletNode(
  context: BaseAudioContext,
  options: Partial<SawWorkletOptions> = {},
): Promise<AudioWorkletNode> {
  console.log('workerUrl', workerUrl);
  console.log('wasmUrl', wasmUrl);
  await context.audioWorklet.addModule(workerUrl);

  const wasmBytes = await (await fetch(wasmUrl)).arrayBuffer();
  const opts: SawWorkletOptions = {
    ...defaultWorkletOptions,
    ...options,
  };

  const message: WorkletMessage = {
    type: 'INIT_WASM',
    wasmBytes,
    sampleRate: context.sampleRate,
    frequency: options?.frequency,
  };

  const node = new AudioWorkletNode(context, 'saw-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    parameterData: { frequency: opts.frequency },
  });
  node.port.postMessage(message);

  return node;
}
