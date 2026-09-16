# Filter Types & Slopes Design

Date: 2026-09-16

## Goal

Expand the `Filter` class so it supports all Web Audio biquad filter types
plus 12/24/36/48 dB/octave slopes (chained filters), expose a flat
`FilterType` enum, and add a type toggle to the FilterPanel UI.

## Requirements

- `Filter` supports all Web Audio filter shapes plus lowpass/highpass slopes
  of 12, 24, 36, and 48 dB/octave, expressed as a flat type string.
- Slopes are implemented as chained biquad filters. Q compensation must make a
  slope filter's perceived resonance match the single-filter Res knob.
- Filter Q is an a-rate parameter. Compensation must stay correct per sample
  without JS recompute on every Q value change.
- The Q transform for each slope must be computed once and shared across all
  16 voices (same philosophy as `WaveshaperCurve`).
- UI: FilterPanel gets a toggle in its top-right showing six useful types:
  `LP12, LP24, HP12, HP24, BP, Notch`.

## Type model

One flat type string. Each value maps internally to
`{ shape: BiquadFilterType, stages: 1 | 2 | 3 | 4 }` where each stage adds
12 dB/octave of rolloff.

```ts
type FilterType =
  | 'lowpass12' | 'lowpass24' | 'lowpass36' | 'lowpass48'
  | 'highpass12' | 'highpass24' | 'highpass36' | 'highpass48'
  | 'bandpass' | 'notch'
  | 'lowshelf' | 'highshelf' | 'peaking' | 'allpass';
```

Mapping (`filterTypeToSpec`):

| Public type               | shape                  | stages |
| ------------------------- | ---------------------- | ------ |
| `lowpass12` … `lowpass48` | `lowpass`              | 1..4   |
| `highpass12` … `highpass48` | `highpass`           | 1..4   |
| `bandpass`                | `bandpass`             | 1      |
| `notch`                   | `notch`                | 1      |
| `lowshelf`/`highshelf`/`peaking`/`allpass` | same           | 1      |

Slopes exist only for lowpass and highpass. Bandpass/notch/shelves/allpass
have no meaning as chained slopes: a chained bandpass narrows bandwidth, a
chained notch is already -∞ at center, and shelves/allpass have no rolloff
slope. They stay single-stage.

Default: `'lowpass12'` (single lowpass biquad) — audio-identical to today's
hardcoded `lowpass`, so behavior is unchanged at startup.

## `FilterResonance` — shared Q transform

New file `packages/audio-engine/src/engine/filter-resonance.ts`. One instance
per engine. Mirrors `WaveshaperCurve`: shared value + shared computation + node
fan-out.

Fields:

- `source: ConstantSourceNode` — the shared Q source, started in the ctor,
  offset initialized to the start Q. Replaces the engine-owned
  `filterQSource`.
- Per-slope transform chains:
  - slope 1 → `source` itself (identity; `Q = q`).
  - slopes 2/3/4 → `source → Gain(1/20) → WaveShaper[curve: x → (20x)^(1/stages)]`
    — one chain per slope, fixed curve arrays.

API:

```ts
class FilterResonance implements Destroyable {
  constructor(ctxt: AudioContext, startQ: number)
  get q(): number                                 // current Q value
  set q(v: number)                                // ramps source.offset over 10ms
  stageQFor(slope: 1 | 2 | 3 | 4): AudioNode      // node whose output carries q^(1/slope)
  destroy(): void
}
```

Stages wire Q with plain Web Audio connect/disconnect, so no
attach/detach helper methods exist:

```ts
resonance.stageQFor(slope).connect(stage.Q);      // during rebuild
stage.Q.disconnect();                             // during stage teardown
```

### Why WaveShaper

`q^(1/N)` is not a linear function, so a fixed gain node cannot implement it.
The shared Q source is a-rate by nature (an LFO/envelope could drive it in the
future). Driving each stage's `Q` through a WaveShaper node whose curve is
`(20x)^(1/N)` evaluates the compensation per sample, exactly, computed once per
exponent for the whole engine.

Input normalization: WaveShaper maps input `[-1, 1]` to the curve, so the
preceding `Gain(1/20)` maps the practical Q range `0.5–20` onto roughly the
upper half of the curve (input ~`0.025–1`). Output ranges 0–`20^(1/N)` (e.g.
`20^0.25 ≈ 2.11`) and is not clamped by Web Audio, so it feeds the Q param
directly. Precision is ~0.04 Q steps across the range and degrades below
`Q < 0.5`; the Res knob cannot produce values in that region, so this is
invisible in practice.

## `Filter` class

`packages/audio-engine/src/engine/filter.ts`. Reworked around lazy stage
create/destroy.

Constructor injection replaces the external param wiring:

```ts
new Filter(ctxt, {
  cutoff: ConstantSourceNode,       // shared engine source
  resonance: FilterResonance,       // shared Q transform
  type: Observable<FilterType>,     // shared engine observable
})
```

Structure:

- Stable skeleton: `drive: GainNode` (input) → `output: GainNode` (unity).
  `connect(dest)` wires `output`; external destinations are never rebuilt.
- Keytrack internals unchanged: `keytrackSource → keytrackGain`, where
  `keytrackGain.gain` is the `keytrack` getter.
- `modulationNodes: AudioNode[]` — envelope-side nodes registered via
  `connectModulation(node)`; re-fanned to every new stage on rebuild.
- Active stages: `BiquadFilterNode[]`, built lazily for the current type.

API changes:

- Removed getters: `frequency`, `q`, `detune` (their ports move inside the
  class). Dropping `q` is what forces the shared `FilterResonance`-based Q.
- Added: `connectModulation(node)` (registers + fans to current stages).
- Unchanged: `input`, `drive`, `keytrack`, `noteOn`, `connect`,
  `disconnect`, `destroy`.

Rebuild (triggered by the type observable). Stages form a nested prefix
chain — slope N uses stages `[0..N-1]` — so growth and shrink always happen at
the tail and intermediate stages are always reusable. Drive always feeds
`stages[0]` and `stages[last]` always feeds `output`.

1. Map new type → `{ shape, stages }`; let `cur` = current stage count.
2. Reuse each existing stage: set `stage.type = shape`. Frequency, keytrack,
   and modulation wiring persist untouched (`stageQFor` re-points are separate,
   below). Shape-only swaps therefore rebuild nothing.
3. Slope changed (`stages ≠ cur`): re-point Q on every existing stage —
   `stage.Q.disconnect()` then `resonance.stageQFor(stages).connect(stage.Q)`.
4. Grow (`stages > cur`): create the missing tail stages; per new stage set
   `type = shape`, `frequency.value = 0` (anti-blip, as today), and wire
   `cutoff → frequency`, `keytrackGain → detune`, `modulationNodes → detune`,
   `resonance.stageQFor(stages) → Q`. Rewire the tail edge:
   `stages[cur-1] → output` becomes `stages[cur-1] → newTail → … → output`.
5. Shrink (`stages < cur`): teardown only the tail stages `[stages..cur-1]`
   (`stage.disconnect()`, `stage.frequency/detune/Q.disconnect()` — the Q
   disconnect also detaches the shared resonance edge), then bridge
   `stages[stages-1] → output`.

Param-level `disconnect()` only removes edges into that voice's own stage
params, so shared engine sources feeding other voices are untouched.

Destroy: teardown stages, unsubscribe from the type observable, disconnect
drive/output/keytrack internals, stop the keytrack source.

## Engine changes

`packages/audio-engine/src/engine/engine.ts`:

- Replace `filterQSource` with `new FilterResonance(ctxt, this.filterConfig.q)`.
  `filterQ` getter/setter delegate to `this.filterResonance.q`.
- Add `_filterType = new Observable<FilterType>(this.filterConfig.type)`
  (pattern mirrors `_waveshaperType`). New `filterType` getter/setter.
- `FilterConfig` (types/filter-config.ts) gains `type: FilterType`.
- Voice config gains `filterType: Observable<FilterType>`; `filterResonance`
  becomes `FilterResonance`; `filterCutoff` stays `ConstantSourceNode`.
- Destroy: `this.filterResonance.destroy()` instead of
  `filterQSource.disconnect()/stop()`.

## Voice changes

`packages/audio-engine/src/engine/axiom-voice.ts`:

- Construct: `this.filter = new Filter(ctxt, { cutoff: config.filterCutoff, resonance: config.filterResonance, type: config.filterType })`.
- Drop the two param-connect lines (`filterCutoff.connect(frequency)`,
  `filterResonance.connect(q)`) — wiring moved into the class.
- Envelope wiring: `this.filterEnvelope.node.connect(this.filter.detune)` →
  `this.filter.connectModulation(this.filterEnvelope.node)`.
- Destroy: drop the two param-disconnect lines; `filter.destroy()` handles
  stage teardown and type unsubscription.

## UI changes

- `app/src/components/FilterPanel.vue`:
  - Top-right: `<Toggle v-model="type" :values="types" />` via the Panel
    `#top-right` slot (reusing the existing Toggle component).
  - `types` = `LP12 LP24 HP12 HP24 BP Notch` mapping to the flat type ids.
  - New required `type` model: `defineModel<FilterType>('type', { required: true })`.
- `app/src/components/Synth.vue`:
  - `const filterType = ref(engine.value.filterType)`, watch →
    `engine.value.filterType = v`, bind `v-model:type="filterType"`.

## Exports

- `packages/audio-engine/src/index.ts`: add
  `export type { FilterType } from './engine/filter';`
  (+ `export type { FilterResonance }` if a type export is needed).
- `types/filter-config.ts` imports `FilterType` from the engine to type the new
  field.

## Behavior parity & risks

- Default `lowpass12` = single stage, Q = identity tap → startup sound and Q
  wiring are identical to today's hardcoded single `lowpass`.
- Type switches rebuild per-voice chains; a brief audible click on the hard
  switch is expected and accepted (documented in `CONCERNS.md`). Rebuilds are
  incremental: a slope change churns only the stage-count delta (e.g. 4→2
  destroys 2 stages), and a shape-only swap (LP24→HP24) reuses every stage
  with a `.type` assignment — no node churn. A toggle still touches all 16
  voices in one tick, but each rebuild is small; accepted.
- The three slope transform chains (Gain + WaveShaper per slope) run even when
  no voice uses a slope and even while the synth is silent — trivial block
  cost, accepted. Lazy-bridging them is YAGNI.
- Max-slope cost is 4 biquads per voice (4× today's single biquad) — inherent
  to chained filters; small at a 16-voice pool.
- At the default `lowpass12` each voice holds exactly one biquad — idle node
  count identical to today.
- Per-voice fan-outs (frequency, detune/keytrack/envelope) are pointer-level
  Web Audio connections: the source signal is computed once and applied to N
  params; no duplicated per-stage processing.
- Q-change cost is unchanged from today: a single ramp on the shared source,
  no per-change curve recompute.
- `Filter.destroy` must unsubscribe from the type observable — otherwise 16
  callbacks linger on the engine-level observable after teardown.
- WaveShaper Q curve precision ~0.04 steps, worsens below `Q < 0.5` (out of
  Res-knob range; documented).
- Three extra WaveShaper/Gain nodes per engine for the slope transforms —
  negligible.

## Testing / verification

No test runner (build is the gate). Verify with `pnpm build` and `pnpm lint`.

Manual checks to add:

- Toggle the type while holding a chord (including >8-voice chords) and listen
  for dropouts beyond the accepted switch click.
- After `engine.destroy()`, confirm no type-observable subscribers remain
  (a repeat note-on after destroy must not run rebuilds).