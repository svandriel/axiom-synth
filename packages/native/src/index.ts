import { MoogOscillator } from './nodes/moog-oscillator';
import { getWasmModule } from './wasm-holder';
import workerUrl from './worker/worker?worker&url';

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

  createMoogOscillator(): MoogOscillator {
    return new MoogOscillator(this.ctxt, this.wasmModule);
  }
}
