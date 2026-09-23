export type WorkletMessage = {
  type: 'INIT_WASM';
  wasmBytes: ArrayBuffer;
  sampleRate: number;
  frequency?: number;
};
