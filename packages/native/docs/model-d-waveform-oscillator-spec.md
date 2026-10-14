# Model D-Inspired Continuous Waveform Oscillator — Specification

## Status and approval gate

**Proposal only.** This document defines constraints and decisions required before implementation. No DSP implementation is authorized until the user approves the specification.

## Goal and scope

Add an Axiom-specific continuous control across six oscillator-shape anchors, using the existing Pekonen et al. saw oscillator as an immutable compatibility reference. The goal is a convincing, phase-coherent Moog/Model D-inspired oscillator, not a claim of circuit-exact emulation.

The original instrument uses discrete waveform selections; continuous morphing is an Axiom feature. Without a hardware recording/reference waveform set, choices that cannot be established from reliable documentation must be labelled as design hypotheses and tuned by listening and measurement.

## Anchor set: provisional, must be resolved before implementation

The current proposal is:

| Value | Candidate anchor | Initial definition |
| ---: | --- | --- |
| 0.0 | Triangle | Candidate shape derived from a shared phase representation |
| 1.0 | Sharktooth | Provisional asymmetric ramp-like shape; not yet established as a Model D selector position |
| 2.0 | Sawtooth | Existing Pekonen output, unchanged |
| 3.0 | Square | 50% duty cycle |
| 4.0 | Wide pulse | 75% duty cycle; provisional Axiom choice |
| 5.0 | Narrow pulse | 25% duty cycle; provisional Axiom choice |

**Phase 0 must verify the intended reference waveform set before these anchors are frozen.** In particular, establish whether “sharktooth” is the intended shape or whether a reverse-saw / another documented Model D shape belongs in the set. Do not silently label an Axiom-invented shape as an original hardware waveform. If six anchors cannot faithfully represent the selected reference set, record the trade-off and obtain approval before implementation.

The 75%/25% duty cycles are starting design values, not asserted measurements of original hardware. Keep widths fixed for this feature; do not add a separate pulse-width control.

## User-visible parameter

- Name: **waveform**.
- Range: 0.0 through 5.0, with finite values clamped to this range.
- Five equal intervals between six anchors.
- Values between anchors linearly interpolate the two adjacent anchor outputs evaluated at the same oscillator phase.
- Default value: **2.0**, preserving the existing saw sound for callers that do not opt into morphing.
- Shape behavior takes priority over parameter smoothing. Smoothing is out of scope for the first implementation.

Input handling:
- A finite value below 0 maps to 0; above 5 maps to 5.
- NaN maps to the saw anchor (2.0), providing deterministic compatibility behavior.
- Negative infinity maps to 0; positive infinity maps to 5.
- Apply the same rules in C and at the WASM/AudioWorklet boundary. Do not rely on a clamp operation to handle NaN.

## Shared phase model and shape equations

The current implementation computes, for wrapped phase \(x\in[0,1)\) and fitted parameter \(P\), a piecewise phase offset:

\[
\phi_{mod}(x,P)=
\begin{cases}
(\pi-2\pi P)\,x/P & x<P\\
(\pi-2\pi P)\,(1-x)/(1-P) & x\ge P
\end{cases}
\]

and returns:

\[
y_{saw}(x,P)=-\cos(2\pi x+\phi_{mod}(x,P)).
\]

The current \(P(f)\) fit and exact floating-point operation order are part of the legacy behavior. This equation is a description of the existing saw path, not evidence that its fitted phase distortion is physically correct for other waveforms.

Before implementation, Phase 0 must propose explicit candidate equations for every non-saw anchor. Investigate whether the angle \(\theta=2\pi x+\phi_{mod}(x,P)\), or a normalized/wrapped representation derived from it, is a useful shared shape coordinate. Verify its periodicity, monotonicity, discontinuities, phase alignment, and behavior around \(x=P\). Do not assume it can be used as a conventional ramp phase without proving those properties.

For each candidate shape, document:
1. the exact equation and inputs;
2. how it relates to the shared representation;
3. phase alignment relative to the saw at reset;
4. polarity, peak-to-peak amplitude, and DC convention;
5. discontinuities and required anti-aliasing;
6. any parameters that are shape-specific rather than shared.

The Pekonen fit was developed for the saw. If it does not produce useful non-saw shapes, preserve the saw path and document a separate calibrated transformation for the other shapes. Do not force all shapes through a common equation merely for architectural purity.

## Morphing behavior

For a sanitized waveform value \(w\), select adjacent anchors \(i=\lfloor w\rfloor\) and \(i+1\), with local fraction \(t=w-i\). At the upper endpoint, evaluate anchor 5 directly.

\[
y=(1-t)y_i+t y_{i+1}
\]

Both anchor values must be evaluated at the same oscillator phase and with consistent normalization. Define anchor phase alignment, polarity, amplitude and DC convention before implementing interpolation; otherwise morphs can cancel, change loudness, or shift DC unexpectedly.

Integer values must reproduce their anchor. At exactly 2.0, output must be bit-for-bit identical to the legacy saw path for equivalent inputs. The implementation must explicitly dispatch to the original calculation at this value; do not assume algebraically equivalent refactoring preserves floating-point results.

Changing waveform must not reset or jump oscillator phase. Preserve frequency, detune, hard-sync edge detection, sync event timing, reset behavior, and per-instance state.

## DSP architecture and aliasing

1. **Phase/state core:** retain the existing phase accumulator, frequency/detune handling and hard-sync behavior.
2. **Legacy saw path:** keep the existing fitted \(P(f)\), moog_saw_waveform() and legacy process calculation unchanged wherever needed for bit-exact output.
3. **Shape functions:** implement only after Phase 0 has documented candidate equations and the anchor set is approved.
4. **Morph stage:** linearly interpolate adjacent, phase-aligned, consistently normalized outputs.
5. **Band-limiting:** assess each newly introduced shape separately. Square/pulse and any ramp discontinuities require an anti-aliasing strategy; measure triangle aliasing rather than assuming it is negligible. Band-limit shape outputs before morphing so interpolation does not blend unbandlimited discontinuities.
6. **Output:** retain the legacy saw's output convention. Any different normalization or DC treatment for new shapes must be explicit and justified.

PolyBLEP and band-limited tables are candidates for new shapes, not pre-approved choices. They must not silently replace or alter the Pekonen saw algorithm. Choose the strategy based on repeatable spectral measurements, audible artifacts and CPU cost.

### Required aliasing evaluation

For each anchor and selected intermediate morphs, render deterministic signals at multiple pitches and sample rates, including low notes, midrange, high notes, and near-Nyquist fundamentals. Compare each candidate against its own high-rate reference rendered and downsampled with a documented high-quality reference method. Report:
- RMS error and peak error against that reference;
- alias energy relative to total signal energy, using a documented FFT/windowing and bin-classification method;
- spectral plots or machine-readable measurements;
- CPU cost per rendered sample/block.

Record the baseline legacy saw measurements separately. Do not impose an arbitrary pass threshold after seeing results: propose thresholds and their rationale in the implementation note before selecting the new-shape algorithm. Since no hardware reference is available, these are numerical/engineering comparisons, not proof of circuit accuracy.

## C API and compatibility

Relevant files: packages/native/c/include/moog_saw.h, packages/native/c/src/moog_saw.c, and packages/native/c/src/moog_saw_wasm.c.

- Preserve all existing exported signatures and legacy saw behavior.
- Add a backward-compatible extended block-processing function accepting a per-sample waveform buffer, e.g. moog_saw_process_ex(..., const float *waveform, ...).
- The extended function's waveform pointer contract must be unambiguous: when non-null, it points to at least frames readable floats; when null, use the legacy saw behavior for the whole block. There is no one-float “constant buffer” convention.
- If constant waveform control is needed, use an explicit scalar setter or a separately named scalar API. Keep the existing API saw-only.
- Do not add persistent waveform state unless a scalar setter or persistence requirement justifies it.
- Finalize the exact signature against the header during implementation.

## WASM and AudioWorklet integration

Relevant files include packages/native/c/Makefile, packages/native/c/src/moog_saw_wasm.c, packages/native/src/wasm-holder.ts, packages/native/src/nodes/moog-oscillator-worklet-node.ts, packages/native/src/worker/moog-oscillator-processor.ts, and existing native/WASM tests.

- Expose the extended function through the WASM bridge and export it from the build.
- Add a waveform AudioParam with range 0–5 and default 2.0. Use a-rate for per-sample automation.
- Reuse WASM heap buffers. No allocation, table construction, logging or expensive initialization in process().
- Handle scalar-length and per-sample AudioParam arrays consistently with existing frequency/detune code.
- Preserve multiple-instance isolation and the current render-quantum/buffer strategy.

## Acceptance criteria

- Existing C tests pass.
- Golden regression renders captured from the pre-change implementation match the new legacy saw path bit-for-bit for the same inputs, including frequency changes and hard sync. If cross-platform libm behavior prevents portable byte comparisons, run the strict comparison on the same build/runtime and separately document cross-platform tolerance.
- waveform = 2.0 and a null waveform buffer both preserve the legacy saw output.
- All six anchors have approved, documented equations and defined phase/polarity/amplitude/DC conventions.
- Anchor and interpolation tests cover exact anchors, endpoints, half steps, and continuity under waveform automation.
- Duty-cycle tests verify the 50%, 75%, and 25% square/pulse candidates at suitable phases and frequencies.
- Invalid and non-finite waveform values behave as specified in C and WASM.
- Aliasing measurements follow the reproducible procedure above and include the unchanged saw baseline.
- Hard sync, reset, frequency/detune changes, finite output, WASM pointer offsets/buffer lengths, multi-instance behavior and processing performance are tested.
- No allocations occur in the real-time render loop.
- WAVs are reviewed by ear and by waveform/spectrum inspection; subjective tuning is labelled as such.

## Explicit non-goals

- Circuit-exact reconstruction of every Model D waveform.
- A separate pulse-width control.
- Parameter smoothing in the first implementation.
- Replacing or silently modifying the Pekonen saw algorithm.
- DSP implementation before approval of this proposal.
