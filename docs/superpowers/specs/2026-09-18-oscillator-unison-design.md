# Oscillator Unison Design

## Goal

Add oscillator-local unison to Axiom Synth. Each oscillator creates one to
sixteen synchronized subvoices per note, with symmetric pitch detune,
equal-power stereo depth, and live normalized blend. Existing oscillator
tuning, gain, waveform, and LFO modulation continue for every subvoice.

Research and rationale: `2026-09-18-oscillator-unison-research.md`.

## Architecture

Add public `CurveNode` and `UnisonOscillator` modules to
`@axiom/audio-engine`. `UnisonOscillator` is dedicated module: no inheritance
from, or composition of, `Oscillator`. `Oscillator` remains raw single-source
building block. `UnisonOscillator` directly owns per-note raw oscillator,
gain, panner, and control-calculation nodes.

`AxiomVoice` constructs one `UnisonOscillator` per oscillator index. It still
owns voice lifecycle, envelopes, filter, waveshaper, and static modulation
patching. `AxiomSynth` remains source of truth for UI config and shared sources.

## Public Modules

Construct `UnisonOscillator` plainly:

```ts
const oscillator = new UnisonOscillator(ctxt);
```

```ts
export type CurveFunction = (input: number) => number;

export interface CurveNodeOptions {
  inputMin: number;
  inputMax: number;
}

export class CurveNode implements Destroyable {
  constructor(
    ctxt: AudioContext,
    curveFunction: CurveFunction,
    options: CurveNodeOptions,
  );
  get input(): AudioNode;
  get output(): AudioNode;
  connect(destination: AudioNode | AudioParam): void;
  disconnect(destination?: AudioNode | AudioParam | null): void;
  destroy(): void;
}

export class UnisonOscillator implements Destroyable {
  constructor(ctxt: AudioContext);
  set waveform(value: WaveFormType);
  get voices(): number;
  set voices(value: number);
  get frequency(): AudioParam;
  get detune(): AudioParam;
  get gain(): AudioParam;
  get unisonDetune(): AudioParam;
  get unisonDepth(): AudioParam;
  get unisonBlend(): AudioParam;
  connect(destination: AudioNode | AudioParam): void;
  disconnect(destination?: AudioNode | AudioParam | null): void;
  start(noteHz: number, now: number): void;
  stop(): void;
  stop(time: number): void;
  destroy(): void;
}
```

`frequency`, `detune`, and `gain` match existing `Oscillator` jacks.
`unisonDetune`, `unisonDepth`, and `unisonBlend` are a-rate modulation-input
jacks, backed by module-owned `ConstantSourceNode.offset` sources. Every
owned source is explicitly zeroed and started before any patching, per rule 3.

`voices` is a plain number getter/setter since it changes graph topology. Round
then clamp it to `[1, 16]`. `AxiomSynth` clamps continuous unison configuration
before it schedules shared source values. Out-of-range values do not throw.
Calls after `destroy()` do not create or reconnect nodes:

| Jack           | Effective range | Default |
| -------------- | --------------- | ------- |
| `unisonDetune` | 0 to 50 cents   | 0       |
| `unisonDepth`  | 0 to 1          | 0       |
| `unisonBlend`  | 0 to 1          | 1       |

No public config objects, no subvoice nodes, and no unison-specific setters.
Out-of-range values do not throw. Calls after `destroy()` do not create or
reconnect nodes.

`CurveNodeOptions` declares the input signal range. It must satisfy
`inputMin < inputMax`. `CurveNode` samples `curveFunction` at 1024 evenly
distributed inclusive points over that declared range, stores them in
`Float32Array`, and assigns it to one owned `WaveShaperNode.curve`.

It normalizes incoming signals to WaveShaper's `[-1, 1]` domain before the
wave shaper with an internal gain and offset:

```text
normalizationGain = 2 / (inputMax - inputMin)
normalizationOffset = -(inputMax + inputMin) / (inputMax - inputMin)
normalized(x) = normalizationGain * x + normalizationOffset
```

During curve generation, `CurveNode` evaluates callback input in caller units:

```text
curveInput(n) = inputMin + (n / 1023) * (inputMax - inputMin)
curve[n] = curveFunction(curveInput(n))
```

`input` is the normalization-gain node; `output` is owned WaveShaperNode. It
does not expose curve data or sample-count configuration.

## Per-Note Topology

At `start(noteHz, now)`, sample only `voices`. It controls number of paths, so
changes apply to next note. The three AudioParam unison controls are live for
held notes. For each subvoice `i` in `[0, V - 1]`:

```text
OscillatorNode -> rawGain_i -> normalizerGain_i -> StereoPannerNode -> outputGain
```

`outputGain` is public `gain` jack and common mixed output. Every raw oscillator
gets current waveform, `frequency` source, normal `detune` source, and LFO
modulation just as existing `Oscillator` does.

## Live Computation

For `V` voices and index `i`:

| Value             | Formula                                                                 |
| ----------------- | ----------------------------------------------------------------------- |
| Position          | `p_i = 0` when `V = 1`; else `p_i = -1 + 2i / (V - 1)`                  |
| Live fixed detune | `detune_i(t) = p_i * clamp(unisonDetune(t), 0, 50)` cents               |
| Live pan          | `pan_i(t) = p_i * clamp(unisonDepth(t), 0, 1)`                          |
| Center weight     | `centerWeight_i = 1 / (1 + abs(p_i))`                                   |
| Live raw gain     | `rawGain_i(t) = centerWeight_i + unisonBlend(t) * (1 - centerWeight_i)` |
| Mean power        | `meanPower(t) = sum(rawGain_k(t)^2 for k in [0, V - 1]) / V`            |
| Normalizer        | `normalizer(t) = 1 / sqrt(V * meanPower(t))`                            |
| Final gain        | `gain_i(t) = rawGain_i(t) * normalizer(t)`                              |

For legal Blend input, raw gains are `[0.5, 1]`; mean power is `[0.25, 1]`.
The formula guarantees `sum(gain_i(t)^2) = 1`. At Blend 1, every gain is
`1 / sqrt(V)`. At Blend 0, central subvoices have greater gain. With `V = 1`,
position is zero and final gain is one for every control value.

Build the live detune path with `unisonDetune -> GainNode(p_i) ->
OscillatorNode.detune`. Build live panning with `unisonDepth -> GainNode(p_i)
-> StereoPannerNode.pan`. Existing normal detune source and LFO output also
connect to raw oscillator detune; Web Audio sums signals.

For each fixed Voice Count and subvoice position, create one `CurveNode` over
Blend `[0, 1]` whose callback returns `gain_i(b)`. Connect clamped Blend to its
input and curve output to the subvoice gain. This evaluates exact normalized
gain in one waveshaper stage per subvoice, rather than building raw-gain,
squaring, summing, and reciprocal-square-root control graphs from many nodes.

The curve callback calculates all subvoice raw gains for its fixed `V`, then
returns the requested index gain:

```text
rawGain_k(b) = centerWeight_k + b * (1 - centerWeight_k)
gain_i(b) = rawGain_i(b) / sqrt(sum(rawGain_k(b)^2 for k in [0, V - 1]))
```

The input domain is exactly `[0, 1]`, so legal Blend signals remain within the
curve's range. This preserves exact live a-rate Blend normalization while
removing most blend control nodes.

## Stereo

Each subvoice panner receives `pan_i(t)`. `StereoPannerNode` is Web Audio's
specified equal-power panner:

```text
leftGain(q) = cos((q + 1) * pi / 4)
rightGain(q) = sin((q + 1) * pi / 4)
leftGain(q)^2 + rightGain(q)^2 = 1
```

Never use manual linear gain panning. Stereo starts at per-subvoice panners and
continues through oscillator mix, waveshaper, filter, envelope, synth output,
and AudioEngine master chain with no forced downmix. `V = 1` creates one raw
oscillator at normal pitch and gain, centered in stereo; it is behaviorally
equivalent to current plain oscillator.

## Axiom Integration

Extend `OscillatorConfig`:

```ts
unison: { voices: 1, detune: 0, depth: 0, blend: 1 }
```

`AxiomSynth` owns three `FixedArray<ConstantSourceNode, OscillatorCount>`
collections for unison detune, depth, and blend. It initializes each from
config. It owns `Observable<FixedArray<number, OscillatorCount>>` for voices.
`AxiomVoiceConfig` carries all four shared controls.

`setOscillatorConfiguration()` updates unison fields. Voices publishes new
fixed array through observable. Detune, depth, and blend cancel scheduled
values then ramp matching shared sources over 10 ms. Clamp values before both
scheduling and storing complete copied configuration. Use a hold-safe ramp
operation so rapid updates continue from the in-progress ramp value.

`AxiomVoice` replaces `Oscillator` with `UnisonOscillator`. Construction wires:

1. `new UnisonOscillator(ctxt)`.
2. Current shared voices value.
3. Current waveform.
4. Existing detune and gain sources to `detune` and `gain`.
5. New sources to `unisonDetune`, `unisonDepth`, and `unisonBlend`.
6. Existing oscillator normalization gain as output destination.
7. Existing LFO oscillator targets to normal `detune`, never unison detune.

Subscribe once to shared voices and apply each updated count. Unsubscribe during
destroy. Existing waveform subscription, start, stop, and router ownership stay
intact.

Enable `OscillatorPanel` controls through `modelValue.unison`. UI ranges: Voices
1–16 integer, Detune 0–50 cents, Depth 0–100%, Blend 0–100%. Rename Spread to
Depth. Bind controls to config; no UI owns DSP or raw nodes.

## Lifecycle And Capacity

Timed `stop()` stops all subvoices in current bundle at same time. New start
stops prior bundle before building replacement, preserving voice-steal choke
behavior. Each raw oscillator `onended` disconnects inbound frequency, normal
detune, and fixed-unison-detune paths; disconnects audio and control outputs;
removes its record; and destroys shared per-note CurveNodes after all relevant
subvoices end. This meets rule 4.

`destroy()` is idempotent. It stops active nodes, tears down all bundle control
and audio connections, destroys curves, then disconnects/stops owned sources and
disconnects output. `AxiomVoice.destroy()` destroys `ModulationRouter` before
unison modules, per rule 5.

Worst active graph: `3 * 16 * 16 = 768` raw oscillator nodes, with matching
panners and audio gains, plus per-active-oscillator control graphs. Do not lower
requested Voices based on polyphony. Normalization controls nominal power, not
coherent attack peaks; master compression remains final peak protection.

When `V = 1`, create the same raw oscillator plus direct `OscillatorNode ->
outputGain` route used before unison. Do not create panner, per-subvoice gain,
Blend curve, or any unison control graph. This preserves pre-unison default CPU
cost; its mono output is upmixed only by downstream standard Web Audio channel
handling.

## Verification

No test runner exists. Do not add one for this feature. Verify:

- `pnpm build` passes strict TypeScript and all workspace builds.
- `pnpm lint` passes Prettier checks.
- Panel permits controls: Voices 1–16, Detune 0–50, Depth 0–100%, Blend 0–100%.
- Voice Count 1 has original pitch and nominal level, centered in stereo.
- Multiple voices beat symmetrically; Depth 0 centers all, Depth 100 hard-pans
  outer voices; Blend 0 favors center; Blend 100 equalizes power-normalized
  voices.
- Held-note changes to unison detune, depth, and blend move continuously with
  no allocation click. Voice Count changes apply on next note.
- Repeated chord release and voice stealing beyond 16 active synth voices cause
  no console errors, runaway CPU, or new audible click beyond existing choke.
