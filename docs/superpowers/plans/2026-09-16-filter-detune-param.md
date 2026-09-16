# Implementation Plan — Filter detune as exposed AudioParam

## Objective

Replace `Filter.connectModulation(node)` + `modulationNodes[]` with a
filter-owned `ConstantSourceNode` fan-out, exposing `get detune(): AudioParam`
(its `.offset`) so the voice uses the standard Web Audio idiom
`filterEnvelope.node.connect(filter.detune)`. This also removes the
cross-object teardown race on stage detunes.

## Why this design

- A `GainNode` hub exposed as `detune` cannot work: with no audio input its
  output is input × gain = silence, so nothing would reach the stages.
- A `ConstantSourceNode` mirrored the engine `cutoff` pattern: the envelope
  drives `offset` (base 0) a-rate, the source output carries exactly the
  envelope signal, and that output fans out to every stage's `detune`.

## Tasks

### T1 — Filter: `detuneSource` fan-out + `detune` getter (`filter.ts`)

- Remove `private readonly modulationNodes: AudioNode[] = [];`.
- In ctor, next to `keytrackSource` creation, add:

  ```typescript
  this.detuneSource = ctxt.createConstantSource();
  this.detuneSource.offset.value = 0;
  this.detuneSource.start();
  ```

- Add getter:

  ```typescript
  get detune(): AudioParam {
    return this.detuneSource.offset;
  }
  ```

- Remove `connectModulation(node)`.
- Grow path (line 161): replace `this.modulationNodes.forEach(node => node.connect(stage.detune));` with `this.detuneSource.connect(stage.detune);`.
- `teardownStage` (line 192): replace the modulation loop with `this.detuneSource.disconnect(stage.detune);`.
- `destroy()`: add `this.detuneSource.disconnect();` and `this.detuneSource.stop();` beside `keytrackSource` teardown.

### T2 — Voice: connect envelope to `filter.detune` (`axiom-voice.ts`)

- In the ctor wiring, replace `this.filter.connectModulation(this.filterEnvelope.node)` with `this.filterEnvelope.node.connect(this.filter.detune)`.
- Keep the `ampEnvelope → filter → filterEnvelope` destroy order as-is (now cosmetic; filter no longer touches envelope edges).

### T3 — Verify

- `pnpm build` from repo root.
- `pnpm lint` from repo root.
- `rg "connectModulation|modulationNodes" packages/audio-engine/src` → no matches.
- Grep voice wiring to confirm the new connect line.

## Files

- `packages/audio-engine/src/engine/filter.ts`
- `packages/audio-engine/src/engine/axiom-voice.ts`

## Definition of done

- No `connectModulation`/`modulationNodes` references remain in `packages/audio-engine/src`.
- `filter.detune` is an `AudioParam`; envelope connects to it with one Web Audio `connect`.
- Build + lint green.
