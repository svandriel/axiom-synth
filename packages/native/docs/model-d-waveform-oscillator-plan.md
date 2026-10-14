# Model D-Inspired Continuous Waveform Oscillator — Implementation Plan

This plan is gated on approval of model-d-waveform-oscillator-spec.md. Do not start DSP implementation until approval is given. This plan adds decision and measurement gates to prevent implementing unverified waveform assumptions.

## Phase 0 — Baseline, reference waveform set, and model investigation

1. Read packages/native/c/src/moog_saw.c, packages/native/c/include/moog_saw.h, packages/native/c/tests/test_moog_saw.c, and packages/native/c/Makefile.
2. Capture the current C test results and deterministic golden saw renders at representative frequencies, including frequency modulation and hard sync. Preserve exact inputs and build/runtime details so the legacy path can be regression-tested.
3. Resolve the intended six-anchor set. Verify whether sharktooth is a documented/intended Model D waveform or whether reverse saw / another shape is more appropriate. Label any Axiom-specific addition explicitly; do not claim hardware authenticity without evidence. Record the final proposed anchors and rationale for approval before implementation.
4. Analyze the exact Pekonen equation and document the candidate shared representation: wrapped phase x, fitted P(f), phase offset, and theta = 2*pi*x + phi_mod. Check periodicity, monotonicity, discontinuities, and behavior at x = P; do not assume theta is a valid conventional phase coordinate.
5. Write explicit candidate equations for every non-saw anchor. For each, document phase alignment, polarity, amplitude, DC convention, shape-specific parameters, and discontinuities. Treat these as hypotheses, not circuit facts. If the shared representation is unsuitable, propose a separate transformation while preserving the saw path.
6. Define waveform sanitization consistently: finite values clamp to 0–5, NaN selects anchor 2.0, negative infinity selects 0, and positive infinity selects 5. Define the extended C API pointer contract: non-null waveform points to at least frames values; null means legacy saw for the block. A scalar/constant control, if needed, must use a distinct API.
7. Establish the reproducible aliasing measurement method: deterministic pitch/sample-rate matrix; documented high-rate reference and downsampling method; FFT windowing/bin classification; RMS/peak error; alias energy ratio; and CPU cost. Propose acceptance thresholds and rationale before choosing the new-shape algorithm.
8. Produce a short implementation note containing the resolved anchor proposal, equations, normalization conventions, aliasing method/threshold proposal, and known limitations.

**Gate 0:** stop for review of the anchor set and candidate equations before any DSP code changes. The user must approve the specification and implementation direction.

## Phase 1 — Native C shape core

1. Implement only the approved anchor set and equations.
2. Keep the existing fitted P calculation, saw waveform calculation, and legacy process path unchanged wherever required for bit-exact output.
3. Add new shape helpers using the shared representation only where Phase 0 validates it.
4. Sanitize waveform input as specified and clamp finite values to 0–5.
5. Implement adjacent-anchor interpolation with common phase and approved normalization. Explicitly dispatch waveform = 2.0 to the unchanged legacy saw calculation.
6. Add the extended processing API with a per-sample waveform buffer. A null buffer means legacy saw for the whole block; a non-null buffer must contain at least frames values. Do not treat a one-value pointer as a constant buffer.
7. Preserve frequency, detune, hard-sync edge detection, sync timing, reset behavior, and per-instance state.

**Tests:**
- Pre-change golden renders and same-runtime bit-for-bit legacy regression, including hard sync and changing frequency.
- Existing API and null extended-buffer path match the legacy saw.
- Each anchor, anchor endpoints, interpolation midpoints, and clamping.
- NaN and both infinities follow the specified policy.
- Shape-specific invariants, phase alignment, polarity, amplitude, DC convention, and pulse duty cycles.
- Waveform automation does not reset phase or alter sync state.
- Output remains finite for supported input ranges.

## Phase 2 — Band-limiting and sound validation

1. Render all anchors and selected half-step morphs at low, midrange, high, and near-Nyquist fundamentals, at multiple sample rates.
2. Compare candidate output to a documented high-rate reference/downsampling procedure. Report RMS error, peak error, alias-energy ratio, spectra, and CPU cost.
3. Record the unchanged legacy saw baseline independently. Do not modify its anti-aliasing as part of this feature.
4. Compare PolyBLEP, band-limited tables, or other justified approaches for new shapes. Select based on measurements and listening, not assumption.
5. Listen for clicks, phase discontinuities, DC/level jumps, and implausible timbral transitions. Tune any subjective asymmetry and pulse values, clearly labelling choices as subjective in the absence of a hardware reference.

**Gate 2:** document results against the predeclared metrics and proposed thresholds. Review the algorithm and trade-offs before integrating into WASM.

## Phase 3 — WASM bridge and build

1. Add the extended wrapper in packages/native/c/src/moog_saw_wasm.c.
2. Update exported symbols and dependencies in packages/native/c/Makefile.
3. Regenerate or update TypeScript declarations as required by the build.
4. Add WASM-level tests for exported function availability, finite output, pointer offsets, frame lengths, null-buffer behavior, and the waveform sanitization policy.
5. Confirm legacy WASM callers and outputs remain unchanged.

## Phase 4 — AudioWorklet integration

1. Add a waveform AudioParam to MoogOscillatorProcessor.parameterDescriptors with minValue 0, maxValue 5, defaultValue 2, and automationRate a-rate.
2. Add a reusable WASM heap buffer for per-sample waveform values and release it in the existing teardown path.
3. Populate the buffer from AudioParam values, handling scalar-length and per-sample arrays consistently with frequency/detune handling.
4. Call the extended WASM function and copy output using the existing buffer strategy.
5. Expose waveform on MoogOscillatorWorkletNode as an AudioParam getter.
6. Verify lifecycle, destruction, multi-instance isolation, render-quantum handling, and absence of allocation or expensive setup in process().

## Phase 5 — Verification and review

1. Run native C tests, native TypeScript tests, WASM build, project build, lint/format checks, and relevant full test suite.
2. Benchmark at 44.1 kHz and 48 kHz with static anchors and automated morphing.
3. Attach deterministic WAV renders, spectra, metric results, and listening notes to the implementation PR.
4. Review for API compatibility, real-time allocations, duplicate shape work, non-finite handling, and unintended saw changes.
5. Update this plan with completed items and deviations from the approved spec.

## Proposed commit/PR structure after approval

- Keep this design/specification PR separate from DSP implementation.
- After approval, implement on a new branch based on the agreed native branch, with commits grouped by native DSP, anti-aliasing, WASM, worklet integration, and tests as useful.
- Do not merge either the documentation PR or the implementation PR without explicit user approval.
