# Oscillator Audio Param Jacks + Modulation Router — Design

Date: 2026-09-17
Status: Approved (adversarial review: "approve-with-changes", all findings adopted)

## Problem

`Oscillator` (`packages/audio-engine/src/engine/oscillator.ts`) takes a whole
`OscillatorConfigSource` (`oscillator-config-source.ts`) — shared
`ConstantSourceNode`s for detune/gain, a waveform `Observable`, and raw LFO
`modInputs: AudioNode[]`. It wires LFO depth-gain outputs and the detune source
into each per-note `OscillatorNode.detune` inside `start()`, tearing down in
`onended`. Consequences:

- The oscillator unit knows about the _patch topology_ (LFOs, engine shared
  sources) — wrong concern. It should be a dumb sound generator.
- Modulation wiring is **per-note** (attach on start, detach on end) even though
  the sources are persistent. The `onended` teardown juggles unsubscribes,
  disconnects, and mod-input detaches.
- Extension (unison, FM, pitch mods, velocity → detune, keytrack) couples new
  patch logic into the same class.

The `Filter` class already shows the target idiom: per-voice `ConstantSourceNode`
backed params exposed as `AudioParam` getters (`filter.ts:94-112`), with engine
sources and modulations patched in from outside. The oscillator does not follow
it.

## Goals

1. `Oscillator` becomes a self-contained unit generator exposing modulation
   **input jacks** (`AudioParam`s). It knows nothing about LFOs, the engine,
   or voices.
2. A separate `ModulationRouter` owns the voice's static patch topology —
   the only place connections are declared and torn down.
3. Modulation patching becomes **persistent** (connect once to stable jacks);
   per-note work is limited to `OscillatorNode` create/start/stop.
4. Future features slot in without breaking the module boundary: unison,
   linear FM, additional modulation sources.
5. Behavior is bit-for-bit identical before/after this refactor.

## Design

### 1. `Oscillator` — unit generator with jacks

New shape of `packages/audio-engine/src/engine/oscillator.ts`:

```ts
export class Oscillator implements Destroyable {
  constructor(ctxt: AudioContext);
  set waveform(w: WaveFormType); // caches value, fans out to live nodes
  get frequency(): AudioParam; // jack: unit ConstantSourceNode.offset, bias 0, a-rate
  get detune(): AudioParam; // jack: unit ConstantSourceNode.offset, bias 0, a-rate
  get gain(): AudioParam; // jack: output GainNode.gain, bias 0, a-rate
  start(noteHz: number, now: number);
  stop(): void;
  stop(time: number): void;
  connect(destination: AudioNode | AudioParam): void;
  disconnect(destination?: null | AudioNode | AudioParam): void;
  destroy(): void;
}
```

Internals:

- One permanent `ConstantSourceNode` per parameter (`frequencySource`,
  `detuneSource`), each `offset` explicitly zeroed with
  `setValueAtTime(0, ctxt.currentTime)` in the constructor (default is `1` —
  a gain jack left un-zeroed would double the engine source = +6 dB), then
  `start()`ed before any patching.
- One permanent output `GainNode`, `gain.value = 0`. `osc.connect(dest)` /
  `disconnect(dest)` route through it. `gain` getter exposes its `.gain`
  AudioParam (bias for the engine's per-osc gain source).
- Per note, `start(noteHz, now)` creates an `OscillatorNode` (via a private
  `createVoiceNodes(now)` helper shaped to later return a list for unison):
  - `node.type = this.waveform` (cached value)
  - `node.frequency.setValueAtTime(noteHz, now)` — note pitch is the
    **intrinsic** value of `node.frequency`; the `frequencySource` jack (and
    the detune jack) add on top through the additive AudioParam model.
  - `frequencySource.connect(node.frequency)`
  - `detuneSource.connect(node.detune)`
  - `node.connect(outputGain)`
  - `node.start(now)`
- Per-note teardown in `onended`: `frequencySource.disconnect(node.frequency)`,
  `detuneSource.disconnect(node.detune)`, `osc.disconnect()`, remove from the
  live-node set. **The source→param detaches are mandatory** — `osc.disconnect()`
  only removes outgoing links; the inbound source connections survive node death
  and would leak a live audio-rate connection per stopped note (adversarial
  review, blocker F1).
- `set waveform(w)` stores the value and sets `.type` on every live node.
  No per-note subscription. The voice keeps its single engine-level waveform
  subscription and forwards via this setter (rule: one subscription held by the
  voice, not per-note churn).

### 2. `ModulationRouter` — static patch registry

New file `packages/audio-engine/src/engine/modulation-router.ts`:

```ts
export class ModulationRouter implements Destroyable {
  patch(source: AudioNode, target: AudioParam): void;
  unpatch(source: AudioNode, target: AudioParam): void;
  destroy(): void; // idempotent; disconnects every registered pair defensively
}
```

Rules locked:

- **Scope: static node → AudioParam patching only.** The router registers
  modulations that exist for the life of the voice. Per-note targets and
  audio-path wires do not belong here.
- Registry dedupes `(source, target)` pairs.
- `destroy()` is idempotent and defensive (try/catch per pair; a source may have
  already been destroyed). Teardown race precedent exists at
  `axiom-voice.ts:182-187`.
- Destruction **order is pinned**: `router.destroy()` runs before any child
  `.destroy()` in `AxiomVoice.destroy()`.

### 3. `AxiomVoice` — patching location

Constructor wires the whole voice once through `ModulationRouter`:

- `engine.oscillatorDetuneSources[i]` → `osc.detune`
- each `lfo.targetOutput(LFO_TARGET_INDEX.oscN)` → `osc.detune` (per-osc)
- `engine.oscillatorGainSources[i]` → `osc.gain`
- `engine.filterCutOffSource` → `filter.cutoff`
- `engine.filterKeyTrackSource` → `filter.keytrack`
- `engine.waveShaperDriveSource` → `waveShaper.drive`
- LFO `cutoff` / `amp` / `drive` depth outputs → `filter.detune` /
  `ampModGain.gain` / `waveShaper.drive`
- `filterEnvelope.node` → `filter.detune`

Intentionally **not** in the router (with an inline comment marking why):

- Per-note audio-path switch: `ampEnvelope.node ↔ ampModGain` (`onSoundStart` /
  `onSoundStop`).
- Static node → node signal wire: `filterEnvAmountSource` →
  `filterEnvelope.node` (constant source into a gain-node input, not a param).

Waveform bridge replaced: the existing single subscription to
`config.oscillatorWaveForms` (currently `axiom-voice.ts:114-118`) now forwards
into `oscillators[i]!.waveform = value[i]`. The per-osc sub-`Observable`
construction and `waveformUnsubscribers` array are deleted.

### 4. Deletions and unchanged surface

- Delete `oscillator-config-source.ts`.
- `AxiomVoiceConfig` keeps the engine source refs (the voice patches them in);
  `oscillatorDetuneSources` / `oscillatorGainSources` / `oscillatorWaveForms`
  remain fields. No type change beyond removing nothing.
- `AudioEngine` untouched: shared `ConstantSourceNode` creation, setter ramps,
  `LFO_DEPTH_SCALES`, and the octave/semi→cents fold in
  `setOscillatorConfiguration` stay as-is.
- UI untouched (unison placeholders in `OscillatorPanel.vue` stay disabled).
- `Oscillator` / `ModulationRouter` are engine internals — **not** exported from
  the `@axiom/audio-engine` barrel (`packages/audio-engine/src/index.ts`).

## Future proofing (recorded, not implemented)

- **Unison.** `createVoiceNodes(now)` returns a list; `unisonCount` (plain
  value, read at `start()`) sizes it. Per-voice pitch offset = intrinsic
  `node.detune.setValueAtTime(offset, now)`; global detune + LFO mods add on top
  via the jack. Loudness: fold a `1/sqrt(unisonCount)` scale per unit into the
  per-note gain (else N=8 ≈ +9 dB). Knob moves retune the _next_ note — snapshot
  semantics for note-started unison; acceptable, documented.
- **Linear FM / pitch mods.** Addressed today via the `frequency` jack;
  router patches `lfo → osc.frequency` statically. Do not implement detune-path
  "FM" (detune is exp2-scaled cents — waveform-dependent sidebands, not linear FM).

## Safety / invariants

- Jack offsets are **modulation-input-only** — never automate a jack directly
  (the unit never schedules on its own param sources; engine ramps live on
  _engine_ sources, which flow a-rate through the jack untouched).
- No behavior change: same node count, same additive math, same depth scales.
- Verification gate: `pnpm build` (+ `pnpm lint`).

## Architectural rules (also recorded in `docs/codebase/RULES.md`)

1. Sound-generation units expose control as `AudioParam` jacks (per-voice
   `ConstantSourceNode.offset` / `GainNode.gain`), never accept a config source
   that leaks patch topology into the unit.
2. Static modulation patching lives in `ModulationRouter` (node → param only).
   Per-note targets and audio-path wires stay in the voice and are commented.
3. Every unit-own `ConstantSourceNode` is zeroed (`setValueAtTime(0, now)`) and
   `start()`ed before any patching; unit-own `GainNode.gain` jacks are zeroed
   likewise.
4. Per-note `onended`: detach each source→param inbound connection before the
   node dies; `node.disconnect()` alone leaks.
5. Multi-voice teardown order pinned: routers/parents destroy before children.
6. New engine modules stay internal: no barrel export unless a consumer needs it.
