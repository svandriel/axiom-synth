# Shared Native WASM Instance — Design

Date: 2026-10-13
Status: Approved

## Problem

`MoogOscillatorProcessor` calls `initializeMainModule` in its constructor. That
function invokes the Emscripten `Module()` factory, which instantiates a fresh
`WebAssembly.Instance` with its own linear memory. The native module is built
with `-sSHARED_MEMORY=1`, so each instance reserves a fixed **16.125 MiB**
`SharedArrayBuffer`.

The synth creates one native oscillator per unison voice:

```
voices (16) × oscillator indices (3) × unison voices (1–16)
```

Each oscillator becomes its own `AudioWorkletNode` and therefore its own
processor and its own WASM instance. A modest patch reaches dozens of
instances; a high unison count reaches hundreds. At 16 MiB each, the browser
runs out of address space and instantiation fails:

```
RangeError: WebAssembly.instantiate(): Out of memory: Cannot allocate
Wasm memory for new instance
```

## Fix

Instantiate the native module **once per `AudioWorkletGlobalScope`** and share
the resulting `MainModule` across every processor. Each processor still creates
its own oscillator handle and buffers inside the shared instance.

## Why sharing is safe

- Every processor for one `AudioContext` runs in the same
  `AudioWorkletGlobalScope`, on one audio thread, with serialized `process()`
  calls. A single heap cannot be accessed concurrently.
- The C API is handle-based: `moog_saw_wasm_create` returns an opaque
  `MoogSaw *`, and `moog_saw_wasm_process` operates on that handle. One
  instance is meant to host many oscillators.
- Exactly one compiled native module exists per scope. `getWasmModule()`
  memoizes compilation on the main thread, and each `AudioContext` loads one
  worker URL.

## Change

One file: `packages/native/src/worker/initiate-module.ts`.

```ts
import Module, { type MainModule } from '../../c/dist/wasm/moog_saw';

let mainModulePromise: Promise<MainModule> | undefined;

export function initializeMainModule(
  wasmModule: WebAssembly.Module,
): Promise<MainModule> {
  mainModulePromise ??= createMainModule(wasmModule);
  return mainModulePromise;
}

function createMainModule(wasmModule: WebAssembly.Module): Promise<MainModule> {
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
        .catch(error => {
          console.error('Failed to instantiate WebAssembly module', error);
        });
      return {};
    },
  });
}
```

`initializeMainModule` keeps its signature and return type. `createMainModule`
holds the current body.

The memo is deliberately **not** keyed by `wasmModule`. A `WebAssembly.Module`
sent through `processorOptions` is structured-cloned per `AudioWorkletNode`
construction, and cloned module objects are not `===` to each other. Identity
keying would therefore miss on every processor and defeat the fix. There is one
module per scope, so a single memo is correct.

No changes to `moog-oscillator-processor.ts`, the C sources, the `Makefile`, the
worklet node, shared types, or any build flag. `destroyResources()` already
frees only the processor's own handle and three buffers, then drops its local
`mainModule` reference; the shared instance survives in the module scope.

## Data flow

1. The first processor awaits `initializeMainModule`; the factory runs once and
   the runtime initializes.
2. The resolved `MainModule` (including `HEAPF32`) is cached in
   `mainModulePromise`.
3. Every later processor reuses the same promise and instance, calls
   `_moog_saw_wasm_create(sampleRate)` for its own handle, and `_malloc`s its
   own frequency, detune, and output buffers.
4. On destroy, a processor frees its own handle and buffers. The shared
   instance stays alive for the lifetime of the worklet scope.

## Error handling

Unchanged. A failed `WebAssembly.instantiate` is logged through `console.error`.
Emscripten's `Module()` promise has no reject path, so the cached promise never
settles; a failed runtime init is fatal either way. This matches the current
behavior.

## Testing

New `packages/native/src/worker/initiate-module.test.ts`:

- Mock the default export of `../../c/dist/wasm/moog_saw` with a factory spy.
- Assert the factory runs exactly once and repeated `initializeMainModule`
  calls return the same `MainModule`.
- Use `vi.resetModules()` plus dynamic import per test so the module-scope memo
  starts clean.

Existing processor tests stay as they are. They assert per-processor
`_moog_saw_wasm_create` / `_malloc` / `_free` counts, which sharing does not
change.

Gates: `pnpm test`, `pnpm build`, `pnpm lint`.

## Out of scope (YAGNI)

- Build-flag changes (`SHARED_MEMORY`, `INITIAL_MEMORY`, memory growth).
- Removing `wasmModule` from `processorOptions`.
- Pooling or reusing oscillator handles.
- Supporting more than one native module per worklet scope.
