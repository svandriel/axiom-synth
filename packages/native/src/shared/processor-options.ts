export interface SawProcessorOptions extends AudioWorkletNodeOptions {
  processorOptions: {
    wasmModule: WebAssembly.Module;
  };
}
