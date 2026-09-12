# WaveShaper Types + Shared Curve — Design

Date: 2026-09-12

## Context

The synth has a working `Waveshaper` (`src/engine/waveshaper.ts`) with two curve
types (`classic`, `tanh`), wired per-voice inside `AxiomVoice` and driven from
`AudioEngine` via:

- `distortionAmount` — `Observable<number>` (0–100), subscribed by every voice
- `waveshaperType` — `Observable<WaveshaperType>`, subscribed by every voice
- `waveshaperDrive` — shared `ConstantSourceNode` into each voice's drive gain

Two problems:

1. The curve types are limited and musically uninteresting (`classic`, `tanh`).
2. Every knob move recomputes the full 1024-sample curve **per voice** (16×
   duplication of the same chained-on-purpose calculation). Curve computation is
   per-voice but the configuration is shared, so the curve result is identical
   across voices.

## Goals

- Replace `classic`/`tanh` with six classic audio waveshaper types, each mapping
  the existing 0–100% `amount` control to a targeted parameter range.
- Compute the sharing-config waveshaper curve exactly once per parameter change
  and share the result across all 16 voice nodes. Keep the per-voice node
  topology (shaper before filter, before amp envelope) — no timbre change.

## Non-goals

- No change to signal-chain order.
- No change to drive parameter semantics (per-voice drive gain stays).
- No test runner exists; verification is `pnpm build` + `pnpm lint`.

## Design

### 1. New type union

`src/engine/waveshaper.ts` — `WaveshaperType` becomes:

```ts
export type WaveshaperType =
  | 'atan'
  | 'soft-algebraic'
  | 'asymmetric-tube'
  | 'hard-clipper'
  | 'sine-shaper'
  | 'chebyshev';
```

Old `'classic'` and `'tanh'` are removed. `src/engine/engine.ts` defaults the
wave-shaper config type to `'atan'`. (No persisted config exists, so no
migration needed.)

### 2. Shared curve provider (`src/engine/waveshaper-curve.ts`, new file)

New class `WaveshaperCurve`:

- Owns one `Float32Array(1024)`, the shared buffer.
- Owns the waveshaper state (`amount` 0–100, `type`) — previously held per
  `Waveshaper` instance.
- Owns a `Set<WaveShaperNode>` registry of live nodes.
- `subscribe(node)` / `unsubscribe(node)` — register/unregister. On subscribe
  the node is immediately given the current curve.
- On `amount`/`type` change: recompute the shared buffer once, then re-assign
  `node.curve = shared` for every registered node.

Curve math — all inputs `x` in `[-1, 1]`, `amount` `a` in `[0, 100]`, `m = a/100`:

| type            | k/m                 | y(x)                     |
| --------------- | ------------------- | ------------------------ |
| atan            | `k = 1 + m²·24`     | `atan(k·x) / atan(k)`    |
| soft-algebraic  | `k = m²·10`         | `x / sqrt(1 + k·x²)`     |
| asymmetric-tube | `k = 1 + m·9`       | `x < 0 ? tanh(k·x) : x`  |
| hard-clipper    | `k = 1 − m·0.95`    | `clamp(x, −k, k) / k`    |
| sine-shaper     | `k = 1 + m·4`       | `sin(k·x·π/2)`           |
| chebyshev       | `m` (dry/wet blend) | `(1−m)·x + m·(4x³ − 3x)` |

At `amount = 0`, `k`/`m` start at their transparent values, and five of the six
types reproduce the identity `y = x` exactly (atan k=1, soft-algebraic k=0,
asymmetric-tube k=1, hard-clipper k=1, chebyshev m=0). Sine-shapers k=1 is
`sin(x·π/2)` — a monotonic, boundary-fixed (`±1 → ±1`) softener, not exact
identity. That is inherent to the formula, by design.

Chebyshev's dry-to-wet blend is baked into the curve — no extra mix nodes, no
parallel dry path.

### 3. Slim per-voice `Waveshaper` (`src/engine/waveshaper.ts`)

Keeps: drive `GainNode` (pre-shaper gain), `WaveShaperNode`, constructor wiring,
`input`/`output`/`drive` getters, `destroy()`.

Changes:

- Constructor signature becomes `(ctxt: AudioContext, curve: WaveshaperCurve)`.
  Registers its `wsNode` with the shared curve; `destroy()` unregisters.
- `amount`/`type` getters/setters and all per-instance curve computation move out
  into `WaveshaperCurve`. No per-instance `Float32Array`.

### 4. Wiring

`AxiomVoiceConfig` (`src/engine/axiom-voice-config.ts`):

- Remove `distortionAmount: Observable<number>` and
  `waveshaperType: Observable<WaveshaperType>`.
- Add `waveshaperCurve: WaveshaperCurve`.
- Keep `waveshaperDrive: ConstantSourceNode`.

`AxiomVoice` (`src/engine/axiom-voice.ts`):

- Construct `new Waveshaper(ctxt, config.waveshaperCurve)`.
- Delete both `.subscribe(...)` blocks — this also removes the
  `// TODO: actually unsubscribe` leak (nothing to unsubscribe anymore).
- Keep `config.waveshaperDrive.connect(this.waveShaper.drive)`.
- Fix the latent bug `this.filterEnvelope.disconnect;` → call it
  (`this.filterEnvelope.disconnect()`).
- `destroy()` must unregister the voice's node from the shared curve: it flows
  through `this.waveShaper.destroy()`, which calls
  `curve.unsubscribe(this.wsNode)`. A destroyed voice's node must no longer
  receive curve re-assignments on parameter changes.

`AudioEngine` (`src/engine/engine.ts`):

- Constructs one `WaveshaperCurve`, seeds it from `waveshaperConfig`
  (`distortion`, `type`).
- Subscribes to `_distortionAmount` and `_waveshaperType` once (engine level);
  each subscription writes the new value into the shared curve object. Net:
  recompute runs once per change, not 16×.
- Reads the shared `WaveshaperCurve` into `AxiomVoiceConfig.waveshaperCurve` for
  each pooled voice.
- Default `waveshaperConfig.type` = `'atan'`.
- `destroy()`: disconnect/stop the existing constant sources (unchanged), let
  `WaveshaperCurve` die with the engine. Note: `waveShaperDriveSource` was not
  stopped in `destroy()` previously; stop it (small hygiene fix, same pattern as
  the oscillator detune sources).

The `Observable` class (`src/utils/observable.ts`) is unchanged — it is the
single engine-level "compute-once" trigger.

### 5. UI (`src/components/WaveshaperPanel.vue`)

Toggle entries replace Classic/Tanh:

```
Arc-tan · Algebraic · Tube · Clipper · Sine · Cheby
```

ids map to labels:

| id                | label     |
| ----------------- | --------- |
| `atan`            | Arc-tan   |
| `soft-algebraic`  | Algebraic |
| `asymmetric-tube` | Tube      |
| `hard-clipper`    | Clipper   |
| `sine-shaper`     | Sine      |
| `chebyshev`       | Cheby     |

Drive and Distortion knobs unchanged.

### 6. Behavior notes

- Hard Clipper: `k` scales downward (1.0 at 0% = transparent, 0.05 at 100% =
  heavy square-wave clipping).
- Sine Shaper: `k > 1` folds curve edges backward; timbre varies strongly with
  input level into the shaper.
- Chebyshev at 100% isolates the 3rd harmonic with no clipping; blend gives
  mixed dry/shaped output.

## Files

| File                                 | Change                                                                                          |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/engine/waveshaper-curve.ts`     | NEW — shared buffer provider, 6 curve computes, node registry                                   |
| `src/engine/waveshaper.ts`           | Slim to node + drive; register with shared curve; new type union                                |
| `src/engine/axiom-voice.ts`          | Drop subscriptions, pass shared curve, fix `disconnect` bug                                     |
| `src/engine/axiom-voice-config.ts`   | Swap observables for `waveshaperCurve`                                                          |
| `src/engine/engine.ts`               | Heads-up one `WaveshaperCurve`, engine-level subscriptions, default `'atan'`, drive-source stop |
| `src/components/WaveshaperPanel.vue` | Six-type toggle                                                                                 |

## Verification

- `pnpm build` (vue-tsc strict type-check + vite build) must pass.
- Pre-commit prettier formats automatically.

## Open questions (resolved)

- Existing types: replaced with the six (approved).
- Chebyshev dry/wet: baked into the curve (approved).
- Shared curve approach: single `WaveshaperCurve` provider, per-voice nodes kept
  (approved). Master-chain single node rejected — changes timbre.
