export * from './nodes/saw-oscillator-node';
import { SawOscillatorNode } from './nodes/saw-oscillator-node';
import workerUrl from './worker/worker?worker&url';
import { getWasmModule } from './wasm-holder';

export async function initNativeModule(ctxt: AudioContext) {
  await ctxt.audioWorklet.addModule(workerUrl);

  const wasmModule = await getWasmModule();

  return new NativeModule(ctxt, wasmModule);
}

export class NativeModule {
  private readonly ctxt: AudioContext;
  private readonly wasmModule: WebAssembly.Module;

  constructor(ctxt: AudioContext, wasmModule: WebAssembly.Module) {
    this.ctxt = ctxt;
    this.wasmModule = wasmModule;
  }

  createSawOscillator(): SawOscillatorNode {
    return new SawOscillatorNode(this.ctxt, this.wasmModule);
  }
}
