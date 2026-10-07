export * from './nodes/saw-worklet';
import { SawOscillatorNode } from './nodes/saw-worklet';
import workerUrl from './processors/saw-processor?worker&url';

export async function initNativeModule(ctxt: AudioContext) {
  await ctxt.audioWorklet.addModule(workerUrl);

  return new NativeModule(ctxt);
}

export class NativeModule {
  private readonly ctxt: AudioContext;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;
  }

  createSawOscillator(): SawOscillatorNode {
    return new SawOscillatorNode(this.ctxt);
  }
}
