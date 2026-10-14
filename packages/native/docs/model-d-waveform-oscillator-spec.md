# Model D-Inspired Continuous Waveform Oscillator — Specification

## Status

**Proposal only.** This document defines intended behavior and engineering constraints. No DSP implementation is authorized until the specification is approved.

## Goal

Extend Axiom's native Moog-inspired oscillator with a continuous control that moves through six Minimoog Model D-inspired waveform shapes. Prioritize convincing Moog character, phase continuity, compatibility with the existing Pekonen-based saw, and real-time-safe C/WASM execution.

This is an inspired digital model, not a claim of circuit-exact emulation. The original Model D offers discrete waveform selections; continuous morphing is an Axiom feature.

## Design premise

Treat the waveforms as related outputs of a shared oscillator/shape-generation model rather than six unrelated textbook oscillators. The existing Pekonen et al. saw model is the reference implementation and must remain intact at its saw anchor.

Do not assume that the final saw sample alone contains enough information to reconstruct the other waveforms. First inspect and factor the existing phase-distortion equation into a shared internal representation, then test whether shape-specific transformations of that representation produce useful triangle, sharktooth, square, and pulse shapes. The phase distortion was fitted to the saw, so other shapes may need separately calibrated transformations. Record any such deviations explicitly.

## User-visible parameter

- Name: **waveform**.
- Normalized range: 0.0 through 5.0, clamped at the native boundary.
- Five equal intervals between six anchors.
- The control is continuous; values between anchors interpolate adjacent shape outputs.
- Initially, shape behavior takes priority over parameter smoothing. Smoothing can be designed separately after the waveform model is validated.

| Value | Anchor | Notes |
| ---: | --- | --- |
| 0.0 | Triangle | Derived from the shared phase model; calibrate shape as needed. |
| 1.0 | Sharktooth | Asymmetric ramp-like shape; tune by ear and waveform inspection. |
| 2.0 | Sawtooth | Existing Pekonen output, unchanged. |
| 3.0 | Square | 50% duty-cycle anchor. |
| 4.0 | Wide pulse | Initial target duty cycle 75%; provisional Axiom value. |
| 5.0 | Narrow pulse | Initial target duty cycle 25%; provisional Axiom value. |

The 75%/25% pulse widths are starting design values, not asserted measurements of the original hardware. Keep them fixed for this feature; do not add an independent pulse-width control.

## Morphing behavior

For clamped waveform value w, select adjacent anchors i = floor(w) and i+1, with local fraction t = w-i. At the upper endpoint, use anchor 5 directly.

For adjacent anchor outputs y_i and y_(i+1), compute:

    y = (1 - t) * y_i + t * y_(i+1)

Both anchor values must be evaluated at the same oscillator phase. Integer settings must reproduce the corresponding anchor. At waveform = 2.0, output must be identical to the legacy saw path.

Do not reset or jump oscillator phase when the waveform changes. Preserve frequency, detune, hard-sync edge detection, sync event timing, reset behavior, and per-instance state.

## DSP architecture

1. **Phase/state core:** retain the current phase accumulator, frequency/detune handling, and hard-sync behavior.
2. **Shared phase-distortion representation:** inspect the current Pekonen equation and factor it only if the legacy saw can be preserved exactly. Keep the existing fitted P(f0) calculation.
3. **Shape functions:** implement candidate shapes using the shared representation where technically justified. Do not substitute unrelated ideal oscillators without documenting why.
4. **Morph stage:** linearly interpolate neighboring anchor outputs.
5. **Band-limiting:** assess aliasing per shape. Square/pulse and discontinuous sharktooth shapes require a band-limited strategy; triangle aliasing must also be measured. Apply appropriate band-limiting before morphing so morphing does not mix raw discontinuities.
6. **Output:** retain the existing normalized output convention unless listening and measurements justify a deliberate, documented change.

PolyBLEP or band-limited tables are candidates for newly introduced discontinuities, but must not silently replace or alter the existing Pekonen saw algorithm. Compare their spectral and perceptual behavior before choosing.

## C API and compatibility

Current API is declared in packages/native/c/include/moog_saw.h and implemented in packages/native/c/src/moog_saw.c. The WASM bridge is packages/native/c/src/moog_saw_wasm.c.

- Preserve all current exported signatures and legacy saw behavior.
- Add a backward-compatible extended block-processing function that accepts a per-sample waveform buffer, e.g. moog_saw_process_ex(..., const float *waveform, ...).
- Define null/constant-buffer semantics explicitly and consistently with the current API; do not introduce ambiguous optional pointer behavior.
- The old moog_saw_process() must remain a saw-only compatibility path and should not acquire a different sound through refactoring.
- A scalar setter or constant-parameter fast path may be added if it benefits the caller, but must share the same DSP implementation and tests.
- Do not add a waveform field to oscillator state unless a scalar setter or persistence requirement needs it. Per-sample waveform input alone does not require state storage.

Exact function signature should be finalized against the existing header during implementation, not copied blindly from this proposal.

## WASM / AudioWorklet integration

Relevant files include:

- packages/native/c/Makefile
- packages/native/c/src/moog_saw_wasm.c
- packages/native/src/wasm-holder.ts
- packages/native/src/nodes/moog-oscillator-worklet-node.ts
- packages/native/src/worker/moog-oscillator-processor.ts
- Existing native tests and generated WASM declarations.

Expose the extended native function through the WASM bridge and export it from the Emscripten build. Add a waveform AudioParam with range 0–5. Use a-rate to support per-sample automation; if the product later elects to expose only block-rate control, that is a separate UI/runtime decision, not a limitation of the DSP API.

Reuse WASM heap buffers. No allocation, waveform-table construction, logging, or expensive initialization in process(). Account for the current worklet's fixed-size buffers and render-quantum handling. Preserve multiple-instance isolation.

## Acceptance criteria

- Existing C tests and saw-render regressions pass.
- At waveform = 2.0, output matches the legacy saw output exactly for equivalent inputs, including frequency changes and hard sync.
- Six anchors are reachable at their defined values; pulse widths are fixed at their anchors.
- Intermediate settings interpolate adjacent outputs at a common phase.
- Changing waveform does not reset phase or corrupt sync state.
- Invalid/non-finite waveform values are handled deterministically and safely.
- Tests cover output range, waveform properties, high-frequency aliasing, WASM memory behavior, multi-instance state, and processing performance.
- No allocations occur in the real-time render loop.
- WAV renders at multiple pitches are reviewed by ear and with waveform/spectrum inspection. Since there is no hardware recording reference, document subjective tuning as such.

## Explicit non-goals

- Circuit-exact reconstruction of every Model D waveform.
- An independent pulse-width control.
- Parameter smoothing in the first implementation.
- Replacing the Pekonen saw algorithm.
- Implementing the DSP before this proposal is approved.
