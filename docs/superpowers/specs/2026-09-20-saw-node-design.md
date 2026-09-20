# SawNode Design

## Goal

Add a `SawNode` to `@axiom/audio-native` that wraps the initial
`AudioWorkletNode` usage into a reusable, main-thread-friendly class. `SawNode`
loads the worklet processor module and the Rust/WASM oscillator bytecode, then
exposes a real `AudioWorkletNode` ready for connection.

`SawNode` supersedes the initial `createSawWorkletNode` factory in
`packages/axiom-native/src/index.ts`.

## Architecture

`@axiom/audio-native` gains:

1. `src/saw-node.ts` — the `SawNode` class.
2. `src/worklet-url.ts` — default processor URL resolution helper.
3. `vite.config.ts` — library-mode worklet bundle build.
4. `vitest` devDependency + tests that stub Web Audio globals.
5. Message protocol extension in `src/worklet-message.ts`.

The package ships two artifacts:

- `pkg/` — wasm-pack output (`axiom_native.js` glue + `axiom_native_bg.wasm`
  - generated `.d.ts`). Rust DSP unchanged.
- `dist/worklet/processor.js` — self-contained worklet bundle built by Vite
  from `processor.ts` + the wasm glue, with the wasm emitted as a sibling
  asset and referenced via a rewritten `new URL('axiom_native_bg.wasm',
import.meta.url)`.

Main thread always goes through `SawNode.create`; the standard code path is
`addModule` (built bundle) → construct node → post `INIT_WASM`.

## Public Modules

```ts
export type WasmSource = ArrayBuffer | URL | string;

export interface SawNodeOptions {
  frequency?: number;
  processorUrl?: string; // overrides the package default build URL
}

export class SawNode extends AudioWorkletNode {
  static async create(
    context: BaseAudioContext,
    wasmSource: WasmSource,
    options?: SawNodeOptions,
  ): Promise<SawNode>;

  get frequency(): AudioParam; // parameters.get('frequency')

  whenReady(): Promise<void>; // resolves on READY, rejects on ERROR
}

export const defaultProcessorUrl: string | URL;
```

`create` flow:

1. Resolve `processorUrl` = `options.processorUrl ?? defaultProcessorUrl`.
2. `await context.audioWorklet.addModule(processorUrl)`.
3. Normalize `wasmSource`: `ArrayBuffer` passes through; `URL`/`string` is
   fetched internally into `ArrayBuffer` (rejects on fetch failure).
4. `new SawNode(context)` with `{ numberOfInputs: 0, numberOfOutputs: 1,
outputChannelCount: [2], parameterData: { frequency } }`.
5. `postMessage` `INIT_WASM` with `wasmBytes`, `sampleRate`, `frequency`.

The node produces audio immediately once the worklet finishes wasm init; the
sound start can be gated by `whenReady()` when callers need it.

## Message Protocol

`worklet-message.ts` union grows:

```ts
export type WorkletMessage =
  | {
      type: 'INIT_WASM';
      wasmBytes: ArrayBuffer;
      sampleRate: number;
      frequency?: number;
    }
  | { type: 'READY' }
  | { type: 'ERROR'; message: string };
```

`processor.ts` changes:

- On wasm init success: `this.port.postMessage({ type: 'READY' })`.
- On init failure: `this.port.postMessage({ type: 'ERROR', message })`
  (replaces the current `console.error` swallow).

`SawNode` wires a port `message` handler in its constructor:

- `READY` → resolve the pending ready promise.
- `ERROR` → reject the pending ready promise.

## Worklet Build

`src/processors/saw.ts` is the worklet-only module; everything else in `src/`
is ordinary frontend TS. The rule: `src/processors/` holds only
`AudioWorkletProcessor` modules.

Native `package.json` scripts become:

```json
{
  "build": "pnpm run build:wasm && pnpm run build:worklet && pnpm run build:ts",
  "build:wasm": "wasm-pack build ./rust --target web --out-dir ../pkg",
  "build:worklet": "vite build",
  "build:ts": "tsc -p tsconfig.app.json && tsc -p tsconfig.processor.json"
}
```

`exports` gains `"./worklet": "./dist/worklet/saw-processor.js"` for consumers
who want the bundle directly (future app integration).

`vite.config.ts`:

- `build.lib` entry: `src/processors/saw.ts`, `formats: ['es']`.
- `rollupOptions.output` `inlineDynamicImports: true`, entryFileNames
  `worklet/saw-processor.js`.
- The wasm-pack glue's default wasm URL (`new URL('axiom_native_bg.wasm',
import.meta.url)`) is statically rewritten by Vite into the emitted sibling
  asset, so the bundle stays self-consistent for the AudioWorklet scope.
- No wasm-pack changes; the Rust crate and `lib.rs` tests are untouched.

`src/worklet-url.ts`:

```ts
export const defaultProcessorUrl: string | URL = new URL(
  '../../dist/worklet/saw-processor.js',
  import.meta.url,
);
```

In dev, that resolves to the on-disk file served by Vite; in production builds
Vite statically rewrites the `new URL(...)` to the emitted asset when the
package is consumed as source.

## Error Handling

- `addModule` rejection propagates out of `create`.
- wasm `fetch`/`arrayBuffer` rejection propagates out of `create`.
- Worklet-side init failures surface as an `ERROR` message and reject
  `whenReady()`. Silent failures are no longer masked by `console.error`.

## Testing

Add Vitest to `@axiom/audio-native` (repo-matched version) with
`"test": "vitest run && cargo test --manifest-path rust/Cargo.toml"`.
Root `pnpm test` becomes engine + native suites. CI already runs `pnpm test`
so no workflow change is required.

Node-global stubs are installed with `vi.stubGlobal` before dynamic import of
the real modules:

- `AudioWorkletNode` — records constructor args, exposes a fake `port`
  (captures `postMessage`, holds an `onmessage` dispatcher).
- `BaseAudioContext`-shaped fixture — `audioWorklet.addModule` spy,
  `sampleRate`.
- `registerProcessor` / `AudioWorkletProcessor` — capture the processor class
  and provide a `port` fixture.
- `pkg/axiom_native` aliased (Vitest `resolve.alias`) to a fixture module whose
  `init` builds a fake `SawOscillator` spy; tests run without a wasm build.

Cases:

- `create` resolves and calls `addModule` with the default/resolved processor
  URL; `SawNode.frequency` reflects `parameterData.frequency`.
- `create` posts `INIT_WASM` with the exact `wasmBytes`, `sampleRate`,
  `frequency`.
- `create` with a `URL`/`string` wasm source fetches and posts the fetched
  bytes.
- `whenReady()` resolves on a `READY` message and rejects on `ERROR`.
- processor: on `INIT_WASM` it runs init, constructs the oscillator, and posts
  `READY`; `process()` forwards `parameters.frequency` via `set_frequency` and
  renders the left channel; `process` no-ops before wasm ready.

## Distribution / Docs

- `STRUCTURE.md`: document `dist/worklet` artifact, new scripts, Vitest.
- `STACK.md`: note Vite worklet build in `@axiom/audio-native`.
- `CONVENTIONS.md`: document the pkg alias test fixture pattern if not present.
- `TESTING.md`: note native JS tests and the root `pnpm test` scope change.
