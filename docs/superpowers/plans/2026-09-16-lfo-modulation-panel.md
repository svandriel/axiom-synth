# LFO Modulation Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four note-triggered LFO slots modulating six targets (osc1/2/3 detune, cutoff, amp, drive) across the audio engine and UI.

**Architecture:** Per-voice `Lfo` instances (4×) in `AxiomVoice` create lazy per-note oscillators connected through depth gain nodes to per-voice injection points. Engine-level shared `ConstantSourceNode`s fan depth values and rates to all 16 voices, following the existing fan-out pattern. Filter is refactored to expose a per-voice `cutoff` AudioParam. A new `ampModGain` between amp envelope and sink supports tremolo.

**Tech Stack:** Vue 3 + TypeScript (strict), Web Audio API, Vite, Prettier, Tailwind.

## Global Constraints

- `tsconfig.app.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `erasableSyntaxOnly: true` (no enums, use string-literal unions).
- Formatter: Prettier 3.9.6 — `singleQuote: true`, `trailingComma: 'all'`, `arrowParens: 'avoid'`, `printWidth: 80`.
- Build gate: `pnpm build` (vue-tsc type-check + Vite bundle). No test runner.
- `FixedArray<T, N>` for compile-time length guarantees.
- PascalCase for components/classes; kebab-case for type files.
- Observable pub/sub for discrete changes; `ConstantSourceNode` for audio-rate params.
- `Observable` is internal (not exported from barrel); config types are.

## File Structure

| Action | File                                                           | Purpose                                        |
| ------ | -------------------------------------------------------------- | ---------------------------------------------- |
| Create | `packages/audio-engine/src/types/lfo-config.ts`                | `LfoTarget`, `LfoWaveformType`, `LfoConfig`    |
| Modify | `packages/audio-engine/src/engine/constants.ts`                | Add `LFO_COUNT`, `LFO_TARGET_COUNT`            |
| Create | `packages/audio-engine/src/engine/lfo.ts`                      | Per-voice `Lfo` class                          |
| Modify | `packages/audio-engine/src/engine/oscillator-config-source.ts` | Add `modInputs` field                          |
| Modify | `packages/audio-engine/src/engine/oscillator.ts`               | Wire mod inputs in start/onended/destroy       |
| Modify | `packages/audio-engine/src/engine/filter.ts`                   | Expose per-voice `cutoff` AudioParam           |
| Modify | `packages/audio-engine/src/engine/axiom-voice-config.ts`       | Add LFO shared-source fields                   |
| Modify | `packages/audio-engine/src/engine/axiom-voice.ts`              | Wire LFOs, add `ampModGain`, lifecycle updates |
| Modify | `packages/audio-engine/src/engine/engine.ts`                   | Create LFO sources, add setter, voice config   |
| Modify | `packages/audio-engine/src/index.ts`                           | Barrel export types                            |
| Create | `app/src/components/LfoPanel.vue`                              | New UI panel                                   |
| Modify | `app/src/components/Synth.vue`                                 | Grid + wiring                                  |

---

### Task 1: LFO types and constants

**Files:**

- Modify: `packages/audio-engine/src/engine/constants.ts`
- Create: `packages/audio-engine/src/types/lfo-config.ts`

**Interfaces:**

- Produces: `LfoIndex`, `LfoTargetCount`, `LfoTarget`, `LfoWaveformType`, `LfoConfig`

- [ ] **Step 1: Add LFO constants to `constants.ts`**

Append after existing code in `packages/audio-engine/src/engine/constants.ts`:

```ts
export const LFO_COUNT = 4 as const;
export type LfoCount = typeof LFO_COUNT;
export type LfoIndex = BuildIndices<LfoCount>;

export const LFO_TARGET_COUNT = 6 as const;
export type LfoTargetCount = typeof LFO_TARGET_COUNT;
```

- [ ] **Step 2: Create `lfo-config.ts`**

Create `packages/audio-engine/src/types/lfo-config.ts`:

```ts
import type { FixedArray } from './fixed-array';
import type { LfoTargetCount } from '../engine/constants';

export type LfoTarget = 'osc1' | 'osc2' | 'osc3' | 'cutoff' | 'amp' | 'drive';

export type LfoWaveformType = 'sine' | 'triangle' | 'square' | 'sawtooth';

export interface LfoConfig {
  rateHz: number;
  waveform: LfoWaveformType;
  depths: FixedArray<number, LfoTargetCount>;
}
```

- [ ] **Step 3: Add barrel export**

In `packages/audio-engine/src/index.ts`, add:

```ts
export type * from './types/lfo-config';
```

- [ ] **Step 4: Verify build**

Run: `pnpm build`
Expected: PASS (new types not yet consumed — clean type-check)

- [ ] **Step 5: Commit**

```bash
git add packages/audio-engine/src/engine/constants.ts packages/audio-engine/src/types/lfo-config.ts packages/audio-engine/src/index.ts
git commit -m "feat(engine): add LFO types and constants"
```

---

### Task 2: Oscillator mod inputs

**Files:**

- Modify: `packages/audio-engine/src/engine/oscillator-config-source.ts`
- Modify: `packages/audio-engine/src/engine/oscillator.ts`

**Interfaces:**

- Consumes: none
- Produces: `OscillatorConfigSource.modInputs?: AudioNode[]` (accepted by all future LFO wiring)

- [ ] **Step 1: Add `modInputs` to config source**

In `packages/audio-engine/src/engine/oscillator-config-source.ts`, add the field:

```ts
import type { WaveFormType } from '../types';
import type { Observable } from '../utils/observable';

export interface OscillatorConfigSource {
  detuneSource: ConstantSourceNode;
  gainSource: ConstantSourceNode;
  waveForm: Observable<WaveFormType>;
  modInputs?: AudioNode[];
}
```

- [ ] **Step 2: Wire mod inputs in `Oscillator.start()`**

In `packages/audio-engine/src/engine/oscillator.ts`, inside `start()`, after the existing `this.configSource.detuneSource.connect(osc.detune);` line, add:

```ts
if (this.configSource.modInputs) {
  for (const modInput of this.configSource.modInputs) {
    modInput.connect(osc.detune);
  }
}
```

- [ ] **Step 3: Disconnect mod inputs in `onended`**

In `onended`, before `osc.disconnect()`, add:

```ts
if (this.configSource.modInputs) {
  for (const modInput of this.configSource.modInputs) {
    modInput.disconnect(osc.detune);
  }
}
```

- [ ] **Step 4: Disconnect mod inputs in `destroy()`**

In `destroy()`, after the existing `this.configSource.detuneSource.disconnect(osc.detune);` line inside the `activeOscillators.forEach`, add:

```ts
if (this.configSource.modInputs) {
  for (const modInput of this.configSource.modInputs) {
    modInput.disconnect(osc.detune);
  }
}
```

- [ ] **Step 5: Verify build**

Run: `pnpm build`
Expected: PASS (`modInputs` is optional — existing callers unaffected)

- [ ] **Step 6: Commit**

```bash
git add packages/audio-engine/src/engine/oscillator-config-source.ts packages/audio-engine/src/engine/oscillator.ts
git commit -m "feat(engine): accept mod inputs on Oscillator for LFO wiring"
```

---

### Task 3: Audio engine core (Filter, Lfo, AxiomVoice, Engine)

All files in this task are committed together because the `Filter` constructor change and `AxiomVoice` wiring change are atomic.

**Files:**

- Modify: `packages/audio-engine/src/engine/filter.ts`
- Create: `packages/audio-engine/src/engine/lfo.ts`
- Modify: `packages/audio-engine/src/engine/axiom-voice-config.ts`
- Modify: `packages/audio-engine/src/engine/axiom-voice.ts`
- Modify: `packages/audio-engine/src/engine/engine.ts`
- Modify: `packages/audio-engine/src/index.ts` (add `LfoIndex` export)

**Interfaces:**

- Consumes: `LfoConfig`, `LfoWaveformType`, `LfoIndex`, `LfoTargetCount` (Task 1); `Oscillator.modInputs` (Task 2)
- Produces: `AudioEngine.setLfoConfiguration`, `Lfo` class, refactored `Filter.cutoff` AudioParam

- [ ] **Step 1: Refactor `Filter` to expose `cutoff` AudioParam**

In `packages/audio-engine/src/engine/filter.ts`:

Remove `cutoff` from the `FilterInputs` interface:

```ts
interface FilterInputs {
  resonance: FilterResonance;
  type: Observable<FilterType>;
}
```

Replace the `cutoff` field and constructor parameter with an internal source. Remove the old `cutoff` field declaration. Add the new field:

```ts
export class Filter implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly gain: GainNode;
  private readonly output: GainNode;
  private readonly resonance: FilterResonance;
  private readonly cutoffSource: ConstantSourceNode;
  private readonly keytrackSource: ConstantSourceNode;
  private readonly keytrackGain: GainNode;
  private readonly detuneSource: ConstantSourceNode;
  private readonly typeSubscription: { unsubscribe: () => void };
  private stages: BiquadFilterNode[] = [];
  private currentSlope: 1 | 2 | 3 | 4 = 1;
  private destroyed = false;

  constructor(ctxt: AudioContext, config: FilterInputs) {
    this.ctxt = ctxt;
    this.resonance = config.resonance;

    this.cutoffSource = ctxt.createConstantSource();
    this.cutoffSource.offset.value = 0;
    this.cutoffSource.start();

    this.gain = ctxt.createGain();
    this.output = ctxt.createGain();
    this.output.gain.value = 1;

    this.keytrackSource = ctxt.createConstantSource();
    this.keytrackSource.offset.value = 0;
    this.keytrackSource.start();

    this.keytrackGain = ctxt.createGain();
    this.keytrackGain.gain.value = 0;
    this.keytrackSource.connect(this.keytrackGain);

    this.detuneSource = ctxt.createConstantSource();
    this.detuneSource.offset.value = 0;
    this.detuneSource.start();

    this.typeSubscription = config.type.subscribe(type => this.rebuild(type));
    this.rebuild(config.type.value);
  }

  get cutoff(): AudioParam {
    return this.cutoffSource.offset;
  }

  // ... rest unchanged (input, drive, keytrack, detune, noteOn, connect, disconnect) ...
```

In `rebuild()`, replace all occurrences of `this.cutoff.connect(stage.frequency)` with `this.cutoffSource.connect(stage.frequency)`.

In `teardownStage()`, replace `this.cutoff.disconnect(stage.frequency)` with `this.cutoffSource.disconnect(stage.frequency)`.

In `destroy()`, add before the existing `this.gain.disconnect()`:

```ts
this.cutoffSource.disconnect();
this.cutoffSource.stop();
```

- [ ] **Step 2: Create `Lfo` class**

Create `packages/audio-engine/src/engine/lfo.ts`:

```ts
import type { Observable } from '../utils/observable';
import type { LfoWaveformType } from '../types/lfo-config';
import type { ConstantSourceNode } from 'standard';
import type { Destroyable } from './destroyable';

export class Lfo implements Destroyable {
  private osc: OscillatorNode | null = null;
  private readonly depthGains: GainNode[];
  private readonly waveForm: Observable<LfoWaveformType>;
  private readonly rateSource: ConstantSourceNode;
  private readonly ctxt: AudioContext;
  private waveFormUnsubscribe: (() => void) | null = null;
  private destroyed = false;

  constructor(
    ctxt: AudioContext,
    waveForm: Observable<LfoWaveformType>,
    rateSource: ConstantSourceNode,
    depthSources: readonly ConstantSourceNode[],
  ) {
    this.ctxt = ctxt;
    this.waveForm = waveForm;
    this.rateSource = rateSource;

    this.depthGains = depthSources.map(src => {
      const gain = ctxt.createGain();
      gain.gain.value = 0;
      src.connect(gain.gain);
      return gain;
    });
  }

  targetOutput(index: number): AudioNode {
    return this.depthGains[index]!;
  }

  start(now: number): void {
    if (this.osc) return;

    const osc = this.ctxt.createOscillator();
    osc.type = this.waveForm.value;

    this.rateSource.connect(osc.frequency);
    for (const gain of this.depthGains) {
      osc.connect(gain);
    }

    this.waveFormUnsubscribe = this.waveForm.subscribe(v => {
      osc.type = v;
    });

    osc.onended = () => {
      this.cleanupOsc(osc);
    };

    osc.start(now);
    this.osc = osc;
  }

  stop(): void {
    if (!this.osc) return;
    const osc = this.osc;
    this.osc = null;
    osc.onended = null;
    this.cleanupOsc(osc);
  }

  private cleanupOsc(osc: OscillatorNode): void {
    this.waveFormUnsubscribe?.();
    this.waveFormUnsubscribe = null;
    this.rateSource.disconnect(osc.frequency);
    for (const gain of this.depthGains) {
      osc.disconnect(gain);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    for (const gain of this.depthGains) {
      gain.disconnect();
    }
  }
}
```

- [ ] **Step 3: Update `AxiomVoiceConfig`**

In `packages/audio-engine/src/engine/axiom-voice-config.ts`, add imports and fields:

```ts
import type { EnvelopeConfig, FixedArray, WaveFormType } from '../types';
import type { Observable } from '../utils/observable';
import type { LfoTargetCount, OscillatorCount } from './constants';
import type { FilterType } from './filter';
import type { FilterResonance } from './filter-resonance';
import type { LfoWaveformType } from '../types/lfo-config';
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
  lfoWaveforms: Observable<LfoWaveformType>[];
  lfoRateSources: ConstantSourceNode[];
  lfoDepthSources: ConstantSourceNode[][];
}
```

- [ ] **Step 4: Wire LFOs in `AxiomVoice`**

In `packages/audio-engine/src/engine/axiom-voice.ts`, add imports:

```ts
import { Lfo } from './lfo';
import { LFO_COUNT } from './constants';
```

Add private fields after `waveformUnsubscribers`:

```ts
private readonly lfos: Lfo[];
private readonly ampModGain: GainNode;
```

In the constructor, insert LFO creation and wiring **after** the `this.oscillators` loop and **before** the existing `filter.connect(this.ampEnvelope.node)` line (you may need to reorganize slightly):

```ts
// Create LFO instances — depth gains are wired to shared depth sources
this.lfos = Array.from(
  { length: LFO_COUNT },
  (_, lfoIdx) =>
    new Lfo(
      ctxt,
      config.lfoWaveforms[lfoIdx]!,
      config.lfoRateSources[lfoIdx]!,
      config.lfoDepthSources[lfoIdx]!,
    ),
);

// Collect per-osc mod inputs from LFO depthGains (osc1 → index 0, etc.)
const oscModInputs = [
  this.lfos.map(lfo => lfo.targetOutput(0)),
  this.lfos.map(lfo => lfo.targetOutput(1)),
  this.lfos.map(lfo => lfo.targetOutput(2)),
];

// Modify the existing Oscillator creation loop — pass modInputs per osc index:
// (inside the .map callback, replace the Oscillator construction):
const osc = new Oscillator(ctxt, {
  detuneSource: config.oscillatorDetuneSources[index as OscillatorIndex],
  gainSource: config.oscillatorGainSources[index as OscillatorIndex],
  waveForm,
  modInputs: oscModInputs[index]!,
});
osc.connect(oscillatorAudioSink);

// Create ampModGain (bias 1.0, sits between envelope and sink)
this.ampModGain = ctxt.createGain();
this.ampModGain.gain.value = 1.0;

// Wire LFO non-osc targets (cutoff, amp, drive)
for (const lfo of this.lfos) {
  lfo.targetOutput(3).connect(this.filter.cutoff); // cutoff
  lfo.targetOutput(4).connect(this.ampModGain.gain); // amp (tremolo)
  lfo.targetOutput(5).connect(this.waveShaper.drive); // drive
}
```

Also move the existing `this.filter.connect(this.ampEnvelope.node);` to run **after** the above (it already does — just ensure ordering).

Update `onSoundStart`:

```ts
private onSoundStart(noteNumber: number, now: number): void {
  if (this.areOscillatorsActive) {
    this.oscillators.forEach(osc => osc.stop(now));
    this.lfos.forEach(lfo => lfo.stop());
  } else {
    this.ampEnvelope.node.connect(this.ampModGain);
  }

  const frequency = freqOf(noteNumber);
  this.oscillators.forEach(osc => osc.start(frequency, now));
  this.lfos.forEach(lfo => lfo.start(now));

  this.areOscillatorsActive = true;
}
```

Update `onSoundStop`:

```ts
override onSoundStop(): void {
  this.oscillators.forEach(osc => osc.stop());
  this.lfos.forEach(lfo => lfo.stop());

  try {
    this.ampEnvelope.node.disconnect(this.ampModGain);
  } catch {
    // Was not connected, it's ok
  }

  this.areOscillatorsActive = false;
}
```

Update `destroy` — add before `super.destroy()`:

```ts
this.lfos.forEach(lfo => lfo.destroy());
this.ampModGain.disconnect();
```

- [ ] **Step 5: Update `AudioEngine`**

In `packages/audio-engine/src/engine/engine.ts`, add imports:

```ts
import type { LfoConfig, LfoWaveformType } from '../types/lfo-config';
import { LFO_COUNT, LFO_TARGET_COUNT, type LfoIndex } from './constants';
```

Add new fields after `_filterType`:

```ts
private readonly lfoWaveforms: Observable<LfoWaveformType>[];
private readonly lfoRateSources: ConstantSourceNode[];
private readonly lfoDepthSources: ConstantSourceNode[][];

public readonly lfoConfigs: FixedArray<LfoConfig, LfoCount> = [
  { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
  { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
  { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
  { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
];
```

In the constructor, add LFO source creation **after** the waveshaper setup and **before** the `voiceConfig` object:

```ts
this.lfoWaveforms = Array.from(
  { length: LFO_COUNT },
  (_, i) => new Observable<LfoWaveformType>(this.lfoConfigs[i]!.waveform),
);
this.lfoRateSources = Array.from({ length: LFO_COUNT }, (_, i) =>
  this.createConstantSource(this.lfoConfigs[i]!.rateHz),
);
this.lfoDepthSources = Array.from({ length: LFO_COUNT }, (_, i) =>
  Array.from({ length: LFO_TARGET_COUNT }, (_, j) =>
    this.createConstantSource(this.lfoConfigs[i]!.depths[j]!),
  ),
);
```

In the `voiceConfig` object, add the three new fields:

```ts
const voiceConfig: AxiomVoiceConfig = {
  // ... existing fields ...
  lfoWaveforms: this.lfoWaveforms,
  lfoRateSources: this.lfoRateSources,
  lfoDepthSources: this.lfoDepthSources,
};
```

Add a module-level depth-scale constant (above the class or as a static):

```ts
// Per-target depth scales: raw -1..1 × scale → final modulation amount
// [osc1 detune, osc2 detune, osc3 detune, cutoff Hz, amp gain, drive units]
const LFO_DEPTH_SCALES: readonly number[] = [150, 150, 150, 1000, 1, 4];
```

Add the setter (after existing `setOscillatorConfiguration`):

```ts
setLfoConfiguration(index: LfoIndex, config: LfoConfig) {
  this.lfoConfigs[index] = {
    ...config,
    depths: [...config.depths] as FixedArray<number, LfoTargetCount>,
  };
  const now = this.ctxt.currentTime;

  this.lfoRateSources[index].offset.linearRampToValueAtTime(
    config.rateHz,
    now + 0.01,
  );
  this.lfoWaveforms[index].value = config.waveform;

  for (let i = 0; i < LFO_TARGET_COUNT; i++) {
    this.lfoDepthSources[index]![i]!.offset.linearRampToValueAtTime(
      config.depths[i]! * LFO_DEPTH_SCALES[i]!,
      now + 0.01,
    );
  }
}
```

The raw UI value (-1..1) is stored in the config; the scaled value goes into the
`ConstantSourceNode` so the audio-rate modulation reaches the correct musical
range. The UI always shows/edits the unscaled -1..1 range.

In `destroy()`, add before `this.dry.disconnect()`:

```ts
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
```

- [ ] **Step 6: Add `LfoIndex` export to barrel**

In `packages/audio-engine/src/index.ts`, add:

```ts
export type { LfoIndex } from './engine/constants';
```

- [ ] **Step 7: Verify build**

Run: `pnpm build`
Expected: PASS (all audio-engine changes type-check; UI not yet wired)

- [ ] **Step 8: Commit**

```bash
git add packages/audio-engine/
git commit -m "feat(engine): implement LFO class, Filter cutoff refactor, AxiomVoice wiring"
```

---

### Task 4: LfoPanel component

**Files:**

- Create: `app/src/components/LfoPanel.vue`

**Interfaces:**

- Consumes: `LfoConfig`, `LfoWaveformType` (from `@axiom/audio-engine`)
- Produces: `v-model` (config), `v-model:selectedLfo` (string)

- [ ] **Step 1: Create `LfoPanel.vue`**

Create `app/src/components/LfoPanel.vue`:

```vue
<template>
  <Panel label="LFO">
    <template #top-right>
      <Toggle v-model="selectedLfo" :values="lfoSlots" />
    </template>
    <div class="mt-3 flex flex-row gap-4">
      <Knob
        v-model="rateHz"
        label="Rate"
        size="md"
        :from="0.01"
        :to="30"
        :log-base="2"
        :default="2"
        :format="rateFormat"
      />
      <Toggle v-model="waveform" :values="waveforms" class="mt-3" />
    </div>
    <div class="mt-3 grid grid-cols-3 gap-4">
      <Knob
        v-for="(_, i) in depthLabels"
        :key="depthLabels[i]"
        v-model="depthComputeds[i]"
        :label="depthLabels[i]"
        size="md"
        :from="-1"
        :to="1"
        :default="0"
        :format="depthFormat"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LfoConfig, LfoWaveformType } from '@axiom/audio-engine';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';

const config = defineModel<LfoConfig>({ required: true });
const selectedLfo = defineModel<string>('selectedLfo', { required: true });

const lfoSlots = [
  { id: '0', label: 'LFO1' },
  { id: '1', label: 'LFO2' },
  { id: '2', label: 'LFO3' },
  { id: '3', label: 'LFO4' },
];

const waveforms: Array<{ id: LfoWaveformType; label: string }> = [
  { id: 'sine', label: 'SIN' },
  { id: 'triangle', label: 'TRI' },
  { id: 'square', label: 'SQR' },
  { id: 'sawtooth', label: 'SAW' },
];

const depthLabels = ['VCO1', 'VCO2', 'VCO3', 'CUT', 'AMP', 'DRV'];

const rateHz = computed({
  get: () => config.value.rateHz,
  set: (v: number) => {
    config.value.rateHz = v;
  },
});

const waveform = computed({
  get: () => config.value.waveform,
  set: (v: LfoWaveformType) => {
    config.value.waveform = v;
  },
});

const depthComputeds = depthLabels.map((_, i) =>
  computed({
    get: () => config.value.depths[i],
    set: (v: number) => {
      config.value.depths[i] = v;
    },
  }),
);

function rateFormat(v: number): string {
  return v < 10 ? `${v.toFixed(2)} Hz` : `${v.toFixed(1)} Hz`;
}

function depthFormat(v: number): string {
  const pct = Math.round(v * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}
</script>
```

- [ ] **Step 2: Verify build**

Run: `pnpm build`
Expected: PASS (component not imported yet — clean type-check)

- [ ] **Step 3: Commit**

```bash
git add app/src/components/LfoPanel.vue
git commit -m "feat(ui): add LfoPanel component"
```

---

### Task 5: Synth.vue wiring and grid placement

**Files:**

- Modify: `app/src/components/Synth.vue`

**Interfaces:**

- Consumes: `LfoPanel`, `LfoConfig`, `LfoIndex` (from `@axiom/audio-engine`), `AudioEngine.setLfoConfiguration`
- Produces: none (wires existing)

- [ ] **Step 1: Add imports**

In the `<script setup>` block, add:

```ts
import type { LfoConfig, LfoIndex } from '@axiom/audio-engine';
import LfoPanel from './LfoPanel.vue';
```

- [ ] **Step 2: Add LFO state**

Add after the existing `waveshaperDrive` ref:

```ts
function cloneLfoConfig(c: LfoConfig): LfoConfig {
  return {
    rateHz: c.rateHz,
    waveform: c.waveform,
    depths: c.depths.slice() as LfoConfig['depths'],
  };
}

const lfoConfigs = [
  reactive(cloneLfoConfig(engine.value.lfoConfigs[0])),
  reactive(cloneLfoConfig(engine.value.lfoConfigs[1])),
  reactive(cloneLfoConfig(engine.value.lfoConfigs[2])),
  reactive(cloneLfoConfig(engine.value.lfoConfigs[3])),
];

const selectedLfo = ref('0');
const activeLfo = computed(() => lfoConfigs[Number(selectedLfo.value)]!);

watch(
  activeLfo,
  cfg => {
    engine.value.setLfoConfiguration(
      Number(selectedLfo.value) as LfoIndex,
      cfg,
    );
  },
  { deep: true },
);
```

- [ ] **Step 3: Add `LfoPanel` to the template**

Insert before the `ScopePanel`:

```html
<LfoPanel
  class="col-span-12 row-start-7 sm:col-span-12 sm:col-start-1 sm:row-start-4 lg:col-span-4 lg:row-start-3"
  v-model="activeLfo"
  v-model:selected-lfo="selectedLfo"
/>
```

- [ ] **Step 4: Update `ScopePanel` grid position**

Update the `ScopePanel` class:

```html
class="col-span-12 row-start-8 sm:col-span-12 sm:col-start-1 sm:row-start-5
lg:col-span-4 lg:col-start-5 lg:row-start-3"
```

- [ ] **Step 5: Update grid row counts**

In the outer grid `<div>`, update row classes:

```html
grid-rows-7 sm:grid-rows-4 lg:grid-rows-3
```

becomes:

```html
grid-rows-8 sm:grid-rows-5 lg:grid-rows-3
```

- [ ] **Step 6: Verify build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add app/src/components/Synth.vue
git commit -m "feat(ui): wire LfoPanel into Synth grid"
```

---

### Task 6: Lint and final commit

- [ ] **Step 1: Run lint**

Run: `pnpm lint`
Expected: PASS (Prettier clean)

- [ ] **Step 2: Commit any fixes if needed**

```bash
git add -u
git commit -m "style: prettier pass after LFO implementation"
```
