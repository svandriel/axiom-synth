# Oscillator Unison Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add stereo, oscillator-local unison with one to sixteen voices and live detune, depth, and blend controls.

**Architecture:** Add `CurveNode` for reusable audio-rate transfer curves, and a `UnisonOscillator` facade which owns raw subvoice bundles. `AxiomSynth` owns configuration and shared sources; `AxiomVoice` wires them to one unison module per oscillator; the Vue panel edits the configuration.

**Tech Stack:** TypeScript strict mode, Vue 3, Web Audio API, pnpm, Prettier.

## Global Constraints

- `UnisonOscillator` does not extend or compose `Oscillator`.
- `CurveNode` and `UnisonOscillator` are public exports of `@axiom/audio-engine`.
- `unisonDetune`, `unisonDepth`, and `unisonBlend` are a-rate AudioParam jacks backed by zeroed, started owned sources.
- `voices` is a clamped integer getter/setter and changes only future note topology.
- Use `StereoPannerNode`; do not implement linear panning.
- Preserve all inbound source-to-AudioParam teardown required by `RULES.md` rule 4.
- Do not add a test runner. Build and browser/audio smoke tests are required gates.

---

## File Structure

- Create `packages/audio-engine/src/engine/curve-node.ts`: range-normalized reusable `WaveShaperNode` module.
- Create `packages/audio-engine/src/engine/clamp-node.ts`: reusable range-clamping control-signal module.
- Create `packages/audio-engine/src/engine/unison-oscillator.ts`: subvoice topology, live control graph, and lifecycle.
- Modify `packages/audio-engine/src/engine/index.ts`: public exports.
- Modify `packages/audio-engine/src/types/oscillator-config.ts`: embedded unison config.
- Modify `packages/axiom-synth/src/axiom-synth.ts`: defaults, shared unison sources, voice-count observable, updates, teardown.
- Modify `packages/axiom-synth/src/axiom-voice-config.ts`: unison source plumbing.
- Modify `packages/axiom-synth/src/axiom-voice.ts`: use and wire `UnisonOscillator`.
- Modify `app/src/components/OscillatorPanel.vue`: real controls and Depth label.

### Task 1: Add CurveNode

**Files:**

- Create: `packages/audio-engine/src/engine/curve-node.ts`
- Modify: `packages/audio-engine/src/engine/index.ts`

**Interfaces:**

- Produces: `CurveFunction`, `CurveNodeOptions`, and `CurveNode` exported through `@axiom/audio-engine`.
- Consumes: `Destroyable` from `./destroyable`.

- [ ] **Step 1: Implement range-normalized CurveNode**

```ts
export type CurveFunction = (input: number) => number;

export interface CurveNodeOptions {
  inputMin: number;
  inputMax: number;
}

const CURVE_SAMPLES = 1024;

export class CurveNode implements Destroyable {
  private readonly inputGain: GainNode;
  private readonly waveShaper: WaveShaperNode;
  private destroyed = false;

  constructor(
    ctxt: AudioContext,
    curveFunction: CurveFunction,
    { inputMin, inputMax }: CurveNodeOptions,
  ) {
    if (!(inputMin < inputMax)) {
      throw new Error('CurveNode inputMin must be less than inputMax');
    }

    this.inputGain = ctxt.createGain();
    this.inputGain.gain.value = 2 / (inputMax - inputMin);
    this.waveShaper = ctxt.createWaveShaper();
    this.waveShaper.curve = Float32Array.from(
      { length: CURVE_SAMPLES },
      (_, index) =>
        curveFunction(
          inputMin + (index / (CURVE_SAMPLES - 1)) * (inputMax - inputMin),
        ),
    );
    this.offset = ctxt.createConstantSource();
    this.offset.offset.value = -(inputMax + inputMin) / (inputMax - inputMin);
    this.offset.start();
    this.inputGain.connect(this.waveShaper);
    this.offset.connect(this.waveShaper);
  }

  get input(): AudioNode {
    return this.inputGain;
  }
  get output(): AudioNode {
    return this.waveShaper;
  }
  connect(destination: AudioNode | AudioParam): void {
    this.waveShaper.connect(destination);
  }
  disconnect(destination: AudioNode | AudioParam | null = null): void {
    if (destination === null) this.waveShaper.disconnect();
    else this.waveShaper.disconnect(destination);
  }
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.offset.disconnect();
    this.offset.stop();
    this.inputGain.disconnect();
    this.waveShaper.disconnect();
  }
}
```

Add `private readonly offset: ConstantSourceNode`. Use repository `connect` and
`disconnect` overload style. Offset joins signal at `WaveShaperNode` input;
`GainNode` cannot add an offset.

- [ ] **Step 2: Export module**

Add to `packages/audio-engine/src/engine/index.ts`:

```ts
export * from './curve-node';
```

- [ ] **Step 3: Verify build and formatting**

Run: `pnpm build && pnpm lint`

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add packages/audio-engine/src/engine/curve-node.ts packages/audio-engine/src/engine/index.ts
git commit -m "feat(engine): add range-normalized curve node"
```

### Task 2: Add UnisonOscillator

**Files:**

- Create: `packages/audio-engine/src/engine/unison-oscillator.ts`
- Modify: `packages/audio-engine/src/engine/index.ts`

**Interfaces:**

- Consumes: `CurveNode`, `Destroyable`, and `WaveFormType`.
- Produces: exported `UnisonOscillator` with `frequency`, `detune`, `gain`, `unisonDetune`, `unisonDepth`, `unisonBlend`, `voices`, lifecycle, and connection interface.

- [ ] **Step 1: Create persistent module controls**

Create five module-owned sources/output nodes in constructor:

```ts
private readonly outputGain: GainNode;
private readonly frequencySource: ConstantSourceNode;
private readonly detuneSource: ConstantSourceNode;
private readonly unisonDetuneSource: ConstantSourceNode;
private readonly unisonDepthSource: ConstantSourceNode;
private readonly unisonBlendSource: ConstantSourceNode;
private voicesValue = 1;
private wave: WaveFormType = 'sawtooth';
```

Set all source offsets to zero then `start()` before any connection. Set
`outputGain.gain` to zero before source patching. Set `unisonBlendSource.offset`
AudioParam getters and `voices` getter/setter. Voices rounds then clamps to
`[1, 16]`.

- [ ] **Step 2: Create one subvoice bundle**

Use a private type containing raw oscillator, per-voice gain nodes, panner,
detune/depth scaling gains, CurveNodes, and all owned static sources needed for
cleanup. In `start(noteHz, now)`, compute:

```ts
const position = voices === 1 ? 0 : -1 + (2 * index) / (voices - 1);
const centerWeight = 1 / (1 + Math.abs(position));
```

Wire audio path:

```text
OscillatorNode -> rawGain -> normalizerGain -> StereoPannerNode -> outputGain
```

Set oscillator frequency to `noteHz`; connect `frequencySource` to frequency
and `detuneSource` to detune. Connect `unisonDetuneSource` through gain set to
`position` into raw oscillator detune. Connect `unisonDepthSource` through gain
set to `position` into `panner.pan`.

- [ ] **Step 3: Build exact live Blend graph**

For each subvoice, generate raw gain:

```text
rawGain = centerWeight + unisonBlend * (1 - centerWeight)
```

Implement with a started `ConstantSourceNode` set to `centerWeight`, joined at
`rawGain.gain`, and a `GainNode` fed by `unisonBlendSource` with gain
`1 - centerWeight`, also joined at `rawGain.gain`. Connect each raw-gain output

Sum curve outputs into a mean-power `GainNode` whose gain is `1 / voices`.
Pass it through:

```ts
new CurveNode(ctxt, value => 1 / Math.sqrt(Math.max(value, 0.0001)), {
  inputMin: 0.25,
  inputMax: 1,
});
```

Route reciprocal-sqrt output through a static gain `1 / Math.sqrt(voices)` to

- [ ] **Step 4: Implement lifecycle and teardown**

Keep active and stopped bundles. `waveform` updates raw nodes in both sets.
`stop(time?)` stops every raw oscillator in current bundle and clears current
ownership immediately. Every raw node `onended` disconnects all incoming source
to AudioParam links explicitly, then every audio/control connection it owns.
Destroy shared CurveNodes only when final raw node in bundle ends.

`destroy()` stops active raw oscillators, tears down all retained bundles,
Preserve current timed-stop behavior used by voice stealing.

- [ ] **Step 5: Export and verify**

Add this export to `packages/audio-engine/src/engine/index.ts`:

```ts
export * from './unison-oscillator';
```

Run: `pnpm build && pnpm lint`

Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add packages/audio-engine/src/engine/unison-oscillator.ts packages/audio-engine/src/engine/index.ts
git commit -m "feat(engine): add stereo unison oscillator"
```

### Task 3: Add ClampNode

**Files:**

- Create: `packages/audio-engine/src/engine/clamp-node.ts`
- Modify: `packages/audio-engine/src/engine/index.ts`
- Modify: `packages/audio-engine/src/engine/unison-oscillator.ts`

**Interfaces:**

- Consumes: `CurveNode` and `CurveNodeOptions` from `./curve-node`.
- Produces: public `ClampNode`, which passes values inside its declared input
  range unchanged and clamps values outside it to the nearest endpoint.

- [ ] **Step 1: Implement ClampNode as CurveNode specialization**

```ts
import { CurveNode } from './curve-node';

export class ClampNode extends CurveNode {
  constructor(ctxt: AudioContext, inputMin: number, inputMax: number) {
    super(ctxt, value => value, { inputMin, inputMax });
  }
}
```

`CurveNode` maps the declared range to `WaveShaperNode`'s `[-1, 1]` input
domain. Its identity curve preserves in-range values, while WaveShaper endpoint
behavior clamps values outside the declared range. Do not add methods, fields,
or separate teardown behavior.

- [ ] **Step 2: Export ClampNode**

Add to `packages/audio-engine/src/engine/index.ts`:

```ts
export * from './clamp-node';
```

- [ ] **Step 3: Clamp all continuous unison controls**

In `unison-oscillator.ts`, create one per-note `ClampNode` for every continuous
unison source before it reaches its distribution or gain-normalization graph:

```ts
const detuneClamp = new ClampNode(ctxt, 0, 50);
const depthClamp = new ClampNode(ctxt, 0, 1);
const blendClamp = new ClampNode(ctxt, 0, 1);

this.unisonDetuneSource.connect(detuneClamp.input);
this.unisonDepthSource.connect(depthClamp.input);
this.unisonBlendSource.connect(blendClamp.input);
```

Use `detuneClamp.output`, `depthClamp.output`, and `blendClamp.output` in place
of direct continuous-source connections. Retain ClampNodes in the per-note
bundle and destroy them with its CurveNodes after final raw oscillator ends.
Explicitly disconnect each persistent source from every clamp input before
destroying the clamp, following source-to-parameter teardown discipline.

- [ ] **Step 4: Verify build and formatting**

Run: `pnpm build && pnpm lint && git diff --check`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/audio-engine/src/engine/clamp-node.ts packages/audio-engine/src/engine/index.ts packages/audio-engine/src/engine/unison-oscillator.ts
git commit -m "feat(engine): clamp unison control signals"
```

### Task 4: Wire Synth And Voice

**Files:**

- Modify: `packages/audio-engine/src/types/oscillator-config.ts`
- Modify: `packages/axiom-synth/src/axiom-synth.ts`
- Modify: `packages/axiom-synth/src/axiom-voice-config.ts`
- Modify: `packages/axiom-synth/src/axiom-voice.ts`

**Interfaces:**

- Consumes: `UnisonOscillator`, `Observable`, shared `ConstantSourceNode`s.
- Produces: per-oscillator unison configuration applied across all Axiom voices.

- [ ] **Step 1: Define stored config**

Add and export from `oscillator-config.ts`:

```ts
export interface UnisonConfig {
  voices: number;
  detune: number;
  depth: number;
  blend: number;
}
```

Add `unison: UnisonConfig` to `OscillatorConfig`.

- [ ] **Step 2: Add synth sources and state propagation**

Give each default oscillator config:

```ts
unison: { voices: 1, detune: 0, depth: 0, blend: 1 }
```

In `AxiomSynth`, create three `FixedArray<ConstantSourceNode, OscillatorCount>`

- [ ] **Step 3: Extend voice config and replace module**

Add three continuous source arrays and voices observable to `AxiomVoiceConfig`.

- [ ] **Step 4: Verify build and formatting**

Run: `pnpm build && pnpm lint`

Expected: exit code 0.

- [ ] **Step 5: Commit**

```bash
git add packages/audio-engine/src/types/oscillator-config.ts packages/axiom-synth/src/axiom-synth.ts packages/axiom-synth/src/axiom-voice-config.ts packages/axiom-synth/src/axiom-voice.ts
git commit -m "feat(synth): wire oscillator unison controls"
```

### Task 5: Enable Oscillator Panel

**Files:**

- Modify: `app/src/components/OscillatorPanel.vue`

**Interfaces:**

- Consumes: `OscillatorConfig.unison`.
- Produces: live model edits passed by existing `Synth.vue` deep watches to `AxiomSynth.setOscillatorConfiguration()`.

- [ ] **Step 1: Remove placeholder refs and bind config fields**

Delete `ref` import and four local placeholder refs. Replace disabled bindings:

```vue
<Knob
  label="Voices"
  v-model="modelValue.unison.voices"
  :from="1"
  :to="16"
  :default="1"
  :tick-size="1"
/>
<Knob
  label="Detune"
  v-model="modelValue.unison.detune"
  :from="0"
  :to="50"
  :default="0"
/>
<Knob
  label="Depth"
  v-model="modelValue.unison.depth"
  :from="0"
  :to="1"
  :default="0"
/>
<Knob
  label="Blend"
  v-model="modelValue.unison.blend"
  :from="0"
  :to="1"
  :default="1"
/>
```

Use a local percentage formatter that multiplies normalized Depth and Blend by
100 before using `fractionDisplay(0)`. Keep Detune's existing one-decimal
format. Preserve `accent2` visual grouping.

- [ ] **Step 2: Verify UI and audio manually**

Run: `pnpm dev`

Expected: Vite serves port 4000. Verify all three panels expose active controls,

- [ ] **Step 3: Run required gates**

Run: `pnpm build && pnpm lint`

Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/OscillatorPanel.vue
git commit -m "feat(ui): enable oscillator unison controls"
```

### Task 6: Optimize Unison Render Graph

**Files:**

- Modify: `packages/audio-engine/src/engine/unison-oscillator.ts`
- Modify: `packages/audio-engine/src/engine/clamp-node.ts`
- Modify: `packages/axiom-synth/src/axiom-synth.ts`

**Interfaces:**

- Preserves: public `UnisonOscillator` interface and exact live normalized
  Blend result.
- Produces: reduced default and high-unison Web Audio node counts.

- [ ] **Step 1: Remove ClampNode from unison paths**

Remove per-note ClampNode creation and source wiring. Delete
`packages/audio-engine/src/engine/clamp-node.ts` and its barrel export because
no remaining production code uses it. In `AxiomSynth`, clamp unison config
before source scheduling and before storing values:

```ts
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const unison = {
  voices: Math.min(16, Math.max(1, Math.round(config.unison.voices))),
  detune: clamp(config.unison.detune, 0, 50),
  depth: clamp(config.unison.depth, 0, 1),
  blend: clamp(config.unison.blend, 0, 1),
};
```

- [ ] **Step 2: Precompute one exact Blend curve per active subvoice**

Replace raw-gain control, square curves, mean-power, reciprocal-square-root,
and normalizer nodes with one per-subvoice `CurveNode` driven by
`unisonBlendSource`. For fixed `voices`, precompute each position and center
weight, then use this curve callback:

```ts
const gainForBlend = (blend: number) => {
  const rawGain = centerWeight + blend * (1 - centerWeight);
  const power = positions.reduce((sum, position) => {
    const weight = 1 / (1 + Math.abs(position));
    const gain = weight + blend * (1 - weight);
    return sum + gain * gain;
  }, 0);
  return rawGain / Math.sqrt(power);
};
```

Create `new CurveNode(ctxt, gainForBlend, { inputMin: 0, inputMax: 1 })` and
connect `unisonBlendSource` to its input and curve output to its subvoice gain.
Retain/destroy each curve with its subvoice. Detune and depth use direct source
through static position gains.

- [ ] **Step 3: Bypass unison graph for one voice**

When `voices === 1`, create only raw `OscillatorNode`, connect normal frequency
and detune sources, and connect it directly to persistent `outputGain`. Do not
create any panner, subvoice gain, Blend curve, or detune/depth multiplier. Keep
explicit inbound source-to-AudioParam teardown.

- [ ] **Step 4: Preserve smooth rapid automation**

Replace `rampUnisonSource()` cancellation with a cross-browser hold operation.
Track each source's scheduled ramp start time, start value, and target. At each
update, calculate interpolated current value, cancel future events, schedule
that value at `now`, then ramp to target at `now + 0.01`. This must prevent a
discontinuity when controls update before prior ramp ends.

- [ ] **Step 5: Verify**

Run: `pnpm build && pnpm lint && git diff --check`

Expected: exit code 0. Run Vite server and verify its root returns HTTP 200.

- [ ] **Step 6: Commit**

```bash
git add packages/audio-engine/src/engine/unison-oscillator.ts packages/audio-engine/src/engine/clamp-node.ts packages/audio-engine/src/engine/index.ts packages/axiom-synth/src/axiom-synth.ts
git commit -m "perf(engine): reduce unison graph cost"
```

### Task 7: Final Verification

**Files:**

- Verify: all modified files.

- [ ] **Step 1: Inspect changes**

Run: `git diff main...HEAD --check && git status --short`

Expected: no whitespace errors; only intended worktree changes.

- [ ] **Step 2: Run build and format checks**

Run: `pnpm build && pnpm lint`

Expected: exit code 0.

- [ ] **Step 3: Perform audio smoke test**

Verify Voice Count 1 is centered and pitch/level-equivalent to prior oscillator.

- [ ] **Step 4: Inspect final status**

```bash
git status --short
```

Expected: clean worktree.
