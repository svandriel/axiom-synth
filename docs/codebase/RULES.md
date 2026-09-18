# Architecture Rules

Living record of hard architectural rules for axiom-synth. Append rules as they
are decided and implemented; do not delete or rewrite history without an
explicit decision. Rules are agreed at design time and enforced during
implementation — if code contradicts a rule, the code is wrong.

## Status

- Active rules apply to current and future work.
- Superseded rules are moved to "History" with the rule that replaced them.

## Audio engine

### 1. Units expose control as AudioParam jacks

Sound-generation units (`Oscillator`, `Filter`) expose controllable/moddable
values as `AudioParam` getters backed by unit-owned `ConstantSourceNode.offset`
or `GainNode.gain` (per-voice). A unit must never accept an opaque "config
source" object that leaks patch topology (LFOs, engine shared sources) into the
unit.

Reference: `Filter.cutoff`/`drive`/`keytrack`/`detune`
(`packages/audio-engine/src/engine/filter.ts`), `Oscillator.frequency`/`detune`/
`gain` (`packages/audio-engine/src/engine/oscillator.ts`).
Design: `docs/superpowers/specs/2026-09-17-oscillator-audio-param-jacks-design.md`.

### 2. Static modulation patching lives in ModulationRouter

Static node → AudioParam modulations (engine sources, LFO depth outputs) are
registered once, for the life of the voice, in `ModulationRouter`. Per-note
targets and audio-path signal wires do not belong in the router — they stay in
the voice (`AxiomVoice`) and are marked with a comment why.

### 3. Unit-own sources/params are zeroed and started before patching

`createConstantSource()` defaults `offset` to `1`; `GainNode.gain` defaults to
`1`. Any unit-owned `ConstantSourceNode` used as a modulation-input jack must
explicitly `setValueAtTime(0, ctxt.currentTime)` and `start()` in the
constructor, before any external source connects. Likewise a unit-owned output
`GainNode.gain` jack must be zeroed. A gain jack left at default doubles the
engine source (+6 dB).

### 4. Per-note onended must detach inbound source→param connections

`node.disconnect()` removes only outgoing connections. Inbound
`source.connect(node.audioParam)` links survive node death. Per-note teardown
must explicitly `source.disconnect(node.param)` for every inbound connection
before/at `onended`, or every stopped note leaks a live audio-rate connection.

### 5. Teardown order: parents/routers destroy before children

When a composite (`AxiomVoice`) owns a connection registry (`ModulationRouter`)
and child units, `router.destroy()` runs first in `.destroy()` — before any
child `.destroy()` — so registered pairs are disconnected while both ends still
exist. `destroy()` implementations are idempotent and defensively skip
already-gone connections (try/catch precedent:
`packages/axiom-synth/src/axiom-voice.ts`).

### 6. Building-block units are public; Axiom classes live in @axiom/axiom-synth

Sound-generation units and the abstract `Voice`/`Synth` bases are public API
exported from the `@axiom/audio-engine` barrel (`packages/audio-engine/src/
index.ts`) — `@axiom/axiom-synth` requires them. `AudioEngine` stays the
package facade. Axiom-specific classes (`AxiomSynth`, `AxiomVoice`,
`AxiomVoiceConfig`) live in `packages/axiom-synth/` (`@axiom/axiom-synth`),
never in the engine package. `@axiom/audio-engine` contains no Axiom
identifiers; dependency direction is one-way (`@axiom/axiom-synth` imports the
engine, never the reverse).

### 7. Only export what crosses a seam

A symbol gets an `export` only if it is (a) actually referenced outside its
module or (b) declared public API from a package entry barrel
(`packages/*/src/index.ts`). Exports that nothing imports and that are not
barrel-guaranteed public API are dead and must be removed. Internal plumbing
(patch structs, shared node wiring, per-voice glue) must not be exported from
a package barrel even when two files in the same package share it — that seam
stays package-internal. A package's public API is exactly what its `index.ts`
barrel declares.

Reference: `packages/axiom-synth/src/index.ts` earns its keep — it exports only
`AxiomSynth`/`AxiomVoice`; `AxiomVoiceConfig` stays package-internal.

## History

- Rule 6 ("New engine modules stay internal") superseded by rule 6
  (2026-09-18): engine building blocks (`Oscillator`, `ModulationRouter`, …)
  are now public API so `@axiom/axiom-synth` can consume them.
