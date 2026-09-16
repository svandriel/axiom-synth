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
  hub node created in the constructor:

  ```typescript
  this.detuneHub = ctxt.createGain();
  this.detuneHub.gain.value = 1;
  ```

- Add a public getter:

  ```typescript
  get detune(): AudioParam {
    return this.detuneHub.gain;
  }
  ```

- Remove `connectModulation(node)`.

- Grow path (new stage): replace

  ```typescript
  this.modulationNodes.forEach(node => node.connect(stage.detune));
  ```

  with

  ```typescript
  this.detuneHub.connect(stage.detune);
  ```

- `teardownStage`: replace the modulation disconnect loop with a source-side
  disconnect:

  ```typescript
  this.detuneHub.disconnect(stage.detune);
  ```

- `destroy()`: add `this.detuneHub.disconnect();` alongside the other node
  disconnects.

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

- The hub gain is 1, so the envelope's modulated cents flow through unchanged
  into every stage's `detune`.
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