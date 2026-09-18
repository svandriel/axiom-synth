# AudioEngine / Synth Separation — Design

Date: 2026-09-18
Status: Approved

## Problem

`AudioEngine` (`packages/audio-engine/src/engine/engine.ts`) is a single class
that plays two roles at once:

- **Audio engine / host**: owns the `AudioContext`, the master chain
  (`dry → master → comp → analyser → destination`), the `Meter`, and scope-data
  access.
- **Synth**: owns all Axiom voice allocation (pool of 16 `AxiomVoice`s,
  `noteToVoiceMap`, voice stealing, choke), all shared `ConstantSourceNode`s
  (filter cutoff/Q/env/keytrack, oscillator detune/gain, waveshaper drive, LFO
  rate/depth), and every Axiom parameter configuration (oscillators, envelopes,
  filter, LFOs, waveshaper).

The class is 561 lines and mixes generic host concerns with Axiom-specific
tuning. There is no seam for building a second synth, and the `@axiom/audio-engine`
package cannot be described as an engine — it is a single-purpose synth with an
analyser bolted on.

## Goals

1. Separate the host (audio engine) from the synthesizer.
2. Introduce a reusable `Synth` base class owning generic voice allocation
   (pool, `noteToVoiceMap`, stealing, choke, `allNotesOff`).
3. A concrete `AxiomSynth` carries all Axiom-specific state (configs, shared
   sources, setters) and builds `AxiomVoice`s.
4. `@axiom/audio-engine` knows nothing about Axiom. It is the engine host plus
   generic building blocks (oscillator, filter, envelope, LFO, waveshaper,
   modulation router, meter, analyser) plus the abstract `Voice`/`Synth`.
5. Behavior is preserved: same node graph, same levels, same stealing, same
   setters and config field names. Only ownership and file layout change.
6. Lay the seam for future synths (multi-synth framework intent) without
   building speculative features now.

## Package layout

Two packages:

- `@axiom/audio-engine` (existing) — **engine host + building blocks + bases**:
  - `AudioEngine` (host: context, master bus, meter, analyser/scope)
  - `Voice` (abstract) — unchanged, `voice.ts`, nothing moves
  - `Synth<V extends Voice>` (abstract, new) — generic voice allocation
  - Building blocks: `Oscillator`, `Filter`, `FilterResonance`, `Envelope`,
    `Lfo`, `Waveshaper`, `WaveshaperCurve`, `ModulationRouter`, `Analyser`,
    `Meter`, `Observable`, `Destroyable`, `helpers` (adds
    `resumeIfSuspended`), `constants`, and types (`EnvelopeConfig`,
    `FilterConfig`, `LfoConfig`, `OscillatorConfig`, `WaveshaperConfig`,
    `FixedArray`).
- `@axiom/axiom-synth` (new) — **the Axiom synth**:
  - `AxiomSynth` (extends `Synth<AxiomVoice>`, new)
  - `AxiomVoice` (moved verbatim from audio-engine)
  - `AxiomVoiceConfig` (moved verbatim from audio-engine)
  - owns its own barrel (`src/index.ts`)

Dependency direction is one-way: `@axiom/axiom-synth` → `@axiom/audio-engine`.
The reverse is impossible by construction: `@axiom/audio-engine` contains zero
Axiom identifiers, and pnpm rejects circular workspace dependencies (workspace
build sort would break).

Files that physically move: `axiom-voice.ts`, `axiom-voice-config.ts`. Every
other audio-engine file stays; only exports/barrels change.

### Barrel changes

`packages/audio-engine/src/index.ts` widens to export the building blocks, the
`Voice`/`Synth` bases, `Meter`, `Analyser`, `helpers`, `constants`, and the
config types (the existing type exports stay). `src/engine/index.ts` re-exports
accordingly. This amends RULES.md rule 6: building-block units are now public
API for synth packages (an `AxiomSynth` outside the package must import
`Oscillator`, `Filter`, `Envelope`, `Lfo`, `Waveshaper`, `ModulationRouter`
etc.).

## Design

### 1. `AudioEngine` — master-bus host

`AudioEngine` keeps only host responsibilities:

- `ctxt: AudioContext`
- `masterInput: GainNode` (renamed from `dry`; gain `1.0` — neutral bus)
- `master: GainNode` (gain `0.5`), `comp`, `analyser` (fftSize 2048, smoothing
  0.82)
- `Meter` reading `masterInput` (pre-comp, same metering behavior as today)
- `getScopeData(buffer)`, `meterLevel`, `ensureStarted()`
- `destroy()` — disconnect chain, `ctxt.close()`

Chain: `masterInput → master → comp → analyser → destination`, plus
`masterInput → meter.input`.

Removed from `AudioEngine`: all configs, all shared constant sources, waveform
`Observable`, `waveshaperCurve`/`waveshaperConfig`, voice pool, `noteOn` /
`noteOff` / `allNotesOff`, `setOscillatorConfiguration` /
`setLfoConfiguration`, all filter/osc/waveshaper setters, `LFO_DEPTH_SCALES`,
the `AxiomVoiceConfig` construction, and the `console.log("Initializing
AudioEngine …")` line.

`analyser` and `master` may be `protected`/private with the current public
accessors (`getScopeData`, `meterLevel`) kept public.

### 2. Base `Synth<V extends Voice>` — voice allocation engine

New file `packages/audio-engine/src/engine/synth.ts`.

```ts
export abstract class Synth<V extends Voice> implements Destroyable {
  protected readonly ctxt: AudioContext;
  protected readonly audioSink: AudioNode;
  protected constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    options?: { maxVoices?: number }, // default 16
  );
  protected abstract createVoice(): V;
  noteOn(noteNumber: number, velocity: number): void;
  noteOff(noteNumber: number): void;
  allNotesOff(): void;
  destroy(): void;
}
```

Owns (moved verbatim from `AudioEngine.noteOn`/`noteOff`/`allNotesOff`):

- `private noteToVoiceMap: Map<number, Voice>`
- `private voicePool: V[] | undefined` (lazy, see §3)
- Pool allocation: find an available voice, retrigger a duplicate note
  (`noteOff` then re-`noteOn`), steal the oldest voice by `lastUsed` when the
  pool is exhausted (`fastChoke`, `startDelay = chokeDuration`), then `noteOn`.
- `noteOff`/`allNotesOff` body and logging, verbatim.
- `ensureVoicePool()` — builds `maxVoices` voices via `createVoice()` on first
  use.
- `destroy()`: idempotent guard, clear `noteToVoiceMap`, destroy every voice,
  mark destroyed.
- After `destroy`, `noteOn`/`noteOff`/`allNotesOff` are no-ops (new cheap
  guard).
- `noteOn` resumes a suspended context through the shared
  `resumeIfSuspended(ctxt)` helper (new, in `helpers.ts`), so the context
  resume logic is not duplicated between `Synth` and `AudioEngine`.

`Voice` is untouched. `createVoice()` is called lazily so subclasses can rely
on their own field initializers (which run after `super()`), see §4.

### 3. `AxiomSynth` — the Axiom synth

New file `packages/axiom-synth/src/axiom-synth.ts`.

```ts
export class AxiomSynth extends Synth<AxiomVoice> {
  protected override createVoice(): AxiomVoice {
    return new AxiomVoice(this.ctxt, this.output, this.voiceConfig);
  }
}
```

Carries, moved verbatim from the old `AudioEngine`:

- Public configs: `oscillatorConfigs`, `ampEnvelope`, `filterConfig`,
  `filterEnvelope`, `lfoConfigs`, `waveshaperConfig` (private, as today).
- Shared sources: `filterCutOffSource`, `FilterResonance`, `_filterType` /
  `filterEnvAmountSource` / `filterKeyTrackSource`, `oscillatorDetuneSources`,
  `oscillatorGainSources`, `oscillatorWaveForms` (`Observable`),
  `waveShaperDriveSource`, `WaveshaperCurve`, `_distortionAmount`,
  `_waveshaperType`, `lfoWaveforms` / `lfoRateSources` / `lfoDepthSources`.
- `LFO_DEPTH_SCALES` table and the `setLfoConfiguration` depth logic.
- All setters, unchanged names and bodies: `filterCutOff`, `filterQ`,
  `filterType`, `filterEnvAmount`, `filterKeyTrack`, `distortionAmount`,
  `waveshaperDrive`, `waveshaperType`, `setOscillatorConfiguration`,
  `setLfoConfiguration`.

New:

- `private output: GainNode` with `gain.value = 0.6` — the relabeled `dry`
  bus. Voices sink into `output` (passed as `audioSink` to each `AxiomVoice`);
  `output.connect(engine.masterInput)` happens in the app composition layer, not
  inside the synth. Object shape kept: `output` and `voiceConfig` are initialized
  in the constructor body / field initializers after `super()`.

Lazy pool timing: because subclass fields run after `super()`, `createVoice()`
may read `voiceConfig`/`output` only when the pool is built on first use — never
from the base constructor. `ensureVoicePool()` guards against double-build.

`destroy()` order (preserving the old `AudioEngine.destroy()` relative order):

1. `super.destroy()` — voices destroyed first (each voice destroys its own
   router/envelopes per RULES.md rule 5), map cleared.
2. Shared sources stopped/disconnected: filter cutoff/resonance/env/keytrack,
   oscillator detune/gain, waveshaper drive, `waveshaperCurve.destroy()`,
   LFO rate/depth sources.
3. `output.disconnect()`.
4. `destroyed` flag.

`AxiomSynth` never closes the `AudioContext` — that stays the engine's job.

### 4. `AxiomVoice` / `AxiomVoiceConfig` — moved verbatim

- Move `axiom-voice.ts` and `axiom-voice-config.ts` into
  `packages/axiom-synth/src/`.
- Import `Voice`, `Oscillator`, `Filter`, `Envelope`, `Lfo`, `Waveshaper`,
  `ModulationRouter`, `helpers`, `constants`, `FixedArray` from
  `@axiom/audio-engine` instead of relative paths.
- No logic changes. The voice's `audioSink` is now `AxiomSynth.output` (it was
  `AudioEngine.dry`); the voice code does not care which node that is.

### 5. App wiring

- `app/src/composables/use-audio-context.ts` keeps the `AudioEngine`
  module-singleton. New `app/src/composables/use-axiom-synth.ts` keeps an
  `AxiomSynth` module-singleton built against the engine:
  `new AxiomSynth(engine.ctxt, engine.masterInput)`, and re-builds both when the
  `AudioContext` is closed (engine first, then the synth against the fresh
  `masterInput`).
- `Synth.vue`: all synth controls/config readings switch to `useAxiomSynth()`
  (`filterConfig`, `oscillatorConfigs`, `lfoConfigs`, `filterType`,
  `waveshaperType`, `distortionAmount`, …). Scope-related means
  (`meterLevel`, `getScopeData`) stay on the engine.
- `Keyboard.vue`: `noteOn`/`noteOff`/`allNotesOff` → `useAxiomSynth()`.
- `ScopePanel.vue`: engine (unchanged).
- No UI shape change: knob → setter names identical.

## Out of scope (YAGNI)

- No mono/poly/last-note polyphony modes or steal-policy hooks. A second synth
  must request them.
- No per-synth level/mute/crossfade controls. The `dry → masterInput` relabel is
  a gain rename only (`0.6` moves onto `AxiomSynth.output`).
- No MIDI layer, no patch/program loading.
- `AxiomVoice` graph topology untouched (covered by earlier specs).
- No per-synth meters; one global engine meter.
- No engine-package renames of UI-facing fields (`filterCutOff`, `filterQ`, …).

## Safety / invariants

- Identical node graph and levels: `AxiomSynth.output (0.6)` feeds
  `masterInput (1.0) → master (0.5) → comp → analyser → dest` — the old
  `dry (0.6) → master (0.5)` path unchanged in value.
- Meter still pre-comp, on `masterInput`.
- Stealing/choke/retrigger rules byte-for-byte identical (relocated, not
  rewritten).
- `@axiom/audio-engine` contains no Axiom identifier (grep-clean); the sole
  import direction is `@axiom/axiom-synth` → `@axiom/audio-engine`.
- Verification gate: `pnpm build` and `pnpm lint` (root).
- RULES.md rule 6 amended to permit barrel export of building-block units needed
  by synth packages.

## Architectural rules (recorded in `docs/codebase/RULES.md`)

Existing rules 1–5 unaffected. Rule 6 changes from "new engine modules stay
internal" (barrel-exports only what consumers outside the package need) to:
building-block units (`Oscillator`, `Filter`, `Envelope`, `Lfo`, `Waveshaper`,
`WaveshaperCurve`, `ModulationRouter`, `FilterResonance`, `Meter`, `Analyser`)
and the abstract `Voice`/`Synth` bases are public API — required by
`@axiom/axiom-synth`. `AudioEngine` stays the engine package's facade. Axiom
classes (`AxiomSynth`, `AxiomVoice`, `AxiomVoiceConfig`) live in
`@axiom/axiom-synth`, never in the engine package.
