# SawNode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) — every task is independently testable. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `SawNode` in `@axiom/audio-native`: a reusable main-thread class that loads the built saw worklet processor + the WASM oscillator bytecode, and exposes the ready gate (`whenReady`).

**Architecture:** A Vite library build bundles `src/processors/saw.ts` (+ wasm glue, wasm as sibling asset) into `dist/worklet/saw-processor.js`; `SawNode` (subclass of `AudioWorkletNode`, constructed via static `create`) resolves/fetches wasm bytes, `addModule`s the worklet, posts `INIT_WASM`, and resolves `whenReady()` on the worklet's `READY` message. Wasm-pack output (`pkg/`) and the Rust crate/tests are untouched.

**Tech Stack:** TS 6.0.3 (strict), Vue 3.5, Vite (repo-matched), Vitest (repo-matched), Rust 1.98 + wasm-pack + wasm-bindgen, audioworklet types.

## Global Constraints

From `2026-09-20-saw-node-design.md`:

- Processor rule: `src/processors/` contains ONLY `AudioWorkletProcessor` modules; everything else in `src/` is ordinary frontend TS. `worklet.d.ts` lives at package root (ambient worklet-scope typings, referenced by the processor tsc project only, never included by `tsconfig.app.json`).
- `@types/audioworklet@0.0.100` has no `AudioParamDescriptor` and no `parameterDescriptors` on `AudioWorkletProcessor`; TS 6.0.3 lib.dom/lib.webworker also lack `AudioParamDescriptor` → must not rely on it.
- Messages must post `READY` (init ok) / `ERROR` (init fail) back over the port; no console-error swallow on the worklet.
- `SawNode.create` normalizes `WasmSource` = `ArrayBuffer | URL | string`; default processor URL = `new URL('../../dist/worklet/saw-processor.js', import.meta.url)` in `src/worklet-url.ts`.
- No wasm-pack / Rust / `lib.rs` changes. Wasm source stays `wasm-bindgen` web-target glue in `pkg/`.
- Tests: Vitest with Node-global stubs (`vi.stubGlobal`) before dynamic import; `pkg` module aliased to a fixture (run without a wasm build). `cargo test` stays in suite.
- Package `exports` gains `"./worklet": "./dist/worklet/saw-processor.js"` so app integration can consume the bundle directly.

---

### Task 1: Scaffold Vitest + Vite worklet build in `@axiom/audio-native`

**Files:**

- Modify: `packages/axiom-native/package.json`
- Create: `packages/axiom-native/vite.config.ts`
- Modify: `packages/axiom-native/.gitignore` (ignore `dist/`)
- Modify: `packages/axiom-native/tsconfig.app.json`, `tsconfig.processor.json` (if needed for vitest file globbing)

**Interfaces:**

- Consumes: nothing (new tooling).
- Produces: `pnpm --filter @axiom/audio-native build:worklet` → `dist/worklet/saw-processor.js` + `axiom_native_bg.wasm` sibling. Scripts: `build`, `build:wasm`, `build:worklet`, `build:ts` as in the design doc.

- [ ] **Step 1:** Add Vitest + Vite devDependencies (repo-matched versions). Check the root/app `package.json` for exact engine-compatible versions first (`pnpm add -D vite vitest -w @axiom/audio-native`? No — add per-package: edit `packages/axiom-native/package.json` devDependencies).

Run: `pnpm install`.

- [ ] **Step 2:** Write `packages/axiom-native/vite.config.ts`:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/processors/saw.ts'),
      formats: ['es'],
    },
    outDir: 'dist/worklet',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
        entryFileNames: 'saw-processor.js',
      },
    },
    target: 'es2022',
  },
});
```

The wasm glue's `new URL('axiom_native_bg.wasm', import.meta.url)` is statically rewritten by Vite to the emitted sibling asset.

- [ ] **Step 3:** Add scripts to `packages/axiom-native/package.json`:

```json
{
  "build": "pnpm run build:wasm && pnpm run build:worklet && pnpm run build:ts",
  "build:wasm": "wasm-pack build ./rust --target web --out-dir ../pkg",
  "build:worklet": "vite build",
  "build:ts": "tsc -p tsconfig.app.json && tsc -p tsconfig.processor.json",
  "test": "vitest run && cargo test --manifest-path rust/Cargo.toml"
}
```

- [ ] **Step 4:** Add `dist/` to `packages/axiom-native/.gitignore`.

- [ ] **Step 5 (verify):** `pnpm --filter @axiom/audio-native run build:worklet` → assert `dist/worklet/saw-processor.js` and a `*.wasm` sibling exist.

- [ ] **Step 6:** Commit: `feat(native): scaffold vite worklet build`.

---

### Task 2: Message protocol — READY/ERROR extension

**Files:**

- Modify: `packages/axiom-native/src/worklet-message.ts`
- Modify: `packages/axiom-native/src/processors/saw.ts`

**Interfaces:**

- Consumes: existing `WorkletMessage` type.
- Produces: union grows with `{ type: 'READY' }` and `{ type: 'ERROR'; message: string }`. `SawProcessor` posts `READY` after wasm init success, `ERROR` after failure.

- [ ] **Step 1:** Extend the union in `src/worklet-message.ts`:

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

- [ ] **Step 2:** In `src/processors/saw.ts`, replace the error-swallow body:

- On wasm init success: `this.port.postMessage({ type: 'READY' })`.
- On init failure: `this.port.postMessage({ type: 'ERROR', message })` (replacing `console.error` swallow).

- [ ] **Step 3 (verify):** `pnpm --filter @axiom/audio-native run build:ts` passes; `pnpm --filter @axiom/audio-native test` still green (no saw-node tests yet).

- [ ] **Step 4:** Commit: `feat(native): emit READY/ERROR from saw processor`.

---

### Task 3: `SawNode` class (main thread)

**Files:**

- Create: `packages/axiom-native/src/saw-node.ts`
- Modify: `packages/axiom-native/src/index.ts` (export `SawNode` + drop legacy `createSawWorkletNode`)

**Interfaces:**

- Consumes: `WorkletMessage` union, `src/processors/saw.ts` default URL (via `src/worklet-url.ts`).
- Produces:
  - `type WasmSource = ArrayBuffer | URL | string`
  - `interface SawNodeOptions { frequency?: number; processorUrl?: string }`
  - `class SawNode extends AudioWorkletNode` with `static create(context, wasmSource, options?): Promise<SawNode>`, `readonly frequency: AudioParam` getter, `whenReady(): Promise<void>`.

- [ ] **Step 1:** Create `src/worklet-url.ts`:

```ts
export const defaultProcessorUrl: string | URL = new URL(
  '../../dist/worklet/saw-processor.js',
  import.meta.url,
);
```

- [ ] **Step 2:** Create `src/saw-node.ts`:

```ts
import type { WorkletMessage } from './worklet-message';
import { defaultProcessorUrl } from './worklet-url';

export type WasmSource = ArrayBuffer | URL | string;

export interface SawNodeOptions {
  frequency?: number;
  processorUrl?: string | URL;
}

type ReadyMessage = Extract<WorkletMessage, { type: 'READY' }>;
type ErrorMessage = Extract<WorkletMessage, { type: 'ERROR'; message: string }>;

export class SawNode extends AudioWorkletNode {
  readonly #whenReady: Promise<void>;

  private constructor(context: BaseAudioContext) {
    super(context, 'saw-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [2],
    });

    let resolveReady!: () => void;
    let rejectReady!: (err: Error) => void;
    this.#whenReady = new Promise<void>((res, rej) => {
      resolveReady = res;
      rejectReady = rej;
    });

    this.port.addEventListener('message', (ev: MessageEvent<WorkletMessage>) => {
      const msg = ev.data;
      if (msg?.type === 'READY') resolveReady();
      else if (msg?.type === 'ERROR') rejectReady(new Error(msg.message));
    });
    this.port.start();
  }

  static async create(
    context: BaseAudioContext,
    wasmSource: WasmSource,
    options: SawNodeOptions = {},
  ): Promise<SawNode> {
    const processorUrl = options.processorUrl ?? defaultProcessorUrl;
    await context.audioWorklet.addModule(processorUrl);

    const wasmBytes = await SawNode.#toBytes(wasmSource->);
    const node = new SawNode(context melt);
    const init: Extract<WorkletMessage, { type: 'INIT_WASM' }> = {
      type: 'INIT_WASM',
      wasmBytes,
      sampleRate: context.sampleRate,
      frequency: options.frequency,
    };
    node.port.postMessage(init);
    return node;
  }

  static #toBytes(src: WasmSource): Promise<ArrayBuffer> {
    if (src instanceof ArrayBuffer) return Promise.resolve(src);
    const url = src instanceof URL ? src : new URL(src);
    return fetch(url).then((r) => {
      if (!r.ok) throw new Error(`wasm fetch failed: ${r.status}`);
      return r.arrayBuffer();
    });
  }

  get frequency(): AudioParam {
    return this.parameters.get('frequency') as AudioParam;
  }

  whenReady(): Promise<void> {
    return this.#whenReady;
  }
}
```

> Implementation note (not checked): `AudioWorkletNode.parameters.get` may return `AudioParam | undefined` per `@types/audioworklet`/lib.dom; at runtime the `frequency` param always exists. Follow the compiler: type the getter to return `AudioParam`, cast via `!`/`as` only where strictly required.

- [ ] **Step 3:** Update `src/index.ts` to export `SawNode` (and remove `createSawWorkletNode` per "SawNode supersedes" in the design doc).

- [ ] **Step 4 (verify):** `pnpm --filter @axiom/audio-native run build:ts` passes (both projects).

- [ ] **Step 5:** Commit: `feat(native): add SawNode`.

---

### Task 4: SawNode + processor tests (Vitest, stubbed globals)

**Files:**

- Create: `packages/axiom-native/src/saw-node.test.ts`
- Create: `packages/axiom-native/src/processors/saw.test.ts`
- Create: `packages/axiom-native/test/fixtures/axiom_native.ts` (fake `SawOscillator`)
- Modify: `packages/axiom-native/vite.config.ts` or a `vitest.config.ts` (alias `./pkg/axiom_native` → fixture)

**Interfaces:**

- Consumes: `SawNode`, `SawProcessor`.
- Produces: passing `pnpm --filter @axiom/audio-native test` plus `cargo test`.

- [ ] **Step 1:** Write `test/fixtures/axiom_native.ts` — exports `init` (no-op async) + `SawOscillator` class with `new(sampleRate, frequency)`, `set_frequency(f)`, `process(buf)` that fills `buf` with a constant (e.g. `-1.0`), and a public `frequency` record for assertions.

- [ ] **Step 2:** `vitest.config.ts`:

```ts
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', globals: false },
  resolve: {
    alias: {
      './pkg/axiom_native': resolve(__dirname, 'test/fixtures/axiom_native.ts'),
    },
  },
});
```

- [ ] **Step 3:** Write `saw-node.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
```

Stubs via `vi.stubGlobal` (installed before dynamic import of the real modules):

- `AudioWorkletNode` — records constructor args, fake `port` (captures `postMessage`, holds an `onmessage` dispatcher).
- `BaseAudioContext`-shaped fixture — `audioWorklet.addModule` spy, `sampleRate`.
- `registerProcessor` / `AudioWorkletProcessor` — capture the processor class, provide `port` fixture.

Cases:

1. `create` resolves and calls `addModule` with the default/resolved processor URL; `SawNode.frequency` reflects `parameterData.frequency`.
2. `create` posts `INIT_WASM` with exact `wasmBytes`, `sampleRate`, `frequency`.
3. `create` with a `URL`/`string` wasm source fetches and posts the fetched bytes.
4. `whenReady()` resolves on a `READY` message, rejects on `ERROR`.
5. `SawProcessor`: on `INIT_WASM` runs init, constructs oscillator, posts `READY`; `process()` forwards `parameters.frequency` → `set_frequency` and fills left channel; `process` no-ops before wasm ready.

- [ ] **Step 4 (verify):** `pnpm --filter @axiom/audio-native test` → all pass, `cargo test` green.

- [ ] **Step 5:** Commit: `test(native): cover SawNode + saw processor`.

---

### Task 5: Docs + root test scope

**Files:**

- Modify: `docs/codebase/STRUCTURE.md`, `STACK.md`, `TESTING.md`, `CONVENTIONS.md`
- Modify: root `package.json` (extend `pnpm test` to the native suite) — confirm with user; CI already runs `pnpm test`

**Interfaces:**

- Consumes: final scripts + module paths.
- Produces: docs reflect new layout; root test command includes native.

- [ ] **Step 1:** Update docs to reflect `src/processors/saw.ts`, `SawNode`, `dist/worklet/`, new scripts, Vitest. (`STRUCTURE.md`/`STACK.md` path updates for the moved files are pending — apply the `src/processors/saw.ts` references there.)
- [ ] **Step 2:** If user approves root `pnpm test` change, update root `package.json` `test` script to run both suites.
- [ ] **Step 3 (verify):** `pnpm lint` and `pnpm test` (root, with the native package built first via `pnpm build` or the wasm+worklet artifact) pass.
- [ ] **Step 4:** Commit: `chore: document SawNode layout`.

---

## Self-Review

- **Spec coverage:** Worklet build (T1), message protocol (T2), SawNode class (T3), tests (T4), misc/docs + root test (T5) — all spec sections mapped. Rust/wasm-pack untouched (T1 step 3 script keeps `--target web`). ✅
- **No placeholders:** Step 2 of each build/tests task contains full code or concrete behavior; the one "Implementation note" flags a genuinely-unknown-at-write-time compiler detail rather than meat. All runs/URLs/names concrete. ✅
- **Type consistency:** `WasmSource`, `SawNodeOptions`, `WorkletMessage` variants, `SawProcessor` protocol names match the design doc's spec. `previousTask`-naming: `create`/`whenReady`/`frequency` consistent across T3/T4. ✅
- **Gap found:** `src/worklet-url.ts` was in the spec's "Public Modules" list but not explicitly owned by any task — moved into T3 Step 1 owner. ✅
