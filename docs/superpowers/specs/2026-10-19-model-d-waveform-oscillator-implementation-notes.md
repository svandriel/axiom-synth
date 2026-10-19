# Model D-Inspired Waveform Oscillator — Implementation Notes

Date: 2026-10-19
Status: **Task 2 proposal; implementation approval required**

This note resolves the equation and measurement questions for Tasks 3–4. It
does not authorize DSP, API, test, or benchmark implementation. The waveform
equations and transitions below are Axiom proposals, not claims of
circuit-exact Model D behavior.

## Authority and boundaries

**Approved constraints from the design spec (not changed here):**

- The six anchors are, in order: `0.0` triangle, `1.0` sharktooth, `2.0`
  legacy ramp/saw, `3.0` square, `4.0` wide pulse, and `5.0` narrow pulse.
- The pulse anchors are 50%, 75%, and 25%. For square → wide pulse,
  `d = 0.5 + 0.25t`; for wide → narrow pulse, `d = 0.75 - 0.5t`.
- `waveform` is in `[0, 5]`, has five equal intervals, defaults to `2.0`,
  and uses the specified finite clamp and NaN/infinity handling. No smoothing
  is included.
- The legacy saw at `2.0` is immutable and bit-exact for equivalent inputs;
  explicitly dispatch to its original calculation and preserve operation
  order. Do not apply new band-limiting corrections to it.
- Generic phase accumulation, sync-edge detection and fractional reset remain
  in the oscillator core. The generic C/WASM/worklet names and file/API
  boundaries in the approved design remain authoritative. The saw-only API
  remains a compatibility wrapper and does not select shapes.
- The approved naming split is unchanged: public `moog_oscillator.h` and
  stateful `moog_oscillator.c`; internal `moog_waveforms.h/.c` and
  `moog_oscillator_math.h`; saw compatibility `moog_saw.h` and
  `moog_saw_compat.c`; generic `moog_oscillator_wasm.c` with preserved
  `moog_saw_wasm_*` exports; worklet processor name
  `moog-oscillator-processor`; generic `test_moog_oscillator.*` and
  `bench_moog_oscillator.*` alongside saw-specific legacy tests. Do not move
  responsibilities across those boundaries.
- The design’s maximum stress topology is 16 synth voices × 3 oscillator
  indices × 16 unison voices. A reference comparison is not evidence of
  hardware equivalence.

**Proposals requiring approval:** the exact non-saw equations, phase mapping,
the three non-pulse morph laws, numerical tolerances and performance gates
below. These are fixed before any new-shape algorithm is selected.

## Existing saw and candidate shared phase coordinate

For wrapped phase `x ∈ [0, 1)`, the existing fitted parameter is evaluated in
float as

```c
float p = 0.9924f - 0.00002151f * frequency_hz;
if (p < 0.0f) p = 0.0f;
if (p > 1.0f) p = 1.0f;
```

Non-finite `frequency_hz` returns `0.9924f` before this calculation. The
waveform evaluator then moves endpoint `p` values inward to `1.0e-7f` or
`1.0f - 1.0e-7f`, respectively. The legacy phase offset and output are

```text
A       = π - 2πp
φmod    = A x / p                         if x < p
          A (1 - x) / (1 - p)             if x ≥ p
y_saw   = -cos(2πx + φmod)
```

In C, keep the current double-precision expression order: compute
`MOOG_SAW_PI - MOOG_SAW_TWO_PI * (double)p`; compute the selected `phi_mod`
branch with its existing multiply/divide order; then call
`quadrant_cos(MOOG_SAW_TWO_PI * phase + phi_mod)` and negate/cast to `float`.
The phase is wrapped before this evaluator in `moog_saw_waveform`; the
block-rendering legacy path supplies a phase already known to be in `[0,1)`.
Do not replace this with an algebraically equivalent `cos`/ramp rewrite.

The proposed coordinate for the _new_ shapes is

```text
θ(x,p) = 2πx + φmod(x,p)
q(x,p) = θ(x,p) / 2π
```

Use `q` in `[0,1]` for the derivation and wrap its endpoint `1` to `0` for
periodic shape evaluation. At `x=0`, `q=0`; at `x=p`, `q=0.5`; as `x→1`,
`q→1`. The two branches meet continuously at `x=p` because `θ(p,p)=π`.
Within either branch,

```text
dθ/dx = π/p       for 0 ≤ x < p
dθ/dx = π/(1-p)   for p ≤ x < 1
```

Both slopes are positive for the evaluator’s guarded `0 < p < 1`; therefore
the map is monotone and traverses exactly one full cycle. Its endpoint is
periodic modulo `2π`, and its origin agrees with the saw reset. It is **not**
uniform in `x`, and its derivative has a corner at `x=p` unless `p=0.5`.
That corner is intentional in this proposal: it aligns `q=0.5` with the
legacy saw’s positive peak, but can create a slope discontinuity in a new
shape. Measure and band-limit it as a new-shape feature; do not claim that the
coordinate is a smooth physical phase law. No new shape is permitted to
alter the saw calculation.

For deterministic tests defined on uniform `q` samples, invert the map with
`x=2pq` for `q<0.5`, and
`x=p+2(1-p)(q-0.5)` for `q≥0.5`. These expressions are for test-coordinate
conversion only; they do not replace the legacy saw’s forward calculation.

## Proposed anchors and normalization

All new equations below use `q=q(x,p)`, with `q=1` evaluated as `q=0`.
`d` means the fraction of a cycle at `+1`. The proposals set bipolar extrema
to `-1` and `+1` (peak-to-peak 2). No peak normalization is applied after
morphing. Only pulse anchors have nonzero DC; do not remove that DC.

| Anchor          | Proposed equation                                                                    | Phase and properties                                                                                                                                                                                                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Triangle, 0     | `T(q) = -1 + 4q` for `0≤q<0.5`; `T(q) = 3 - 4q` for `0.5≤q<1`                        | Reset `-1`; peak `+1` at `q=0.5` / `x=p`; trough `-1` at wrap. Range `[-1,+1]`, p-p 2, DC 0, half-wave antisymmetric. Continuous with slope corners at `q=0,0.5`.                                                                                                                                       |
| Sharktooth, 1   | Let `a=0.75`. `H(q) = -1 + 2q/a` for `0≤q<a`; `H(q) = 1 - 2(q-a)/(1-a)` for `a≤q<1`. | Proposed asymmetric triangle with a 75%-cycle rise and 25%-cycle fall. Reset `-1`; peak `+1` at `q=0.75`; wrap returns to `-1`. Range `[-1,+1]`, p-p 2, DC 0 (each linear segment has zero mean over its own duration). Not half-wave symmetric. `a=0.75` is a proposal, not a measured hardware value. |
| Ramp / saw, 2   | Exact `y_saw(x,p)` above.                                                            | Keep original fitted `P(f)`, equation, operation order, output convention and process path. The reset is `-1`, positive peak is at `x=p`, range `[-1,+1]`, p-p 2 and ideal-cycle mean 0. No new correction.                                                                                             |
| Square, 3       | `S(q,d) = -1` for `q < 1-d`; `+1` for `q ≥ 1-d`, with `d=0.5`.                       | Reset is `-1` by the point-value convention. Rising edge at `q=0.5`; falling wrap edge at `q=0`. Range `[-1,+1]`, p-p 2, DC `2d-1 = 0`. Value discontinuities at both edges.                                                                                                                            |
| Wide pulse, 4   | `S(q,0.75)`                                                                          | Positive fraction `d=0.75`; rising edge at `q=0.25`, falling wrap edge at `q=0`. Reset point is `-1`; p-p 2; DC `+0.5`.                                                                                                                                                                                 |
| Narrow pulse, 5 | `S(q,0.25)`                                                                          | Positive fraction `d=0.25`; rising edge at `q=0.75`, falling wrap edge at `q=0`. Reset point is `-1`; p-p 2; DC `-0.5`.                                                                                                                                                                                 |

The sharktooth equation is one explicit, reproducible Axiom interpretation of
the name, not a source-derived hardware equation. Its reset matches the
legacy saw, but its peak is deliberately not aligned with the saw peak; the
chosen asymmetry is its defining proposal. If listening/measurement rejects
this anchor, change it only at this approval gate, not silently during DSP
implementation.

For `±1` pulses the ideal DC is `2d-1`; after DC removal, 25% and 75% pulses
have identical harmonic magnitudes and differing harmonic phase. Retain both
selector anchors and their DC as specified here.

## Proposed internal waveform helper interface

These are candidate declarations for
`packages/native/c/src/moog_waveforms.h`; the header is not created by this
task. Phase arguments are normalized cycles, `p` is the existing legacy fit,
and `t ∈ [0,1]` is the local morph fraction. Shape helpers may derive `q`
from `(phase,p)`; the saw helper must use the exact legacy equation.

```c
float moog_waveform_saw(double phase, float p);
float moog_waveform_triangle(double phase, float p);
float moog_waveform_sharktooth(double phase, float p);
float moog_waveform_pulse(double phase, float p, float duty);

float moog_waveform_morph_triangle_shark(
    double phase, float p, float t);
float moog_waveform_morph_shark_saw(
    double phase, float p, float t);
float moog_waveform_morph_saw_square(
    double phase, float p, float t);
float moog_waveform_morph_square_wide(
    double phase, float p, float t);
float moog_waveform_morph_wide_narrow(
    double phase, float p, float t);

float moog_waveform_evaluate(
    double phase, float frequency_hz, float waveform);
```

`moog_waveform_evaluate` sanitizes/dispatches according to the approved
`waveform` rules and computes `p` for the selected sample. Exact `waveform ==
2.0f` dispatches to the original legacy calculation, with its original
expression order. The generic process path also treats a null waveform buffer
as the legacy saw for the block. No saw-only function is repurposed as a
selector. Generic public and WASM signatures, oscillator state ownership,
bridge names, worklet name, compatibility wrappers, and test/benchmark
renames remain exactly those in the approved design’s C API and WASM sections.

## Proposed five interval laws

Each law evaluates at the oscillator’s current phase; changing `waveform`
never resets or advances phase. `L(a,b,t)=(1-t)a+tb` is the sample crossfade
candidate. Every candidate reproduces its exact anchors for `t=0` and `t=1`.
At an integer waveform boundary the adjacent laws call the same anchor, so
there is no output-value jump caused solely by changing the control; waveform
corners/edges remain as defined above.

Implement the crossfade endpoints as direct anchor dispatches at `t==0` and
`t==1`, rather than relying on floating-point multiplication by zero to
preserve them. Dispatch anchor 5 directly at the upper parameter endpoint as
well. This is in addition to the mandatory bit-exact dispatch at waveform
`2.0`.

| Interval                        | Proposed law                   | Endpoint and spectral behavior                                                                                                                                   |
| ------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[0,1]` triangle → sharktooth   | `L(T(q), H(q), t)`             | Crossfade candidates are phase-aligned at reset and DC remains 0. Their different peak positions can reduce intermediate peak-to-peak level; do not renormalize. |
| `[1,2]` sharktooth → legacy saw | `L(H(q), y_saw(x,p), t)`       | Crossfade candidate. At `t=1`, dispatch the exact legacy saw result. For `t<1`, any saw component is mixed as a value; never “correct” the legacy saw endpoint.  |
| `[2,3]` legacy saw → square     | `L(y_saw(x,p), S(q,0.5), t)`   | Crossfade candidate. The square discontinuities need new-shape band-limiting before the morph; the endpoint at `t=0` remains untouched legacy saw.               |
| `[3,4]` square → wide pulse     | `S(q, d(t))`, `d(t)=0.5+0.25t` | Required pulse-preserving duty morph. `d` increases from 50% to 75%; DC follows `2d-1`.                                                                          |
| `[4,5]` wide → narrow pulse     | `S(q, d(t))`, `d(t)=0.75-0.5t` | Required pulse-preserving duty morph. `d` decreases from 75% to 25%; midpoint `t=0.5` is 50% duty, with the square’s ideal harmonic magnitudes.                  |

The three crossfades are explicit starting candidates, not assumed winners.
Compare each against a parameterized shape morph where it is meaningful,
using the predeclared measurements and listening review. Preserve the two
approved pulse duty curves even if a crossfade sounds attractive.

## Phase, sync, discontinuity and anti-alias rules

- The core uses the existing wrapped phase accumulator and sample order.
  At a rising sync zero crossing (`previous <= 0`, `current > 0`), estimate
  `u = -previous / (current-previous)` and clamp to `[0,1]`. The event is
  `(1-u)` samples before the current sample; reset phase to
  `wrap((1-u) * phase_increment)` before rendering that sample. Keep this
  edge detector and fractional reset waveform-independent.
- Sync resets phase to the shape’s `q=0` origin. Output at the event is shape
  dependent: smooth/triangle shapes may be value-continuous at reset while
  square/pulse shapes can jump because the left limit is high and the reset
  point is low. A hard-sync correction, if selected, is waveform-dependent
  and must use the same fractional event time. Measure it independently.
- Triangle corners, sharktooth corners, the `q(x,p)` slope corner, square and
  pulse value edges, and hard-sync resets are new-shape discontinuities.
  Compare PolyBLAMP for slope discontinuities and PolyBLEP for value
  discontinuities against band-limited tables for appropriate anchors.
  Apply selected corrections to new-shape anchor outputs before morphing, as
  required by the design. Test triangle rather than assuming its aliases are
  negligible. No correction, lookup, rewrite, or changed fit is allowed on the
  legacy saw-only path or at exact waveform `2.0`.
- Crossfade transients and moving pulse edges must be included in automated
  morph tests. No new state, smoothing, table setup, allocation, or logging in
  the real-time process callback is approved by this note.

## Invariants and deterministic test matrix

These are proposed Task 3 invariants; exact legacy bit fixtures remain a
stronger condition than numeric tolerances.

1. **Legacy compatibility:** compare all Task 1 golden output bits and final
   phases for static, per-sample frequency/detune and fractional-sync inputs.
   Verify `waveform=2.0` and a null waveform buffer use the unchanged path.
2. **Periodicity and range:** for each new anchor and morph, evaluate phases
   `x`, `x+1`, and equivalent negative phases; outputs are finite and periodic
   within `2e-6` full scale. Anchors and crossfades stay in `[-1.000002,
+1.000002]`; anchor peak-to-peak is `2 ± 2e-5` before band-limiting.
3. **Phase landmarks / symmetry:** triangle reset/trough `-1`, peak at
   `q=.5`, DC 0 and `T(q+.5)=-T(q)`; shark reset/trough `-1`, peak at
   `q=.75`, DC 0 and non-half-wave symmetry; saw reset and peak at `x=0,p`;
   square/pulse reset point `-1` and rising edge at `q=1-d`.
4. **Morph endpoints and automation:** evaluate exact anchors, each interval
   at `t=0`, `0.5`, `1`, and both sides of each integer control boundary.
   Endpoints equal the corresponding anchor; integer-boundary value
   difference is at most `2e-6`. Abrupt control changes do not alter phase or
   sync state. Pulse duties at indices 3/4/5 are `.5/.75/.25`; the 3→4
   midpoint is `.625` and 4→5 midpoint is `.5`.
5. **DC and duty:** measure over 4096 uniform `q` samples. Triangle, shark,
   saw and square DC absolute value ≤ `2e-4`; pulse DC differs from `2d-1`
   by ≤ `2e-4`. Pulse positive sample fraction differs from `d` by at most
   one sample / 4096.
6. **Sync:** deterministic crossings at event offsets 0, 0.25, 0.5, 0.75,
   and 1 sample; assert the unchanged phase at render sample, final phase,
   and event timing for each anchor and selected morph. Test any chosen
   waveform-specific correction against the same cases.
7. **Invalid control values:** exact approved C and WASM mapping: finite
   under/over range clamp to 0/5; NaN to 2; negative/positive infinity to
   0/5. Verify buffer length/scalar conventions and multiple-instance
   isolation per the approved generic API.

Render every anchor and the five interval midpoints at each sample rate below.
Run free-running and sync stress separately. The nominal pitch rows are
55 Hz, 110 Hz, 440 Hz, 1 kHz, 5 kHz, `0.25 × Fs`, and `0.45 × Fs` (the last
row is the near-Nyquist case). For coherent FFT analysis, use `N=65,536`
samples and set the actual test fundamental to
`round(f_nominal*N/Fs)*Fs/N`; record both nominal and actual values. Use
deterministic phase `0`, no drift/randomness, fixed detune 0, and repeatable
sync sequences. Sample rates:

|      `Fs` | 128-frame budget |  Near-Nyquist row |
| --------: | ---------------: | ----------------: |
| 44,100 Hz |         2.902 ms | 19,845 Hz nominal |
| 48,000 Hz |         2.667 ms | 21,600 Hz nominal |
| 96,000 Hz |         1.333 ms | 43,200 Hz nominal |

For the offline reference, render the same analytic equation and phase at
32× each target rate; low-pass and decimate with a documented, linear-phase
windowed-sinc Kaiser FIR (32,769 taps, β=10), passband edge `0.45×Fs`,
stopband beginning `0.5×Fs`, and compensate its group delay. Confirm
reference convergence with a 64× rendering; 32× vs 64× must differ by no
more than `1e-5` RMS and `1e-4` peak full scale or the reference itself is
not qualified. This is a numerical oracle for the specified digital
equations, not hardware truth.

Use a rectangular FFT window on the coherent record. Report complex
harmonic-bin residuals and off-harmonic residuals separately. Aliased partials
can fold onto occupied harmonic bins, so a bin mask alone cannot identify
all alias energy. Define the operational alias/error residual ratio as

```text
10 log10( sum_k |Y[k] - R[k]|² / sum_k |Y[k]|² )
```

over positive-frequency bins excluding DC, and report the occupied-harmonic
and off-harmonic parts of the numerator. `Y` is the candidate FFT and `R` is
the high-rate/downsampled reference FFT. Label this honestly as a
reference-residual alias/error estimate, not a pure physical alias-energy
measurement; the coherent residual captures excess aliased harmonics even
where they overlap a desired harmonic. Additionally report time-domain RMS
and peak absolute error against `R`, in full-scale units, and provide spectral
plots or machine-readable bin measurements.

## Predeclared proposed acceptance thresholds

The thresholds below are engineering gates, not values taken from hardware
measurement. They are set before choosing PolyBLEP, PolyBLAMP, or a table.
The exact legacy saw is reported separately and is held to bit-exact
compatibility; it is not required to meet new-shape anti-alias targets.

| Case                                                                | Proposed threshold                                                                                                         |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| New-shape RMS error vs qualified reference, rows through `0.25×Fs`  | `≤ 0.01 FS` (−40 dBFS)                                                                                                     |
| New-shape peak error vs qualified reference, rows through `0.25×Fs` | `≤ 0.05 FS`                                                                                                                |
| New-shape RMS error at `0.45×Fs`                                    | `≤ 0.03 FS`                                                                                                                |
| New-shape peak error at `0.45×Fs`                                   | `≤ 0.12 FS`                                                                                                                |
| Reference-residual ratio, rows through `0.25×Fs`                    | `≤ −35 dB`                                                                                                                 |
| Reference-residual ratio at `0.45×Fs`                               | `≤ −25 dB`                                                                                                                 |
| Generic render deadline, maximum stress topology                    | ≤ 90% of the 128-frame budget at each tested sample rate (retain ≥10% headroom)                                            |
| Cost regression vs same-build legacy baseline                       | ≤ 25% per rendered sample in each static, uniform-detuned, and varying case; also report absolute ns/sample and block time |

The error gates allow finite residuals from practical band-limiting but
require visibly lower error than raw discontinuous waveforms should achieve;
the near-Nyquist allowance is wider because fewer harmonics fit below
Nyquist and edge corrections lose margin. These are proposed conservative
product targets, not literature-established perceptual thresholds. If a
candidate cannot meet them without breaking the deadline, present the
measured tradeoff for approval rather than relaxing limits after algorithm
selection.

Benchmark native and WASM with the existing harness style, warmup, block size
and best-of-five convention, and report all cases rather than only the best
shape. Extend measurements to 44.1/48/96 kHz and all anchors/midpoints. At
each rate the stress topology renders `768 × 128` oscillator samples per
quantum; compare total elapsed time with the budget in the table above.
Existing 48 kHz baseline results in `packages/native/c/BENCHMARKS.md` are
context only (they are not substitutes for same-build baseline measurements).

## Approval gate

Before Task 3 begins, approve or revise: use of `q(x,p)` and its derivative
corner; the proposed triangle/sharktooth equations and phase landmarks; the
three crossfade candidates; the helper signatures; the reference procedure
and thresholds. Keep the approved anchors, pulse duty curves, exact legacy
saw rule and generic naming boundaries unchanged. No DSP code or tests were
changed for Task 2.
