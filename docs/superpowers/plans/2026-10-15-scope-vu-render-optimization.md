# Scope/VU Render Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the idle CPU spent by the `ScopePanel` and `VUMeter` canvas `requestAnimationFrame` loops by suspending them while the audio engine is silent and by making each active frame cheaper.

**Architecture:** The engine already knows when it is silent — its `IdleGate` (task `#61`) closes a valve and sleeps the FX island. Expose that state as an `Observable<boolean>` on the engine, bridge it into Vue with a generic `useObservable` composable, and drive both canvases through one shared `useCanvasRender` governor that cancels its rAF loop while paused and fits the canvas on mount/resize only. Active-frame cost is reduced incrementally (30 fps, no `shadowBlur`, DPR cap, reused gradients), measuring after each change.

**Tech Stack:** TypeScript, Vue 3.5 `<script setup>`, Vite, Vitest (audio-engine only), Prettier.

## Global Constraints

- Branch: work on `perf/scope-vu-render-optimization` (already created, stacked on `fix/idle-cpu-fx-voice-gating`). Never commit to `main`.
- No magic numbers: every meaningful literal becomes a named, exported constant.
- `@axiom/app` has **no test setup** — verify app changes with `pnpm --filter @axiom/app build` and `pnpm lint`, plus user-assisted browser measurement.
- Engine changes get Vitest coverage (TDD: failing test first).
- Prettier runs on commit (pre-commit hook); run `pnpm lint` before each commit's task is considered done.
- `noUnusedLocals`/`noUnusedParameters` are on — remove now-unused imports/vars.
- Keep the existing `[IdleGate] opened`/`[IdleGate] closed` console logs; they confirm suspension during measurement.
- Measurement method (user-assisted): `pnpm dev` → http://localhost:4000 → play a few notes → let it go quiet → wait 10 s → average 10 s of Chrome Task Manager CPU for the tab, and read the DEV `[render]` log line.

---

### Task 1: Expose engine idle state as an Observable

**Files:**

- Modify: `packages/audio-engine/src/engine/idle-gate.ts`
- Modify: `packages/audio-engine/src/engine/idle-gate.test.ts`
- Modify: `packages/audio-engine/src/engine/engine.ts`

**Interfaces:**

- Consumes: `Observable<T>` from `packages/audio-engine/src/utils/observable.ts` (constructor `new Observable<T>(initial)`, `get/set value`, `subscribe(cb) → { unsubscribe() }`).
- Produces: `IdleGate.idle: Observable<boolean>` (false while open, true while closed); `AudioEngine.idle: Observable<boolean>` (delegates to the gate). Consumed by the app in Task 4.

- [ ] **Step 1: Write the failing tests**

Append these tests inside the existing `describe('IdleGate', …)` block in `packages/audio-engine/src/engine/idle-gate.test.ts` (after the `destroy()` test):

```ts
it('starts with idle false while the gate is open', () => {
  const { gate } = makeGate();
  expect(gate.idle.value).toBe(false);
});

it('sets idle true when it closes and false when it reopens', () => {
  const { analyser, ticks } = makeGate();
  analyser.timeDomainData = new Float32Array([0, 0, 0]);

  ticks(IDLE_DEBOUNCE_SECONDS * 1000 + SILENCE_POLL_INTERVAL_MS);
  expect(gate.idle.value).toBe(true);

  analyser.timeDomainData = new Float32Array([0.5, 0, 0]);
  ticks(SILENCE_POLL_INTERVAL_MS);
  expect(gate.idle.value).toBe(false);
});

it('notifies idle subscribers on transitions only', () => {
  const { gate, analyser, ticks } = makeGate();
  const seen: boolean[] = [];
  gate.idle.subscribe(value => seen.push(value));
  analyser.timeDomainData = new Float32Array([0, 0, 0]);

  ticks(IDLE_DEBOUNCE_SECONDS * 1000 + SILENCE_POLL_INTERVAL_MS);
  analyser.timeDomainData = new Float32Array([0, 0, 0]);
  ticks(SILENCE_POLL_INTERVAL_MS);

  expect(seen).toEqual([true]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @axiom/audio-engine exec vitest run src/engine/idle-gate.test.ts`
Expected: FAIL — `gate.idle` is `undefined` (`Cannot read properties of undefined`).

- [ ] **Step 3: Write the minimal implementation**

Edit `packages/audio-engine/src/engine/idle-gate.ts`. Add the import at the top:

```ts
import { Observable } from '../utils/observable';
```

Add the field after `private destroyed = false;` (line 26):

```ts
  public readonly idle = new Observable<boolean>(false);
```

Set it in `close()` (line 121-125) and in `activate()` (line 63-73):

```ts
  activate(): void {
    if (this.destroyed) {
      return;
    }
    this.silentSeconds = 0;
    if (!this.open) {
      this.open = true;
      this._input.connect(this._output);
      this.idle.value = false;
      console.log('[IdleGate] opened — activity resumed, FX island active');
    }
  }
```

```ts
  private close(): void {
    this.open = false;
    this._input.disconnect(this._output);
    this.idle.value = true;
    console.log('[IdleGate] closed — output silent, FX island asleep');
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @axiom/audio-engine exec vitest run src/engine/idle-gate.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Expose the signal on AudioEngine**

Edit `packages/audio-engine/src/engine/engine.ts`. Add the import after line 7:

```ts
import type { Observable } from '../utils/observable';
```

Add the getter next to the other getters (after `get meterLevel()`, line 64):

```ts
  get idle(): Observable<boolean> {
    return this.idleGate.idle;
  }
```

- [ ] **Step 6: Run the full engine suite, build and lint**

Run: `pnpm --filter @axiom/audio-engine test && pnpm --filter @axiom/audio-engine build && pnpm lint`
Expected: 87 engine tests pass, `tsc --noEmit` clean, prettier clean.

- [ ] **Step 7: Commit**

```bash
git add packages/audio-engine/src/engine/idle-gate.ts packages/audio-engine/src/engine/idle-gate.test.ts packages/audio-engine/src/engine/engine.ts
git commit -m "feat(engine): expose IdleGate state as an Observable"
```

---

### Task 2: Add the `useObservable` Vue composable

**Files:**

- Create: `app/src/composables/use-observable.ts`

**Interfaces:**

- Consumes: `Observable<T>` from `@axiom/audio-engine`.
- Produces: `useObservable<T>(source: Observable<T>): Ref<T>` — seeds from `source.value`, updates on every emission, unsubscribes on unmount. Consumed by `ScopePanel` in Task 4.

- [ ] **Step 1: Create the composable**

Create `app/src/composables/use-observable.ts`:

```ts
import type { Observable } from '@axiom/audio-engine';
import { onUnmounted, ref, type Ref } from 'vue';

export function useObservable<T>(source: Observable<T>): Ref<T> {
  const value = ref(source.value) as Ref<T>;
  const subscription = source.subscribe(newValue => {
    value.value = newValue;
  });
  onUnmounted(() => subscription.unsubscribe());
  return value;
}
```

- [ ] **Step 2: Build and lint**

Run: `pnpm --filter @axiom/app build && pnpm lint`
Expected: build and prettier clean (the composable is unused so far; that is fine).

- [ ] **Step 3: Commit**

```bash
git add app/src/composables/use-observable.ts
git commit -m "feat(app): add useObservable composable"
```

---

### Task 3: Shared `useCanvasRender` governor (behavior-preserving baseline)

Extract the two hand-rolled rAF loops into one governor that owns fitting (mount/resize only), a throttled loop, pause support (wired later), and DEV-only per-render timing. Baseline keeps current visuals: 60 fps target, DPR cap 3, `shadowBlur` on, gradient built per frame.

**Files:**

- Create: `app/src/composables/use-canvas-render.ts`
- Modify: `app/src/components/ScopePanel.vue` (whole `<script setup>`)
- Modify: `app/src/components/VUMeter.vue` (whole `<script setup>`)

**Interfaces:**

- Produces:
  - `useCanvasRender(canvas: Ref<HTMLCanvasElement | null>, options: CanvasRenderOptions): void`
  - `interface CanvasRenderOptions { label: string; paused: Ref<boolean>; prepare?: (ctx: CanvasRenderingContext2D, size: RenderSize) => void; render: (ctx: CanvasRenderingContext2D, size: RenderSize) => void }`
  - `interface RenderSize { width: number; height: number; dpr: number }`
  - exported constants `RENDER_FPS_CAP` and `RENDER_DPR_CAP`.

- [ ] **Step 1: Create the governor**

Create `app/src/composables/use-canvas-render.ts`:

```ts
import { onMounted, onUnmounted, watch, type Ref } from 'vue';

/** Target frames per second for canvas render loops. */
export const RENDER_FPS_CAP = 60;
/** Upper bound on device-pixel-ratio used when sizing canvases. */
export const RENDER_DPR_CAP = 3;

const MILLISECONDS_PER_SECOND = 1000;
const TIMING_LOG_INTERVAL_MS = 1000;

export interface RenderSize {
  width: number;
  height: number;
  dpr: number;
}

export interface CanvasRenderOptions {
  label: string;
  paused: Ref<boolean>;
  prepare?: (context: CanvasRenderingContext2D, size: RenderSize) => void;
  render: (context: CanvasRenderingContext2D, size: RenderSize) => void;
}

export function useCanvasRender(
  canvas: Ref<HTMLCanvasElement | null>,
  options: CanvasRenderOptions,
): void {
  const frameIntervalMs = MILLISECONDS_PER_SECOND / RENDER_FPS_CAP;
  let context: CanvasRenderingContext2D | null = null;
  let frameRequestId: number | undefined = undefined;
  let lastFrameTimestamp = 0;
  let lastTimingLog = 0;
  let accumulatedRenderMs = 0;
  let renderedFrames = 0;
  let mounted = false;
  let size: RenderSize = { width: 0, height: 0, dpr: 1 };

  function fit(): void {
    const element = canvas.value;
    const parent = element?.parentElement;
    if (!element || !parent) {
      size = { width: 0, height: 0, dpr: 1 };
      return;
    }
    const rect = parent.getBoundingClientRect();
    const dpr = Math.min(RENDER_DPR_CAP, window.devicePixelRatio || 1);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (element.width !== width || element.height !== height) {
      element.width = width;
      element.height = height;
    }
    size = { width, height, dpr };
    context = element.getContext('2d');
    if (context) {
      options.prepare?.(context, size);
    }
  }

  function logTiming(elapsedMs: number): void {
    const now = performance.now();
    if (now - lastTimingLog < TIMING_LOG_INTERVAL_MS) {
      return;
    }
    if (import.meta.env.DEV) {
      const average = accumulatedRenderMs / renderedFrames;
      console.log(
        `[render] ${options.label} last=${elapsedMs.toFixed(2)}ms avg=${average.toFixed(2)}ms frames=${renderedFrames}`,
      );
    }
    lastTimingLog = now;
    accumulatedRenderMs = 0;
    renderedFrames = 0;
  }

  function draw(): void {
    if (!context) {
      return;
    }
    const startedAt = performance.now();
    options.render(context, size);
    const elapsedMs = performance.now() - startedAt;
    accumulatedRenderMs += elapsedMs;
    renderedFrames += 1;
    logTiming(elapsedMs);
  }

  function loop(timestamp: number): void {
    frameRequestId = requestAnimationFrame(loop);
    if (timestamp - lastFrameTimestamp < frameIntervalMs) {
      return;
    }
    lastFrameTimestamp = timestamp;
    draw();
  }

  function start(): void {
    if (frameRequestId !== undefined) {
      return;
    }
    lastFrameTimestamp = 0;
    frameRequestId = requestAnimationFrame(loop);
  }

  function stop(): void {
    if (frameRequestId === undefined) {
      return;
    }
    cancelAnimationFrame(frameRequestId);
    frameRequestId = undefined;
  }

  function onResize(): void {
    fit();
  }

  onMounted(() => {
    mounted = true;
    fit();
    window.addEventListener('resize', onResize);
    if (!options.paused.value) {
      start();
    }
  });

  onUnmounted(() => {
    mounted = false;
    window.removeEventListener('resize', onResize);
    stop();
  });

  watch(options.paused, isPaused => {
    if (!mounted) {
      return;
    }
    if (isPaused) {
      stop();
    } else {
      start();
    }
  });
}
```

- [ ] **Step 2: Rewrite the ScopePanel script to use the governor**

Replace the entire `<script setup lang="ts">` block of `app/src/components/ScopePanel.vue` (lines 15-136) with:

```vue
<script setup lang="ts">
import type { AudioEngine } from '@axiom/audio-engine';
import { ref, useTemplateRef } from 'vue';
import {
  useCanvasRender,
  type RenderSize,
} from '../composables/use-canvas-render';
import Panel from './Panel.vue';
import VUMeter from './VUMeter.vue';

const { audioEngine } = defineProps<{ audioEngine: AudioEngine }>();

const scope = useTemplateRef<HTMLCanvasElement>('scope');

const styles = getComputedStyle(document.documentElement);

const scopeGridColor = styles.getPropertyValue('--color-accent-100');
const scopeColor1 = styles.getPropertyValue('--color-accent-300');
const scopeColor2 = styles.getPropertyValue('--color-accent-500');
const scopeColor3 = styles.getPropertyValue('--color-accent-900');

const timeData = new Float32Array(2048);

function render(sctx: CanvasRenderingContext2D, size: RenderSize): void {
  const w = size.width;
  const h = size.height;
  sctx.clearRect(0, 0, w, h);
  sctx.strokeStyle = scopeGridColor;
  sctx.globalAlpha = 0.2;
  sctx.lineWidth = 1;
  for (let g = 1; g < 8; g++) {
    sctx.beginPath();
    sctx.moveTo((w * g) / 8, 0);
    sctx.lineTo((w * g) / 8, h);
    sctx.stroke();
  }
  sctx.beginPath();
  sctx.moveTo(0, h / 2);
  sctx.lineTo(w, h / 2);
  sctx.stroke();
  sctx.globalAlpha = 1;

  audioEngine.getScopeData(timeData);
  const grad = sctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, scopeColor1);
  grad.addColorStop(0.5, scopeColor2);
  grad.addColorStop(1, scopeColor3);

  sctx.lineWidth = 2.2 * size.dpr;
  sctx.lineJoin = 'round';
  sctx.shadowBlur = 18 * size.dpr;
  sctx.shadowColor = 'rgba(255,45,149,1)';
  sctx.strokeStyle = grad;
  sctx.beginPath();

  let start = 0;
  for (let i = 1; i < timeData.length / 2; i++) {
    if (timeData[i - 1]! < 0 && timeData[i]! >= 0) {
      start = i;
      break;
    }
  }
  const n = Math.min(timeData.length - start, 1024);
  for (let i = 0; i < n; i++) {
    const v = timeData[start + i]! * 1.6;
    const x = (i / (n - 1)) * w;
    const y = h / 2 - (v * h) / 2;
    if (i === 0) {
      sctx.moveTo(x, y);
    } else {
      sctx.lineTo(x, y);
    }
  }
  sctx.stroke();
  sctx.shadowBlur = 0;
}

useCanvasRender(scope, {
  label: 'scope',
  paused: ref(false),
  render,
});
</script>
```

- [ ] **Step 3: Rewrite the VUMeter script to use the governor**

Replace the entire `<script setup lang="ts">` block of `app/src/components/VUMeter.vue` (lines 10-95) with:

```vue
<script setup lang="ts">
import { ref, useTemplateRef } from 'vue';
import {
  useCanvasRender,
  type RenderSize,
} from '../composables/use-canvas-render';

const props = withDefaults(
  defineProps<{
    getValue: () => number;
    maxLevel?: number;
  }>(),
  {
    maxLevel: 1.2,
  },
);

const canvas = useTemplateRef<HTMLCanvasElement>('canvas');

const styles = getComputedStyle(document.documentElement);
const scopeColor1 = styles.getPropertyValue('--color-green-500');
const scopeColor2 = styles.getPropertyValue('--color-orange-500');
const scopeOverthresholdColor = styles.getPropertyValue('--color-red-500');

function render(sctx: CanvasRenderingContext2D, size: RenderSize): void {
  const w = size.width;
  const h = size.height;
  sctx.clearRect(0, 0, w, h);

  const threshold = 1 / props.maxLevel;

  const grad = sctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, scopeOverthresholdColor);
  grad.addColorStop(1 - threshold, scopeOverthresholdColor);
  grad.addColorStop(1 - threshold, scopeColor2);
  grad.addColorStop(1, scopeColor1);

  const height = (props.getValue() / props.maxLevel) * h;

  sctx.fillStyle = grad;
  sctx.fillRect(0, h - height, w, height);
}

useCanvasRender(canvas, {
  label: 'vu',
  paused: ref(false),
  render,
});
</script>
```

- [ ] **Step 4: Build and lint**

Run: `pnpm --filter @axiom/app build && pnpm lint`
Expected: vue-tsc + vite build clean, prettier clean.

- [ ] **Step 5: Capture the baseline (user-assisted)**

Run `pnpm dev`, open http://localhost:4000, play notes, then go quiet. Record in `.superpowers/sdd/progress.md`: idle/active Chrome Task Manager CPU and one `[render] scope` / `[render] vu` line for each of idle and playing. This is the "before" for every later comparison.

- [ ] **Step 6: Commit**

```bash
git add app/src/composables/use-canvas-render.ts app/src/components/ScopePanel.vue app/src/components/VUMeter.vue
git commit -m "refactor(app): drive scope and VU canvases with a shared render governor"
```

---

### Task 4: Suspend both loops while the engine is idle

**Files:**

- Modify: `app/src/components/ScopePanel.vue`
- Modify: `app/src/components/VUMeter.vue`

**Interfaces:**

- Consumes: `useObservable` (Task 2), `AudioEngine.idle` (Task 1), `useCanvasRender`'s `paused` (Task 3).
- Produces: `VUMeter` gains an `isIdle?: boolean` prop.

- [ ] **Step 1: Wire ScopePanel to the engine idle signal**

In `app/src/components/ScopePanel.vue`, add the import after the `use-canvas-render` import:

```ts
import { useObservable } from '../composables/use-observable';
```

Add after the `timeData` declaration:

```ts
const isIdle = useObservable(audioEngine.idle);
```

Change the `useCanvasRender` call's `paused` and pass the flag to `VUMeter` in the template:

```ts
useCanvasRender(scope, {
  label: 'scope',
  paused: isIdle,
  render,
});
```

```vue
<VUMeter :get-value="() => audioEngine.meterLevel" :is-idle="isIdle" />
```

- [ ] **Step 2: Accept `isIdle` in VUMeter**

In `app/src/components/VUMeter.vue`, change the `vue` import to include `toRef`:

```ts
import { toRef, useTemplateRef } from 'vue';
```

Add `isIdle` to the props and defaults:

```ts
const props = withDefaults(
  defineProps<{
    getValue: () => number;
    maxLevel?: number;
    isIdle?: boolean;
  }>(),
  {
    maxLevel: 1.2,
    isIdle: false,
  },
);
```

Add after the `canvas` declaration:

```ts
const isIdle = toRef(props, 'isIdle');
```

Change the `useCanvasRender` call:

```ts
useCanvasRender(canvas, {
  label: 'vu',
  paused: isIdle,
  render,
});
```

Remove the now-unused `ref` import from VUMeter (the `paused: ref(false)` is gone), so the vue import line is exactly:

```ts
import { toRef, useTemplateRef } from 'vue';
```

- [ ] **Step 3: Build and lint**

Run: `pnpm --filter @axiom/app build && pnpm lint`
Expected: clean. No unused-import errors.

- [ ] **Step 4: Measure (user-assisted)**

Reload the app, play notes, wait for the `[IdleGate] closed` log (~1 s after silence). Expect: no further `[render]` lines while idle, and idle CPU drops from the Task 3 baseline. Record in `.superpowers/sdd/progress.md`.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ScopePanel.vue app/src/components/VUMeter.vue
git commit -m "feat(app): suspend scope and VU rendering while the engine is idle"
```

---

### Task 5: Cap rendering at 30 fps

**Files:**

- Modify: `app/src/composables/use-canvas-render.ts`

**Interfaces:**

- Consumes: `RENDER_FPS_CAP` (Task 3).
- Produces: no signature change.

- [ ] **Step 1: Lower the cap**

In `app/src/composables/use-canvas-render.ts`, change:

```ts
/** Target frames per second for canvas render loops. */
export const RENDER_FPS_CAP = 60;
```

to:

```ts
/** Target frames per second for canvas render loops. */
export const RENDER_FPS_CAP = 30;
```

- [ ] **Step 2: Build and lint**

Run: `pnpm --filter @axiom/app build && pnpm lint`
Expected: clean.

- [ ] **Step 3: Measure (user-assisted)**

Play notes; expect `[render]` logs at ~30 frames per 1 s interval and lower playing CPU than Task 4. Confirm the scope/VU still look smooth. Record in `.superpowers/sdd/progress.md`.

- [ ] **Step 4: Commit**

```bash
git add app/src/composables/use-canvas-render.ts
git commit -m "perf(app): cap canvas rendering at 30 fps"
```

---

### Task 6: Drop the scope glow (`shadowBlur`)

**Files:**

- Modify: `app/src/components/ScopePanel.vue`

**Interfaces:**

- Consumes: nothing new.
- Produces: no signature change.

- [ ] **Step 1: Remove the shadow**

In `app/src/components/ScopePanel.vue`, in `render`, delete these three lines:

```ts
sctx.shadowBlur = 18 * size.dpr;
sctx.shadowColor = 'rgba(255,45,149,1)';
```

and the trailing reset line at the end of `render`:

```ts
sctx.shadowBlur = 0;
```

The stroke block should read:

```ts
sctx.lineWidth = 2.2 * size.dpr;
sctx.lineJoin = 'round';
sctx.strokeStyle = grad;
sctx.beginPath();
```

- [ ] **Step 2: Build and lint**

Run: `pnpm --filter @axiom/app build && pnpm lint`
Expected: clean.

- [ ] **Step 3: Measure (user-assisted)**

Watch the `[render] scope last=` value and playing CPU. Expect lower; confirm the scope still reads clearly without the glow. Record in `.superpowers/sdd/progress.md`.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ScopePanel.vue
git commit -m "perf(app): remove scope shadowBlur for cheaper rasterization"
```

---

### Task 7: Cap canvas DPR at 1.5

**Files:**

- Modify: `app/src/composables/use-canvas-render.ts`

**Interfaces:**

- Consumes: `RENDER_DPR_CAP` (Task 3).
- Produces: no signature change.

- [ ] **Step 1: Lower the DPR cap**

In `app/src/composables/use-canvas-render.ts`, change:

```ts
/** Upper bound on device-pixel-ratio used when sizing canvases. */
export const RENDER_DPR_CAP = 3;
```

to:

```ts
/** Upper bound on device-pixel-ratio used when sizing canvases. */
export const RENDER_DPR_CAP = 1.5;
```

- [ ] **Step 2: Build and lint**

Run: `pnpm --filter @axiom/app build && pnpm lint`
Expected: clean.

- [ ] **Step 3: Measure (user-assisted)**

Play notes; expect lower `[render]` times and playing CPU (fewer pixels). Confirm the canvases still look sharp enough. Record in `.superpowers/sdd/progress.md`.

- [ ] **Step 4: Commit**

```bash
git add app/src/composables/use-canvas-render.ts
git commit -m "perf(app): cap canvas device-pixel-ratio at 1.5"
```

---

### Task 8: Build gradients once per fit instead of per frame

**Files:**

- Modify: `app/src/components/ScopePanel.vue`
- Modify: `app/src/components/VUMeter.vue`

**Interfaces:**

- Consumes: the optional `prepare(ctx, size)` hook (Task 3).
- Produces: no signature change.

- [ ] **Step 1: Reuse the ScopePanel stroke gradient**

In `app/src/components/ScopePanel.vue`, add a module-scoped gradient after `timeData`:

```ts
let strokeGradient: CanvasGradient | null = null;
```

Add a `prepare` function before `render`:

```ts
function prepare(sctx: CanvasRenderingContext2D, size: RenderSize): void {
  strokeGradient = sctx.createLinearGradient(0, 0, size.width, 0);
  strokeGradient.addColorStop(0, scopeColor1);
  strokeGradient.addColorStop(0.5, scopeColor2);
  strokeGradient.addColorStop(1, scopeColor3);
}
```

In `render`, delete the per-frame gradient creation:

```ts
const grad = sctx.createLinearGradient(0, 0, w, 0);
grad.addColorStop(0, scopeColor1);
grad.addColorStop(0.5, scopeColor2);
grad.addColorStop(1, scopeColor3);
```

and use the cached one:

```ts
sctx.strokeStyle = strokeGradient ?? scopeColor2;
```

Pass `prepare` to the governor:

```ts
useCanvasRender(scope, {
  label: 'scope',
  paused: isIdle,
  prepare,
  render,
});
```

- [ ] **Step 2: Reuse the VUMeter fill gradient**

In `app/src/components/VUMeter.vue`, add after the `isIdle` declaration:

```ts
let fillGradient: CanvasGradient | null = null;
```

Add a `prepare` function before `render`:

```ts
function prepare(sctx: CanvasRenderingContext2D, size: RenderSize): void {
  const threshold = 1 / props.maxLevel;
  fillGradient = sctx.createLinearGradient(0, 0, 0, size.height);
  fillGradient.addColorStop(0, scopeOverthresholdColor);
  fillGradient.addColorStop(1 - threshold, scopeOverthresholdColor);
  fillGradient.addColorStop(1 - threshold, scopeColor2);
  fillGradient.addColorStop(1, scopeColor1);
}
```

In `render`, delete the per-frame gradient creation:

```ts
const threshold = 1 / props.maxLevel;

const grad = sctx.createLinearGradient(0, 0, 0, h);
grad.addColorStop(0, scopeOverthresholdColor);
grad.addColorStop(1 - threshold, scopeOverthresholdColor);
grad.addColorStop(1 - threshold, scopeColor2);
grad.addColorStop(1, scopeColor1);
```

and use the cached one:

```ts
const height = (props.getValue() / props.maxLevel) * h;

sctx.fillStyle = fillGradient ?? scopeColor1;
sctx.fillRect(0, h - height, w, height);
```

Pass `prepare` to the governor:

```ts
useCanvasRender(canvas, {
  label: 'vu',
  paused: isIdle,
  prepare,
  render,
});
```

- [ ] **Step 3: Build and lint**

Run: `pnpm --filter @axiom/app build && pnpm lint`
Expected: clean. No unused `h` warning errors (`h` is still used by `fillRect`/baseline). Remove any now-unused local.

- [ ] **Step 4: Measure (user-assisted)**

Play notes; expect a small drop in `[render]` times. Record in `.superpowers/sdd/progress.md`.

- [ ] **Step 5: Commit**

```bash
git add app/src/components/ScopePanel.vue app/src/components/VUMeter.vue
git commit -m "perf(app): build scope and VU gradients once per resize"
```

---

### Task 9: Final verification and hand-off

**Files:**

- Modify: `.superpowers/sdd/progress.md` (local ledger, gitignored)

**Interfaces:**

- Consumes: everything above.
- Produces: verified branch.

- [ ] **Step 1: Run the full validation gate**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: all tests pass (94 engine + synth combined at minimum — 87 engine from Task 1 plus 6 synth, i.e. 93; verify the actual count in output), build clean, prettier clean.

- [ ] **Step 2: Confirm the win (user-assisted)**

Fresh page, play, go quiet. Confirm: `[IdleGate] closed` appears, no `[render]` lines while idle, and idle CPU is close to the ~1.4% audio-only floor. Record final before/after table in `.superpowers/sdd/progress.md`.

- [ ] **Step 3: Summarize**

Report the per-step CPU/`[render]` table from the ledger and which optimizations were kept. Do NOT open a PR yet — this branch is stacked on `fix/idle-cpu-fx-voice-gating` (PR #61); rebase onto `main` after #61 merges, then open the PR (ask the user).

- [ ] **Step 4: Commit any ledger-free changes**

If nothing is left uncommitted, no commit is needed. Otherwise:

```bash
git add -A
git commit -m "chore(app): finalize scope/VU render optimization"
```

## Self-Review

- **Spec coverage:** engine idle signal (Task 1), `useObservable` (Task 2), shared governor with fit-on-resize + timing + pause (Task 3), suspend-on-idle (Task 4), 30 fps (Task 5), drop `shadowBlur` (Task 6), DPR cap (Task 7), gradient reuse (Task 8), verification (Task 9). All spec sections covered.
- **Spec correction:** the spec's measurement step F listed both "reuse gradients" and "stop per-frame re-fit". Per-frame re-fit is folded into the governor from the start (Task 3), so Task 8 is gradient reuse only. Spec updated to match.
- **Placeholder scan:** every code step shows complete code; no TBD/TODO.
- **Type consistency:** `RenderSize`/`CanvasRenderOptions` field names and `useObservable<T>(source): Ref<T>` / `IdleGate.idle` / `AudioEngine.idle` / `VUMeter.isIdle` are used consistently across tasks.
