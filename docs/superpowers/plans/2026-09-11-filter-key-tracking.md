# Filter Key Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add keyboard tracking to the filter: a shared ConstantSourceNode carrying the tracking amount, per-voice GainNodes computing the per-note cents offset, routed into `filter.detune`.

**Architecture:** A shared `filterKeyTrackSource` (ConstantSourceNode, range 0–2) lives in `AudioEngine` alongside the existing `filterCutOffSource`/`filterQSource`. Each `AxiomVoice` receives it and connects it through a `GainNode` (`keyTrackGain`) whose gain is set per note-on to `100 × noteNumber` cents. The output sums into `filter.detune` alongside the existing filter envelope.

**Tech Stack:** TypeScript, Web Audio API, Vue 3.

**Spec:** `docs/superpowers/specs/2026-09-11-filter-key-tracking-design.md`

## Global Constraints

- TypeScript strict mode, `erasableSyntaxOnly`
- No semicolons, single quotes, 80-char width, trailing commas (Prettier)
- No test runner configured — verify with `pnpm build` (type-check + build)
- No new comments unless specified
- Voice pool stays at 16 voices

---

### Task 1: Add tracking to FilterConfig, AudioEngine, and AxiomVoice

**Files:**

- Modify: `src/types/filter-config.ts`
- Modify: `src/engine/engine.ts`
- Modify: `src/engine/axiom-voice.ts`

**Interfaces:**

- Produces: `FilterConfig.tracking: number`, `AudioEngine.filterKeyTrack` getter/setter, `AxiomVoice` constructor accepts `filterKeyTrack: ConstantSourceNode`
- Consumes: existing `freqOf(noteNumber)`, `filter.detune`, `createConstantSource`

- [ ] **Step 1: Add `tracking` to FilterConfig**

In `src/types/filter-config.ts`, add after `envAmount`:

```typescript
export interface FilterConfig {
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

- [ ] **Step 2: Add `filterKeyTrackSource` field and constructor initialization in AudioEngine**

In `src/engine/engine.ts`, add the field after the existing `filterEnvAmountSource` declaration (around line 28):

```typescript
private readonly filterKeyTrackSource: ConstantSourceNode;
```

In the constructor, after the `this.filterEnvAmountSource = ...` block (around line 122), add:

```typescript
this.filterKeyTrackSource = this.createConstantSource(
  this.filterConfig.tracking,
);
```

- [ ] **Step 3: Add `filterKeyTrack` default to filterConfig in AudioEngine**

In the `filterConfig` initializer (line 75–79), add `tracking: 0`:

```typescript
public readonly filterConfig: FilterConfig = {
  frequency: 350,
  q: 6,
  envAmount: 3600, // cents, -9600 to 9600
  tracking: 0,
};
```

- [ ] **Step 4: Pass `filterKeyTrackSource` to AxiomVoice constructor in AudioEngine**

In the voice pool creation (lines 147–158), add `this.filterKeyTrackSource` after `this.filterEnvAmountSource`:

```typescript
new AxiomVoice(
  this.ctxt,
  this.dry,
  this.ampEnvelope,
  this.filterEnvelope,
  this.filterCutOffSource,
  this.filterQSource,
  this.filterEnvAmountSource,
  this.filterKeyTrackSource,
  this.oscillatorDetuneSources,
  this.oscillatorGainSources,
  this.oscillatorWaveForms,
),
```

- [ ] **Step 5: Add `filterKeyTrack` getter/setter in AudioEngine**

After the `filterEnvAmount` getter/setter block (around line 201), add:

```typescript
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
```

- [ ] **Step 6: Clean up `filterKeyTrackSource` in AudioEngine.destroy**

In the `destroy` method, after the `filterEnvAmountSource` disconnect/stop block (around line 324), add:

```typescript
this.filterKeyTrackSource.disconnect();
this.filterKeyTrackSource.stop();
```

- [ ] **Step 7: Add `filterKeyTrack` parameter to AxiomVoice constructor**

In `src/engine/axiom-voice.ts`, add a `filterKeyTrack: ConstantSourceNode` parameter to the constructor, after `filterEnvAmount` (line 45). Add the corresponding private field declaration before the constructor:

```typescript
private readonly keyTrackGain: GainNode;
```

Update the constructor signature:

```typescript
constructor(
  ctxt: AudioContext,
  audioSink: AudioNode,
  ampEnvelopeConfig: EnvelopeConfig,
  filterEnvelopeConfig: EnvelopeConfig,
  filterCutoff: ConstantSourceNode,
  filterResonance: ConstantSourceNode,
  filterEnvAmount: ConstantSourceNode,
  filterKeyTrack: ConstantSourceNode,
  oscillatorDetuneSources: FixedArray<ConstantSourceNode, OscillatorCount>,
  oscillatorGainSources: FixedArray<ConstantSourceNode, OscillatorCount>,
  oscillatorWaveForms: Observable<FixedArray<WaveFormType, OscillatorCount>>,
)
```

In the constructor body, after the existing `this.filterEnvelope.node.connect(this.filter.detune);` (line 73), add:

```typescript
this.keyTrackGain = ctxt.createGain();
this.keyTrackGain.gain.value = 0;
filterKeyTrack.connect(this.keyTrackGain);
this.keyTrackGain.connect(this.filter.detune);
```

- [ ] **Step 8: Set `keyTrackGain` gain in `internalNoteOn`**

In `internalNoteOn` (lines 88–96), add after the three existing lines:

```typescript
override internalNoteOn(
  noteNumber: number,
  velocity: number,
  now: number,
): void {
  this.createOscillators(noteNumber, now);
  this.ampEnvelope.noteOn(velocity, this.ampEnvelopeConfig, now);
  this.filterEnvelope.noteOn(velocity, this.filterEnvelopeConfig, now);
  this.keyTrackGain.gain.setValueAtTime(100 * noteNumber, now);
}
```

- [ ] **Step 9: Disconnect `keyTrackGain` in `destroy`**

In the `destroy` method (lines 159–166), add before `super.destroy()`:

```typescript
this.keyTrackGain.disconnect();
```

- [ ] **Step 10: Type-check and build**

Run: `pnpm build`

Expected: exit 0, no type errors.

- [ ] **Step 11: Commit**

```bash
git add src/types/filter-config.ts src/engine/engine.ts src/engine/axiom-voice.ts
git commit -m "feat: add filter keyboard tracking to engine and voice"
```

---

### Task 2: Add Tracking knob to FilterPanel and wire in Synth

**Files:**

- Modify: `src/components/FilterPanel.vue`
- Modify: `src/components/Synth.vue`

**Interfaces:**

- Consumes: `AudioEngine.filterKeyTrack` getter/setter (Task 1)
- Produces: `FilterPanel` accepts `tracking` v-model, `Synth` wires ref + watch

- [ ] **Step 1: Add Tracking knob to FilterPanel**

In `src/components/FilterPanel.vue`, add the Tracking knob in the template after the Env Amt knob (after line 31):

```html
<Knob
  label="Tracking"
  v-model="tracking"
  class="mt-3"
  :from="0"
  :to="2"
  :default="0"
  :format="v => fractionDisplay(0)(v * 100)"
/>
```

Add the corresponding `defineModel` in the `<script setup>` block, after the `envAmount` defineModel (around line 51):

```typescript
const tracking = defineModel<number>('tracking', {
  required: true,
});
```

- [ ] **Step 2: Wire tracking ref and watch in Synth.vue**

In `src/components/Synth.vue`, add `v-model:tracking="tracking"` to the `<FilterPanel>` component (after the `v-model:envAmount` line, around line 25):

```html
<FilterPanel
  class="col-span-12 row-start-4 sm:col-span-6 sm:col-start-7 sm:row-start-1 lg:col-span-4"
  v-model:cutoff="cutoff"
  v-model:resonance="resonance"
  v-model:envAmount="envAmount"
  v-model:tracking="tracking"
/>
```

Add the tracking ref after the `envAmount` ref (around line 47):

```typescript
const tracking = ref(engine.value.filterConfig.tracking);
```

Add the watch after the `envAmount` watch (around line 64):

```typescript
watch(tracking, newTracking => {
  engine.value.filterKeyTrack = newTracking;
});
```

- [ ] **Step 3: Type-check and build**

Run: `pnpm build`

Expected: exit 0, no type errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/FilterPanel.vue src/components/Synth.vue
git commit -m "feat: add tracking knob to filter panel"
```

---

## Self-Review Checklist

- **Spec coverage:** `FilterConfig.tracking` ✓ (Task 1 Step 1); `filterKeyTrackSource` + setter ✓ (Steps 2–6); `keyTrackGain` in voice + constructor + `internalNoteOn` + destroy ✓ (Steps 7–9); Tracking knob ✓ (Task 2 Step 1); Synth wiring ✓ (Step 2). All spec sections covered.
- **Placeholder scan:** No TBD/TODO. Every code block is complete and copy-pasteable.
- **Type consistency:** `filterKeyTrackSource` name matches between AudioEngine field, constructor, destroy, and AxiomVoice constructor param. `keyTrackGain.gain.setValueAtTime(100 * noteNumber, now)` uses `noteNumber` (number) and `now` (number) matching `internalNoteOn` signature. `filterConfig.tracking` typed as `number` everywhere.
