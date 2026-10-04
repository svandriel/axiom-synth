import wasmUrl from '../pkg/axiom_native_bg.wasm?url';

export type LoadingState = 'idle' | 'pending' | 'success' | 'error';

let wasmBytes: ArrayBuffer | null = null;
let state: LoadingState = 'idle';

export async function getWasmBytes() {
  if (wasmBytes) {
    return wasmBytes;
  }
  if (state === 'pending' || state === 'success') {
    return;
  }
  wasmBytes = await (await fetch(wasmUrl)).arrayBuffer();
}
