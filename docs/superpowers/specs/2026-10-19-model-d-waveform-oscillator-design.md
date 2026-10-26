# Model D-Inspired Continuous Waveform Oscillator — Specification

Date: 2026-10-19

## Status and approval gate

**Proposal only.** This document defines constraints and decisions required before implementation. No DSP implementation is authorized until the user approves the specification.

## Goal and scope

Add an Axiom-specific continuous control across six Model D-inspired oscillator-shape anchors. The goal is a wide, useful range of harmonic and spectral content as the control moves from one anchor to the next. This is an Axiom feature inspired by the Model D selector, not a claim of circuit-exact emulation.

All three Axiom oscillators use the same six-anchor map. This intentionally standardizes their controls rather than reproducing any oscillator-specific difference in the original instrument. The existing Pekonen et al. saw remains an immutable compatibility reference at the ramp anchor. Without a hardware recording/reference waveform set, digital equations and transitions that cannot be established from reliable documentation are Axiom design choices; label them as such and tune them by listening and measurement.

This phase is limited to the native C, WASM, and AudioWorklet parameter surface. It does not change the app UI, `OscillatorConfig`, `AxiomSynth` state, or persistence; those will be addressed later. The new parameter is available at the AudioWorklet boundary but is not connected to the app's existing discrete selector in this phase.

## Research findings and implications

- Sound On Sound's Model D review reports that Oscillators 1 and 2 offer triangle, shark's tooth, ramp, and three pulse variants; Oscillator 3 replaces shark's tooth with a sawtooth. This supports sharktooth as a real selector shape for Oscillators 1/2, but means the six-shape set is oscillator-specific rather than universal. ([Sound On Sound, Minimoog Model D review](https://www.soundonsound.com/reviews/moog-minimoog-model-d))
- The official Model D manual describes square, wide-rectangle and narrow-rectangle pulse timbres and explains their duty-cycle/harmonic differences. It supports the three pulse anchors, but does not provide measured duty-cycle values for the original hardware. ([Official Moog Model D manual](https://api.moogmusic.com/sites/default/files/2018-01/Minimoog_Model_D_Manual.pdf))
- The Model D technical service manual describes sawtooth signals being processed into triangle and variable-width rectangular waveforms. This is evidence for a related circuit path, not proof that ideal mathematical shapes or a single shared phase transform reproduce the hardware. ([Model D technical service manual](https://manuals.plus/m/60a4fe7267f2c66ac033917355bd1b8ce2fea581c4dee57692fcfa047fa44ac5))
- Pekonen et al. model a recorded Moog sawtooth using a fitted phase-distortion model and a separate spectral post-equalization method. Their fitted phase distortion is a saw-specific model; the paper does not validate reusing it for triangle, sharktooth or pulse shapes. ([Pekonen et al., 2011, DOI: 10.1155/2011/785103](https://doi.org/10.1155/2011/785103))

**Design implication:** use the six-position Model D Oscillator 1/2 selector family as the shared Axiom map, with the existing Pekonen saw at the ramp-like anchor for compatibility. Axiom's three oscillators intentionally share this map; do not introduce an oscillator-specific map in this feature.

## Anchor set: provisional, must be resolved before implementation

The six-position selector family documented for Minimoog Model D Oscillators 1 and 2 is the proposed shared Axiom map:

| Value | Candidate anchor         | Initial definition                                                                        |
| ----: | ------------------------ | ----------------------------------------------------------------------------------------- |
|   0.0 | Triangle                 | Candidate shape; exact waveform and phase alignment still need definition                 |
|   1.0 | Sharktooth               | Documented selector shape; exact digital equation is not established by the sources below |
|   2.0 | Ramp / legacy saw        | Existing Pekonen output, unchanged for compatibility                                      |
|   3.0 | Square                   | 50% duty cycle                                                                            |
|   4.0 | Wide rectangle / pulse   | 75% duty cycle; provisional Axiom value, not a measured hardware value                    |
|   5.0 | Narrow rectangle / pulse | 25% duty cycle; provisional Axiom value, not a measured hardware value                    |

Sound On Sound reports that Oscillators 1 and 2 have triangle, shark's tooth, ramp and three pulse variants. Axiom uses these same six anchors on all three of its oscillators as an explicit product choice, not as a claim that every Model D oscillator has an identical selector.

The labels “ramp” and “sawtooth” may refer to related but not necessarily identical measured waveforms in this instrument context. The legacy Pekonen output remains at value 2.0 for compatibility; this placement is a design decision, not proof of an exact hardware match.

The 75%/25% duty cycles are starting design values, not asserted measurements of original hardware. Keep widths fixed for this feature; do not add a separate pulse-width control.

The 25% and 75% ideal pulse anchors are retained because both positions are
part of the Model D-inspired selector set, not because they provide different
steady-state harmonic magnitudes. After removing DC, ideal rectangular pulses
at complementary duties have the same harmonic magnitudes and differ in
harmonic phase. Their value is in reproducing both selector waveforms and their
phase relationships in Axiom patches, especially when combined with other
oscillators or nonlinear processing.

## AudioWorklet parameter

- AudioParam name: **waveform**.
- Range: 0.0 through 5.0, with finite values clamped to this range.
- Five equal intervals between six anchors.
- Each interval uses its own transition law, evaluated at the same oscillator phase as its endpoint anchors.
- Default value: **2.0**, preserving the existing saw sound for callers that do not opt into morphing.
- Shape behavior takes priority over parameter smoothing. Smoothing is out of scope for the first implementation.

Input handling:

- A finite value below 0 maps to 0; above 5 maps to 5.
- NaN maps to the saw anchor (2.0), providing deterministic compatibility behavior.
- Negative infinity maps to 0; positive infinity maps to 5.
- Apply the same rules in C and at the WASM/AudioWorklet boundary. Do not rely on a clamp operation to handle NaN.

## Shared phase model and shape equations

The current implementation computes, for wrapped phase $x\in[0,1)$ and fitted parameter $P$, a piecewise phase offset:

$$
\phi_{mod}(x,P)=
\begin{cases}
(\pi-2\pi P)\,x/P & x<P\\
(\pi-2\pi P)\,(1-x)/(1-P) & x\ge P
\end{cases}
$$

and returns:

$$
y_{saw}(x,P)=-\cos(2\pi x+\phi_{mod}(x,P)).
$$

The current $P(f)$ fit and exact floating-point operation order are part of the legacy behavior. This equation is a description of the existing saw path, not evidence that its fitted phase distortion is physically correct for other waveforms.

Before implementation, Phase 0 must propose explicit candidate equations for every non-saw anchor and transition. Investigate whether the angle $\theta=2\pi x+\phi_{mod}(x,P)$, or a normalized/wrapped representation derived from it, is a useful shared shape coordinate. Verify its periodicity, monotonicity, discontinuities, phase alignment, and behavior around $x=P$. Do not assume it can be used as a conventional ramp phase without proving those properties.

For each candidate shape and transition, document:

1. the exact equation and inputs;
2. how it relates to the shared representation;
3. phase alignment relative to the saw at reset;
4. polarity, peak-to-peak amplitude, and DC convention;
5. discontinuities and required anti-aliasing;
6. any parameters that are shape-specific rather than shared.

The Pekonen fit was developed for the saw. If it does not produce useful non-saw shapes, preserve the saw path and document separate calibrated transformations for the other shapes. Do not force all shapes or transitions through a common equation merely for architectural purity.

## Morphing behavior

For a sanitized waveform value $w$, select adjacent anchors $i=\lfloor w\rfloor$ and $i+1$, with local fraction $t=w-i$. At the upper endpoint, evaluate anchor 5 directly. Each interval has its own approved transition $M_i(\phi,t)$, evaluated without changing the oscillator's phase. Every transition must reproduce its exact endpoint anchors and meet the next interval without a value jump.

Do not assume one interpolation formula is suitable for every interval:

- For square to wide pulse, interpolate duty cycle as $d=0.5+0.25t$. For wide pulse to narrow pulse, use $d=0.75-0.5t$. These transitions must remain pulse waves at intermediate values; a sample-by-sample crossfade is a comparison candidate, not the default.
- For triangle to sharktooth, sharktooth to ramp, and ramp to square, compare an appropriate shape/phase parameterization with a sample-by-sample crossfade. Select a transition for each interval using listening and spectral measurements; do not presume the same method wins everywhere.
- Define phase alignment, polarity, amplitude, and DC convention for every anchor and transition before implementation. Otherwise morphs can cancel, change loudness, or shift DC unexpectedly.
- The wide-to-narrow pulse transition passes through 50% duty at its midpoint. This returns to the square's ideal harmonic-magnitude spectrum; it is an intentional consequence of preserving pulse shape, not a claim that the morph adds a new spectrum there.

Integer values must reproduce their anchor. At exactly 2.0, output must be bit-for-bit identical to the legacy saw path for equivalent inputs. The implementation must explicitly dispatch to the original calculation at this value; do not assume algebraically equivalent refactoring preserves floating-point results.

Changing waveform must not reset or jump oscillator phase. Preserve frequency, detune, hard-sync edge detection, sync event timing, reset behavior, and per-instance state.

## DSP architecture and aliasing

1. **Phase/state core:** retain the existing phase accumulator, frequency/detune handling, and generic hard-sync edge detection and fractional phase reset for every shape.
2. **Legacy saw path:** keep the existing fitted $P(f)$, moog_saw_waveform() and legacy process calculation unchanged wherever needed for bit-exact output.
3. **Shape functions:** implement only after Phase 0 has documented candidate equations and the anchor set is approved.
4. **Morph stage:** use the approved transition law for each adjacent anchor pair, retaining common phase and exact endpoint behavior.
5. **Band-limiting:** assess each newly introduced shape separately. Use PolyBLEP as a candidate for value discontinuities and PolyBLAMP as a candidate for slope discontinuities; compare them with band-limited tables where appropriate. Measure triangle aliasing rather than assuming it is negligible. A hard-sync phase reset uses the common event timing, but its output jump depends on the selected waveform and may need a waveform-dependent correction. Band-limit new-shape outputs before morphing so transitions do not blend unbandlimited discontinuities. Do not apply these corrections to the legacy saw path.
6. **Output:** retain the legacy saw's output convention. Any different normalization or DC treatment for new shapes must be explicit and justified.

PolyBLEP, PolyBLAMP, and band-limited tables are candidates for new shapes, not pre-approved choices. They must not silently replace or alter the Pekonen saw algorithm. Choose the strategy based on repeatable spectral measurements, audible artifacts and CPU cost.

### Required aliasing evaluation

For each anchor and selected intermediate morphs, render deterministic signals at multiple pitches and sample rates, including low notes, midrange, high notes, and near-Nyquist fundamentals. Compare each candidate against its own high-rate reference rendered and downsampled with a documented high-quality reference method. Measure one oscillator and the current maximum stress topology of 16 synth voices × 3 oscillator indices × 16 unison voices. Record the 128-frame render-quantum budget at each sample rate. Report:

- RMS error and peak error against that reference;
- alias energy relative to total signal energy, using a documented FFT/windowing and bin-classification method;
- spectral plots or machine-readable measurements;
- CPU cost per rendered sample/block.

Record the baseline legacy saw measurements separately. Do not impose an arbitrary pass threshold after seeing results: propose thresholds and their rationale in the implementation note before selecting the new-shape algorithm. Since no hardware reference is available, these are numerical/engineering comparisons, not proof of circuit accuracy.

## C API and compatibility

Use generic names for the implementation that processes all shapes. Keep waveform evaluation separate from phase, sync, and block-processing state:

- `packages/native/c/include/moog_oscillator.h` declares the generic public oscillator API.
- `packages/native/c/src/moog_oscillator.c` owns phase accumulation, frequency/detune, hard sync, and generic block processing.
- `packages/native/c/src/moog_waveforms.h` declares internal waveform evaluators.
- `packages/native/c/src/moog_waveforms.c` implements the legacy saw equation, other anchors, and per-interval morphs.
- Rename the private `moog_saw_math.h` helper header to `moog_oscillator_math.h`; use generic names for shared math constants and helpers.
- `packages/native/c/include/moog_saw.h` and `packages/native/c/src/moog_saw_compat.c` retain the existing saw-only C API as compatibility wrappers.

Name the generic opaque handle `MoogOscillator`. The generic block API accepts an optional per-sample waveform buffer:

```c
void moog_oscillator_process(
    MoogOscillator *osc,
    const float *frequency,
    const float *detune,
    const float *sync,
    const float *waveform,
    float *output,
    uint32_t frames);
```

- Preserve every existing `moog_saw_*` function signature and behavior. The legacy `moog_saw_process()` remains saw-only; it must not start selecting shapes implicitly.
- Add `moog_oscillator_*` C functions for the generic path. Legacy wrappers must preserve the existing saw calculation and exact operation order.
- The generic function's waveform pointer contract is unambiguous: when non-null, it points to at least `frames` readable floats; when null, render the legacy saw for the whole block. There is no one-float “constant buffer” convention.
- The generic oscillator API and the compatibility API use distinct opaque handle types; do not cast between unrelated handle types.
- If constant waveform control is needed, use an explicit scalar setter or a separately named scalar API. Do not add persistent waveform state unless that API or another persistence requirement justifies it.

## WASM and AudioWorklet integration

Use generic names through the bridge and processor as well:

- Rename the WASM bridge to `packages/native/c/src/moog_oscillator_wasm.c`; expose `moog_oscillator_wasm_*` wrappers for the generic API.
- Build `moog_oscillator.js`, `.wasm`, and `.d.ts`, and update the generated-module imports and WASM URL in the TypeScript package.
- Preserve existing `moog_saw_wasm_*` exports as saw-only compatibility wrappers.
- Register the worklet as `moog-oscillator-processor` and use that name when creating the `AudioWorkletNode`; `MoogOscillatorProcessor` and `MoogOscillatorWorkletNode` already have suitable generic names.
- Rename the generic C test and benchmark harness files to `test_moog_oscillator.*` and `bench_moog_oscillator.*`. Keep saw-specific test names for legacy compatibility coverage.
- Update the Makefile, `packages/native/c/BENCHMARKS.md`, `packages/native/README.md`, and TypeScript imports to use generic names for new behavior while retaining saw-specific names for legacy compatibility.

- Expose `moog_oscillator_process()` through the WASM bridge and export it from the build.
- Add a waveform AudioParam with range 0–5 and default 2.0. Use a-rate for per-sample automation.
- Reuse WASM heap buffers. No allocation, table construction, logging or expensive initialization in process().
- Handle scalar-length and per-sample AudioParam arrays consistently with existing frequency/detune code.
- Preserve multiple-instance isolation and the current render-quantum/buffer strategy.

## Acceptance criteria

- Existing C tests pass.
- Golden regression renders captured from the pre-change implementation match the legacy saw path bit-for-bit for the same inputs, including frequency changes and hard sync. If cross-platform libm behavior prevents portable byte comparisons, run the strict comparison on the same build/runtime and separately document cross-platform tolerance.
- waveform = 2.0 and a null waveform buffer both preserve the legacy saw output.
- All six anchors have approved, documented equations and defined phase/polarity/amplitude/DC conventions.
- Anchor and transition tests cover exact anchors, endpoints, half steps, and continuity under waveform automation.
- Pulse-width transitions remain pulse waves across their full intervals, follow the specified duty curves, and pass through 50%, 75%, and 25% at the anchors. The 75%-to-25% midpoint is 50% duty.
- Duty-cycle tests verify the 50%, 75%, and 25% square/pulse candidates at suitable phases and frequencies.
- Invalid and non-finite waveform values behave as specified in C and WASM.
- Aliasing measurements follow the reproducible procedure above and include the unchanged saw baseline.
- Generic hard-sync timing and phase reset are tested for every new shape; any selected waveform-dependent sync correction is tested separately. Legacy saw hard-sync renders remain bit-for-bit unchanged.
- Reset, frequency/detune changes, finite output, WASM pointer offsets/buffer lengths, multi-instance behavior and processing performance are tested.
- No allocations occur in the real-time render loop.
- WAVs are reviewed by ear and by waveform/spectrum inspection; subjective tuning is labelled as such.

## References

1. Sound On Sound, [“Moog Minimoog Model D”](https://www.soundonsound.com/reviews/moog-minimoog-model-d) — Model D selector family and oscillator-specific differences; Axiom intentionally uses a shared map.
2. Moog Music, [Minimoog Model D manual (PDF)](https://api.moogmusic.com/sites/default/files/2018-01/Minimoog_Model_D_Manual.pdf) — pulse/square/rectangle descriptions.
3. [Minimoog Model D technical service manual](https://manuals.plus/m/60a4fe7267f2c66ac033917355bd1b8ce2fea581c4dee57692fcfa047fa44ac5) — oscillator-board signal-path description; third-party-hosted scan.
4. Pekonen, Lazzarini, Timoney, Kleimola and Välimäki, [“Discrete-Time Modelling of the Moog Sawtooth Oscillator Waveform” (2011)](https://doi.org/10.1155/2011/785103) — saw-specific phase-distortion and spectral-matching models.

## Explicit non-goals

- Circuit-exact reconstruction of every Model D waveform.
- A separate pulse-width control.
- Parameter smoothing in the first implementation.
- Replacing or silently modifying the Pekonen saw algorithm.
- DSP implementation before approval of this proposal.
