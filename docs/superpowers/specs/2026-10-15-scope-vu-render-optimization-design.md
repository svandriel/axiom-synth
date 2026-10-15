# Scope + VU render optimization — design

Date: 2026-10-15
Status: approved (ready for implementation plan)
Follow-up from: issue #62, pull request #61

## Problem

After the FX/voice idle gating (#61), the audio graph idles at about 1.4% CPU.
The remaining idle CPU comes from two always-on canvas render loops:

- `app/src/components/ScopePanel.vue` — `render()` reads 2048 time-domain
  samples, scans for a zero crossing, and strokes a 1024-point path with
  `shadowBlur = 18 * dpr` and a freshly created linear gradient, every rAF
  frame.
- `app/src/components/VUMeter.vue` — `render()` runs every rAF frame, creating a
  gradient and filling a rect.

Measured on Chrome Task Manager, fresh idle with the audio gate closed:

| State                       | Idle CPU |
| --------------------------- | -------- |
| UI loops running            | ~12%     |
| UI loops stopped (ablation) | ~1.4%    |

The two loops account for roughly 10.6 idle CPU points.

## Goals

1. Suspend both render loops while the engine is silent, and resume on the next
   note.
2. Make an active frame cheaper.
3. Measure the cost of a single scope render and a single VU render, then compare
   before and after each change.

## Non-goals

- No change to the audio graph, `IdleGate` behavior, or the wake path.
- No change to what the scope and VU display beyond the accepted quality
  trade-offs below.
- No test infrastructure for the `@axiom/app` package (stays untested, as today).

## Agreed quality trade-offs

Start aggressive; evaluate visually; compromise later if needed.

- Drop `shadowBlur` (the glow).
- Reuse gradients; stop creating them per frame.
- Throttle to 30 fps.
- Lower the render device-pixel-ratio cap from 3 to 1.5.
- Stop re-fitting the canvas every frame.

## Design

### 1. Engine idle signal (`@axiom/audio-engine`, tested)

The engine already tracks silence in `IdleGate`. Expose it as an observable so
the UI can mirror it.

- `IdleGate` (`packages/audio-engine/src/engine/idle-gate.ts`) gains
  `readonly idle = new Observable<boolean>(false)`.
  - `close()` sets `idle.value = true`.
  - `activate()` sets `idle.value = false` when it actually reopens.
  - `destroy()` sets `idle.value = true`.
- `AudioEngine` (`engine.ts`) exposes the same instance through a getter, next to
  the existing `activate()` wake method.

`Observable<T>` already ships in `@axiom/audio-engine`
(`packages/audio-engine/src/utils/observable.ts`). Its setter fires subscribers
only when the value changes, so a no-op `activate()` stays silent.

### 2. Generic composable (`@axiom/app`, untested)

`app/src/composables/use-observable.ts`:

```ts
export function useObservable<T>(source: Observable<T>): Ref<T>;
```

Seeds a `ref` from `source.value`, subscribes on setup, and unsubscribes on
`onUnmounted`. It works for any engine `Observable`, not just idle.

### 3. Shared canvas render governor (`@axiom/app`, untested)

`app/src/composables/use-canvas-render.ts` owns one canvas's rAF lifecycle and
its `fit()` logic (currently duplicated in both components).

Inputs:

- the canvas template ref,
- a `label` for timing (e.g. `'scope'`, `'vu'`),
- a `paused: Ref<boolean>` (the idle signal),
- a `render(ctx, size)` callback.

Behavior:

- Fit the canvas on mount and on `resize` only. Read
  `getBoundingClientRect()` and cap DPR at `RENDER_DPR_CAP`.
- Run a throttled loop that skips frames to hold `RENDER_FPS_CAP`.
- When `paused` is true, cancel the pending rAF; when it flips false, restart.
- Time each `render()` with `performance.now()` and keep a rolling average.

### 4. Components

`ScopePanel.vue`:

- `const isIdle = useObservable(audioEngine.idle)`.
- Drive `useCanvasRender` with `paused: isIdle`.
- Drop `shadowBlur`; build the gradient once per fit, not per frame.
- Pass `:is-idle="isIdle"` to `VUMeter`.

`VUMeter.vue`:

- Gains an `isIdle` prop.
- Uses `useCanvasRender`; reuses its gradient.

### Data flow

```
note ON  -> engine.activate() -> IdleGate.activate() -> idle.value = false
         -> ref false -> governor resumes the loop
silence >= debounce -> IdleGate.close() -> idle.value = true
         -> ref true -> governor cancels the loop (canvas freezes on the
         last, already-flat frame)
```

## Measurement plan

Measure each step on the same machine and browser, and keep only the changes that
pay.

Per-render JS timing: `useCanvasRender` logs, DEV-only and about once per second,
a rolling average per label:

```
[render] scope last=0.42ms avg=0.38ms frames=30
```

Caveat: `performance.now()` around `render()` measures JS command recording, not
canvas rasterization. `shadowBlur` and gradients rasterize asynchronously, so the
timer can under-report them. Chrome Task Manager CPU is the ground truth and is
recorded at each step.

Steps:

- **A.** Extract the governor with timing, no behavior change (60 fps, full
  quality). Capture the baseline.
- **B.** Suspend on idle. Measure idle CPU.
- **C.** 30 fps cap. Measure.
- **D.** Drop `shadowBlur`. Measure (Task Manager matters most).
- **E.** DPR cap 3 -> 1.5. Measure.
- **F.** Reuse gradients. Measure. (Per-frame re-fit is already removed by
  the governor's fit-on-resize introduced in step A.)

## Constants

Named constants, no magic numbers:

- `RENDER_FPS_CAP = 30`
- `RENDER_DPR_CAP = 1.5`

(The existing `SILENCE_*` and `IDLE_DEBOUNCE_SECONDS` constants in `IdleGate` are
unchanged.)

## Testing

- `@axiom/audio-engine`: extend `idle-gate.test.ts` to assert `idle.value` flips
  false -> true on close, true -> false on reopen, and does not flip on a no-op
  `activate()`.
- `AudioEngine` constructs a real `AudioContext`, so its getter is verified
  manually.
- `@axiom/app`: no automated tests. Verify visually and with the `[render]` logs
  plus Chrome Task Manager.

## Risks

- The look changes: no glow, softer edges (DPR 1.5), 30 fps. If it reads poorly,
  revert individual steps (they are measured separately).
- The per-render timer under-reports raster cost. Rely on Task Manager CPU.

## Out of scope

- Further audio-graph work; the FX/voice gating in #61 is assumed.
- Adding a test setup to `@axiom/app`.
- Other panels (Waveshaper, Envelope) draw once and are not loops.
