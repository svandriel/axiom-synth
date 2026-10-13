# Shared Native WASM Instance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instantiate the native Emscripten WASM module once per `AudioWorkletGlobalScope` instead of once per oscillator, eliminating the out-of-memory crash.

**Architecture:** Memoize the Emscripten `Module()` factory in `packages/native/src/worker/initiate-module.ts` behind a module-scope promise. Every `AudioWorkletProcessor` in the scope shares the single `MainModule` and its heap; each processor still creates and frees only its own oscillator handle and buffers.

**Tech Stack:** TypeScript, Vitest, Emscripten-generated ES module (`packages/native/c/dist/wasm/moog_saw.js`), Web Audio `AudioWorklet`.

## Global Constraints

- One file changes: `packages/native/src/worker/initiate-module.ts`. Do not touch `moog-oscillator-processor.ts`, `saw-processor.ts`, the C sources, the `Makefile`, shared types, or build flags.
- `initializeMainModule(wasmModule: WebAssembly.Module): Promise<MainModule>` keeps its exact signature and return type.
- The memo is **not** keyed by `wasmModule`: structured-cloned `WebAssembly.Module` objects are not `===` across processor constructions. One native module per worklet scope is the documented assumption.
- No magic numbers, no comments unless required by the existing style. TypeScript strict mode is on.
- Follow repo conventions: Prettier formatting (`pnpm lint` = `prettier --check .`), tests beside the module under test named `<module>.test.ts`.
- Current branch is `feature/native`. Never commit to `main`.

---

### Task 1: Share the native WASM instance

**Files:**

- Create: `packages/native/src/worker/initiate-module.test.ts`
- Modify: `packages/native/src/worker/initiate-module.ts`

**Interfaces:**

- Consumes: the default export `Module` from `../../c/dist/wasm/moog_saw`, typed `(options?: unknown) => Promise<MainModule>`.
- Produces: `initializeMainModule(wasmModule: WebAssembly.Module): Promise<MainModule>` — unchanged public signature, now returning one shared promise per module scope.

- [ ] **Step 1: Write the failing test**

Create `packages/native/src/worker/initiate-module.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const instantiateWasmModule = vi.hoisted(() =>
  vi.fn(async () => ({ marker: 'main-module' })),
);

vi.mock('../../c/dist/wasm/moog_saw', () => ({
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @axiom/native exec vitest run src/worker/initiate-module.test.ts`

Expected: FAIL on the first test with `expected "vi.fn()" to be called 1 times, but got 2 times`, because the current `initializeMainModule` calls the factory on every invocation.

- [ ] **Step 3: Write the minimal implementation**

Replace the full contents of `packages/native/src/worker/initiate-module.ts` with:

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
        .catch(err => {
          console.error('Failed to instantiate WebAssembly module', err);
        });
      return {};
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @axiom/native exec vitest run src/worker/initiate-module.test.ts`

Expected: PASS — 2 tests passing.

- [ ] **Step 5: Run the native package JS tests to confirm no regressions**

Run: `pnpm --filter @axiom/native test:js`

Expected: PASS — all existing worker and node tests still pass. In particular `moog-oscillator-processor.test.ts` keeps asserting per-processor `_moog_saw_wasm_create` / `_malloc` / `_free` counts, which sharing does not change.

- [ ] **Step 6: Commit**

```bash
git add packages/native/src/worker/initiate-module.ts packages/native/src/worker/initiate-module.test.ts
git commit -m "fix: instantiate native wasm module once per worklet scope"
```

---

### Task 2: Repo-wide verification

**Files:**

- No file changes.

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`

Expected: PASS — JavaScript package tests and native C tests.

- [ ] **Step 2: Run lint**

Run: `pnpm lint`

Expected: PASS — `prettier --check .` reports no issues.

- [ ] **Step 3: Run the build (requires Emscripten)**

Run: `pnpm build`

Expected: PASS. This compiles the native WebAssembly module and typechecks the workspace. It needs `emcc` on `PATH` (Emscripten SDK `6.0.12`, matching CI). If `emcc` is unavailable, note it and rely on the CI build.

---

## Self-Review

**Spec coverage:**

- "Instantiate once per `AudioWorkletGlobalScope` and share" → Task 1 Step 3 memo.
- "Keep `initializeMainModule` signature" → Task 1 Interfaces / Step 3.
- "No changes to processor, C, Makefile, node, types, build flags" → Global Constraints.
- "Unit test asserting the factory runs exactly once" → Task 1 Steps 1–4.
- "Existing processor tests unchanged" → Task 1 Step 5.
- "Gates: `pnpm test`, `pnpm build`, `pnpm lint`" → Task 2.

**Placeholder scan:** No TBD/TODO; every code and command step is complete.

**Type consistency:** `initializeMainModule(wasmModule: WebAssembly.Module): Promise<MainModule>` is used identically in the test, the implementation, and the existing callers (`moog-oscillator-processor.ts:72`, `saw-processor.ts:62`). `createMainModule` returns the factory's `Promise<MainModule>`.
