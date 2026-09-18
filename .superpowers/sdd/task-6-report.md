# Task 6: Optimize Unison Render Graph Report

## Scope

Implemented only Task 6 changes:

- Deleted the unused `ClampNode` module and removed its audio-engine barrel
  export.
- Replaced the per-note unison normalization control graph with one Blend
  `CurveNode` per active subvoice when voice count is greater than one.
- Added the single-voice direct oscillator route.
- Moved unison range clamping to `AxiomSynth` before automation and stored
  configuration updates.
- Replaced cancellation-only unison automation with manual hold interpolation.

## Render Graph

For `V > 1`, `UnisonOscillator.start()` precomputes all fixed positions:

```text
p_i = -1 + 2i / (V - 1)
weight_i = 1 / (1 + abs(p_i))
rawGain_i(b) = weight_i + b * (1 - weight_i)
gain_i(b) = rawGain_i(b) / sqrt(sum(rawGain_k(b)^2))
```

Each subvoice owns one `CurveNode` with an input range of `[0, 1]`. Its
callback evaluates `gain_i(b)` using the complete fixed position array, so all
subvoice output gains remain normalized for each live Blend source value.

At Blend 1, every subvoice gain is `1 / sqrt(V)`. For every Blend value,
`sum(gain_i(b)^2) = 1` by direct substitution into the denominator. Detune and
depth retain direct shared-source routes through only their static position
gains.

For `V = 1`, the only per-note nodes are the `OscillatorNode`; it connects
directly to persistent `outputGain`. No panner, subvoice gain, blend curve, or
unison detune/depth multiplier is created.

## Lifecycle

Every subvoice still receives the frequency and normal detune source links.
Its `onended` handler explicitly disconnects those inbound source-to-parameter
links. Multi-voice subvoices also explicitly disconnect the unison detune,
depth, and Blend source links before their target nodes are destroyed. Curves
are destroyed with their owning subvoice. Active and timed-stopped bundles are
retained until all raw oscillators end, preserving existing note and voice-steal
behavior.

## Automation

`AxiomSynth` clamps voices to integer `[1, 16]`, detune to `[0, 50]`, and depth
and Blend to `[0, 1]` before source scheduling and before storing the copied
configuration. Each unison source tracks the start time, start value, and
target of its 10 ms ramp. A new update calculates the current linear
interpolated value, cancels future events, writes that held value at `now`, and
ramps to the new target at `now + 0.01`. This avoids discontinuities during
rapid updates without `cancelAndHoldAtTime` browser support.

## Verification

Run after implementation:

```text
pnpm build
Exit code: 0

pnpm lint
Exit code: 0
Output: All matched files use Prettier code style!

git diff --check
Exit code: 0

pnpm dev --host 127.0.0.1 ...; curl http://127.0.0.1:4000/
HTTP status: 200
```

No test runner exists in this repository, and Task 6 requirements explicitly
prohibit adding one. The build covers strict TypeScript checks for both engine
packages and `vue-tsc` plus the Vite production build for the app.
