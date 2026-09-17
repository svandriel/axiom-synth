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
`gain` (post-refactor `packages/audio-engine/src/engine/oscillator.ts`).
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
already-gone connections (try/catch precedent: `axiom-voice.ts`).

### 6. New engine modules stay internal

`Oscillator`, `ModulationRouter`, and other engine-internal classes are not
exported from the `@axiom/audio-engine` barrel (`packages/audio-engine/src/
index.ts`) unless a consumer outside the package needs them.

## History

- _(none yet — this is the initial ruleset, recorded 2026-09-17)_
