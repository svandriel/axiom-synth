# Unison Allocation Optimization Review

**Review scope:**
`docs/superpowers/specs/2026-09-18-unison-allocation-optimization-design.md`

**Review perspectives:** Audio DSP/Web Audio engineering and solution
architecture.

**Implementation changes:** None.

## Critical

### 1. Spec contains truncated requirements

**References:** Lines 11-13, 82-85, 96-101, 135-146.

Core sentences end mid-thought. Missing requirements cover public interface
preservation, path construction, pool growth, armed-path reuse, source
lifecycle, destruction, and performance outcomes.

Different implementations could satisfy the visible text while leaking nodes,
reusing armed paths, or changing public behavior.

**Required clarification:** Restore every incomplete sentence before
implementation.

### 2. Blend WaveShaper input normalization is unspecified

**References:** Lines 61-68, 74-80.

Blend uses range `[0, 1]`, while `WaveShaperNode` indexes its curve over
`[-1, 1]`. The current `CurveNode` handles this with an input gain of `2` and
an offset of `-1`, but the pooled path does not specify that topology.

Without this remapping, Blend `0` reads the curve midpoint rather than the
`g_i(0)` endpoint. That changes gain behavior and invalidates the documented
Blend semantics.

**Required clarification:** Specify persistent normalization gain `2`, offset
`-1`, zero intrinsic values, connection ownership, and offset-source teardown.

### 3. Pool capacity and overflow policy are undefined

**References:** Lines 84-97.

Stopped generations retain paths until asynchronous `onended`. Rapid
retriggering or scheduled stops can require several simultaneous path sets.

An uncapped grow-only pool can retain an arbitrarily high event-burst
high-water mark. A pool capped at 16 cannot safely start a replacement while
old paths drain.

**Required clarification:** Define normal retained capacity, temporary overflow
behavior, whether overflow paths are destroyed or retained, and acquisition
behavior under pressure.

### 4. Note start is not transactional

**References:** Lines 102-111.

Path acquisition, role configuration, oscillator creation, graph connection,
and `start()` can fail independently, especially after `AudioContext` closure.

Partial failure can leave leased paths, half-connected graphs, or partially
started generations.

**Required clarification:** Configure all paths before starting sources, define
rollback in reverse construction order, and specify resulting `current` state
and error behavior.

## Important

### 1. Persistent paths may replace GC spikes with high idle render cost

**References:** Lines 70-85.

Keeping ConstantSource-driven detune, depth, Blend WaveShaper, panner, and gain
graphs permanently connected can leave hundreds of control graphs processing
after one 16x-unison warm-up.

**Required clarification:** State which links remain connected while paths are
free, which links exist only while armed, and the expected idle-node/render
budget.

### 2. Reusable path reset invariants are missing

**References:** Lines 72-95.

Reuse must reset:

- `gain.gain` intrinsic value to `0`
- detune and depth scale values
- Blend curve assignment
- pan baseline
- prior AudioParam automation
- previous raw oscillator identity

A default `GainNode.gain` of `1` would add one to Blend modulation and break
normalization.

**Required clarification:** Enumerate complete acquire-time reset behavior and
the exact scheduling method for each reusable `AudioParam`.

### 3. Direct `V = 1` cleanup is absent

**References:** Lines 104-106, 116-124.

Direct mode has no pooled path, but cleanup instructions assume a path exists.

**Required clarification:** Direct members must disconnect:

```text
frequencySource -> oscillator.frequency
detuneSource -> oscillator.detune
oscillator -> outputGain
```

They must also clear the callback and remove bundle bookkeeping.

### 4. Destruction and callback races are underspecified

**References:** Lines 126-138.

Missing behavior includes repeated `destroy()`, scheduled stops, context closure,
queued `onended` callbacks, and cleanup exceptions. A failed `disconnect()`
could prevent lease release and retain an entire bundle.

**Required clarification:** Make cleanup idempotent, isolate connection failures,
always complete bookkeeping, add destroyed guards, and never rely on `onended`
after explicit destruction.

### 5. Voice-steal timing is hidden behind “existing semantics”

**References:** Lines 102-114.

Normal release, immediate retrigger, and 3 ms voice steal have different timing
requirements.

**Required clarification:** State when old oscillators stop, when replacement
sources start, and whether paths remain unavailable until each scheduled stop
completes.

### 6. Cache ownership contradicts the architecture diagram

**References:** Lines 27-31, 61-64.

The diagram says each `UnisonOscillator` owns `BlendCurveCache`, while the
prose says the cache is module-scoped and shared globally.

**Required clarification:** Module scope owns the cache implementation;
`UnisonOscillator` consumes it and does not destroy it.

### 7. Cache validation and error behavior are absent

**References:** Lines 47-68.

`curveFor(V, i)` assumes valid integer arguments but defines no response to
invalid internal calls.

**Required clarification:** Validate `2 <= V <= 16` and `0 <= i < V`; define key
format, lazy or eager population, and failure mode.

### 8. Verification cannot prove core lifecycle claims

**References:** Lines 147-156.

Profiling and listening cannot deterministically verify exact connections, stale
callbacks, pool reuse, partial-start rollback, or repeated destruction.

**Required clarification:** Define an instrumented or fake `AudioContext` seam
that records node creation and exact connect/disconnect operations and permits
out-of-order `onended` dispatch.

## Medium

### 1. “Immutable Float32Array” is not enforceable

**References:** Lines 61-68.

Typed-array elements remain mutable. Browsers may also copy curve contents when
assigning them to `WaveShaperNode.curve`.

**Required clarification:** Keep arrays encapsulated and never mutate them after
construction. Define success as avoiding repeated application-level generation,
not sharing browser-internal memory.

### 2. Normalization guarantee is overstated

**References:** Lines 52-59.

`sum(g_i^2) = 1` normalizes scalar pre-pan gains. It does not guarantee
constant measured stereo output power because synchronously started oscillators
remain correlated and create cross-terms.

**Required clarification:** Describe this as nominal pre-pan power
normalization. Define expected stereo symmetry under `StereoPannerNode`'s
equal-power law separately.

### 3. Detune and pan formulas are missing

**References:** Lines 52-59, 74-80.

The spec defines Blend positions but does not explicitly state:

```text
detune_i(t) = p_i * unisonDetune(t)
pan_i(t) = clamp(p_i * unisonDepth(t), -1, 1)
```

**Required clarification:** Include units, AudioParam destinations, and browser
pan-range behavior.

### 4. Bundle callback ownership needs stronger invariants

**References:** Lines 116-127.

Path identity protects against path reuse, but callbacks must also modify only
their original bundle and never clear newer `current` state.

**Required clarification:** Define immutable member-to-bundle ownership and
idempotent callback behavior.

### 5. Pool interface is absent

**References:** Lines 70-97.

Without a small private interface, acquisition and lifecycle logic may leak back
into `UnisonOscillator`, weakening locality.

Suggested private interface:

```ts
acquire(voiceCount: number): PathLease;
release(lease: PathLease): void;
destroy(): void;
```

### 6. Performance acceptance criteria are qualitative

**References:** Lines 139-151.

“Reduces GC pressure” does not specify warmed allocations per note, maximum
retained path count, cache-miss count, or memory ceiling.

**Required clarification:** Define measurable warm-state allocation and retained
node limits for direct and unison modes.

### 7. Warm-up definition ignores overlapping generations

**References:** Lines 149-153.

Warming one Voice Count without tails does not warm capacity for the same count
under overlapping scheduled stops.

**Required clarification:** Define warm state by maximum concurrent leased paths,
not Voice Count alone.

## Low

### 1. Lease terminology is inconsistent

**References:** Lines 19-35, 123-124.

`VoiceBundle` is called a “generation lease,” owns oscillators, holds path
leases, and later has a “bundle lease” released. No bundle pool or lessor is
defined.

**Required clarification:** Make `VoiceBundle` a bookkeeping record that owns
path leases, or define a real bundle pool and lease contract.

### 2. Pattern labels may create shallow private modules

**References:** Lines 17-25.

Flyweight and Object Pool should describe implementation, not mandate classes.

Keep separate private modules only where they hide lifecycle or cache complexity
behind smaller interfaces.

### 3. 540 KiB is payload, not total cache memory

**References:** Lines 61-64.

The estimate excludes typed-array objects, map keys, entries, and potential
browser curve copies.

**Required clarification:** Label 540 KiB as JavaScript sample payload, not a
total memory ceiling.

### 4. Comment requirement is broad

**References:** Lines 42-45.

Comments should target non-obvious lifetime and mathematical seams. State and
ownership invariants should be enforced through types and runtime assertions
where possible.

## Overall Assessment

The pattern choice is sound: a private immutable curve-data cache, a lazy pool
for reusable processing paths, and per-note one-shot oscillator generations.
The external `UnisonOscillator` seam remains appropriately deep.

The spec is not implementation-ready. Critical missing text and undefined pool
capacity, transactional start, WaveShaper input normalization, and teardown
behavior must be resolved first. The performance direction is promising, but
the spec needs measurable allocation and idle-render acceptance criteria.
