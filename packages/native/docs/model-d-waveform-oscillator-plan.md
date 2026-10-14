# Model D-Inspired Continuous Waveform Oscillator — Implementation Plan

This plan is gated on approval of model-d-waveform-oscillator-spec.md. Do not start implementation until approval is given.

## Phase 0 — Baseline and model investigation

1. Read packages/native/c/src/moog_saw.c, packages/native/c/include/moog_saw.h, packages/native/c/tests/test_moog_saw.c, and packages/native/c/Makefile.
2. Capture the current C test results and deterministic saw renders at representative frequencies, including frequency modulation and hard sync.
3. Analyze the exact Pekonen equation and identify a shared phase-distortion representation that can be extracted without changing the legacy saw's floating-point operation order or output.
4. Record the proposed derivation for each non-saw anchor. Treat triangle/sharktooth/pulse derivations as hypotheses to validate, not established circuit facts.
5. Produce a short implementation note describing the candidate equations and alias-control approach before committing DSP changes.

**Gate:** demonstrate that the proposed phase-core refactor can preserve the legacy saw, or keep the original saw function as a separate path if exact preservation cannot be guaranteed.

## Phase 1 — Native C shape core

1. Add shape-generation helpers in C, using the shared phase representation where justified.
2. Keep the current moog_saw_p(), moog_saw_waveform(), and legacy moog_saw_process() behavior stable.
3. Implement the six anchors and clamp the waveform parameter to 0–5.
4. Add the extended processing API with a per-sample waveform buffer. Specify null/constant semantics in the header.
5. Implement adjacent-anchor interpolation at a common phase; ensure anchor 2 dispatches to the existing saw output without a changed calculation.
6. Preserve current frequency, detune, hard-sync, and reset semantics.

**Tests:** legacy regression; exact saw anchor; anchor selection; clamping; shape invariants; pulse duty cycle; morph endpoints and midpoints; phase continuity; sync behavior; finite output.

## Phase 2 — Band-limiting and sound validation

1. Render each anchor and half-step morph positions at several frequencies and sample rates.
2. Inspect waveform shape and spectrum, including frequencies near Nyquist.
3. Compare candidate band-limiting methods for discontinuous shapes (e.g. PolyBLEP or band-limited tables).
4. Do not alter the legacy saw's anti-aliasing behavior as part of this phase unless a separate change is explicitly approved.
5. Listen for clicks, unexpected level jumps, and implausible timbral transitions. Tune sharktooth asymmetry and pulse anchor values by ear; record these as subjective choices without hardware-reference claims.

**Gate:** document the chosen algorithm and the trade-offs before integrating it into WASM.

## Phase 3 — WASM bridge and build

1. Add the extended wrapper in packages/native/c/src/moog_saw_wasm.c.
2. Update the exported function list and dependencies in packages/native/c/Makefile.
3. Regenerate or update the generated TypeScript declaration as required by the build.
4. Add a WASM-level test for exported function availability, finite output, correct pointer offsets, and buffer lengths.
5. Confirm legacy WASM callers still work.

## Phase 4 — AudioWorklet integration

1. Add a 0–5 waveform AudioParam to MoogOscillatorProcessor.parameterDescriptors; use a-rate.
2. Add a reusable WASM heap buffer for waveform values and release it in the existing teardown path.
3. Populate the buffer from AudioParam values, handling both scalar-length and per-sample arrays consistently with frequency/detune handling.
4. Call the extended WASM function and copy the output using the existing buffer strategy.
5. Expose waveform on MoogOscillatorWorkletNode as an AudioParam getter.
6. Verify lifecycle, destruction, and multi-instance behavior. Do not allocate in the render loop.

## Phase 5 — Verification and review

1. Run the native C tests, native TypeScript tests, WASM build, project build, lint/format checks, and relevant full test suite.
2. Benchmark render time at 44.1 kHz and 48 kHz, with static shapes and automated morphing.
3. Review the generated WAV set and spectra; attach findings to the PR.
4. Review the diff for backward compatibility, real-time allocations, duplicate shape work, and unintended changes to the saw.
5. Update this plan with completed items and any deviations from the approved spec.

## Proposed commit/PR structure after approval

- Keep this design/specification PR separate from DSP implementation.
- After approval, implement on a new branch based on the agreed native branch, with commits grouped by native DSP, anti-aliasing, WASM, worklet integration, and tests as useful.
- Do not merge either the documentation PR or the implementation PR without explicit user approval.
