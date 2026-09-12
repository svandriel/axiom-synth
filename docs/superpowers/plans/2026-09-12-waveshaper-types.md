# WaveShaper Types + Shared Curve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two limited waveshaper types with six classic waveshaper curves and compute the shared-curve once per parameter change instead of once per voice.

**Architecture:** A new engine-level `WaveshaperCurve` provider owns one shared 1024-point `Float32Array`, the amount/type state, and a registry of every voice's `WaveShaperNode`. It recomputes the curve once on any change and re-assigns the buffer to all registered nodes. Each per-voice `Waveshaper` slims down to drive gain + node + registry registration. `AudioEngine` subscribes to the distortion/type observables once (instead of every `AxiomVoice`), so curve math runs 1× per knob move instead of 16×.

**Tech Stack:** Vue 3.5, TypeScript strict (`erasableSyntaxOnly`), Vite, Web Audio API (`WaveShaperNode`).

## Global Constraints

- No test runner configured. Verification for every task is `pnpm build` (runs `vue-tsc -b && vite build`). `pnpm lint` is handled by the pre-commit hook; never run manually.
- `pnpm` is the package manager. Prettier: single quotes, trailing commas, no semicolons, 80-char width.
- Do NOT add code comments unless asked.
- `erasableSyntaxOnly` — no enums, no `namespace`; plain type aliases only.
- Branch: `feature/waveshaper`. Commit small, conventional-style messages.
- Signal-chain order must not change: `Oscillator → WaveShaper → Filter → Amp Envelope → Sink`.

---

### Task 1: Create `WaveshaperCurve` shared curve provider

**Files:**

- Create: `src/engine/waveshaper-curve.ts`

**Interfaces:**

- Produces:
  - `export type WaveshaperType = 'atan' | 'soft-algebraic' | 'asymmetric-tube' | 'hard-clipper' | 'sine-shaper' | 'chebyshev'`
  - `export class WaveshaperCurve` with `constructor(amount: number, type: WaveshaperType)`, `subscribe(node: WaveShaperNode): void`, `unsubscribe(node: WaveShaperNode): void`, getters/setters `amount: number` and `type: WaveshaperType`.

Later tasks consume: Task 2 `Waveshaper` imports `WaveshaperCurve` + re-exports `WaveshaperType`; Task 3 engine constructs it and subscribes observables.

- [ ] **Step 1: Create the provider with all six curve computations**

Write `src/engine/waveshaper-curve.ts`:

```ts
const CURVE_SAMPLES = 1024;

export type WaveshaperType =
  | 'atan'
  | 'soft-algebraic'
  | 'asymmetric-tube'
  | 'hard-clipper'
  | 'sine-shaper'
  | 'chebyshev';

export class WaveshaperCurve {
  private readonly nodes = new Set<WaveShaperNode>();
  private readonly curve = new Float32Array(CURVE_SAMPLES);

  private _amount: number;
  private _type: WaveshaperType;

  constructor(amount: number, type: WaveshaperType) {
    this._amount = amount;
    this._type = type;
    this.computeCurve();
  }

  subscribe(node: WaveShaperNode): void {
    this.nodes.add(node);
    node.curve = this.curve;
  }

  unsubscribe(node: WaveShaperNode): void {
    this.nodes.delete(node);
  }

  get amount(): number {
    return this._amount;
  }

  set amount(value: number) {
    if (this._amount === value) {
      return;
    }
    this._amount = value;
    this.apply();
  }

  get type(): WaveshaperType {
    return this._type;
  }

  set type(value: WaveshaperType) {
    if (this._type === value) {
      return;
    }
    this._type = value;
    this.apply();
  }

  private apply(): void {
    this.computeCurve();
    this.nodes.forEach(node => {
      node.curve = this.curve;
    });
  }

  private computeCurve(): void {
    const m = this._amount / 100;
    for (let i = 0; i < CURVE_SAMPLES; ++i) {
      const x = (i * 2) / CURVE_SAMPLES - 1;
      switch (this._type) {
        case 'atan': {
          const k = 1 + m * m * 24;
          this.curve[i] = Math.atan(k * x) / Math.atan(k);
          break;
        }
        case 'soft-algebraic': {
          const k = m * m * 10;
          this.curve[i] = x / Math.sqrt(1 + k * x * x);
          break;
        }
        case 'asymmetric-tube': {
          const k = 1 + m * 9;
          this.curve[i] = x < 0 ? Math.tanh(k * x) : x;
          break;
        }
        case 'hard-clipper': {
          const k = 1 - m * 0.95;
          this.curve[i] = Math.max(-k, Math.min(k, x)) / k;
          break;
        }
        case 'sine-shaper': {
          const k = 1 + m * 4;
          this.curve[i] = Math.sin((k * x * Math.PI) / 2);
          break;
        }
        case 'chebyshev': {
          this.curve[i] = (1 - m) * x + m * (4 * Math.pow(x, 3) - 3 * x);
          break;
        }
      }
    }
  }
}
```

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: PASS (vue-tsc type-check + vite build)

- [ ] **Step 3: Commit**

```bash
git add src/engine/waveshaper-curve.ts
git commit -m "feat: shared waveshaper curve provider with six types"
```

---

### Task 2: Slim `Waveshaper` to node + drive, rewire voice config and voice

**Files:**

- Modify: `src/engine/waveshaper.ts`
- Modify: `src/engine/axiom-voice-config.ts`
- Modify: `src/engine/axiom-voice.ts`

**Interfaces:**

- Consumes: `WaveshaperCurve` and `WaveshaperType` from Task 1's `src/engine/waveshaper-curve.ts`.
- Produces:
  - `Waveshaper` constructor becomes `constructor(ctxt: AudioContext, curve: WaveshaperCurve)`; keeps `drive: AudioParam`, `input: AudioNode`, `output: AudioNode`, `destroy(): void`. `destroy()` unregisters the node.
  - `WaveshaperType` remains importable from `src/engine/waveshaper.ts` (re-export).
  - `AxiomVoiceConfig` replaces `distortionAmount: Observable<number>` and `waveshaperType: Observable<WaveshaperType>` with `waveshaperCurve: WaveshaperCurve`. Keeps `waveshaperDrive: ConstantSourceNode`.

This task must change `waveshaper.ts` + `axiom-voice-config.ts` + `axiom-voice.ts` together — removing the `Waveshaper` amount/type setters breaks `AxiomVoice` until all three land.

- [ ] **Step 1: Rewrite `src/engine/waveshaper.ts`**

```ts
import type { WaveshaperCurve } from './waveshaper-curve';

export type { WaveshaperType } from './waveshaper-curve';

export class Waveshaper {
  private readonly driveNode: GainNode;
  private readonly wsNode: WaveShaperNode;
  private readonly curve: WaveshaperCurve;

  constructor(ctxt: AudioContext, curve: WaveshaperCurve) {
    this.curve = curve;
    this.driveNode = ctxt.createGain();
    this.driveNode.gain.setValueAtTime(1, ctxt.currentTime);
    this.wsNode = ctxt.createWaveShaper();
    this.curve.subscribe(this.wsNode);
    this.driveNode.connect(this.wsNode);
  }

  get drive(): AudioParam {
    return this.driveNode.gain;
  }

  get input(): AudioNode {
    return this.driveNode;
  }

  get output(): AudioNode {
    return this.wsNode;
  }

  destroy(): void {
    this.curve.unsubscribe(this.wsNode);
    this.driveNode.disconnect();
    this.wsNode.disconnect();
  }
}
```

- [ ] **Step 2: Update `src/engine/axiom-voice-config.ts`**

Swap the two observable fields for the shared curve. Final content:

```ts
import type { EnvelopeConfig, FixedArray, WaveFormType } from '../types';
import type { Observable } from '../utils/observable';
import type { OscillatorCount } from './constants';
import type { WaveshaperCurve } from './waveshaper-curve';

export interface AxiomVoiceConfig {
  ampEnvelope: EnvelopeConfig;
  filterEnvelope: EnvelopeConfig;
  filterCutoff: ConstantSourceNode;
  filterResonance: ConstantSourceNode;
  filterEnvAmount: ConstantSourceNode;
  filterKeyTrack: ConstantSourceNode;
  oscillatorDetuneSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorGainSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorWaveForms: Observable<FixedArray<WaveFormType, OscillatorCount>>;
  waveshaperCurve: WaveshaperCurve;
  waveshaperDrive: ConstantSourceNode;
}
```

- [ ] **Step 3: Update `src/engine/axiom-voice.ts`**

Three changes:

1. Constructor line 36:
   `this.waveShaper = new Waveshaper(ctxt, config.waveshaperCurve);`

2. Delete the two subscription blocks (lines 68–74):

```ts
const { unsubscribe: _1 } = config.distortionAmount.subscribe(newAmount => {
  this.waveShaper.amount = newAmount;
});
const { unsubscribe: _2 } = config.waveshaperType.subscribe(newType => {
  this.waveShaper.type = newType;
});
// TODO: actually unsubscribe
```

Keep `config.waveshaperDrive.connect(this.waveShaper.drive);`.

3. Fix the latent bug in `destroy()` (line 177) — call the method:

```ts
this.filterEnvelope.disconnect();
```

- [ ] **Step 4: Verify the build**

Run: `pnpm build`
Expected: PASS. (Engine still passes the old config keys — do not touch `src/engine/engine.ts` yet; it compiles because `AxiomVoiceConfig` is only asserted by TS at the `voiceConfig` literal in the next task. If `pnpm build` fails here citing `engine.ts`, temporarily run `pnpm build` and proceed to Task 3 — flag it, do not "fix" engine.ts early.)

- [ ] **Step 5: Commit**

```bash
git add src/engine/waveshaper.ts src/engine/axiom-voice-config.ts src/engine/axiom-voice.ts
git commit -m "refactor: waveshaper registers with shared curve, drop per-voice subscriptions"
```

---

### Task 3: Wire the shared curve into `AudioEngine`

**Files:**

- Modify: `src/engine/engine.ts`

**Interfaces:**

- Consumes: `WaveshaperCurve` from `src/engine/waveshaper-curve.ts`; `WaveshaperType` still importable from `./waveshaper` (re-exported).
- Produces: `AudioEngine` now owns one `WaveshaperCurve`, passes it into every `AxiomVoiceConfig`, and runs exactly one subscription each on `_distortionAmount` and `_waveshaperType`.

- [ ] **Step 1: Add import and field**

`src/engine/engine.ts` imports:

```ts
import { WaveshaperCurve } from './waveshaper-curve';
```

Add field next to `waveShaperDriveSource`:

```ts
  private readonly waveshaperCurve: WaveshaperCurve;
```

- [ ] **Step 2: Change the default type to `'soft-algebraic'`**

```ts
  private readonly waveshaperConfig: WaveshaperConfig = {
    distortion: 0,
    drive: 0,
    type: 'soft-algebraic',
  };
```

- [ ] **Step 3: Construct the curve and subscribe once**

In the constructor, after `this._waveshaperType = new Observable(...)`, add:

```ts
this.waveshaperCurve = new WaveshaperCurve(
  this.waveshaperConfig.distortion,
  this.waveshaperConfig.type,
);
this._distortionAmount.subscribe(amount => {
  this.waveshaperCurve.amount = amount;
});
this._waveshaperType.subscribe(type => {
  this.waveshaperCurve.type = type;
});
```

Replace the two AxiomVoiceConfig keys:

```ts
      distortionAmount: this._distortionAmount,
      ...
      waveshaperType: this._waveshaperType,
```

with:

```ts
      waveshaperCurve: this.waveshaperCurve,
```

Keep `waveshaperDrive: this.waveShaperDriveSource` in place.

- [ ] **Step 4: Stop the drive source in `destroy()`**

In `destroy()`, alongside the other constant-source stops, add:

```ts
this.waveShaperDriveSource.disconnect();
this.waveShaperDriveSource.stop();
```

- [ ] **Step 5: Verify the build**

Run: `pnpm build`
Expected: PASS (type-check + build). The old `distortionAmount`/`waveshaperType` config keys are gone everywhere except the observables and engine getters/setters, which remain.

- [ ] **Step 6: Commit**

```bash
git add src/engine/engine.ts
git commit -m "feat: engine owns shared waveshaper curve, default soft-algebraic"
```

---

### Task 4: Six-type toggle in `WaveshaperPanel.vue`

**Files:**

- Modify: `src/components/WaveshaperPanel.vue`

**Interfaces:**

- Consumes: `WaveshaperType` via the existing `import { type WaveshaperType } from '../engine/waveshaper.ts'` (re-export keeps this import valid).

- [ ] **Step 1: Replace the toggle options**

Replace the `types` array:

```ts
const types: Array<{ id: WaveshaperType; label: string }> = [
  {
    id: 'atan',
    label: 'Arc-tan',
  },
  {
    id: 'soft-algebraic',
    label: 'Algebraic',
  },
  {
    id: 'asymmetric-tube',
    label: 'Tube',
  },
  {
    id: 'hard-clipper',
    label: 'Clipper',
  },
  {
    id: 'sine-shaper',
    label: 'Sine',
  },
  {
    id: 'chebyshev',
    label: 'Cheby',
  },
];
```

Knobs and `v-model` wiring stay unchanged.

- [ ] **Step 2: Verify the build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/components/WaveshaperPanel.vue
git commit -m "feat: six-type waveshaper selector"
```

---

## Self-Review Notes

- Spec coverage: type union + curve math (Task 1), slim per-voice `Waveshaper` + reg/unreg (Task 2), engine owns shared curve + subscribe-once + `'atan'` default + drive-source stop + voice unsubscribe-on-destroy via `WaveShaper.destroy()` (Tasks 2/3), six-type UI toggle (Task 4). No spec requirement left unmapped.
- No test runner in this repo — verify via `pnpm build` per task instead of TDD red/green cycles.
- No placeholders: all code blocks are complete.
- Type consistency: `WaveshaperType` defined in `waveshaper-curve.ts`, re-exported from `waveshaper.ts` so `waveshaper-config.ts` and `engine.ts` keep their existing import paths; `WaveshaperCurve` imported directly where constructed (engine) and used (config/voice).
