import wasmUrl from '../c/dist/wasm/moog_saw.wasm?url';

export type LoadingState = 'idle' | 'pending' | 'success' | 'error';

export const getWasmModule = once(loadWasm);

async function loadWasm(): Promise<WebAssembly.Module> {
  const response = fetch(wasmUrl);
  return WebAssembly.compileStreaming(response);
}

function once<T>(fn: () => Promise<T>): () => Promise<T> {
  let resolved: Promise<T> | null = null;

  return () => {
    if (resolved === null) {
      resolved = fn();
    }
    return resolved;
  };
}
