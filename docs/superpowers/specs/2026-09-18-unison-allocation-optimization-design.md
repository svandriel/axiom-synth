# Unison Allocation Optimization Design

## Goal

Remove recurring allocation of reusable Web Audio processing paths and Blend
curve tables while preserving `UnisonOscillator` sound, live controls, source
teardown, note release, and voice-steal behavior.

## External Interface

`UnisonOscillator` remains the only public module. Preserve its complete public
interface and behavior:

- constructor accepting `AudioContext`
- `waveform` setter
- `voices` getter/setter
- `frequency`, `detune`, `gain`, `unisonDetune`, `unisonDepth`, and
  `unisonBlend` AudioParam getters
- `connect()` and `disconnect()`
- `start(noteHz, now)`
- `stop()` and `stop(time)`
- idempotent `destroy()`

No new public cache, pool, path, lease, or source-node type is exported.
`voices` remains a rounded and clamped integer in `[1, 16]`. Continuous
unison controls remain live a-rate AudioParam inputs. `waveform` continues to
update active and draining raw oscillators.

## Internal Ownership

`UnisonOscillator` combines two private modules and one lifecycle record:

| Pattern           | Private module        | Responsibility                                                  |
| ----------------- | --------------------- | --------------------------------------------------------------- |
| Flyweight         | `BlendCurveCache`     | Immutable Blend transfer tables shared by voice count and index |
| Object Pool       | `UnisonVoicePathPool` | Lazy reusable Web Audio processing paths                        |
| Generation record | `VoiceBundle`         | One note generation's one-shot oscillators and path leases      |

```text
UnisonOscillator
  owns active and draining VoiceBundles
  consumes module-private BlendCurveCache
  owns context-bound UnisonVoicePathPool

VoiceBundle
  owns fresh OscillatorNodes
  owns path leases until all sources end
```

`BlendCurveCache` is module-scoped and shared across all
`UnisonOscillator` instances and `AudioContext`s. It contains plain immutable
data and has no context-bound resources. `UnisonOscillator` does not destroy
the cache.

Implementation comments must document only non-obvious lifecycle or math:

- raw `OscillatorNode`s are one-shot and cannot be pooled;
- draining paths remain unavailable until `onended`;
- cache keys are `(voiceCount, index)`;
- CurveNode remaps Blend `[0, 1]` to WaveShaper `[-1, 1]`;
- free paths are gain-zeroed;
- exact source-to-parameter disconnects prevent inbound-link leaks;
- overflow paths are temporary.

## Blend Curve Cache

Blend transfer data depends only on `(voiceCount, index)`. It is independent of
note, waveform, frequency, Detune, Depth, and current Blend value.

Valid cache inputs:

```text
2 <= voiceCount <= 16
0 <= index < voiceCount
```

Invalid inputs throw a descriptive `RangeError`. Cache key format is the pair
`voiceCount:index`. Populate lazily. Repeated lookup returns the same
application-owned table for that pair.

For `V` and subvoice index `i`:

```text
p_i = -1 + 2i / (V - 1)
w_i = 1 / (1 + abs(p_i))
r_i(b) = w_i + b * (1 - w_i)
g_i(b) = r_i(b) / sqrt(sum(r_k(b)^2 for k in [0, V - 1]))
```

Each table has 1024 samples across logical Blend input `b` in `[0, 1]`.
Tables are encapsulated by the cache and never mutated after construction.
“Immutable” means no implementation code exposes a mutable table reference or
writes to a returned table. Browser-internal copying by
`WaveShaperNode.curve` is outside application allocation accounting.

The 135 tables (`sum(2..16)`) contain approximately 540 KiB of sample payload,
excluding map, object, and browser-internal overhead. This is not a total memory
ceiling.

Do not cache `CurveNode` or `WaveShaperNode`: they own context-bound nodes and
cannot be shared across contexts. A pooled path assigns the appropriate cached
table to its own Blend WaveShaper when its `(voiceCount, index)` role changes.

## CurveNode Blend Mapping

Blend runtime signal is logical `[0, 1]`; WaveShaper lookup domain is `[-1, 1]`.
Every pooled Blend path contains this persistent mapping before its WaveShaper:

```text
waveShaperInput = 2 * blend - 1
```

Implement mapping with the existing `CurveNode` normalization topology:

```text
inputGain.gain = 2
offsetSource.offset = -1
```

Both values are initialized explicitly. `offsetSource` is started before it is
connected and remains alive until its path is destroyed. Curve callback values
are evaluated in logical `[0, 1]` units, not normalized WaveShaper units.

## Reusable Voice Path

`UnisonVoicePath` owns one reusable context-bound path:

```text
raw OscillatorNode -> path.audioGain -> path.panner -> outputGain

unisonDetuneSource -> path.detuneScale -> raw OscillatorNode.detune
unisonDepthSource -> path.depthScale -> path.panner.pan
unisonBlendSource -> path.blendInput -> path.blendMapper -> path.audioGain.gain
```

Path construction creates and permanently connects:

- `audioGain`
- `StereoPannerNode`
- `detuneScale`
- `depthScale`
- Blend input gain
- Blend mapping gain and offset source
- Blend `WaveShaperNode`
- permanent audio path to `outputGain`

Permanent path nodes stay alive until pool destruction. Per-note links are only
raw oscillator output and raw oscillator AudioParam links.

## Path State And Capacity

Path states:

```text
free -> leased -> armed -> draining -> free
```

- `free`: no raw oscillator; gain is zero; no effective control contribution.
- `leased`: reserved for one bundle; no raw oscillator attached yet.
- `armed`: exactly one raw oscillator attached and potentially audible.
- `draining`: source stopped or scheduled to stop; path remains unavailable.
- `free`: only after exact source disconnects and cleanup completes.

Pool interface remains private:

```ts
acquire(voiceCount: number): PathLease;
release(lease: PathLease): void;
destroy(): void;
```

Pool grows lazily to required stable capacity. Retain paths for the current
generation plus one normal draining generation. If another overlap needs paths,
allocate temporary overflow paths. Overflow paths are destroyed after their raw
sources end; they are not retained in stable capacity.

Never reuse armed or draining paths. Never drop notes, reduce Voice Count, or
reuse a path before `onended`. This bounds normal retained capacity while
preserving scheduled tails. Development counters record paths created,
acquired, released, overflow-created, and overflow-destroyed.

## Source Generation Lifecycle

`OscillatorNode` is one-shot and is never pooled. Each note allocates one raw
oscillator per active subvoice. `ConstantSourceNode` is also one-shot;

### Start

`start(noteHz, now)` is transactional:

1. Stop current bundle using existing timing semantics.
2. For `V = 1`, prepare one direct raw oscillator-to-output member and no pool
   lease.
3. For `V > 1`, acquire all required paths and configure every position,
   AudioParam reset, Blend curve, and connection.
4. Create and connect every raw oscillator, including frequency and normal
   detune source links.
5. Register every cleanup handler.
6. Start all raw oscillators only after complete setup succeeds.
7. Publish the complete bundle as `current`.

If any setup step fails, stop and detach every raw source already created,
release every acquired lease, destroy temporary overflow paths, and leave
`current` unchanged or null. Propagate the original error. Never publish a
partial bundle.

### Stop And End

At `stop(time?)`, retain bundle and path leases until every raw oscillator in
the bundle fires `onended`. This preserves normal release and 3 ms voice-steal
choke behavior.

For normal note release, retain the source generation through the existing amp
release lifetime. For voice stealing, preserve current choke timing: old amp
gain reaches silence before replacement note start; old oscillator stop remains
scheduled according to current voice behavior.

For each raw oscillator's `onended`:

1. Verify both original bundle identity and path/source identity.
2. Disconnect exact `frequencySource -> oscillator.frequency`.
3. Disconnect exact normal `detuneSource -> oscillator.detune`.
4. Disconnect exact `path.detuneScale -> oscillator.detune` for pooled mode.
5. Disconnect exact `oscillator -> path.audioGain` or
   `oscillator -> outputGain` for direct mode.
6. Clear callback and source identity.
7. Return pooled path to `free`, or discard direct member bookkeeping.
8. Remove member from original bundle.
9. When bundle is empty, release its lease record and remove it from draining
   bundles.

Each disconnect is defensive and independent. One failed or already-completed
disconnect must not prevent bookkeeping or release.

Late callbacks cannot clear `current`, detach a newer source, or alter another
bundle.

## Reusable Path Reset

Acquire must reset all reusable state before attaching a new source:

- verify path is `free`;
- set `audioGain.gain` intrinsic value to `0`;
- cancel prior path-gain automation and set its current value safely;
- set `detuneScale.gain` to current position;
- set `depthScale.gain` to current position;
- set panner pan baseline to `0` before live depth signal is attached;
- assign cached Blend curve for `(voiceCount, index)`;
- clear any stale raw oscillator identity;
- attach current per-note links only after reset completes.

Free paths have zero audio contribution. Live a-rate sources may remain
connected to static path control nodes, but zeroed path gain guarantees free
paths do not contribute audio. No stale raw source remains attached.

## Destruction

`destroy()` is idempotent and does not depend on future `onended` callbacks:

1. Mark module destroyed and reject future acquisition/start.
2. Clear raw `onended` handlers.
3. Detach every raw source-to-`AudioParam` and source-to-path connection,
   including direct `V = 1` output links.
4. Stop active raw oscillators defensively.
5. Destroy pooled and overflow paths.
6. Stop path-owned offset sources.
7. Disconnect and stop module-owned ConstantSourceNodes.
8. Disconnect output gain.
9. Clear current and draining bundle bookkeeping.

Every teardown operation tolerates already-destroyed or context-closed nodes.
Queued callbacks observe the destroyed guard and perform no new work.

## Performance And Acceptance Metrics

Before optimization, each `V > 1` subvoice allocates processing nodes, a
CurveNode, curve data, a record, and a callback per note.

After warm-up:

- each normal note allocates raw `OscillatorNode`s and small generation
  bookkeeping only;
- no new Blend table is generated for a warmed `(voiceCount, index)` role;
- no path is allocated after stable capacity unless concurrent draining
  generations exceed retained capacity;
- every path is free or destroyed after its source ends;
- direct `V = 1` notes allocate no pooled processing nodes;
- full polyphony and 16x unison may still render up to 768 raw oscillators and
  768 active panners.

## Verification

Add an internal test seam around Web Audio node creation and connection tracking;
do not export it from the production package. It must support deterministic
`onended` dispatch and recorded exact connections.

Verify:

- cache returns same table for repeated valid `(voices, index)`;
- cache rejects invalid keys;
- cached curves match normalized Blend formula at endpoints and representative
  intermediate points within stated tolerance;
- Blend input maps `0` to first curve sample and `1` to last sample;
- `V = 1` creates direct path and no pooled path;
- `V > 1` acquires distinct paths;
- armed and draining paths cannot be reused;
- overflow paths release and destroy after `onended`;
- stale out-of-order callbacks cannot detach newer sources;
- direct and pooled teardown remove all exact inbound/outbound connections;
- repeated `destroy()` is safe;
- failed start rolls back all created sources and leases;
- rapid stop/start preserves bundle ownership and path states;
- normal release and voice stealing preserve existing timing;
- `V = 1`, `V = 2`, `V = 3`, and `V = 16` retain expected symmetry and Blend
  response;
- build, lint, and browser profiling pass.
