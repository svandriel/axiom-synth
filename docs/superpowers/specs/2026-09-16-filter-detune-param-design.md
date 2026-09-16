# Filter detune as an exposed AudioParam — Design Document

## Context

The `Filter` class (recently rewritten to chain biquad stages) exposes envelope
modulation to the voice through a custom method:

```typescript
connectModulation(node: AudioNode): void
```

The voice must remember to wire the envelope with this bespoke API
(`filter.connectModulation(filterEnvelope.node)`), and `teardownStage`/`destroy`
must disconnect `modulationNodes` edges from each stage's `detune`. Because the
envelope node is owned by the voice and destroyed outside the `Filter`, teardown
depends on cross-object lifecycles: if the envelope is disconnected before the
filter's `teardownStage` runs, the destination-specific disconnect throws
`InvalidAccessError`. The current `AxiomVoice.destroy()` ordering happens to
avoid this, but the dependency is implicit and fragile.

## Goal

Replace the custom `connectModulation` fan-out with a Web Audio-native one:
the `Filter` exposes its detune as a single `AudioParam`, and callers use the
standard `node.connect(audioParam)` idiom. The filter fans that one connection
out to all biquad stages internally.

This removes:
- the bespoke `connectModulation` API,
- the `modulationNodes` bookkeeping array,
- the teardown race (the filter only ever disconnects its own fan-out node,
  never edges on an externally-owned envelope node).

## Design

### Filter changes (`packages/audio-engine/src/engine/filter.ts`)

- Replace `private readonly modulationNodes: AudioNode[] = []` with a fan-out
  source node created in the constructor (mirrors the engine's `cutoff`
  ConstantSourceNode pattern):

  ```typescript
  this.detuneSource = ctxt.createConstantSource();
  this.detuneSource.offset.value = 0;
  this.detuneSource.start();
  ```

  The default is 0 because the stage `detune` param base is already 0; the
  envelope signal is the only contribution.

- Add a public getter:

  ```typescript
  get detune(): AudioParam {
    return this.detuneSource.offset;
  }
  ```

  The envelope connects into the offset (a-rate), and the constant source's
  output — which carries exactly the envelope signal — fans out to the stages.

- Remove `connectModulation(node)`.

- Grow path (new stage): replace

  ```typescript
  this.modulationNodes.forEach(node => node.connect(stage.detune));
  ```

  with

  ```typescript
  this.detuneSource.connect(stage.detune);
  ```

- `teardownStage`: replace the modulation disconnect loop with a source-side
  disconnect:

  ```typescript
  this.detuneSource.disconnect(stage.detune);
  ```

- `destroy()`: add `this.detuneSource.stop();` and `this.detuneSource.disconnect();`
  alongside the other node disconnects.

### Voice changes (`packages/audio-engine/src/engine/axiom-voice.ts`)

- Replace:

  ```typescript
  this.filter.connectModulation(this.filterEnvelope.node);
  ```

  with the standard idiom:

  ```typescript
  this.filterEnvelope.node.connect(this.filter.detune);
  ```

### Behavior parity

- The envelope's modulated cents flow through unchanged: envelope → `offset`
  (base 0) → constant source output → every stage's `detune`.
- The hub-gain approach was rejected: a GainNode with its `.gain` exposed but
  no audio input multiplies silence by the modulated gain, so no signal could
  reach the stages. A ConstantSourceNode is the correct fan-out primitive for
  an exposed AudioParam that other nodes drive.
- Keytrack continues to connect directly to each stage's `detune` (unchanged).
- Default `'lowpass12'`, Q curve, incremental rebuild, wiring — all untouched.
- `Filter` remains `Destroyable`; `destroy()` still unsubscribes the type
  observable and tears down stages.

## Invariants after this change

- The filter only disconnects edges on its own nodes (`detuneHub`, `gain`,
  `output`, `keytrackGain`, stages) plus source-side disconnects of shared
  engine sources (`cutoff`, `resonance`). It never disconnects a node owned by
  another object, so no cross-object lifetime ordering can throw.
- `detuneHub.disconnect()` in destroy is a no-arg disconnect of a filter-owned
  node — always safe.

## Testing / verification

No test runner configured. Gates: `pnpm build` + `pnpm lint` from repo root.
Also grep to confirm no stale references:

```
rg "connectModulation|modulationNodes" packages/audio-engine/src
```

Expected: no matches.

## Out of scope

- Changing the existing `AxiomVoice.destroy()` ordering (still correct, just no
  longer load-bearing).
- Any other filter API surface (cutoff, Q, keytrack, drive, input, output all
  unchanged).