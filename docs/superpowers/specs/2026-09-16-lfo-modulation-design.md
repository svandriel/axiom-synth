# LFO Modulation Panels — Design

Date: 2026-09-16

## Summary

Add four LFO (low-frequency oscillator) slots to the synthesizer. Each slot
modulates six targets — three oscillator detunes, filter cutoff, amplitude
(tremolo), and waveshaper drive — with a rate knob, a waveform selector, and
six bipolar depth knobs. All four LFOs run simultaneously; a panel toggle
chooses which one is being edited. LFOs are note-triggered only: no free-run
mode in this iteration (deferred, see Future Work).

## Rationale

LFOs are the standard source of vibrato, auto-wah, tremolo, and wobble. The
synth currently has no modulation sources beyond fixed envelopes. Resonance
and filter-envelope-amount were considered as targets and dropped: resonance
modulation is niche and conflicts with per-voice note-retriggering (the
resonance source is engine-shared), and envelope-amount modulation is rarely
reached for. A dedicated amplitude target was added instead for tremolo.

## Scope

- 4 LFO slots, all active at once, all note-triggered.
- Targets: osc1 detune, osc2 detune, osc3 detune, filter cutoff, amp,
  drive.
- Per LFO: rate (Hz), waveform, six bipolar depth knobs (-1..1).
- No run-mode switch in the UI for this iteration.

## Architecture

LFO signals are audio-rate oscillator outputs, generated per voice and
routed to per-voice modulation points so retriggered LFOs never sum across
16 voices. Depth amounts are shared engine-level `ConstantSourceNode`s fanned
out to per-voice gain nodes, following the existing shared-parameter pattern
(e.g. `oscillatorDetuneSources`). LFO oscillator nodes are created lazily per
note and stopped on release, so idle voices cost no LFO oscillators.

### Config types (`packages/audio-engine/src/types/lfo-config.ts`)

```ts
type LfoTarget = 'osc1' | 'osc2' | 'osc3' | 'cutoff' | 'amp' | 'drive';
type LfoWaveformType = 'sine' | 'triangle' | 'square' | 'sawtooth';

interface LfoConfig {
  rateHz: number; // 0.01..30, UI uses log2
  waveform: LfoWaveformType;
  depths: FixedArray<number, 6>; // -1..1, indexed by LfoTarget
}
```

Constants: `LFO_COUNT = 4`, `LFO_TARGET_COUNT = 6`. Both live in
`packages/audio-engine/src/engine/constants.ts`. Defaults: rateHz 2, waveform
`sine`, all depths 0.

### Engine (`engine.ts`)

Shared sources, one set per slot, created in the constructor:

- `lfoWaveforms`: `Observable<LfoWaveformType>[4]` — per-slot waveform
  (voices subscribe, same pattern as `oscillatorWaveForms`).
- `lfoRateSources`: `ConstantSourceNode[4]` — per-slot rate, connected to each
  voice's per-note LFO `osc.frequency`.
- `lfoDepthSources`: `ConstantSourceNode[4][6]` — per-slot per-target depth,
  fanned to every voice's per-target gain node so knob moves reach playing
  notes.

`setLfoConfiguration(index: LfoIndex, config: LfoConfig)` mirrors
`setOscillatorConfiguration`: ramps the rate source (10ms), publishes the
waveform observable, ramps the six depth sources, and stores the config.

Destroy teardown: disconnect and stop all `lfoRateSources` and
`lfoDepthSources`.

### Per-voice `Lfo` class (`packages/audio-engine/src/engine/lfo.ts`)

One instance per slot per voice, owned by `AxiomVoice` (like `Envelope`).

Persistent structure, idle-cheap:

- Six depth `GainNode`s, one per target. Each gain's `.gain` AudioParam is
  fed by the matching shared `lfoDepthSource` (the depth amount), the LFO
  oscillator feeds its input, and its output routes to the target injection
  point. These stay wired permanently; with no LFO running they pass silence,
  and depth 0 outputs nothing regardless.

Per-note lifecycle:

- On `noteOn`, if any depth is nonzero, create one `OscillatorNode`
  (`type` from the slot's waveform observable via subscription,
  `osc.frequency` driven by the slot's rate source), `start(0, now)`, and
  wire `osc -> each depthGain -> target injection point`.
- On release/`onSoundStop`, stop and disconnect the oscillator. If the slot
  has all-zero depths, the oscillator is never created.

`AxiomVoiceConfig` gains `lfoWaveforms`, `lfoRateSources`, `lfoDepthSources`.
`AxiomVoice` constructs its own four `Lfo` instances using those shared
references.

### Target injection points

| Target          | Injection point              | Engine change                                             |
| --------------- | ---------------------------- | --------------------------------------------------------- |
| osc1/2/3 detune | transient osc node `.detune` | `Oscillator` accepts external mod inputs                  |
| cutoff          | `filter.cutoff` AudioParam   | `Filter` hosts an internal source, exposes `cutoff` param |
| amp             | per-voice `ampModGain`       | new gain node between amp envelope and sink               |
| drive           | `waveShape.drive` AudioParam | none (already exposed)                                    |

**Oscillator mod inputs.** Each `Oscillator` starts a fresh `OscillatorNode`
per note. It must also connect each LFO depth gain targeting its detune to
that node's `.detune`, and disconnect it in `onended`. The constructor gains
an optional list of mod inputs (AudioNodes) that are connected to every new
osc node's detune on `start()` and disconnected on stop/`onended`/`destroy`.

**Filter cutoff (`filter.ts`).** The `Filter` no longer receives the shared
cutoff `ConstantSourceNode` in its constructor. It creates its own internal
`ConstantSourceNode`, exposes `get cutoff(): AudioParam` (its offset), and
wires that source to every stage's `.frequency` in `rebuild`.
`AxiomVoice` connects the shared engine `filterCutOffSource` to
`filter.cutoff`, and the per-voice LFO depth gain also connects there. Both
signals sum at one per-voice junction, so note-retriggered LFO modulation
stays per voice. `destroy` disconnects the internal source.

**Amp (Tremolo).** Insert a per-voice `ampModGain` between the amp envelope
and the voice sink, biased at 1.0. Depth gain (centered at 0) connects to
`ampModGain.gain`, so at depth 0 the gain stays exactly 1.0 (no modulation)
and bipolar depths give multiplicative, sign-safe tremolo — no amplitude pump
at note attack.

**Drive (waveshaper).** The `Waveshaper` already exposes
`get drive(): AudioParam`; the LFO depth gain for the drive target connects
there directly.

### Depth scaling

The -1..1 knob value scales per target through engine constants
(`packages/audio-engine/src/engine/lfo.ts` or a dedicated constants spot):

- detune: ±150 cents per unit depth
- cutoff: ±24 semitones per unit depth, applied as frequency in Hz on the
  per-voice cutoff param (planner may express as exponential-ish ramp if the
  linear Hz range proves too aggressive at low cutoffs)
- amp: ±1.0 gain per unit depth (drive value 1.0 center)
- drive: ±4.0 per unit depth (drive range is 0..4)

Exact values tuned during implementation; the spec treats them as
units-of-depth multipliers.

### UI

**`app/src/components/LfoPanel.vue`** (new, follows `EnvelopePanel`
conventions):

- `Panel` labeled "LFO"; `#top-right` slot holds a `Toggle` with
  LFO1..LFO4 (`v-model:selected`).
- Body: a rate `Knob` (md, log2, 0.01..30 Hz, Hz format) and a waveform
  `Toggle` (SIN / TRI / SQR / SAW).
- Six bipolar depth `Knob`s (md, `from=-1 to=1 default=0`, `${±}`% format)
  arranged `VCO1 VCO2 VCO3` over `CUT AMP DRV`.
- Models: `v-model:config` (active `LfoConfig`) and `v-model:selected`.
- `Knob` already supports bipolar ranges (`Math.max(0, from)` zero reference
  centers the arc); no knob changes.

**`Synth.vue` wiring** (mirrors `osc1/2/3` pattern):

- `selectedLfo = ref(0)`; `lfoConfigs` seeded from `engine.value.lfoConfigs`
  as four reactive copies; `activeLfo` computed returns
  `lfoConfigs[selectedLfo]`.
- `watch(activeLfo, cfg => engine.value.setLfoConfiguration(selectedLfo.value, cfg), { deep: true })`.
- Grid placement: base `col-span-12 row-start-7` (scope moves to row 8),
  sm `row-start-4` (scope to row 5), lg `col-span-4 col-start-1 row-start-3`.
  Grid row counts: base 8, sm 5, lg 3 (unchanged).

## Files

Engine (`@axiom/audio-engine`):

- `packages/audio-engine/src/types/lfo-config.ts` (new)
- `packages/audio-engine/src/engine/lfo.ts` (new)
- `packages/audio-engine/src/engine/constants.ts` (LFO counts)
- `packages/audio-engine/src/engine/axiom-voice-config.ts`
- `packages/audio-engine/src/engine/axiom-voice.ts`
- `packages/audio-engine/src/engine/oscillator.ts`
- `packages/audio-engine/src/engine/filter.ts`
- `packages/audio-engine/src/engine/engine.ts`
- `packages/audio-engine/src/index.ts` (export `LfoConfig`, `LfoTarget`,
  `LfoWaveformType`)

App (`@axiom/app`):

- `app/src/components/LfoPanel.vue` (new)
- `app/src/components/Synth.vue`

## Verification

- `pnpm build` (type-check + bundle) is the gate; no test runner.
- `pnpm lint` for Prettier.
- Manual: play a note with an osc detune LFO (vibrato), cutoff LFO
  (auto-wah), amp LFO (tremolo), and drive LFO (pumping); confirm all four
  LFOs stack when depths are raised and that unused slots cost no audible or
  measurable CPU.

## Future Work

- Free-run LFO mode ("FREE"/"NOTE" run selector), including the neumorphic
  on/off switch design that was requested but intentionally deferred.
- BPM-synced rates.
- Sample-and-hold waveform.
- Extra targets (drive was added; resonance/envelope-amount stay out for now).
