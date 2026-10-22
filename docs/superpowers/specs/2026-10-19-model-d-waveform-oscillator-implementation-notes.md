# Model D-Inspired Waveform Oscillator — Implementation Notes

Date: 2026-10-19
Status: **Approved equations; Task 4 spectral gates pass, CPU gates fail**

This note resolves the equation and measurement questions for Tasks 3–4. It
does not authorize DSP, API, test, or benchmark implementation. The waveform
equations and transitions below are Axiom proposals, not claims of
circuit-exact Model D behavior.

## Authority and boundaries

**Approved constraints from the design spec (not changed here):**

- The six anchors are, in order: `0.0` triangle, `1.0` sharktooth, `2.0`
  legacy ramp/saw, `3.0` square, `4.0` wide pulse, and `5.0` narrow pulse.
- The pulse anchors are 50%, 75%, and 25%. For square → wide pulse,
  $d = 0.5 + 0.25t$; for wide → narrow pulse, $d = 0.75 - 0.5t$.
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
- The design’s maximum stress topology is $16$ synth voices, $3$ oscillator
  indices, and $16$ unison voices. A reference comparison is not evidence of
  hardware equivalence.

**Proposals requiring approval:** the exact non-saw equations, phase mapping,
the three non-pulse morph laws, numerical tolerances and performance gates
below. These are fixed before any new-shape algorithm is selected.

## Existing saw and candidate shared phase coordinate

For wrapped phase $x \in [0, 1)$, the existing fitted parameter is evaluated in
float as

```c
float p = 0.9924f - 0.00002151f * frequency_hz;
if (p < 0.0f) p = 0.0f;
if (p > 1.0f) p = 1.0f;
```

Non-finite `frequency_hz` returns `0.9924f` before this calculation. The
waveform evaluator then moves endpoint $p$ values inward to `1.0e-7f` or
`1.0f - 1.0e-7f`, respectively. The legacy phase offset and output are

$$
\begin{aligned}
A &= \pi - 2\pi p \\
\phi_{\mathrm{mod}} &=
\begin{cases}
A x / p, & x < p, \\
A (1 - x) / (1 - p), & x \ge p,
\end{cases} \\
y_{\mathrm{saw}} &= -\cos(2\pi x + \phi_{\mathrm{mod}})
\end{aligned}
$$

In C, keep the current double-precision expression order: compute
`MOOG_SAW_PI - MOOG_SAW_TWO_PI * (double)p`; compute the selected `phi_mod`
branch with its existing multiply/divide order; then call
`quadrant_cos(MOOG_SAW_TWO_PI * phase + phi_mod)` and negate/cast to `float`.
The phase is wrapped before this evaluator in `moog_saw_waveform`; the
block-rendering legacy path supplies a phase already known to be in `[0,1)`.
Do not replace this with an algebraically equivalent `cos`/ramp rewrite.

The proposed coordinate for the _new_ shapes is

$$
\begin{aligned}
\theta(x,p) &= 2\pi x + \phi_{\mathrm{mod}}(x,p) \\
q(x,p) &= \frac{\theta(x,p)}{2\pi}
\end{aligned}
$$

Use $q \in [0,1]$ for the derivation and wrap its endpoint $1$ to $0$ for
periodic shape evaluation. At $x=0$, $q=0$; at $x=p$, $q=0.5$; as $x\to1$,
$q\to1$. The two branches meet continuously at $x=p$ because
$\theta(p,p)=\pi$.
Within either branch,

$$
\frac{d\theta}{dx} =
\begin{cases}
\pi/p, & 0 \le x < p, \\
\pi/(1-p), & p \le x < 1.
\end{cases}
$$

Both slopes are positive for the evaluator’s guarded $0 < p < 1$; therefore
the map is monotone and traverses exactly one full cycle. Its endpoint is
periodic modulo $2\pi$, and its origin agrees with the saw reset. It is **not**
uniform in $x$, and its derivative has a corner at $x=p$ unless $p=0.5$.
That corner is intentional in this proposal: it aligns $q=0.5$ with the
legacy saw’s positive peak, but can create a slope discontinuity in a new
shape. Measure and band-limit it as a new-shape feature; do not claim that the
coordinate is a smooth physical phase law. No new shape is permitted to
alter the saw calculation.

For deterministic tests defined on uniform $q$ samples, invert the map with
$x=2pq$ for $q<0.5$, and $x=p+2(1-p)(q-0.5)$ for $q\ge0.5$. These expressions
are for test-coordinate
conversion only; they do not replace the legacy saw’s forward calculation.

## Proposed anchors and normalization

All new equations below use $q=q(x,p)$, with $q=1$ evaluated as $q=0$.
$d$ means the fraction of a cycle at $+1$. The proposals set bipolar extrema
to $-1$ and $+1$ (peak-to-peak $2$). No peak normalization is applied after
morphing. Only pulse anchors have nonzero DC; do not remove that DC.

| Anchor          | Proposed equation                                                                  | Phase and properties                                                                                                                                                                                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Triangle, 0     | $T(q)=-1+4q$ for $0\le q<0.5$; $T(q)=3-4q$ for $0.5\le q<1$                        | Reset $-1$; peak $+1$ at $q=0.5$ / $x=p$; trough $-1$ at wrap. Range $[-1,+1]$, p-p $2$, DC $0$, half-wave antisymmetric. Continuous with slope corners at $q=0,0.5$.                                                                                                                                       |
| Sharktooth, 1   | Let $a=0.75$. $H(q)=-1+2q/a$ for $0\le q<a$; $H(q)=1-2(q-a)/(1-a)$ for $a\le q<1$. | Proposed asymmetric triangle with a 75%-cycle rise and 25%-cycle fall. Reset $-1$; peak $+1$ at $q=0.75$; wrap returns to $-1$. Range $[-1,+1]$, p-p $2$, DC $0$ (each linear segment has zero mean over its own duration). Not half-wave symmetric. $a=0.75$ is a proposal, not a measured hardware value. |
| Ramp / saw, 2   | Exact $y_{\mathrm{saw}}(x,p)$ above.                                               | Keep original fitted $P(f)$, equation, operation order, output convention and process path. The reset is $-1$, positive peak is at $x=p$, range $[-1,+1]$, p-p $2$ and ideal-cycle mean $0$. No new correction.                                                                                             |
| Square, 3       | $S(q,d)=-1$ for $q<1-d$; $+1$ for $q\ge1-d$, with $d=0.5$.                         | Reset is $-1$ by the point-value convention. Rising edge at $q=0.5$; falling wrap edge at $q=0$. Range $[-1,+1]$, p-p $2$, DC $2d-1=0$. Value discontinuities at both edges.                                                                                                                                |
| Wide pulse, 4   | $S(q,0.75)$                                                                        | Positive fraction $d=0.75$; rising edge at $q=0.25$, falling wrap edge at $q=0$. Reset point is $-1$; p-p $2$; DC $+0.5$.                                                                                                                                                                                   |
| Narrow pulse, 5 | $S(q,0.25)$                                                                        | Positive fraction $d=0.25$; rising edge at $q=0.75$, falling wrap edge at $q=0$. Reset point is $-1$; p-p $2$; DC $-0.5$.                                                                                                                                                                                   |

The sharktooth equation is one explicit, reproducible Axiom interpretation of
the name, not a source-derived hardware equation. Its reset matches the
legacy saw, but its peak is deliberately not aligned with the saw peak; the
chosen asymmetry is its defining proposal. If listening/measurement rejects
this anchor, change it only at this approval gate, not silently during DSP
implementation.

For $\pm1$ pulses the ideal DC is $2d-1$; after DC removal, 25% and 75% pulses
have identical harmonic magnitudes and differing harmonic phase. Retain both
selector anchors and their DC as specified here.

## Proposed internal waveform helper interface

These are candidate declarations for
`packages/native/c/src/moog_waveforms.h`; the header is not created by this
task. Phase arguments are normalized cycles, `p` is the existing legacy fit,
and $t \in [0,1]$ is the local morph fraction. Shape helpers may derive $q$
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
never resets or advances phase. $L(a,b,t)=(1-t)a+tb$ is the sample crossfade
candidate. Every candidate reproduces its exact anchors for $t=0$ and $t=1$.
At an integer waveform boundary the adjacent laws call the same anchor, so
there is no output-value jump caused solely by changing the control; waveform
corners/edges remain as defined above.

Implement the crossfade endpoints as direct anchor dispatches at $t=0$ and
$t=1$, rather than relying on floating-point multiplication by zero to
preserve them. Dispatch anchor 5 directly at the upper parameter endpoint as
well. This is in addition to the mandatory bit-exact dispatch at waveform
`2.0`.

| Interval                        | Proposed law                          | Endpoint and spectral behavior                                                                                                                                     |
| ------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| $[0,1]$ triangle → sharktooth   | $L(T(q),H(q),t)$                      | Crossfade candidates are phase-aligned at reset and DC remains $0$. Their different peak positions can reduce intermediate peak-to-peak level; do not renormalize. |
| $[1,2]$ sharktooth → legacy saw | $L(H(q),y_{\mathrm{saw}}(x,p),t)$     | Crossfade candidate. At $t=1$, dispatch the exact legacy saw result. For $t<1$, any saw component is mixed as a value; never “correct” the legacy saw endpoint.    |
| $[2,3]$ legacy saw → square     | $L(y_{\mathrm{saw}}(x,p),S(q,0.5),t)$ | Crossfade candidate. The square discontinuities need new-shape band-limiting before the morph; the endpoint at $t=0$ remains untouched legacy saw.                 |
| $[3,4]$ square → wide pulse     | $S(q,d(t))$, $d(t)=0.5+0.25t$         | Required pulse-preserving duty morph. $d$ increases from 50% to 75%; DC follows $2d-1$.                                                                            |
| $[4,5]$ wide → narrow pulse     | $S(q,d(t))$, $d(t)=0.75-0.5t$         | Required pulse-preserving duty morph. $d$ decreases from 75% to 25%; midpoint $t=0.5$ is 50% duty, with the square’s ideal harmonic magnitudes.                    |

The three crossfades are explicit starting candidates, not assumed winners.
Compare each against a parameterized shape morph where it is meaningful,
using the predeclared measurements and listening review. Preserve the two
approved pulse duty curves even if a crossfade sounds attractive.

## Phase, sync, discontinuity and anti-alias rules

- The core uses the existing wrapped phase accumulator and sample order.
  At a rising sync zero crossing ($\mathrm{previous} \le 0$,
  $\mathrm{current} > 0$), estimate $u=-\mathrm{previous}/(\mathrm{current}
  -\mathrm{previous})$ and clamp to $[0,1]$. The event is $1-u$ samples
  before the current sample; reset phase to
  $\operatorname{wrap}((1-u)\,\mathrm{phase\_increment})$ before rendering that sample. Keep this
  edge detector and fractional reset waveform-independent.
- Sync resets phase to the shape’s $q=0$ origin. Output at the event is shape
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
   Verify $waveform=2.0$ and a null waveform buffer use the unchanged path.
2. **Periodicity and range:** for each new anchor and morph, evaluate phases
   $x$, $x+1$, and equivalent negative phases; outputs are finite and periodic
   within $2\times10^{-6}$ full scale. Anchors and crossfades stay in
   $[-1.000002,+1.000002]$; anchor peak-to-peak is $2\pm2\times10^{-5}$
   before band-limiting.
3. **Phase landmarks / symmetry:** triangle reset/trough $-1$, peak at
   $q=0.5$, DC $0$, and $T(q+0.5)=-T(q)$; shark reset/trough $-1$, peak at
   $q=0.75$, DC $0$, and non-half-wave symmetry; saw reset and peak at
   $x=0,p$; square/pulse reset point $-1$ and rising edge at $q=1-d$.
4. **Morph endpoints and automation:** evaluate exact anchors, each interval
   at $t=0$, $0.5$, $1$, and both sides of each integer control boundary.
   Endpoints equal the corresponding anchor; integer-boundary value
   difference is at most `2e-6`. Abrupt control changes do not alter phase or
   sync state. Pulse duties at indices 3/4/5 are $0.5/0.75/0.25$; the 3→4
   midpoint is $0.625$ and 4→5 midpoint is $0.5$.
5. **DC and duty:** measure over 4096 uniform $q$ samples. Triangle, shark,
   saw and square DC absolute value $\le2\times10^{-4}$; pulse DC differs from
   $2d-1$ by $\le2\times10^{-4}$. Pulse positive sample fraction differs from
   $d$ by at most one sample per 4096.
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
55 Hz, 110 Hz, 440 Hz, 1 kHz, 5 kHz, $0.25F_s$, and $0.45F_s$ (the last
row is the near-Nyquist case). For coherent FFT analysis, use $N=65{,}536$
samples and set the actual test fundamental to
$\operatorname{round}(f_{\mathrm{nominal}}N/F_s)F_s/N$; record both nominal and actual values. Use
deterministic phase $0$, no drift/randomness, fixed detune $0$, and repeatable
sync sequences. Sample rates:

|     $F_s$ | 128-frame budget |  Near-Nyquist row |
| --------: | ---------------: | ----------------: |
| 44,100 Hz |         2.902 ms | 19,845 Hz nominal |
| 48,000 Hz |         2.667 ms | 21,600 Hz nominal |
| 96,000 Hz |         1.333 ms | 43,200 Hz nominal |

### Periodic-waveform spectral oracle

The $32\times/64\times$ FIR reference did not pass its convergence gate. Use a
Fourier/spectral oracle for free-running periodic waveforms instead. For each
exact continuous cycle over normalized phase $x \in [0,1)$, compute

$$
C_k = \int_0^1 y(x)\exp(-i2\pi kx)\,dx
$$

in double precision with deterministic adaptive Gauss-Kronrod 15/31
quadrature. Split the integral at every piecewise boundary, including
$x=p$, transformed-phase corners and edges, and pulse edges. For the actual
coherent fundamental $f$, retain $C_0$ and positive harmonics only where
$kf \le 0.45F_s$. Reconstruct the real reference at sample phase $x_n$ as

$$
\begin{aligned}
y_{\mathrm{ref}}(x_n) &=
C_0 + 2\operatorname{Re}\left(\sum_{k=1}^{K}C_k\exp(i2\pi kx_n)\right) \\
K &= \left\lfloor\frac{0.45F_s}{f}\right\rfloor
\end{aligned}
$$

For each anchor and selected morph, hold the waveform identity, actual
coherent frequency, frequency-dependent $p$, morph value, and initial phase
fixed for the entire coefficient calculation and record. Use the existing
$N=65{,}536$ coherent records and pitch/sample-rate matrix; set
$f=\operatorname{round}(f_{\mathrm{nominal}}N/F_s)F_s/N$, record both nominal
and actual $f$, and sample the reconstruction at
$x_n=\operatorname{wrap}(\mathrm{phase}_0+nf/F_s)$ with $\mathrm{phase}_0=0$.
Do not vary $p$, waveform, or morph within a periodic
reference record.

Integrate once with absolute and relative tolerances $10^{-12}$, then recompute
with both tolerances set to $10^{-14}$. At the same record phases, the two
time-domain references must converge to RMS $\le10^{-7}$ FS and peak
$\le10^{-6}$ FS. This is a numerical oracle for the specified continuous
equations, not hardware truth.

### Separate hard-sync transient reference

Do not use free-running periodic coefficients to judge hard-sync transients.
Use the approved cadence of $T=3/(2f)$ seconds between hard-sync events.
The free-running phase advances $fT=1.5$ oscillator cycles between resets,
so its phase modulo one cycle advances by $0.5$ cycle. At event $\tau_j$, reset
phase to zero; between events the exact trajectory is
$x(t)=\operatorname{wrap}(f(t-\tau_j))$ for $\tau_j\le t<\tau_{j+1}$. The pre-reset trajectory
therefore reaches $\operatorname{wrap}(1.5)=0.5$ cycle before the next reset. This cadence
is periodic and includes a nonzero reset transient; do not replace it with
one event per coherent record.

For each nominal pitch and sample rate, choose the positive oscillator-cycle
FFT bin $m$ that is a multiple of $3$ and nearest to $f_{\mathrm{nominal}}N/F_s$
(resolve an exact tie by choosing the lower bin). $N=65{,}536$ and set $f=mF_s/N$, recording nominal and actual frequency. The
record contains $m$ free-running oscillator cycles and
$J=(N/F_s)/T=2m/3$ complete sync-event periods; since $m$ is divisible by
$3$, $J$ is an integer. This establishes both record coherence and exact
period closure. The event period in samples is $TF_s=3N/(2m)$, and need
not be an integer.

For deterministic fractional-event and integer-alignment cases, generate the
same periodic sync edge train at continuous sample-time positions
$\tau_jF_s=\delta+j(3N/(2m))$, with $\delta\in\{0,0.25,0.5,0.75,1\}$ samples.
The offsets $0.25$, $0.5$, and $0.75$ are distinct fractional-sample phases;
$0$ and $1$ are integer-alignment controls, with $1$ a cyclic one-sample shift
of $0$ under periodic extension. Treat $\delta$ as one fixed offset of the entire
train relative to the record boundary, not as a rounded or accumulated change
to the interval. Use the periodic extension of the train across record
boundaries, giving exactly $J$ events per record for every offset. Deliver
event timestamps without rounding their fractional positions; use the same
timestamps for candidate and reference. This preserves exactly $T=3/(2f)$
and the 1.5-cycle inter-event phase advance in every offset case.

For each fixed waveform, actual frequency, frequency-dependent `p`, morph,
reset rule, and offset, compute the Fourier series over one event period.
Using local event time $u=t-\tau_j\in[0,T)$, calculate

$$
C_k=\frac{1}{T}\int_0^T y_{\mathrm{sync}}(\tau_j+u)
\exp(-i2\pi ku/T)\,du
$$

in deterministic double precision with adaptive Gauss-Kronrod 15/31
quadrature. Split integration at each natural phase wrap, sync reset, $x=p$,
all transformed-waveform edges and corners, pulse edges, morph boundaries,
and every other active waveform branch boundary. Include the interval
endpoints. Retain $C_0$ and positive harmonics satisfying $k/T\le0.45F_s$, i.e.
$K=\lfloor0.45F_sT\rfloor$. Reconstruct the real event-aware reference at each
candidate sample time $t_n=n/F_s$ as

$$
y_{\mathrm{ref}}(t_n)=C_0+
2\operatorname{Re}\left(
\sum_{k=1}^{K}C_k\exp(i2\pi k(t_n-\tau_j)/T)
\right)
$$

where $\tau_j$ is the event preceding that sample (the periodic extension
makes any equivalent event index produce the same value). Since `J` event
periods fit the record, event harmonic $k$ has frequency $f_k=k/T$ and maps
to coherent record bin $kJ$.
Integrate once with absolute and relative tolerances $10^{-12}$, then recompute
with both tolerances set to $10^{-14}$. Require the reconstructed sample
references from the two passes to converge to RMS $\le10^{-7}$ FS and peak
$\le10^{-6}$ FS. This is the deterministic band-limited reference for the
specified continuous reset trajectory, not hardware truth. Compare sync
correction against this reference and preserve all predeclared thresholds;
retain common sync detection and phase reset, and never apply a new
correction to the legacy saw.

Use a rectangular FFT window on the coherent record. Report complex
harmonic-bin residuals and off-harmonic residuals separately. Aliased partials
can fold onto occupied harmonic bins, so a bin mask alone cannot identify
all alias energy. Define the operational alias/error residual ratio as

$$
10\log_{10}\left(
\frac{\sum_k |Y[k]-R[k]|^2}{\sum_k |Y[k]|^2}
\right)
$$

over positive-frequency bins excluding DC, and report the occupied-harmonic
and off-harmonic parts of the numerator. `Y` is the candidate FFT and `R` is
the band-limited ideal-waveform spectral reference FFT (the periodic oracle
for free-running records and the event-aware oracle above for sync records).
Label
this honestly as a reference-residual alias/error estimate, not a pure
physical alias-energy measurement; the coherent residual captures excess
aliased harmonics even where they overlap a desired harmonic. Additionally
report time-domain RMS and peak absolute error against `R`, in full-scale
units, and provide spectral plots or machine-readable bin measurements.

## Predeclared proposed acceptance thresholds

The thresholds below are engineering gates, not values taken from hardware
measurement. They are set before choosing PolyBLEP, PolyBLAMP, or a table.
The exact legacy saw is reported separately and is held to bit-exact
compatibility; it is not required to meet new-shape anti-alias targets.

| Case                                                                | Proposed threshold                                                                                                             |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| New-shape RMS error vs qualified reference, rows through $0.25F_s$  | $\le0.01$ FS ($-40$ dBFS)                                                                                                      |
| New-shape peak error vs qualified reference, rows through $0.25F_s$ | $\le0.05$ FS                                                                                                                   |
| New-shape RMS error at $0.45F_s$                                    | $\le0.03$ FS                                                                                                                   |
| New-shape peak error at $0.45F_s$                                   | $\le0.12$ FS                                                                                                                   |
| Reference-residual ratio, rows through $0.25F_s$                    | $\le-35$ dB                                                                                                                    |
| Reference-residual ratio at $0.45F_s$                               | $\le-25$ dB                                                                                                                    |
| Generic render deadline, maximum stress topology                    | $\le90\%$ of the 128-frame budget at each tested sample rate (retain $\ge10\%$ headroom)                                       |
| Cost regression vs same-build legacy baseline                       | $\le25\%$ per rendered sample in each static, uniform-detuned, and varying case; also report absolute ns/sample and block time |

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
each rate the stress topology renders $768\times128$ oscillator samples per
quantum; compare total elapsed time with the budget in the table above.
Existing 48 kHz baseline results in `packages/native/c/BENCHMARKS.md` are
context only (they are not substitutes for same-build baseline measurements).

## Task 4 qualification checkpoint (2026-10-20)

These exploratory results used base commit
`c665137cc3ea1b4d7f265ab9c56dafd09067c74c` plus **uncommitted native
changes**. They are not benchmark records for a committed implementation.
No gates above changed.

- The periodic Fourier matrix passed 231/231 cases before the latest sync
  changes. The native C suite passes after the changes.
- The event-aware sync matrix passed 817/1,155 cases before correcting
  integer-aligned zero crossings for new shapes. Detecting the event at the
  zero sample, while retaining the legacy saw crossing rule, raised the
  result to 1,045/1,155. The remaining 110 failures comprise 50 each for
  morphs `1.5` and `2.5`, plus 10 for narrow pulse `5.0`. Each event offset
  has 22 failures. Reference convergence remains below
  $7.12\times10^{-14}$ RMS and $2.96\times10^{-13}$ peak.
- A numerical, event-split sinc convolution with radius $84$ samples
  matched representative failing cases. Against the same event-aware
  reference, the 256-sample probes had RMS $0.00106$–$0.00150$ and peak
  $0.00231$–$0.00433$. This establishes a possible filter target, **not**
  realtime feasibility or full-matrix qualification. Direct quadrature
  requires too many waveform evaluations per output sample.
- Native stress measurements used an Apple M1 Max, arm64, Apple clang 21,
  `-O3`, 20 measured 128-frame blocks per repeat, and best of five repeats.
  The 768-oscillator generic API with `waveform=2.0` (the unchanged legacy
  saw signal) took 4.483/4.422/4.419 ms per block at 44.1/48/96 kHz:
  154.5%/165.8%/331.4% of the respective budgets. The candidate
  mixed-waveform topology took
  3.159/3.301/2.767 ms: 108.8%/123.8%/207.5%. Thus even the unchanged
  saw baseline exceeds the $\le90\%$ stress gate on this machine.
- A varying-frequency regression exposed a false natural-edge correction:
  the candidate reconstructed the preceding phase with the **current**
  increment, rather than the increment traversed since the preceding
  sample. Tracking that previous increment across blocks removes the
  false edge without changing the legacy saw's output. The C suite passes;
  full spectral qualification is still pending.
- The 84-sample sync correction delay also affected new shapes when sync
  was absent, so an unsynced phase-alignment regression failed at the
  first output sample. Free-running shapes now render without that delay;
  the correction ring remains reserved for synced new shapes. Recheck
  transitions into and out of sync before integration.
- An apparent regression to 688/1,155 came from building the scratch
  renderer without `MOOG_SAW_TEST_RNG`. Its random oscillator drift made
  the rendered frequency disagree with the deterministic Fourier oracle.
  This run is **invalid qualification evidence**. With deterministic
  drift restored, the eight-case smoke matrix again passes 8/8; a full
  rerun of the current source reproduces 1,045/1,155 passes and the
  same 110 failures by waveform and event offset listed above.
- A fresh periodic Fourier run still passed 231/231 cases, with reference
  convergence below $2.5\times10^{-14}$ RMS and
  $9.46\times10^{-14}$ peak. A separate deterministic render through
  `moog_oscillator_process`, rather than just the waveform evaluator,
  also passed all 231 periodic cases after removing the unsynced delay.
- After removing the free-running delay, a new native stress run measured
  154.0%/168.0%/335.2% of the 44.1/48/96 kHz budgets for the saw
  signal and 104.4%/120.0%/198.8% for the mixed topology. This is
  still uncommitted exploratory source based on the same commit,
  machine, compiler, flags, and measurement date noted above.
- A native stress run now fails explicitly above the predeclared $90\%$
  budget. Avoiding a redundant 254-entry buffer clear on every saw
  sample, then hoisting constant saw work for uniform blocks, reduced
  saw utilization to 29.8%/31.8%/64.7%. The same mixed topology still
  used 91.6%/108.6%/172.6%. Uniform morph 1.5 alone used
  181.2%/212.2%/332.7%; morph 2.5 used
  179.2%/210.6%/324.0%. These exploratory Apple M1 Max measurements
  used the same 2026-10-20 date, base commit
  `c665137cc3ea1b4d7f265ab9c56dafd09067c74c`, and uncommitted
  native source. A bit-for-bit regression checks uniform saw against
  its per-sample path across multiple blocks. Optimizing saw cannot
  alone qualify the more expensive morph shapes; the unchanged
  $25\%$ same-build cost and $90\%$ absolute deadline both still fail.
- Disabling the high-accuracy Fourier morph path experimentally lowered
  mixed utilization to 52.0%/55.7%/106.1%, but the periodic oracle then
  failed 8 of 231 cases, including both saw morphs at 1 kHz. The
  experiment was reverted. Changing reset-jump estimates to use the
  periodic band-limited saw improved only one of 22 focused sync
  failures and broke an existing sync test; that experiment was also
  reverted. The waveform's periodic filtering cannot by itself
  band-limit the trajectory after arbitrary resets.
- A focused 63-case sync run reproduced 22 failures, including about
  $0.159$ FS RMS for the saw morphs near $0.45F_s$. Separately, a
  failing native regression exposed unbounded edge enumeration for
  finite pitches above $F_s$; corrections now skip these out-of-band
  natural edges. Native tests and the WASM build pass after this guard.
  All exploratory measurements remain dated 2026-10-20 and refer to
  base commit `c665137cc3ea1b4d7f265ab9c56dafd09067c74c` plus
  uncommitted source.
- A repeat of the native stress run after the out-of-band sync guard,
  with the same date and source status, measured saw
  30.0%/33.0%/66.6% and mixed 96.9%/111.8%/182.6% at
  44.1/48/96 kHz. The stress input has no sync, so the guard cannot
  explain this variation. Full workspace build, native/JavaScript
  tests, Playwright E2E, and lint all pass, but the unchanged CPU and
  sync acceptance gates do not.
- An experimental 1,024-entry per-oscillator phase table retained
  231/231 periodic passes and cut warmed mixed stress to
  23.4%/24.9%/59.2% at 44.1/48/96 kHz. Building tables in the
  first render block took 19.1/20.7/14.7 ms, far above the respective
  deadlines; this approach also left per-sample frequency automation
  and the 110 hard-sync failures unresolved. The table was reverted,
  not accepted as a realtime solution. The experimental numbers were
  measured 2026-10-20 from base commit
  `c665137cc3ea1b4d7f265ab9c56dafd09067c74c` plus uncommitted
  native source.
- Per-sample frequency changes previously rebuilt 64 Fourier
  coefficients even when the selected renderer did not use any.
  Preparing only coefficients actually consumed cut the exploratory
  varying-input mixed stress from 71.4/72.4/70.9 ms to
  13.9/14.9/11.5 ms per 128-frame block. This still misses both CPU
  gates. Full spectral requalification after this change passed
  231/231 periodic cases, while hard sync stayed at 1,045/1,155.
  Full workspace build, native/JavaScript tests, Playwright E2E, and
  lint pass. This is still not a Task 4 pass.
- On 2026-10-21 the native scratch stress harness checked both the
  $\le90\%$ deadline (including the first block) and the separate
  $\le1.25\times$ same-build saw cost limit. Mixed shapes used
  93.6%/108.9%/177.4% of the 44.1/48/96 kHz budgets, and
  $3.159/3.391/2.745\times$ saw cost. At 96 kHz, even uniform
  triangle used $1.351\times$ saw cost and 88.2% of the budget;
  uniform morph 1.5 used $5.322\times$ and 341.3%. These
  exploratory Apple M1 Max, arm64, Apple clang `-O3`, 128-frame,
  best-of-five measurements used base commit
  `c665137cc3ea1b4d7f265ab9c56dafd09067c74c` plus uncommitted
  native changes. Passing only the absolute deadline would not
  qualify the candidate.
- A 2026-10-21 deterministic spectral diagnostic isolated the
  near-Nyquist sync failure: at 96 kHz, $f\approx43.2$ kHz and
  $\delta=0.25$, morphs 1.5 and 2.5 have approximately $0.159$
  FS RMS error. Their aliased second **sync-event** harmonic,
  folded to FFT bin 26,216, has magnitude about $0.103$ FS,
  whereas narrow pulse 5.0 has about $0.0012$ FS at the same bin.
  The current Fourier correction filters the freely running saw
  component at the oscillator frequency but does not eliminate
  harmonics introduced when that component is reset every
  $T=3/(2f)$. At 48 kHz/1 kHz the morphs' RMS errors are smaller
  (about $0.006$ FS), but peak errors still exceed $0.05$ FS.
  A generic sync filter must target the _reset trajectory_ before
  sampling; another post-sampling filter cannot remove an alias
  already folded below the cutoff. These exploratory measurements
  use base commit
  `c665137cc3ea1b4d7f265ab9c56dafd09067c74c`
  plus uncommitted native source.
- The same 768-oscillator scratch stress harness, built with local
  Emscripten and run in Node on the Apple M1 Max on 2026-10-21,
  measured mixed-WASM block utilization
  114.3%/131.5%/216.5% at 44.1/48/96 kHz, against
  35.6%/38.3%/75.9% for same-build saw. Mixed costs were
  $3.208/3.435/2.851\times$ saw. This is Node-hosted WASM,
  **not** an AudioWorklet deadline measurement, and still uses
  base commit `c665137cc3ea1b4d7f265ab9c56dafd09067c74c`
  plus uncommitted native source. Both fixed CPU gates fail
  without depending on a native-only benchmark.
- The 2026-10-21 sync diagnostic also localized a failing narrow-pulse
  case at 96 kHz/$f\approx5$ kHz: its 13th sync-event harmonic folds
  to FFT bin 29,588 with magnitude about $0.0127$ FS, while the
  approved reference retains only harmonics 1 through 12 below
  $0.45F_s$. The 13th sits near the cutoff: an 84-sample
  finite-support edge correction does not suppress it enough to
  satisfy the $0.01$ FS RMS limit (measured $0.0181$ FS).
  Thus both saw-morph and narrow-pulse failures involve **event**
  harmonics missing from the event-aware reference, not just wrong
  free-running phase or a post-render EQ problem.
- A separate 2026-10-21 scratch CPU prototype compiled residual
  correction tables into constants and reused shape coefficients across
  frequency changes up to $0.13\%$ when the harmonic count remained
  constant. It matched the original renderer byte-for-byte for all
  231 static periodic records; **this is not** a fresh independent
  oracle result, and varying-frequency spectral accuracy is
  unqualified. On Apple arm64 with Clang `-O3` and best-of-five
  768-oscillator native 128-frame runs, steady static mixed rendering
  still used 97.5%/110.0%/180.7% of the 44.1/48/96 kHz budgets
  (3.208/3.368/2.745 times saw); varying-input mixed rendering
  used 137.7%/154.3%/264.0% (3.148/3.351/2.798 times saw).
  First blocks were slower. The prototype stayed in ignored scratch
  files; none of its approximate behavior entered the DSP candidate.
  Its measurements refer to base commit
  `c665137cc3ea1b4d7f265ab9c56dafd09067c74c`
  plus uncommitted native source.

- On 2026-10-21, the actual candidate passed **231/231 periodic** and
  **1,155/1,155 hard-sync** Fourier-reference cases. For stable repeating
  sync, the candidate integrates the complete between-reset waveform
  before sampling and reconstructs only event harmonics below $0.45F_s$.
  It selects this result at the existing 84-sample output delay; the
  original raw-output and edge-correction buffers remain available if
  the event cadence stops or changes. Native regressions cover both
  folded-harmonic suppression and the transition after sync stops.
  Native tests, the full workspace build/test (including Playwright),
  and lint pass. This is spectral evidence, **not** a CPU or release pass.
- The same 2026-10-21 768-oscillator, 128-frame exploratory workload
  measured native mixed stress at
  **97.3%/112.1%/189.7%** of the 44.1/48/96 kHz deadlines and
  **$3.135/3.277/2.744\times$** same-build saw cost. Node-hosted WASM
  measured **120.4%/136.7%/216.9%** and
  **$3.311/3.401/2.747\times$** saw cost. These measurements include
  cold first-block checks, use committed base
  `fea272c4bf8f9f229d38e1748e5ed16177748268` **plus uncommitted
  source**, and are not final release benchmarks or AudioWorklet timing
  results. Both unchanged CPU gates ($\le90\%$ deadline and
  $\le1.25\times$ same-build saw) still fail. Event-series coefficients
  are also prepared within native processing when periodicity is
  recognized; the approved worklet design forbids expensive
  initialization in its process callback. This path needs real-time
  qualification or a different preparation boundary before release.
- A 2026-10-21 **unqualified lookup feasibility probe** compared
  2,048-point phase tables interpolated between adjacent
  64-rows-per-octave frequencies against the current exact renderer at
  the seven test pitches, three sample rates, and ten non-saw test
  waveforms. Keeping both frequency rows within the same harmonic-count
  band and falling back to the exact renderer above 64 harmonics yielded
  maximum $0.000819$ FS RMS and $0.00157$ FS peak **relative to that
  renderer**, not to the independent Fourier oracle. With no high-count
  fallback, interpolation peaked at $0.184$ FS for a 55 Hz waveform at
  96 kHz. This tests approximation error only: it says nothing yet
  about first-block cost, varying-input CPU, memory/startup cost, or
  arbitrary pulse-width automation. Source is committed base
  `fea272c4bf8f9f229d38e1748e5ed16177748268` plus uncommitted
  native code; the probe remains in ignored scratch files.

Next, redesign free-running new-shape rendering for both fixed CPU gates
and resolve event-series preparation without worklet-time stalls. Keep
generic hard-sync timing and legacy saw output unchanged. Do not publish
release benchmarks or change any gate without explicit approval.

## Approval gate

Before Task 3 begins, approve or revise: use of `q(x,p)` and its derivative
corner; the proposed triangle/sharktooth equations and phase landmarks; the
three crossfade candidates; the helper signatures; the reference procedure
and thresholds. Keep the approved anchors, pulse duty curves, exact legacy
saw rule and generic naming boundaries unchanged. No DSP code or tests were
changed for Task 2.
