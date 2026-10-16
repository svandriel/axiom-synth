export interface WasmWorkletOptions extends AudioWorkletNodeOptions {
  processorOptions: {
    wasmModule: WebAssembly.Module;
  };
}
