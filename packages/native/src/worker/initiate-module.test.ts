import { beforeEach, describe, expect, it, vi } from 'vitest';

const instantiateWasmModule = vi.hoisted(() =>
  vi.fn(async () => ({
    marker: 'main-module',
    _moog_oscillator_wasm_init: vi.fn(),
  })),
);

vi.mock('../../c/dist/wasm/moog_oscillator', () => ({
  default: instantiateWasmModule,
}));

describe('initializeMainModule', () => {
  beforeEach(() => {
    vi.resetModules();
    instantiateWasmModule.mockClear();
  });

  it('instantiates the wasm module exactly once and shares the result', async () => {
    const { initializeMainModule } = await import('./initiate-module');
    const wasmModule = {} as WebAssembly.Module;

    const first = await initializeMainModule(wasmModule);
    const second = await initializeMainModule(wasmModule);

    expect(instantiateWasmModule).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first._moog_oscillator_wasm_init).toHaveBeenCalledOnce();
  });

  it('supplies an instantiateWasm hook to the Emscripten factory', async () => {
    const { initializeMainModule } = await import('./initiate-module');

    await initializeMainModule({} as WebAssembly.Module);

    const options = instantiateWasmModule.mock.calls[0]?.[0] as {
      instantiateWasm?: unknown;
    };
    expect(typeof options.instantiateWasm).toBe('function');
  });
});
