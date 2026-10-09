import Module, { type MainModule } from '../../c/dist/wasm/moog_saw';

export async function initializeMainModule(
  wasmModule: WebAssembly.Module,
): Promise<MainModule> {
  return Module({
    instantiateWasm(
      imports: WebAssembly.Imports,
      successCallback: (
        instance: WebAssembly.Instance,
        module: WebAssembly.Module,
      ) => WebAssembly.Instance,
    ) {
      WebAssembly.instantiate(wasmModule, imports)
        .then(instance => successCallback(instance, wasmModule))
        .catch(err => {
          console.error('Failed to instantiate WebAssembly module', err);
        });
      return {};
    },
  });
}
