# AudioEngine / Synth Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the monolith `AudioEngine` into a slim master-bus host (`@axiom/audio-engine`) and a new `AxiomSynth` (`@axiom/axiom-synth`) built on abstract `Synth`/`Voice` bases, with behavior preserved.

**Architecture:** `AudioEngine` keeps context + master bus + meter + scope. A new abstract `Synth<V extends Voice>` in the engine package owns voice allocation (pool, note map, stealing). `AxiomSynth` lives in a new `@axiom/axiom-synth` package with `AxiomVoice`/`AxiomVoiceConfig`, owning all Axiom shared sources, configs, and setters. The app wires `AxiomSynth.output → engine.masterInput`.

**Tech Stack:** TypeScript 6 (strict, `erasableSyntaxOnly`, `noUncheckedIndexedAccess`), Vue 3 SFCs, pnpm workspaces, Vite. No test runner — build is the gate.

## Global Constraints

- **Engine knows nothing about Axiom.** `@axiom/audio-engine` must contain zero `Axiom` identifiers. Only import direction: `@axiom/axiom-synth` → `@axiom/audio-engine`.
- **Building blocks stay in the engine package** (`Oscillator`, `Filter`, `FilterResonance`, `Envelope`, `Lfo`, `Waveshaper`, `WaveshaperCurve`, `ModulationRouter`, `Meter`, `Analyser`, `helpers`, `constants`, `Observable`, `Destroyable`, config types). Only `AxiomSynth`, `AxiomVoice`, `AxiomVoiceConfig` live in `@axiom/axiom-synth`.
- **Behavior preserved.** Levels: `AxiomSynth.output (0.6) → masterInput (1.0) → master (0.5) → comp → analyser → destination`; meter reads `masterInput` (pre-comp). Same node graph, same stealing/choke, same setter & config names.
- **No speculative features**: no mono/poly modes, no steal-policy hooks, no per-synth level/mute UI, no MIDI.
- **TS dialect:** no parameter properties, no enums (`erasableSyntaxOnly`). `noUncheckedIndexedAccess` on — index reads need `!`. `noUnusedLocals`/`noUnusedParameters` on — no dead imports.
- **Verification gate (every task):** `pnpm build` (all workspace packages) and `pnpm lint` (prettier check). No test runner exists.
- **Git:** work on branch `feature/engine-synth-separation`; commit after each task; never commit to `main` directly.
- **Spec:** `docs/superpowers/specs/2026-09-18-engine-synth-separation-design.md`.

---

### Task 1: Scaffold `@axiom/axiom-synth` package

**Files:**

- Create: `packages/axiom-synth/package.json`
- Create: `packages/axiom-synth/tsconfig.json`
- Create: `packages/axiom-synth/src/index.ts`
- Modify: `app/package.json` (add dependency)

**Interfaces:**

- Consumes: nothing yet.
- Produces: workspace package `@axiom/axiom-synth` linked for the app, empty barrel `packages/axiom-synth/src/index.ts`.

- [ ] **Step 1: Create `packages/axiom-synth/package.json`**

```json
{
  "name": "@axiom/axiom-synth",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "build": "tsc --noEmit"
  },
  "devDependencies": {
    "@vue/tsconfig": "^0.9.1",
    "typescript": "~6.0.2"
  },
  "dependencies": {
    "@axiom/audio-engine": "workspace:*"
  }
}
```

- [ ] **Step 2: Create `packages/axiom-synth/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "tsBuildInfoFile": "../../node_modules/.tmp/tsconfig.axiom-synth.tsbuildinfo"
  },
  "include": ["src/**/*.ts"]
}
```

- [ ] **Step 3: Create `packages/axiom-synth/src/index.ts`** (empty barrel placeholder)

```ts
export {};
```

- [ ] **Step 4: Add the app dependency in `app/package.json`**

In `app/package.json` `"dependencies"`, after `"@axiom/audio-engine": "workspace:*"` add:

```json
    "@axiom/axiom-synth": "workspace:*",
```

- [ ] **Step 5: Install and build**

Run: `pnpm install && pnpm build`
Expected: install completes, then build succeeds for `@axiom/audio-engine`, `@axiom/axiom-synth`, `@axiom/app` (app still uses the old engine — this is a no-op scaffold).

- [ ] **Step 6: Commit**

```bash
git add packages/axiom-synth app/package.json pnpm-lock.yaml pnpm-workspace.yaml
git commit -m "feat(axiom-synth): scaffold @axiom/axiom-synth package"
```

`pnpm-workspace.yaml` already globs `packages/*`, so no workspace-file change is expected; if `pnpm install` rewrote it or the lockfile, stage those too.

---

### Task 2: Widen `@axiom/audio-engine` barrel to export building blocks + bases

**Files:**

- Modify: `packages/audio-engine/src/engine/index.ts`
- Modify: `packages/audio-engine/src/index.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: public exports so `@axiom/axiom-synth` can import `Voice`, `Oscillator`, `Filter`, `FilterType`, `Envelope`, `Lfo`, `Waveshaper`, `WaveshaperCurve`, `ModulationRouter`, `FilterResonance`, `helpers` (`freqOf`), `constants`, `Observable`, `Destroyable`.

Current `packages/audio-engine/src/engine/index.ts` is one line: `export * from './engine';`.
Current `packages/audio-engine/src/index.ts` is 10 lines (see spec §barrel). Duplicate re-export names (e.g. `WaveshaperType`, `FilterType`) currently exported explicitly must be removed — conflicting `export *` from two modules that export the same name is a TS error.

- [ ] **Step 1: Replace `packages/audio-engine/src/engine/index.ts` entirely**

```ts
export * from './analyser';
export * from './constants';
export * from './destroyable';
export * from './envelope';
export * from './filter';
export * from './filter-resonance';
export * from './helpers';
export * from './lfo';
export * from './meter';
export * from './modulation-router';
export * from './oscillator';
export * from './voice';
export * from './engine';
export * from './waveshaper-curve';
export { Waveshaper } from './waveshaper';
```

Note: `WaveshaperType` is exported by `waveshaper-curve.ts` and re-exported by `waveshaper.ts`; star-exporting both would collide, so `waveshaper` is imported selectively (`Waveshaper` class only). `Synth` gets appended here later (Task 5).

- [ ] **Step 2: Replace `packages/audio-engine/src/index.ts` entirely**

```ts
export * from './engine';
export type * from './types/envelope-config';
export type * from './types/filter-config';
export type * from './types/oscillator-config';
export type * from './types/fixed-array';
export type * from './types/waveshaper-config';
export type * from './types/lfo-config';
```

The previous explicit `export type { WaveshaperType }…`, `export type { FilterType }…`, `export type { LfoIndex }…` lines are now covered by `export * from './engine'` and must be dropped to avoid duplicate-export errors.

- [ ] **Step 3: Build**

Run: `pnpm build`
Expected: all three packages typecheck. In particular no duplicate-export errors from the engine barrel.

- [ ] **Step 4: Commit**

```bash
git add packages/audio-engine/src/engine/index.ts packages/audio-engine/src/index.ts
git commit -m "refactor(engine): widen barrel to export building blocks and bases"
```

---

### Task 3: Move `AxiomVoice` + `AxiomVoiceConfig` into `@axiom/axiom-synth` (strangler copy)

**Files:**

- Create: `packages/axiom-synth/src/axiom-voice-config.ts`
- Create: `packages/axiom-synth/src/axiom-voice.ts`
- Modify: `packages/axiom-synth/src/index.ts`
- (Old copies in `packages/audio-engine/src/engine/` stay until Task 7 — engine still uses them.)

**Interfaces:**

- Consumes: `@axiom/audio-engine` exports from Task 2.
- Produces: `AxiomVoice` (extends `Voice`), `AxiomVoiceConfig` exported from `@axiom/axiom-synth`.

- [ ] **Step 1: Create `packages/axiom-synth/src/axiom-voice-config.ts`** — verbatim content of `packages/audio-engine/src/engine/axiom-voice-config.ts`, imports changed from relative paths to the engine package:

```ts
import type {
  EnvelopeConfig,
  FixedArray,
  LfoWaveformType,
  WaveFormType,
} from '@axiom/audio-engine';
import type {
  FilterResonance,
  FilterType,
  OscillatorCount,
  WaveshaperCurve,
} from '@axiom/audio-engine';
import type { LfoCount, LfoTargetCount } from '@axiom/audio-engine';
import type { Observable } from '@axiom/audio-engine';

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
  lfoWaveforms: FixedArray<Observable<LfoWaveformType>, LfoCount>;
  lfoRateSources: FixedArray<ConstantSourceNode, LfoCount>;
  lfoDepthSources: FixedArray<
    FixedArray<ConstantSourceNode, LfoTargetCount>,
    LfoCount
  >;
}
```

- [ ] **Step 2: Create `packages/axiom-synth/src/axiom-voice.ts`** — verbatim content of `packages/audio-engine/src/engine/axiom-voice.ts`, imports changed:

Replace the import block with:

```ts
import {
  LFO_COUNT,
  LFO_TARGET_INDEX,
  OSCILLATOR_COUNT,
  type LfoCount,
  type OscillatorCount,
  type OscillatorIndex,
} from '@axiom/audio-engine';
import type { FixedArray } from '@axiom/audio-engine';
import { Envelope } from '@axiom/audio-engine';
import { Filter } from '@axiom/audio-engine';
import { freqOf } from '@axiom/audio-engine';
import { Lfo } from '@axiom/audio-engine';
import { ModulationRouter } from '@axiom/audio-engine';
import { Oscillator } from '@axiom/audio-engine';
import { Voice } from '@axiom/audio-engine';
import { Waveshaper } from '@axiom/audio-engine';
import type { AxiomVoiceConfig } from './axiom-voice-config';
```

The class body (constructor through `destroy()`), including the `// intentionally not patched` comments and try/catch in `onSoundStop`, is unchanged. `lfo-waveform.ts` `LfoWaveformType` never appears in the body — only in the config. `Destroyable` was imported but unused in the original; drop it (it is implied by extending `Voice`).

- [ ] **Step 3: Replace `packages/axiom-synth/src/index.ts`**

```ts
export * from './axiom-voice';
export * from './axiom-voice-config';
```

- [ ] **Step 4: Build**

Run: `pnpm build`
Expected: all packages typecheck. Engine still compiles its own copy of `AxiomVoice`; the new package's copy compiles independently.

- [ ] **Step 5: Commit**

```bash
git add packages/axiom-synth
git commit -m "feat(axiom-synth): move AxiomVoice + AxiomVoiceConfig into @axiom/axiom-synth"
```

---

### Task 4: Add `resumeIfSuspended` helper, `Synth` base class, and `AxiomSynth`

**Files:**

- Modify: `packages/audio-engine/src/engine/helpers.ts`
- Modify: `packages/audio-engine/src/engine/engine.ts` (delegate `ensureStarted`)
- Create: `packages/audio-engine/src/engine/synth.ts`
- Modify: `packages/audio-engine/src/engine/index.ts` (export `Synth`)
- Create: `packages/axiom-synth/src/axiom-synth.ts`
- Modify: `packages/axiom-synth/src/index.ts`

**Interfaces:**

- Consumes: `Voice`, engine blocks/constants/helpers from Task 2; `AxiomVoice`/`AxiomVoiceConfig` from Task 3.
- Produces:
  - `resumeIfSuspended(ctxt: AudioContext): void` in `helpers.ts`
  - `abstract class Synth<V extends Voice>` exported from `@axiom/audio-engine` with `noteOn(noteNumber, velocity)`, `noteOff(noteNumber)`, `allNotesOff()`, `destroy()`, protected `ctxt`/`audioSink`/`destroyed`, abstract `createVoice(): V`
  - `class AxiomSynth extends Synth<AxiomVoice>` with `output: GainNode` (public, gain 0.6), same configs/setters as the old `AudioEngine`.

- [ ] **Step 1: Add the helper to `packages/audio-engine/src/engine/helpers.ts`**

Replace the file content with:

```ts
export function freqOf(note: number) {
  return 440 * Math.pow(2, (note - 69) / 12);
}

export function resumeIfSuspended(ctxt: AudioContext) {
  if (ctxt.state === 'suspended') {
    ctxt.resume();
  }
}
```

- [ ] **Step 2: Delegate `AudioEngine.ensureStarted`**

In `packages/audio-engine/src/engine/engine.ts`, add `import { resumeIfSuspended } from './helpers';` to the import block and replace the `ensureStarted()` body:

```ts
  ensureStarted() {
    resumeIfSuspended(this.ctxt);
  }
```

- [ ] **Step 3: Create `packages/audio-engine/src/engine/synth.ts`**

```ts
import type { Destroyable } from './destroyable';
import { resumeIfSuspended } from './helpers';
import type { Voice } from './voice';

export abstract class Synth<V extends Voice> implements Destroyable {
  protected readonly ctxt: AudioContext;
  protected readonly audioSink: AudioNode;
  protected destroyed = false;

  private readonly maxVoices: number;
  private voicePool: V[] | undefined;
  private readonly noteToVoiceMap: Map<number, V> = new Map();

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    options?: { maxVoices?: number },
  ) {
    this.ctxt = ctxt;
    this.audioSink = audioSink;
    this.maxVoices = options?.maxVoices ?? 16;
  }

  protected abstract createVoice(): V;

  private ensureVoicePool(): V[] {
    if (this.voicePool === undefined) {
      this.voicePool = Array.from({ length: this.maxVoices }, () =>
        this.createVoice(),
      );
    }
    return this.voicePool;
  }

  noteOn(noteNumber: number, velocity: number) {
    if (this.destroyed) {
      return;
    }
    resumeIfSuspended(this.ctxt);
    const now = this.ctxt.currentTime;
    const voicePool = this.ensureVoicePool();

    if (this.noteToVoiceMap.has(noteNumber)) {
      console.log(
        `[${now.toFixed(4)}] noteOn(${noteNumber}) - already active, retriggering`,
      );
      this.noteOff(noteNumber);
    }

    let targetVoice = voicePool.find(v => v.isAvailable(now));
    let startDelay = 0;

    if (targetVoice) {
      console.log(
        `[${now.toFixed(4)}] Voice ${targetVoice.id} available for note ${noteNumber}`,
      );
    }

    if (!targetVoice) {
      let oldestTime = Infinity;
      let oldestVoice: V | null = null;

      for (const voice of voicePool) {
        if (voice.lastUsed < oldestTime) {
          oldestTime = voice.lastUsed;
          oldestVoice = voice;
        }
      }

      if (oldestVoice) {
        const age = now - oldestTime;
        console.warn(
          `[${now.toFixed(4)}] Voice stealing triggered for note ${noteNumber} - oldest voice is ${oldestVoice.id}, age ${age.toFixed(1)} s`,
        );
        targetVoice = oldestVoice;

        for (const [note, voice] of this.noteToVoiceMap.entries()) {
          if (voice === targetVoice) {
            this.noteToVoiceMap.delete(note);
          }
        }

        targetVoice.fastChoke(now);
        startDelay = targetVoice.chokeDuration;
      }
    }

    if (targetVoice) {
      targetVoice.noteOn(noteNumber, velocity, startDelay);
      this.noteToVoiceMap.set(noteNumber, targetVoice);
    }
  }

  noteOff(noteNumber: number) {
    if (this.destroyed) {
      return;
    }
    const voice = this.noteToVoiceMap.get(noteNumber);
    if (voice) {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - releasing voice`,
      );
      voice.noteOff();
      this.noteToVoiceMap.delete(noteNumber);
    } else {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - no active voice found`,
      );
    }
  }

  allNotesOff() {
    if (this.destroyed) {
      return;
    }
    console.log('allNotesOff');
    for (const [note, voice] of this.noteToVoiceMap.entries()) {
      voice.noteOff();
      this.noteToVoiceMap.delete(note);
    }
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.noteToVoiceMap.clear();
    this.voicePool?.forEach(voice => voice.destroy());
  }
}
```

(Blocker check: this uses explicit field assignment, no parameter properties, and `erasableSyntaxOnly`-safe constructs. `noteToVoiceMap` maps to `V`, not `Voice`, so `voice === targetVoice` compares the concrete type.)

- [ ] **Step 4: Export `Synth` from the engine barrel**

In `packages/audio-engine/src/engine/index.ts`, add a line after the `voice` export:

```ts
export * from './synth';
```

- [ ] **Step 5: Create `packages/axiom-synth/src/axiom-synth.ts`**

Verbatum transplant of the old `AudioEngine` synth responsibilities. The pool is built lazily by the base; nothing Axiom-specific happens in `super()` scope. Import block references only names the transplanted body actually uses (`FilterType` comes from the engine `filter` module; `LfoTargetIndex` is unused — the old code always indexed via `LFO_TARGET_INDEX[target]`):

````ts

```ts
import {
  LFO_COUNT,
  LFO_TARGET_COUNT,
  LFO_TARGET_INDEX,
  LFO_TARGETS,
  type LfoCount,
  type LfoIndex,
  type LfoTarget,
  type LfoTargetCount,
  type OscillatorCount,
  type OscillatorIndex,
  FilterResonance,
  Observable,
  Synth,
  WaveshaperCurve,
  type EnvelopeConfig,
  type FilterConfig,
  type FixedArray,
  type LfoConfig,
  type LfoWaveformType,
  type OscillatorConfig,
  type WaveFormType,
  type WaveshaperConfig,
  type WaveshaperType,
} from '@axiom/audio-engine';
import { AxiomVoice } from './axiom-voice';
import type { AxiomVoiceConfig } from './axiom-voice-config';

const MAX_VOICES = 16;

const LFO_DEPTH_SCALES: Record<LfoTarget, number> = {
  osc1: 150,
  osc2: 150,
  osc3: 150,
  cutoff: 1200,
  amp: 1,
  drive: 4,
};

export class AxiomSynth extends Synth<AxiomVoice> {
  public readonly output: GainNode;

  public readonly oscillatorConfigs: FixedArray<
    OscillatorConfig,
    OscillatorCount
  > = [
    { octave: 0, semi: 0, detune: 5, waveform: 'sawtooth', gain: 1 },
    { octave: 0, semi: 0, detune: -5, waveform: 'square', gain: 1 },
    { octave: -2, semi: 0, detune: 0, waveform: 'triangle', gain: 1 },
  ];

  public readonly ampEnvelope: EnvelopeConfig = {
    attackSeconds: 0.02,
    attackCurve: 'analog',
    decaySeconds: 0.3,
    decayCurve: 'analog',
    sustainLevel: 0.6,
    releaseSeconds: 0.62,
    releaseCurve: 'analog',
  };

  public readonly filterConfig: FilterConfig = {
    type: 'lowpass24',
    frequency: 360,
    q: 6,
    envAmount: 4800,
    tracking: 0.9,
  };

  public readonly filterEnvelope: EnvelopeConfig = {
    attackSeconds: 0.01,
    attackCurve: 'linear',
    decaySeconds: 0.2,
    decayCurve: 'analog',
    sustainLevel: 0.4,
    releaseSeconds: 3,
    releaseCurve: 'analog',
  };

  public readonly lfoConfigs: FixedArray<LfoConfig, LfoCount> = [
    { rateHz: 2, waveform: 'sine', depths: [-0.11, 0.09, 0, 0, -0.1, 0] },
    { rateHz: 3.47, waveform: 'sine', depths: [0, 0, 0, 0.2, 0, 0] },
    { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
    { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
  ];

  private readonly waveshaperConfig: WaveshaperConfig = {
    distortion: 50,
    drive: 0,
    type: 'soft-algebraic',
  };

  private readonly oscillatorWaveForms: Observable<
    FixedArray<WaveFormType, OscillatorCount>
  >;
  private readonly filterCutOffSource: ConstantSourceNode;
  private readonly filterResonance: FilterResonance;
  private readonly _filterType: Observable<FilterType>;
  private readonly filterEnvAmountSource: ConstantSourceNode;
  private readonly filterKeyTrackSource: ConstantSourceNode;
  private readonly oscillatorDetuneSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  private readonly oscillatorGainSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  private readonly waveShaperDriveSource: ConstantSourceNode;
  private readonly waveshaperCurve: WaveshaperCurve;
  private readonly _distortionAmount: Observable<number>;
  private readonly _waveshaperType: Observable<WaveshaperType>;
  private readonly lfoWaveforms: FixedArray<
    Observable<LfoWaveformType>,
    LfoCount
  >;
  private readonly lfoRateSources: FixedArray<ConstantSourceNode, LfoCount>;
  private readonly lfoDepthSources: FixedArray<
    FixedArray<ConstantSourceNode, LfoTargetCount>,
    LfoCount
  >;

  private readonly voiceConfig: AxiomVoiceConfig;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    super(ctxt, audioSink, { maxVoices: MAX_VOICES });

    this.output = ctxt.createGain();
    this.output.gain.value = 0.6;

    this.filterCutOffSource = this.createConstantSource(this.filterConfig.frequency);
    this.filterResonance = new FilterResonance(ctxt, this.filterConfig.q);
    this._filterType = new Observable<FilterType>(this.filterConfig.type);
    this.filterEnvAmountSource = this.createConstantSource(
      this.filterConfig.envAmount,
    );
    this.filterKeyTrackSource = this.createConstantSource(
      this.filterConfig.tracking,
    );

    this.oscillatorDetuneSources = this.createConstantSources(
      this.oscillatorConfigs.map(c => c.detune) as FixedArray<
        number,
        OscillatorCount
      >,
    );
    this.oscillatorGainSources = this.createConstantSources(
      this.oscillatorConfigs.map(c => c.gain) as FixedArray<
        number,
        OscillatorCount
      >,
    );

    this.oscillatorWaveForms = new Observable(
      this.oscillatorConfigs.map(c => c.waveform) as FixedArray<
        WaveFormType,
        OscillatorCount
      >,
    );

    this._distortionAmount = new Observable(this.waveshaperConfig.distortion);
    this.waveShaperDriveSource = this.createConstantSource(
      this.waveshaperConfig.drive,
    );
    this._waveshaperType = new Observable(this.waveshaperConfig.type);

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

    this.lfoWaveforms = Array.from(
      { length: LFO_COUNT },
      (_, i) => new Observable<LfoWaveformType>(this.lfoConfigs[i]!.waveform),
    ) as FixedArray<Observable<LfoWaveformType>, LfoCount>;
    this.lfoRateSources = Array.from({ length: LFO_COUNT }, (_, i) =>
      this.createConstantSource(this.lfoConfigs[i]!.rateHz),
    ) as FixedArray<ConstantSourceNode, LfoCount>;
    this.lfoDepthSources = Array.from({ length: LFO_COUNT }, (_, i) =>
      Array.from({ length: LFO_TARGET_COUNT }, (_, j) =>
        this.createConstantSource(this.lfoConfigs[i]!.depths[j]!),
      ),
    ) as FixedArray<FixedArray<ConstantSourceNode, LfoTargetCount>, LfoCount>;

    this.voiceConfig = {
      ampEnvelope: this.ampEnvelope,
      filterEnvelope: this.filterEnvelope,
      filterCutoff: this.filterCutOffSource,
      filterResonance: this.filterResonance,
      filterType: this._filterType,
      filterEnvAmount: this.filterEnvAmountSource,
      filterKeyTrack: this.filterKeyTrackSource,
      oscillatorDetuneSources: this.oscillatorDetuneSources,
      oscillatorGainSources: this.oscillatorGainSources,
      oscillatorWaveForms: this.oscillatorWaveForms,
      waveshaperCurve: this.waveshaperCurve,
      waveshaperDrive: this.waveShaperDriveSource,
      lfoWaveforms: this.lfoWaveforms,
      lfoRateSources: this.lfoRateSources,
      lfoDepthSources: this.lfoDepthSources,
    };
  }

  protected override createVoice(): AxiomVoice {
    return new AxiomVoice(this.ctxt, this.output, this.voiceConfig);
  }

  get filterCutOff(): number {
    return this.filterConfig.frequency;
  }

  set filterCutOff(value: number) {
    this.filterCutOffSource.offset.exponentialRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
    this.filterConfig.frequency = value;
  }

  get filterQ(): number {
    return this.filterResonance.q;
  }

  set filterQ(q: number) {
    this.filterResonance.q = q;
    this.filterConfig.q = q;
  }

  get filterType(): FilterType {
    return this._filterType.value;
  }

  set filterType(val: FilterType) {
    this.filterConfig.type = val;
    this._filterType.value = val;
  }

  get filterEnvAmount(): number {
    return this.filterConfig.envAmount;
  }

  set filterEnvAmount(value: number) {
    this.filterEnvAmountSource.offset.linearRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
    this.filterConfig.envAmount = value;
  }

  get filterKeyTrack(): number {
    return this.filterConfig.tracking;
  }

  set filterKeyTrack(value: number) {
    this.filterKeyTrackSource.offset.linearRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
    this.filterConfig.tracking = value;
  }

  get distortionAmount(): number {
    return this._distortionAmount.value;
  }

  set distortionAmount(newValue: number) {
    this._distortionAmount.value = newValue;
  }

  get waveshaperDrive(): number {
    return this.waveshaperConfig.drive;
  }

  set waveshaperDrive(value: number) {
    this.waveshaperConfig.drive = value;
    const now = this.ctxt.currentTime;
    this.waveShaperDriveSource.offset.cancelScheduledValues(now);
    this.waveShaperDriveSource.offset.linearRampToValueAtTime(
      value,
      now + 0.01,
    );
  }

  get waveshaperType(): WaveshaperType {
    return this.waveshaperConfig.type;
  }

  set waveshaperType(val: WaveshaperType) {
    this.waveshaperConfig.type = val;
    this._waveshaperType.value = val;
  }

  get shaperCurve(): Float32Array {
    return this.waveshaperCurve.curve;
  }

  setOscillatorConfiguration(index: OscillatorIndex, config: OscillatorConfig) {
    const currentConfig = this.oscillatorConfigs[index];
    if (
      currentConfig.octave !== config.octave ||
      currentConfig.semi !== config.semi ||
      currentConfig.detune !== config.detune
    ) {
      this.oscillatorDetuneSources[index].offset.linearRampToValueAtTime(
        config.detune + config.semi * 100 + config.octave * 1200,
        this.ctxt.currentTime + 0.01,
      );
    }
    if (currentConfig.waveform !== config.waveform) {
      this.oscillatorWaveForms.value = this.oscillatorWaveForms.value.map(
        (v, i) => (i === index ? config.waveform : v),
      ) as FixedArray<WaveFormType, OscillatorCount>;
    }
    if (currentConfig.gain !== config.gain) {
      this.oscillatorGainSources[index].offset.linearRampToValueAtTime(
        config.gain,
        this.ctxt.currentTime + 0.01,
      );
    }
    this.oscillatorConfigs[index] = { ...config };
  }

  setLfoConfiguration(index: LfoIndex, config: LfoConfig) {
    this.lfoConfigs[index] = {
      ...config,
      depths: [...config.depths] as FixedArray<number, LfoTargetCount>,
    };
    const now = this.ctxt.currentTime;

    this.lfoRateSources[index]!.offset.linearRampToValueAtTime(
      config.rateHz,
      now + 0.01,
    );
    this.lfoWaveforms[index]!.value = config.waveform;

    for (const target of LFO_TARGETS) {
      const targetIndex = LFO_TARGET_INDEX[target];
      const depth =
        target === 'drive'
          ? Math.max(0, config.depths[targetIndex]!)
          : config.depths[targetIndex]!;
      this.lfoDepthSources[index]![targetIndex]!.offset.linearRampToValueAtTime(
        depth * LFO_DEPTH_SCALES[target],
        now + 0.01,
      );
    }
  }

  override destroy() {
    if (this.destroyed) {
      return;
    }
    super.destroy();
    this.filterCutOffSource.disconnect();
    this.filterCutOffSource.stop();
    this.filterResonance.destroy();
    this.filterEnvAmountSource.disconnect();
    this.filterEnvAmountSource.stop();
    this.filterKeyTrackSource.disconnect();
    this.filterKeyTrackSource.stop();
    this.oscillatorDetuneSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.oscillatorGainSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.waveShaperDriveSource.disconnect();
    this.waveShaperDriveSource.stop();
    this.waveshaperCurve.destroy();
    this.lfoRateSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.lfoDepthSources.forEach(sources => {
      sources.forEach(source => {
        source.disconnect();
        source.stop();
      });
    });
    this.output.disconnect();
  }

  private createConstantSources<N extends number>(
    offsets: FixedArray<number, N>,
  ): FixedArray<ConstantSourceNode, N> {
    return offsets.map(offset =>
      this.createConstantSource(offset),
    ) as FixedArray<ConstantSourceNode, N>;
  }

  private createConstantSource(offset: number = 0) {
    const source = this.ctxt.createConstantSource();
    source.offset.value = offset;
    source.start();
    return source;
  }
}
````

Note `MAX_VOICES` and `LFO_DEPTH_SCALES` are now module consts in this package. `_filterType` stays a private `Observable` for the same reason as before (voice patches its `filterType` from the `voiceConfig` reference). The `createVoice()` call keeps its base `this.ctxt` (protected) as context and `this.output` as sink.

- [ ] **Step 6: Update `packages/axiom-synth/src/index.ts`**

```ts
export * from './axiom-synth';
export * from './axiom-voice';
export * from './axiom-voice-config';
```

- [ ] **Step 7: Build**

Run: `pnpm build`
Expected: all packages typecheck. The app still uses the old engine API — it is untouched and unchanged.
If the engine barrel emits a duplicate-export error for `Synth` vs `engine` (none expected), drop the old `export * from './engine';` merge conflict — engine exports `AudioEngine` plus nothing named `Synth`, so the star export is additive.

- [ ] **Step 8: Commit**

```bash
git add packages/audio-engine/src/engine/helpers.ts packages/audio-engine/src/engine/engine.ts packages/audio-engine/src/engine/synth.ts packages/audio-engine/src/engine/index.ts packages/axiom-synth
git commit -m "feat: Synth base + AxiomSynth on lazy voice pool"
```

---

### Task 5: Relabel `dry` → `masterInput`; switch the app to `useAxiomSynth`

**Files:**

- Modify: `packages/audio-engine/src/engine/engine.ts` (dry → masterInput, gain 1.0)
- Create: `app/src/composables/use-axiom-synth.ts`
- Modify: `app/src/components/Synth.vue`
- Modify: `app/src/components/Keyboard.vue`

**Interfaces:**

- Consumes: `AxiomSynth.output` (public, from Task 4), `AudioEngine.masterInput` (this task).
- Produces: `useAxiomSynth(): Ref<AxiomSynth>` module-singleton composable that wires `output → masterInput` and rebuilds on engine replacement.

- [ ] **Step 1: Relabel `dry` → `masterInput` in `packages/audio-engine/src/engine/engine.ts`**

In the constructor:

- Change field `private readonly dry: GainNode;` → `public readonly masterInput: GainNode;` (keep `master` etc. private).
- Change `this.dry = ctxt.createGain(); this.dry.gain.value = 0.6;` → `this.masterInput = ctxt.createGain(); this.masterInput.gain.value = 1.0;`
- Change `this.dry.connect(this.master); this.dry.connect(this.meter.input);` connection lines to `this.masterInput.connect(...)`.
- In `destroy()`, change `this.dry.disconnect();` → `this.masterInput.disconnect();`.

Nothing else changes — the old synth code inside `AudioEngine` stays until Task 6. Signal path: `output(0.6) → masterInput(1.0) → master(0.5)` equals the old `dry(0.6) → master(0.5)` total gain of `0.3`.

- [ ] **Step 2: Create `app/src/composables/use-axiom-synth.ts`**

```ts
import { ref, watch } from 'vue';
import type { AudioEngine } from '@axiom/audio-engine';
import { AxiomSynth } from '@axiom/axiom-synth';
import { useAudioEngine } from './use-audio-context.ts';

let axiomSynth: AxiomSynth | null = null;

function createSynth(engine: AudioEngine): AxiomSynth {
  const synth = new AxiomSynth(engine.ctxt, engine.masterInput);
  synth.output.connect(engine.masterInput);
  return synth;
}

export function useAxiomSynth() {
  const engine = useAudioEngine();
  const synthRef = ref<AxiomSynth>(ensureSynth(engine.value));

  watch(engine, newEngine => {
    if (axiomSynth) {
      axiomSynth.destroy();
      axiomSynth = null;
    }
    synthRef.value = ensureSynth(newEngine);
  });

  return synthRef;
}

function ensureSynth(engine: AudioEngine): AxiomSynth {
  if (!axiomSynth) {
    axiomSynth = createSynth(engine);
  }
  return axiomSynth;
}
```

(Order note: `ensureSynth` is hoisted — calling it before its definition is fine within the module. The `use-audio-context.ts` composable replaces `audioEngineRef.value` on close; this `watch` reacts by destroying the stale synth and rebuilding against the fresh `masterInput`.)

- [ ] **Step 3: Update `app/src/components/Synth.vue`**

Template: replace the three `engine.` member accesses with `synth.`:

- `v-model:amp="engine.ampEnvelope"` → `v-model:amp="synth.ampEnvelope"`
- `v-model:filter="engine.filterEnvelope"` → `v-model:filter="synth.filterEnvelope"`
- `:curve="engine.shaperCurve"` → `:curve="synth.shaperCurve"`

Script block: replace the entire `<script setup lang="ts">` body from `import` through `onUnmounted` with:

```ts
<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import type { LfoConfig, LfoIndex } from '@axiom/audio-engine';
import { useAudioEngine } from '../composables/use-audio-context.ts';
import { useAxiomSynth } from '../composables/use-axiom-synth.ts';
import EnvelopePanel from './EnvelopePanel.vue';
import FilterPanel from './FilterPanel.vue';
import Keyboard from './Keyboard.vue';
import LfoPanel from './LfoPanel.vue';
import OscillatorPanel from './OscillatorPanel.vue';
import ScopePanel from './ScopePanel.vue';
import WaveshaperPanel from './WaveshaperPanel.vue';

const synth = useAxiomSynth();
const engine = useAudioEngine();
const filterQ = Math.log2(2 * synth.value.filterConfig.q) / Math.log2(40);
const cutoff = ref(synth.value.filterConfig.frequency);
const resonance = ref(filterQ);
const envAmount = ref(synth.value.filterConfig.envAmount / 9600);
const tracking = ref(synth.value.filterConfig.tracking);
const filterType = ref(synth.value.filterType);
const waveshaperType = ref(synth.value.waveshaperType);
const waveshaperDistortion = ref(synth.value.distortionAmount);
const waveshaperDrive = ref(synth.value.waveshaperDrive);

function cloneLfoConfig(c: LfoConfig): LfoConfig {
  return {
    rateHz: c.rateHz,
    waveform: c.waveform,
    depths: c.depths.slice() as LfoConfig['depths'],
  };
}

const lfoConfigs = [
  reactive(cloneLfoConfig(synth.value.lfoConfigs[0])),
  reactive(cloneLfoConfig(synth.value.lfoConfigs[1])),
  reactive(cloneLfoConfig(synth.value.lfoConfigs[2])),
  reactive(cloneLfoConfig(synth.value.lfoConfigs[3])),
];

const selectedLfo = ref('0');
const activeLfo = computed(() => lfoConfigs[Number(selectedLfo.value)]!);

watch(
  activeLfo,
  cfg => {
    synth.value.setLfoConfiguration(
      Number(selectedLfo.value) as LfoIndex,
      cfg,
    );
  },
  { deep: true },
);

let osc1 = reactive({ ...synth.value.oscillatorConfigs[0] });
let osc2 = reactive({ ...synth.value.oscillatorConfigs[1] });
let osc3 = reactive({ ...synth.value.oscillatorConfigs[2] });

watch(cutoff, newCutoff => {
  synth.value.filterCutOff = newCutoff;
});

watch(resonance, newResonance => {
  const q = 0.5 * Math.pow(40, newResonance);
  synth.value.filterQ = q;
});

watch(envAmount, newEnvAmount => {
  synth.value.filterEnvAmount = newEnvAmount * 9600;
});

watch(tracking, newTracking => {
  synth.value.filterKeyTrack = newTracking;
});

watch(filterType, newType => {
  synth.value.filterType = newType;
});

watch(osc1, newOsc1 => {
  synth.value.setOscillatorConfiguration(0, newOsc1);
});
watch(osc2, newOsc2 => {
  synth.value.setOscillatorConfiguration(1, newOsc2);
});
watch(osc3, newOsc3 => {
  synth.value.setOscillatorConfiguration(2, newOsc3);
});

watch(waveshaperDistortion, value => {
  synth.value.distortionAmount = value;
});
watch(waveshaperDrive, value => {
  synth.value.waveshaperDrive = value;
});
watch(waveshaperType, value => {
  synth.value.waveshaperType = value;
});

onUnmounted(() => {
  synth.value.destroy();
  engine.value.destroy();
});
</script>
```

Everything above is a mechanical `engine.value.` → `synth.value.` rename for synth setters/getters; the LFO/osc/clone helpers are unchanged. The engine ref stays only for `onUnmounted` teardown. ScopePanel keeps its own `useAudioEngine()`.

- [ ] **Step 4: Update `app/src/components/Keyboard.vue`**

Change the import line 56:

```ts
import { useAudioEngine } from '../composables/use-audio-context';
```

to:

```ts
import { useAxiomSynth } from '../composables/use-axiom-synth';
```

Change line 59 `const engine = useAudioEngine();` to `const synth = useAxiomSynth();` and the three call sites (lines 68, 76, 95):

- `engine.value.noteOn(...)` → `synth.value.noteOn(...)`
- `engine.value.noteOff(...)` → `synth.value.noteOff(...)`
- `engine.value.allNotesOff()` → `synth.value.allNotesOff()`

- [ ] **Step 5: Build**

Run: `pnpm build`
Expected: all packages typecheck — app now targets the new synth while the engine still carries the (now unused) old synth internals.

- [ ] **Step 6: Smoke-check audio in the browser**

Run: `pnpm dev`, open `http://localhost:4000`, play a few notes. Expected: sound identical to before (same levels: `output 0.6 × masterInput 1.0 × master 0.5`); scope + meter still work. This is the one manual verification step in the plan.

- [ ] **Step 7: Commit**

```bash
git add packages/audio-engine/src/engine/engine.ts app/src/composables/use-axiom-synth.ts app/src/components/Synth.vue app/src/components/Keyboard.vue
git commit -m "refactor: relay synth to AxiomSynth, engine masterInput bus"
```

---

### Task 6: Strip the synth out of `AudioEngine`; delete engine AxiomVoice copies

**Files:**

- Modify: `packages/audio-engine/src/engine/engine.ts` (complete rewrite to host-only)
- Delete: `packages/audio-engine/src/engine/axiom-voice.ts`
- Delete: `packages/audio-engine/src/engine/axiom-voice-config.ts`

**Interfaces:**

- Consumes: `Meter`, `resumeIfSuspended`, `Destroyable`.
- Produces: host-only `AudioEngine` with `ctxt`, `masterInput`, `master`, `meter`, `analyser`, `getScopeData`, `meterLevel`, `ensureStarted`, `destroy`.

- [ ] **Step 1: Replace `packages/audio-engine/src/engine/engine.ts` entirely**

```ts
import type { Destroyable } from './destroyable';
import { resumeIfSuspended } from './helpers';
import { Meter } from './meter';

export class AudioEngine implements Destroyable {
  public readonly ctxt: AudioContext;
  public readonly masterInput: GainNode;
  private readonly master: GainNode;
  private readonly meter: Meter;
  private readonly analyser: AnalyserNode;
  private readonly comp: DynamicsCompressorNode;
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    this.masterInput = ctxt.createGain();
    this.masterInput.gain.value = 1.0;
    this.master = ctxt.createGain();
    this.master.gain.value = 0.5;
    this.meter = new Meter(ctxt);
    this.analyser = ctxt.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.comp = ctxt.createDynamicsCompressor();

    this.masterInput.connect(this.master);
    this.masterInput.connect(this.meter.input);
    this.master.connect(this.comp);
    this.comp.connect(this.analyser);
    this.analyser.connect(ctxt.destination);
  }

  getScopeData(buffer: Float32Array<ArrayBuffer>) {
    this.analyser.getFloatTimeDomainData(buffer);
  }

  get meterLevel(): number {
    return this.meter.value;
  }

  ensureStarted() {
    resumeIfSuspended(this.ctxt);
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.meter.destroy();
    this.comp.disconnect();
    this.analyser.disconnect();
    this.masterInput.disconnect();
    this.master.disconnect();
    this.ctxt.close();
  }
}
```

The old file was 561 lines of host + synth; this host retains the exact same chain order and levels as `dry → master → comp → analyser → dest` with `masterInput(gain 1) → meter`.

- [ ] **Step 2: Delete the old copies**

Run: `rm packages/audio-engine/src/engine/axiom-voice.ts packages/audio-engine/src/engine/axiom-voice-config.ts`

- [ ] **Step 3: Verify engine greps clean of Axiom**

Run: `rg -n "Axiom" packages/audio-engine/src`
Expected: no matches (exit code 1). The only Axiom references left are in `packages/axiom-synth/` and `docs/`.

- [ ] **Step 4: Build + lint**

Run: `pnpm build && pnpm lint`
Expected: all packages build; prettier check passes.

- [ ] **Step 5: Commit**

```bash
git add packages/audio-engine/src/engine/engine.ts packages/audio-engine/src/engine/axiom-voice.ts packages/audio-engine/src/engine/axiom-voice-config.ts
git commit -m "refactor(engine): strip Axiom synth out of AudioEngine"
```

---

### Task 7: Update codebase docs to match the new structure

**Files:**

- Modify: `docs/codebase/RULES.md`
- Modify: `docs/codebase/ARCHITECTURE.md`
- Modify: `docs/codebase/CONVENTIONS.md`
- Modify: `docs/codebase/STRUCTURE.md`
- Modify: `docs/codebase/STACK.md`
- Modify: `docs/codebase/CONCERNS.md`

**Interfaces:**

- Consumes: final structure from Tasks 1–6.

- [ ] **Step 1: Update `docs/codebase/RULES.md` rule 6**

Replace the rule-6 text (root scope: `### 6. New engine modules stay internal` through the `Reference:`/`Design:` block) with:

```markdown
### 6. Building-block units are public; Axiom classes live in @axiom/axiom-synth

Sound-generation units and the abstract `Voice`/`Synth` bases are public API
exported from the `@axiom/audio-engine` barrel (`packages/audio-engine/src/
index.ts`) — `@axiom/axiom-synth` requires them. `AudioEngine` stays the
package facade. Axiom-specific classes (`AxiomSynth`, `AxiomVoice`,
`AxiomVoiceConfig`) live in `packages/axiom-synth/` (`@axiom/axiom-synth`),
never in the engine package. `@axiom/audio-engine` contains no Axiom
identifiers; dependency direction is one-way (`@axiom/axiom-synth` imports the
engine, never the reverse).
```

Move the old rule-6 sentence about `Oscillator`, `ModulationRouter`, engine internals not being exported into History with a note: superseded by rule 6 (2026-09-18).

- [ ] **Step 2: Update `docs/codebase/ARCHITECTURE.md`**

Apply these specific changes:

1. Section 1 first bullet — replace the layered-engine description with a three-layer description: host `AudioEngine` (context, master bus, meter, scope) in `@axiom/audio-engine`, abstract `Synth`/`Voice` bases + building blocks in the same package, concrete `AxiomSynth` in `@axiom/axiom-synth`, exposed to the Vue UI through `useAudioEngine()` + `useAxiomSynth()`. State that UI never touches audio nodes directly.
2. Section 1 constraints #1: change `MAX_VOICES` reference from `packages/audio-engine/src/engine/engine.ts` to `packages/axiom-synth/src/axiom-synth.ts`.
3. Section 2 System Flow — rewrite the flow text: `Keyboard.vue → AxiomSynth.noteOn/noteOff → Synth.voicePool (16 AxiomVoice)`; voice chain unchanged; then `AxiomSynth.output(0.6) → AudioEngine.masterInput(1.0) → master(0.5) → comp → analyser → destination`; `ScopePanel` reads analyser via engine.
4. Section 3 responsibilities table — replace the `AudioEngine` row with:

```markdown
| `AudioEngine` | Context, master bus (`masterInput → master → comp → analyser`), meter, scope data, `ctxt.close()` | Voice allocation, parameter configs, shared sources | `packages/audio-engine/src/engine/engine.ts` |
| `Synth` | Generic voice allocation: pool, `noteToVoiceMap`, stealing/choke, `allNotesOff`, `destroy` | Axiom-specific sources/configs | `packages/audio-engine/src/engine/synth.ts` |
| `AxiomSynth` | Axiom shared sources, configs, setters; builds `AxiomVoiceConfig` + `output` bus; `createVoice()` | Context/master chain, voice-pool bookkeeping | `packages/axiom-synth/src/axiom-synth.ts` |
```

Keep the `Voice`/`AxiomVoice` rows (point `AxiomVoice` evidence at `packages/axiom-synth/src/axiom-voice.ts`). Add a `useAxiomSynth` row (module-singleton AxiomSynth wired to `engine.masterInput`, rebuilds on engine replacement — `app/src/composables/use-axiom-synth.ts`). 5. Section 5 known risks #1: reword `use-audio-context.ts` / `use-axiom-synth.ts` module-scope context + synth creation against autoplay policies. 6. Evidence section: `packages/audio-engine/src/engine/engine.ts` now the slim host; add `packages/audio-engine/src/engine/synth.ts`, `packages/axiom-synth/src/axiom-synth.ts`, `app/src/composables/use-axiom-synth.ts`.

- [ ] **Step 3: Update `docs/codebase/CONVENTIONS.md`**

- Row "Packages": add `@axiom/axiom-synth`.
- Section "Alias vs relative import policy": add that the app imports the synth via `@axiom/axiom-synth` and the synth imports engine blocks via `@axiom/audio-engine`, both by package name.
- Section "Public exports/barrel policy": update the engine barrel-export list to include blocks + bases (`Voice`, `Synth`, `Oscillator`, `Filter`, `Envelope`, `Lfo`, `Waveshaper`, `WaveshaperCurve`, `ModulationRouter`, `FilterResonance`, `Meter`, `Analyser`, `helpers`, `constants`, `Observable`) and note `Observable` is now exported (was internal).

- [ ] **Step 4: Update `docs/codebase/STRUCTURE.md`**

Add a row for `packages/axiom-synth/src/` (Axiom synth package: `axiom-synth.ts`, `axiom-voice.ts`, `axiom-voice-config.ts`, `index.ts` barrel) next to the audio-engine row (line 11). Add `packages/axiom-synth/src/` to the ownership table (line 28) as "Axiom synth graph assembly, shared sources, setter ramps". In the file-naming note (line 36) and barrel note (line 45), mention `packages/axiom-synth/src/index.ts` (public barrel).

- [ ] **Step 5: Update `docs/codebase/STACK.md`**

Add a row to the workspace-packages section for `@axiom/axiom-synth` ("Internal source library (`packages/axiom-synth/`); owns the Axiom synth (`AxiomSynth`/`AxiomVoice`), consumed as source"). Update the "vue is the only external production dependency" sentence (line 16) to name both workspace packages.

- [ ] **Step 6: Update `docs/codebase/CONCERNS.md`**

Fix the stale file references after engine slim-down:

- Voice-pool rows (16-voice pool, line 40; curve recompute, line 41): point at `packages/axiom-synth/src/axiom-synth.ts` (sources) / `packages/audio-engine/src/engine/synth.ts` (stealing).
- `console.log` telemetry row (line 24): refs split between `packages/audio-engine/src/engine/synth.ts` and `packages/axiom-synth/src/axiom-voice.ts`.
- High-churn "single class owns sources, pool, all setters" row (line 48): replace with `AxiomSynth` (`packages/axiom-synth/src/axiom-synth.ts`) owning sources+setters and `Synth` (`packages/audio-engine/src/engine/synth.ts`) owning allocation.

- [ ] **Step 7: Lint + commit**

Run: `pnpm lint`
Expected: prettier check passes (pre-commit hook will also format).

```bash
git add docs/codebase
git commit -m "docs(engine): architecture, rules, and structure after engine/synth split"
```

---

## Out of scope (locked)

Mono/poly modes, steal-policy hooks, per-synth level/mute UI, MIDI, `AxiomVoice` graph changes, per-synth meters, renaming UI-facing config fields. Any task adding these is out of plan.
