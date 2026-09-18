# Unison Allocation Optimization Design

## Goal

Remove recurrent allocation of reusable Web Audio processing paths and Blend
curve tables while preserving UnisonOscillator sound, live controls, source
teardown, note release, and voice-steal behavior.

## External Interface

`UnisonOscillator` remains the only public module. Its existing constructor,
AudioParam jacks, `voices` setter, `start`, `stop`, `connect`, `disconnect`,
implementation detail.

No new public cache, pool, path, lease, or source-node type is exported.

## Pattern

`UnisonOscillator` combines two private patterns and one lifecycle record:

| Pattern          | Private module        | Responsibility                                                  |
| ---------------- | --------------------- | --------------------------------------------------------------- |
| Flyweight        | `BlendCurveCache`     | Immutable Blend transfer tables shared by voice count and index |
| Object Pool      | `UnisonVoicePathPool` | Lazy reusable Web Audio processing paths                        |
| Generation lease | `VoiceBundle`         | One note generation's one-shot oscillators and path leases      |

```text
UnisonOscillator
  owns BlendCurveCache
  owns UnisonVoicePathPool
  owns active and stopped VoiceBundles

VoiceBundle
  owns fresh OscillatorNodes
  leases UnisonVoicePaths from pool
```

This keeps one-shot source lifecycle separate from reusable processing graph
lifecycle. It gives callers the same small interface and keeps allocation,
cache, graph, and tail behavior local to `UnisonOscillator`.

Implementation comments must document this ownership split, why raw
`OscillatorNode`s cannot be pooled, why a stopped path remains leased until
`onended`, and why Blend curves are cached by `(voiceCount, index)`. Comments
must explain lifecycle or mathematical intent, not restate code.

## BlendCurveCache Flyweight

Blend transfer data depends only on `(voiceCount, index)`. It is independent
of note, waveform, frequency, Detune, Depth, and current Blend value.

For `V` in `[2, 16]` and `i` in `[0, V - 1]`:

```text
p_i = -1 + 2i / (V - 1)
w_i = 1 / (1 + abs(p_i))
r_i(b) = w_i + b * (1 - w_i)
g_i(b) = r_i(b) / sqrt(sum(r_k(b)^2 for k in [0, V - 1]))
```

`BlendCurveCache.curveFor(V, i)` returns immutable 1024-sample
`Float32Array` for `g_i(b)` across input `b` in `[0, 1]`. Cache is module
scope, so every `UnisonOscillator` and every `AudioContext` reuses the same
tables. It has 135 entries (`sum(2..16)`) and uses approximately 540 KiB.

Do not cache `CurveNode` or `WaveShaperNode`: they own context-bound nodes and
cannot be shared across audio contexts. A path assigns the cache's unchanged
array to its own Blend WaveShaper when its role changes.

## UnisonVoicePath Pool

`UnisonVoicePath` owns one reusable context-bound path:

```text
fresh OscillatorNode -> path.gain -> path.panner -> outputGain

unisonDetuneSource -> path.detuneScale -> fresh OscillatorNode.detune
unisonDepthSource -> path.depthScale -> path.panner.pan
unisonBlendSource -> path.blendInput -> path.blendWaveShaper -> path.gain.gain
```

Path construction creates and permanently connects gain, panner, detune scale,

Pool grows lazily. At first `V > 1` note, create only required paths. Grow to

Path states:

```text
free -> leased -> armed -> leased -> free
```

- `free`: no raw oscillator and no per-note node-to-node/AudioParam link.
- `leased`: reserved for one note generation but not yet connected.
- `armed`: exactly one raw oscillator attached.

The pool gives a bundle distinct paths. It must not return an armed path to

## Source Generation Lifecycle

`OscillatorNode` is one-shot and is never pooled. Each note allocates one raw

At note start:

1. Stop current bundle using existing semantics.
2. For `V = 1`, create one direct raw oscillator-to-output route and no pool
   lease.
3. For `V > 1`, acquire `V` paths, configure each position/Blend curve, create
   raw oscillator, connect raw oscillator to path, set waveform/frequency,
   connect normal frequency and detune sources, connect path detune scale to
   raw detune, then start source.
4. Store raw oscillator and path identity in bundle member.

At `stop(time?)`, retain bundle and path leases until every raw oscillator fires
`onended`. This continues existing release and 3 ms voice-steal choke behavior.

At an oscillator's `onended`:

1. Disconnect exact `frequencySource -> oscillator.frequency` link.
2. Disconnect exact normal `detuneSource -> oscillator.detune` link.
3. Disconnect exact `path.detuneScale -> oscillator.detune` link.
4. Disconnect exact `oscillator -> path.gain` audio link.
5. Clear path's raw oscillator identity and return path to free pool.
6. Remove member. When bundle is empty, release bundle lease and discard its
   small bookkeeping record.

An `onended` callback verifies path's current raw oscillator identity before
disarming it. Late callbacks cannot detach a newer source.

## Destruction

`UnisonOscillator.destroy()` marks module destroyed, clears raw oscillator
callbacks, stops live raw oscillators, explicitly detaches their inbound
AudioParam source connections, and disarms their paths. It then destroys pool
paths, stopping path-owned offset sources and disconnecting their permanent
control and audio wiring. Finally it disconnects/stops module-owned sources and

No source uses broad `disconnect()` during individual subvoice cleanup because

## Performance Outcome

Before optimization, each `V > 1` subvoice allocates gain, panner, detune

After optimization, a warmed path allocates only raw `OscillatorNode`, compact

This reduces GC pressure and note-start allocation churn. It does not reduce

## Verification

- `pnpm build` and `pnpm lint` pass.
- Confirm repeating same Voice Count after warm-up creates no new Blend curve
  arrays or processing paths in browser allocation profiling.
- Play/release dense chords and voice steals. Old sources may finish cleanup
  after stop but must not alter newer notes.
- Verify `V = 1` still has direct normal oscillator behavior.
- Verify `V = 2`, `V = 3`, and `V = 16` retain symmetric detune/pan and live
  Blend response.
