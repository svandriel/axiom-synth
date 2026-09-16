# Filter Types & Slopes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the `Filter` class a flat `FilterType` union covering all Web Audio biquad shapes plus 12/24/36/48 dB/octave lowpass/highpass slopes (chained biquads), with shared per-slope Q compensation, and expose a type toggle in the FilterPanel UI.

**Architecture:** A new shared `FilterResonance` class (one per engine, mirrors `WaveshaperCurve`) owns the Q source and three WaveShaper transform chains (`q^(1/N)`), so Q compensation is computed once per exponent and fanned out to every voice. The `Filter` class is reworked to lazy-build chained biquad stages on a stable `gain → output` skeleton; the type observable triggers an incremental rebuild (reuse stages across shape-only swaps, create/destroy only the tail). Engine and voice wiring move into the Filter via constructor injection. FilterPanel gets a six-entry flat Toggle.

**Tech Stack:** TypeScript, Web Audio API, Vue 3 monorepo (`pnpm` workspaces).

## Global Constraints

- Working branch: `feature/filter-types` (already checked out). Never commit to `main`.
- No test runner configured — the build is the gate. Verify every task with `pnpm build` (repo root; runs all workspace packages) and `pnpm lint` (prettier check).
- Pre-commit hook runs `prettier --write` on staged files; keep formatting in sync.
- TypeScript strict mode: `noUncheckedIndexedAccess` requires `!` on indexed reads; `verbatimModuleSyntax` requires `import type` for type-only imports; `erasableSyntaxOnly` forbids enums (use string-literal unions).
- Follow existing engine patterns: `PascalCase` classes, lowercase-kebab file names, getters for node/param access, `Observable` for shared live values, `Destroyable` for teardown.
- Default filter type stays `'lowpass12'` — a single lowpass biquad, audio-identical to today, so no startup behavior change.

---

### Task 1: FilterType union, spec mapping, config + barrel

**Context:** Add the flat `FilterType` union, the internal `{ shape, stages }` mapping, the `FilterConfig.type` field, and the package export. Wiring that uses these comes in later tasks.

**Files:**

- Modify: `packages/audio-engine/src/engine/filter.ts` (top of file, above the class)
- Modify: `packages/audio-engine/src/types/filter-config.ts`
- Modify: `packages/audio-engine/src/engine/engine.ts:83-88` (add `type` to `filterConfig`)
- Modify: `packages/audio-engine/src/index.ts`

**Interfaces:**

- Produces: `FilterType` (string-literal union of 14 values), `FilterSpec` (`{ shape: BiquadFilterType; stages: 1 | 2 | 3 | 4 }`), `filterTypeToSpec(type: FilterType): FilterSpec`. `FilterConfig` gains required `type: FilterType`. Barrel exports `FilterType`.

- [ ] **Step 1: Add the type and mapping to filter.ts**

Insert at the top of `packages/audio-engine/src/engine/filter.ts`, directly after the existing `import type { Destroyable }` line and before the class:

```typescript
export type FilterType =
  | 'lowpass12'
  | 'lowpass24'
  | 'lowpass36'
  | 'lowpass48'
  | 'highpass12'
  | 'highpass24'
  | 'highpass36'
  | 'highpass48'
  | 'bandpass'
  | 'notch'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'allpass';

export interface FilterSpec {
  shape: BiquadFilterType;
  stages: 1 | 2 | 3 | 4;
}

const FILTER_SPECS: Record<FilterType, FilterSpec> = {
  lowpass12: { shape: 'lowpass', stages: 1 },
  lowpass24: { shape: 'lowpass', stages: 2 },
  lowpass36: { shape: 'lowpass', stages: 3 },
  lowpass48: { shape: 'lowpass', stages: 4 },
  highpass12: { shape: 'highpass', stages: 1 },
  highpass24: { shape: 'highpass', stages: 2 },
  highpass36: { shape: 'highpass', stages: 3 },
  highpass48: { shape: 'highpass', stages: 4 },
  bandpass: { shape: 'bandpass', stages: 1 },
  notch: { shape: 'notch', stages: 1 },
  lowshelf: { shape: 'lowshelf', stages: 1 },
  highshelf: { shape: 'highshelf', stages: 1 },
  peaking: { shape: 'peaking', stages: 1 },
  allpass: { shape: 'allpass', stages: 1 },
};

export function filterTypeToSpec(type: FilterType): FilterSpec {
  return FILTER_SPECS[type];
}
```

- [ ] **Step 2: Add `type` to FilterConfig**

In `packages/audio-engine/src/types/filter-config.ts`, replace the whole file with:

```typescript
import type { FilterType } from '../engine/filter';

export interface FilterConfig {
  /**
   * Filter shape and slope. Slope types chain biquad stages, each adding
   * 12 dB/octave of rolloff (e.g. 'lowpass24' = two chained lowpass stages).
   */
  type: FilterType;
  frequency: number;
  /**
   * The quality factor of the filter, controlling the resonance peak.
   * Range: 0.5-20 (in practice)
   */
  q: number;
  envAmount: number;
  /**
   * Keyboard tracking amount. 0 = no tracking, 1 = full 1:1 tracking,
   * 2 = over-tracking. At 100%, a note one octave above the reference
   * (C4) doubles the filter cutoff relative to the base knob position.
   */
  tracking: number;
}
```

- [ ] **Step 3: Add the default `type` to the engine config**

In `packages/audio-engine/src/engine/engine.ts`, add `type: 'lowpass12'` as the first property of the `filterConfig` object (currently lines 83-88):

```typescript
  public readonly filterConfig: FilterConfig = {
    type: 'lowpass12',
    frequency: 350,
    q: 6,
    envAmount: 3600, // cents, -9600 to 9600
    tracking: 0.5,
  };
```

- [ ] **Step 4: Export FilterType from the package barrel**

In `packages/audio-engine/src/index.ts`, add below the existing `WaveshaperType` re-export:

```typescript
export type { FilterType } from './engine/filter';
```

- [ ] **Step 5: Verify build + lint pass**

Run: `pnpm build`
Expected: all packages build, no TypeScript errors.

Run: `pnpm lint`
Expected: prettier reports no issues.

- [ ] **Step 6: Commit**

```bash
git add packages/audio-engine/src/engine/filter.ts packages/audio-engine/src/types/filter-config.ts packages/audio-engine/src/engine/engine.ts packages/audio-engine/src/index.ts
git commit -m "feat(engine): add FilterType union and spec mapping"
```

---

### Task 2: FilterResonance — shared Q transform

**Context:** New class owning the Q source and the per-slope `q^(1/N)` WaveShaper transforms. One instance per engine. Slopes 2/3/4 get their own `Gain(1/20) → WaveShaper` chain; slope 1 (single-stage types) returns the raw Q source (identity).

**Files:**

- Create: `packages/audio-engine/src/engine/filter-resonance.ts`

**Interfaces:**

- Consumes: `Destroyable` from `./destroyable`.
- Produces: `class FilterResonance implements Destroyable` with
  `constructor(ctxt: AudioContext, startQ: number)`,
  `get q(): number`, `set q(value: number)`,
  `stageQFor(slope: 1 | 2 | 3 | 4): AudioNode`,
  `destroy(): void`.

- [ ] **Step 1: Write the class**

Create `packages/audio-engine/src/engine/filter-resonance.ts`:

```typescript
import type { Destroyable } from './destroyable';

const CURVE_SAMPLES = 1024;
const SCALE = 20;
const SLOPES = [2, 3, 4] as const;

export class FilterResonance implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly source: ConstantSourceNode;
  private readonly transforms = new Map<1 | 2 | 3 | 4, AudioNode>();
  private destroyed = false;

  constructor(ctxt: AudioContext, startQ: number) {
    this.ctxt = ctxt;
    this.source = ctxt.createConstantSource();
    this.source.offset.value = startQ;
    this.source.start();
    this.transforms.set(1, this.source);

    for (const slope of SLOPES) {
      const scale = ctxt.createGain();
      scale.gain.value = 1 / SCALE;
      const shaper = ctxt.createWaveShaper();
      shaper.curve = this.buildCurve(slope);
      this.source.connect(scale);
      scale.connect(shaper);
      this.transforms.set(slope, shaper);
    }
  }

  get q(): number {
    return this.source.offset.value;
  }

  set q(value: number) {
    this.source.offset.linearRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
  }

  stageQFor(slope: 1 | 2 | 3 | 4): AudioNode {
    return this.transforms.get(slope) ?? this.source;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.source.disconnect();
    this.source.stop();
    this.transforms.forEach(node => {
      if (node !== this.source) {
        node.disconnect();
      }
    });
  }

  private buildCurve(slope: number): Float32Array {
    const curve = new Float32Array(CURVE_SAMPLES);
    for (let i = 0; i < CURVE_SAMPLES; ++i) {
      const input = (i / (CURVE_SAMPLES - 1)) * 2 - 1;
      curve[i] = input < 0 ? 0 : Math.pow(SCALE * input, 1 / slope);
    }
    return curve;
  }
}
```

Notes:

- `source.offset.value = startQ` matches the old `createConstantSource(q)` — immediate, no ramp on startup.
- The curve is indexed exactly like Web Audio maps `[-1, 1]` → curve indices; the negative half is filled with `0` (Q is never negative).
- `stageQFor(1)` returns the raw source; slopes 2/3/4 return the WaveShaper node (its output carries `q^(1/slope)`).
- This class is intentionally unused until Task 3 — an exported class triggers no unused-variable errors.

- [ ] **Step 2: Verify build + lint pass**

Run: `pnpm build`
Expected: all packages build, no TypeScript errors.

Run: `pnpm lint`
Expected: prettier reports no issues.

- [ ] **Step 3: Commit**

```bash
git add packages/audio-engine/src/engine/filter-resonance.ts
git commit -m "feat(engine): add shared FilterResonance Q transform"
```

---

### Task 3: Filter rework + engine/voice wiring

**Context:** The coupling — engine owns the shared Q/type, voices wire the shared sources into the Filter — means this refactor lands as one cohesive change. The `Filter` becomes a stage-chain on a stable `gain → output` skeleton, driven by constructor-injected shared nodes, with incremental rebuilds. The engine swaps `filterQSource` for `FilterResonance` + a type `Observable`. The voice stops touching filter params directly.

**Files:**

- Rewrite: `packages/audio-engine/src/engine/filter.ts`
- Modify: `packages/audio-engine/src/engine/axiom-voice-config.ts`
- Modify: `packages/audio-engine/src/engine/axiom-voice.ts`
- Modify: `packages/audio-engine/src/engine/engine.ts`

**Interfaces:**

- Consumes (from Tasks 1-2): `FilterType`, `filterTypeToSpec`, `FilterConfig` (with `type`), `FilterResonance`.
- Produces: `Filter` constructor takes
  `{ cutoff: ConstantSourceNode; resonance: FilterResonance; type: Observable<FilterType> }`.
  Removed getters: `frequency`, `q`, `detune`. Added: `connectModulation(node: AudioNode): void`.
  Kept: `input`, `drive`, `keytrack`, `noteOn`, `connect`, `disconnect`, `destroy`.
  `AxiomVoiceConfig` gains `filterType: Observable<FilterType>`, changes `filterResonance` to `FilterResonance`.
  `AudioEngine` gains `filterType` getter/setter; `filterQ` now delegates to `FilterResonance`.

- [ ] **Step 1: Rewrite filter.ts**

Replace the entire contents of `packages/audio-engine/src/engine/filter.ts`:

```typescript
import type { Observable } from '../utils/observable';
import type { Destroyable } from './destroyable';
import type { FilterResonance } from './filter-resonance';

export type FilterType =
  | 'lowpass12'
  | 'lowpass24'
  | 'lowpass36'
  | 'lowpass48'
  | 'highpass12'
  | 'highpass24'
  | 'highpass36'
  | 'highpass48'
  | 'bandpass'
  | 'notch'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'allpass';

export interface FilterSpec {
  shape: BiquadFilterType;
  stages: 1 | 2 | 3 | 4;
}

const FILTER_SPECS: Record<FilterType, FilterSpec> = {
  lowpass12: { shape: 'lowpass', stages: 1 },
  lowpass24: { shape: 'lowpass', stages: 2 },
  lowpass36: { shape: 'lowpass', stages: 3 },
  lowpass48: { shape: 'lowpass', stages: 4 },
  highpass12: { shape: 'highpass', stages: 1 },
  highpass24: { shape: 'highpass', stages: 2 },
  highpass36: { shape: 'highpass', stages: 3 },
  highpass48: { shape: 'highpass', stages: 4 },
  bandpass: { shape: 'bandpass', stages: 1 },
  notch: { shape: 'notch', stages: 1 },
  lowshelf: { shape: 'lowshelf', stages: 1 },
  highshelf: { shape: 'highshelf', stages: 1 },
  peaking: { shape: 'peaking', stages: 1 },
  allpass: { shape: 'allpass', stages: 1 },
};

export function filterTypeToSpec(type: FilterType): FilterSpec {
  return FILTER_SPECS[type];
}

interface FilterInputs {
  cutoff: ConstantSourceNode;
  resonance: FilterResonance;
  type: Observable<FilterType>;
}

export class Filter implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly gain: GainNode;
  private readonly output: GainNode;
  private readonly resonance: FilterResonance;
  private readonly cutoff: ConstantSourceNode;
  private readonly keytrackSource: ConstantSourceNode;
  private readonly keytrackGain: GainNode;
  private readonly modulationNodes: AudioNode[] = [];
  private readonly typeSubscription: { unsubscribe: () => void };
  private stages: BiquadFilterNode[] = [];
  private destroyed = false;

  constructor(ctxt: AudioContext, config: FilterInputs) {
    this.ctxt = ctxt;
    this.cutoff = config.cutoff;
    this.resonance = config.resonance;

    this.gain = ctxt.createGain();
    this.output = ctxt.createGain();
    this.output.gain.value = 1;

    this.keytrackSource = ctxt.createConstantSource();
    this.keytrackSource.offset.value = 0;
    this.keytrackSource.start();

    this.keytrackGain = ctxt.createGain();
    this.keytrackGain.gain.value = 0;
    this.keytrackSource.connect(this.keytrackGain);

    this.typeSubscription = config.type.subscribe(type => this.rebuild(type));
    this.rebuild(config.type.value);
  }

  get input(): AudioNode {
    return this.gain;
  }

  get drive(): AudioParam {
    return this.gain.gain;
  }

  get keytrack(): AudioParam {
    return this.keytrackGain.gain;
  }

  connectModulation(node: AudioNode): void {
    this.modulationNodes.push(node);
    this.stages.forEach(stage => node.connect(stage.detune));
  }

  noteOn(noteNumber: number, now: number): void {
    this.keytrackSource.offset.setValueAtTime(100 * noteNumber, now);
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void;
  disconnect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void {
    if (destination) {
      this.output.disconnect(destination);
    } else {
      this.output.disconnect();
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.typeSubscription.unsubscribe();
    this.stages.forEach(stage => this.teardownStage(stage));
    this.stages = [];
    this.gain.disconnect();
    this.output.disconnect();
    this.keytrackSource.disconnect();
    this.keytrackSource.stop();
    this.keytrackGain.disconnect();
  }

  private rebuild(type: FilterType): void {
    const spec = filterTypeToSpec(type);
    const cur = this.stages.length;

    this.stages.forEach(stage => {
      stage.type = spec.shape;
    });

    if (spec.stages !== cur) {
      this.stages.forEach(stage => {
        stage.Q.disconnect();
        this.resonance.stageQFor(spec.stages).connect(stage.Q);
      });
    }

    if (spec.stages > cur) {
      for (let i = cur; i < spec.stages; ++i) {
        const stage = this.ctxt.createBiquadFilter();
        stage.type = spec.shape;
        stage.frequency.value = 0;
        this.cutoff.connect(stage.frequency);
        this.keytrackGain.connect(stage.detune);
        this.modulationNodes.forEach(node => node.connect(stage.detune));
        this.resonance.stageQFor(spec.stages).connect(stage.Q);
        this.stages.push(stage);
      }
    } else if (spec.stages < cur) {
      for (let i = spec.stages; i < cur; ++i) {
        this.teardownStage(this.stages[i]!);
      }
      this.stages.length = spec.stages;
    }

    this.wireChain();
  }

  private wireChain(): void {
    this.gain.disconnect();
    this.stages.forEach(stage => stage.disconnect());
    if (this.stages.length === 0) {
      return;
    }
    this.gain.connect(this.stages[0]!);
    for (let i = 1; i < this.stages.length; ++i) {
      this.stages[i - 1]!.connect(this.stages[i]!);
    }
    this.stages[this.stages.length - 1]!.connect(this.output);
  }

  private teardownStage(stage: BiquadFilterNode): void {
    stage.disconnect();
    stage.frequency.disconnect();
    stage.detune.disconnect();
    stage.Q.disconnect();
  }
}
```

Notes:

- `typeSubscription = config.type.subscribe(...)` and call `.unsubscribe()` — `Observable.subscribe` returns `{ unsubscribe }`, not a bare function.
- `frequency`/`q`/`detune` getters are gone. Q no longer flows through a single param — each stage taps `resonance.stageQFor(stages)`.
- Shared sources fan out per-voice: a stage's `param.disconnect()` only tears down that voice's edge to the shared engine node.
- `noUncheckedIndexedAccess` — indexed reads use `!`.

- [ ] **Step 2: Update AxiomVoiceConfig**

In `packages/audio-engine/src/engine/axiom-voice-config.ts`, replace the imports and the two filter lines:

```typescript
import type { EnvelopeConfig, FixedArray, WaveFormType } from '../types';
import type { Observable } from '../utils/observable';
import type { OscillatorCount } from './constants';
import type { FilterType } from './filter';
import type { FilterResonance } from './filter-resonance';
import type { WaveshaperCurve } from './waveshaper-curve';

export interface AxiomVoiceConfig {
  ampEnvelope: EnvelopeConfig;
  filterEnvelope: EnvelopeConfig;
  filterCutoff: ConstantSourceNode;
  filterResonance: FilterResonance;
  filterType: Observable<FilterType>;
  filterEnvAmount: ConstantSourceNode;
  filterKeyTrack: ConstantSourceNode;
  oscillatorDetuneSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorGainSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorWaveForms: Observable<FixedArray<WaveFormType, OscillatorCount>>;
  waveshaperCurve: WaveshaperCurve;
  waveshaperDrive: ConstantSourceNode;
}
```

- [ ] **Step 3: Update AxiomVoice wiring**

In `packages/audio-engine/src/engine/axiom-voice.ts`, replace the constructor filter block (currently `this.filter = new Filter(ctxt);` through `this.config.filterKeyTrack.connect(this.filter.keytrack);`):

```typescript
this.filter = new Filter(ctxt, {
  cutoff: this.config.filterCutoff,
  resonance: this.config.filterResonance,
  type: this.config.filterType,
});

// Filter Env Amount -> Filter Envelope -> Filter Stages (Detune)
this.config.filterEnvAmount.connect(this.filterEnvelope.node);
this.filter.connectModulation(this.filterEnvelope.node);

this.config.filterKeyTrack.connect(this.filter.keytrack);
```

Then, in `destroy()`, remove the two lines that disconnect the cutoff and resonance sources (keep the envAmount and keytrack lines). The old block:

```typescript
this.config.filterCutoff.disconnect(this.filter.frequency);
this.config.filterResonance.disconnect(this.filter.q);
this.config.filterEnvAmount.disconnect(this.filterEnvelope.node);
```

becomes:

```typescript
this.config.filterEnvAmount.disconnect(this.filterEnvelope.node);
```

- [ ] **Step 4: Update the engine**

In `packages/audio-engine/src/engine/engine.ts`:

1. Add imports (`FilterType` is a type, `FilterResonance` is a value):

```typescript
import { FilterResonance } from './filter-resonance';
import type { FilterType } from './filter';
```

2. Replace the `filterQSource` field declaration with `FilterResonance`:

```typescript
  private readonly filterResonance: FilterResonance;
```

and add the type observable field next to the existing `_waveshaperType` field:

```typescript
  private readonly _filterType: Observable<FilterType>;
```

3. In the constructor, replace:

```typescript
this.filterQSource = this.createConstantSource(this.filterConfig.q);
```

with:

```typescript
this.filterResonance = new FilterResonance(ctxt, this.filterConfig.q);
this._filterType = new Observable<FilterType>(this.filterConfig.type);
```

4. In `voiceConfig`, replace:

```typescript
      filterResonance: this.filterQSource,
```

with:

```typescript
      filterResonance: this.filterResonance,
      filterType: this._filterType,
```

5. Replace the `filterQ` getter/setter:

```typescript
  get filterQ(): number {
    return this.filterResonance.q;
  }

  set filterQ(q: number) {
    this.filterResonance.q = q;
    this.filterConfig.q = q;
  }
```

6. Add a `filterType` getter/setter right below the `filterQ` setter:

```typescript
  get filterType(): FilterType {
    return this._filterType.value;
  }

  set filterType(val: FilterType) {
    this.filterConfig.type = val;
    this._filterType.value = val;
  }
```

7. In `destroy()`, replace:

```typescript
this.filterQSource.disconnect();
this.filterQSource.stop();
```

with:

```typescript
this.filterResonance.destroy();
```

- [ ] **Step 5: Verify build + lint pass**

Run: `pnpm build`
Expected: all packages build, no TypeScript errors.

Run: `pnpm lint`
Expected: prettier reports no issues.

Also grep for stale references before committing:

Run: `rg "filterQSource|filter\.frequency|filter\.q|filter\.detune" packages/audio-engine/src`
Expected: no matches.

- [ ] **Step 6: Commit**

```bash
git add packages/audio-engine/src/engine/filter.ts packages/audio-engine/src/engine/axiom-voice-config.ts packages/audio-engine/src/engine/axiom-voice.ts packages/audio-engine/src/engine/engine.ts
git commit -m "refactor(engine): filter class with slope stages and shared resonance"
```

---

### Task 4: FilterPanel toggle + Synth wiring

**Context:** Wire the engine's `filterType` into the UI. The FilterPanel gets a six-entry flat Toggle (reusing the existing `Toggle.vue`); `Synth.vue` adds the model + watch bridge, mirroring the waveshaper type wiring.

**Files:**

- Modify: `app/src/components/FilterPanel.vue`
- Modify: `app/src/components/Synth.vue`

**Interfaces:**

- Consumes: `FilterType` from `@axiom/audio-engine` (barrel — Task 1), `engine.value.filterType` getter/setter (Task 3).
- Produces: `FilterPanel` model `type: FilterType` (required). Labels `LP12 LP24 HP12 HP24 BP Notch`.

- [ ] **Step 1: Add the toggle to FilterPanel**

In `app/src/components/FilterPanel.vue`, replace the whole file:

```vue
<template>
  <Panel :label="label">
    <template #top-right>
      <Toggle v-model="type" :values="types" />
    </template>
    <div class="mt-3 flex flex-row justify-between gap-4">
      <Knob
        label="Cutoff"
        v-model="cutoff"
        class="mt-3"
        size="md"
        :from="20"
        :to="20000"
        :log-base="2"
        :default="20000"
        :format="v => `${v.toFixed(0)} Hz`"
      />
      <Knob
        label="Res"
        v-model="resonance"
        class="mt-3"
        size="md"
        :from="0"
        :to="1"
        :default="0.6"
        :format="v => fractionDisplay(0)(v * 100)"
      />
      <Knob
        label="Env Amt"
        v-model="envAmount"
        class="mt-3"
        size="md"
        :from="-1"
        :to="1"
        :default="0"
        :format="v => fractionDisplay(0)(v * 100)"
      />
      <Knob
        label="Tracking"
        v-model="tracking"
        class="mt-3"
        size="md"
        :from="0"
        :to="2"
        :default="0"
        :format="v => fractionDisplay(0)(v * 100)"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { type FilterType } from '@axiom/audio-engine';
import { fractionDisplay } from '../utils/fraction-display.ts';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';

const type = defineModel<FilterType>('type', {
  required: true,
});

const cutoff = defineModel<number>('cutoff', {
  required: true,
});

const resonance = defineModel<number>('resonance', {
  required: true,
});

const envAmount = defineModel<number>('envAmount', {
  required: true,
});

const tracking = defineModel<number>('tracking', {
  required: true,
});

const types: Array<{ id: FilterType; label: string }> = [
  { id: 'lowpass12', label: 'LP12' },
  { id: 'lowpass24', label: 'LP24' },
  { id: 'highpass12', label: 'HP12' },
  { id: 'highpass24', label: 'HP24' },
  { id: 'bandpass', label: 'BP' },
  { id: 'notch', label: 'Notch' },
];

withDefaults(
  defineProps<{
    label?: string;
  }>(),
  {
    label: 'VCF',
  },
);
</script>
```

- [ ] **Step 2: Wire the model in Synth.vue**

In `app/src/components/Synth.vue`:

1. Add the ref next to `const tracking = ...`:

```typescript
const filterType = ref(engine.value.filterType);
```

2. Add the watch next to the `tracking` watch:

```typescript
watch(filterType, newType => {
  engine.value.filterType = newType;
});
```

3. Add the binding to the `<FilterPanel>` tag:

```vue
<FilterPanel
  class="col-span-12 row-start-4 sm:col-span-6 sm:col-start-7 sm:row-start-1 lg:col-span-4"
  v-model:cutoff="cutoff"
  v-model:resonance="resonance"
  v-model:envAmount="envAmount"
  v-model:tracking="tracking"
  v-model:type="filterType"
/>
```

- [ ] **Step 3: Verify build + lint pass**

Run: `pnpm build`
Expected: all packages build, no TypeScript errors.

Run: `pnpm lint`
Expected: prettier reports no issues.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/FilterPanel.vue app/src/components/Synth.vue
git commit -m "feat(ui): filter type toggle in FilterPanel"
```

---

### Task 5: Final verification + CONCERNS.md update

**Context:** Confirm the whole workspace builds/lints, perform the manual audio checks, and record the accepted performance trade-offs in the codebase concerns doc.

**Files:**

- Modify: `docs/codebase/CONCERNS.md`
- None else.

- [ ] **Step 1: Update CONCERNS.md**

In `docs/codebase/CONCERNS.md`, add three rows to the Top Risks table (after the existing row at line 12):

```markdown
| med | Filter type-switch rebuild touches all 16 voices; hard switch clicks audibly | `packages/audio-engine/src/engine/filter.ts` (rebuild/wireChain) | Click + brief re-patch on type change; rebuild is incremental (shape swaps churn no nodes) | Accepted; consider a crossfade between the old/new chains later |
| low | Slope transform chains (Gain + WaveShaper ×3) run even when no slope is used or synth is silent | `packages/audio-engine/src/engine/filter-resonance.ts` | Trivial block cost, always-on | Accepted; lazy-bridging the chains is YAGNI |
| low | WaveShaper Q-curve resolution degrades below Q < 0.5 | `packages/audio-engine/src/engine/filter-resonance.ts` (buildCurve) | Invisible within the Res-knob range (0.5–20); relevant if Q is ever modulated toward 0 | Document; re-map curve if Q-modulation lands there |
```

- [ ] **Step 2: Clean build + lint from repo root**

Run: `pnpm build`
Expected: all packages build without errors or warnings.

Run: `pnpm lint`
Expected: prettier reports no issues.

- [ ] **Step 3: Manual audio checks**

Run: `pnpm dev` and in the browser:

1. Hold a chord (8+ voices — multiple keys), then toggle through every filter type. Confirm only the accepted hard-switch click, no dropouts or crackle after the switch settles.
2. While holding a note, confirm the Res knob still behaves: LP12 at low Res sweeps clean and smooth; switch to LP24 and verify the resonance feels comparable (not doubled/sharp) at the same knob position.
3. Confirm `filterType` comes back from `engine.value.filterType` and the toggle reflects `LP12` (the default) on load.
4. After `engine.destroy()` (route change/unmount), confirm note-ons no longer trigger rebuilds — i.e., no errors in the console from a destroyed engine.

- [ ] **Step 4: Commit**

```bash
git add docs/codebase/CONCERNS.md
git commit -m "docs: filter type-switch performance trade-offs"
```

- [ ] **Step 5: Confirm branch state**

Run: `git log --oneline --no-decorate -8`
Expected: the Task 1-5 commits at the top of `feature/filter-types`, over the spec commits. If ready, hand off to the user for PR creation — do not push or open a PR unless asked.
