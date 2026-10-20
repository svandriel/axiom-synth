# Model D-Inspired Continuous Waveform Oscillator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a continuous six-anchor waveform parameter to the native oscillator, with useful phase-coherent transitions and no change to legacy saw output.

**Architecture:** Move phase, frequency, detune, and hard-sync state into a generic `MoogOscillator` core. Keep waveform equations and transition logic in a separate waveform module. Preserve the old `moog_saw_*` C/WASM APIs as saw-only compatibility wrappers, while routing new AudioWorklet processing through generic names.

**Tech Stack:** C11, Emscripten/WebAssembly, TypeScript AudioWorklet, Vitest, Make.

**Spec:** [../specs/2026-10-19-model-d-waveform-oscillator-design.md](../specs/2026-10-19-model-d-waveform-oscillator-design.md)

## Global Constraints

- Use the same six anchors for all three Axiom oscillators: 0 triangle, 1 sharktooth, 2 legacy saw, 3 square (50%), 4 wide pulse (75%), 5 narrow pulse (25%).
- The AudioParam is `waveform`, range `0.0` through `5.0`, default `2.0`, and automation rate `a-rate`; do not add smoothing.
- Clamp finite values to `[0, 5]`; map NaN to `2`, negative infinity to `0`, and positive infinity to `5`.
- Keep five equal parameter intervals, but choose a transition law per interval. Pulse duty is $d=0.5+0.25t$ for square→wide and $d=0.75-0.5t$ for wide→narrow; the latter passes through 50% at its midpoint.
- At waveform `2.0`, render the existing Pekonen saw bit-for-bit, including frequency changes and hard sync. Never apply new BLEP/BLAMP corrections to the legacy saw path.
- Preserve all existing `moog_saw_*` and `moog_saw_wasm_*` signatures and saw-only behavior. The generic and compatibility C APIs use distinct opaque handle types.
- A null waveform pointer means legacy saw for the whole block. A non-null waveform pointer addresses at least `frames` values; never treat a one-value pointer as a constant buffer.
- Keep hard-sync detection and fractional phase reset in the shared oscillator core. Test every new shape under sync; use shape-specific correction only if the selected anti-aliasing method requires it.
- This phase adds the native, WASM, and AudioWorklet parameter only. Do not change app UI, `OscillatorConfig`, `AxiomSynth` state, or persistence.
- `AudioWorkletProcessor.process()` must not allocate memory, build tables, log, or perform expensive initialization.

## Review Focus

- **Non-finite and out-of-range waveform values:** C and WASM must clamp/map values identically; test finite bounds, NaN, and both infinities in Tasks 3 and 5.
- **Pulse transition shape and endpoints:** transitions must remain pulses, hit 50%/75%/25% at the anchors, and pass through 50% at the 75%→25% midpoint; test in Task 3.
- **Phase and sync continuity:** waveform automation must not reset phase, and generic fractional hard sync must work on each new shape while legacy saw remains exact; test in Tasks 1, 3, and 4.
- **AudioParam buffer shape:** scalar-length and per-sample arrays, including output lengths that differ from the usual render quantum, must fill only valid frames; test in Task 6.
- **WASM memory and lifecycle:** pointer offsets, per-instance buffers, repeated create/destroy, and teardown must not leak or alias; test in Tasks 5 and 6.

---

## File Map

- `packages/native/c/include/moog_oscillator.h`: generic C API and opaque handle.
- `packages/native/c/src/moog_oscillator.c`: shared phase, frequency, detune, sync, and block-processing core.
- `packages/native/c/src/moog_waveforms.h` and `moog_waveforms.c`: internal anchor equations, morphs, and new-shape anti-aliasing.
- `packages/native/c/src/moog_oscillator_math.h`: generic phase/trig/detune helpers, renamed from `moog_saw_math.h`.
- `packages/native/c/include/moog_saw.h` and `packages/native/c/src/moog_saw_compat.c`: preserved saw-only C API.
- `packages/native/c/src/moog_oscillator_wasm.c`: generic WASM wrappers and retained saw compatibility exports.
- `packages/native/src/worker/moog-oscillator-processor.ts` and `worker.ts`: generic AudioWorklet processing and registration.
- `packages/native/src/nodes/moog-oscillator-worklet-node.ts`: generic worklet node wrapper and AudioParam getter.
- `packages/native/c/Makefile`, native C/TypeScript tests, `BENCHMARKS.md`, and `README.md`: build, verification, and package documentation.

## Task 1: Capturing the Legacy Saw Baseline

**Files:**

- Modify: `packages/native/c/tests/test_moog_saw.c`
- Create: `packages/native/c/tests/fixtures/legacy-saw-golden.h`

**Interfaces:**

- Consumes: Existing `moog_saw_*` API and C test harness.
- Produces: Fixed expected float bit patterns and deterministic input vectors used by the compatibility tests in later tasks.

- [ ] **Step 1: Capture golden output before changing the implementation**

Call `moog_saw_init()` before each oscillator creation, set a known phase with `moog_saw_reset()`, and capture output bits for:

- 64 frames at 48 kHz with constant 440 Hz;
- 64 frames with a fixed per-sample frequency sequence and detune;
- a fractional sync crossing followed by another sync event.

Store the expected `uint32_t` float bit patterns and exact inputs in `legacy-saw-golden.h`.

- [ ] **Step 2: Add named golden regression tests**

Add `test_legacy_saw_golden_static`, `test_legacy_saw_golden_frequency_detune`, and `test_legacy_saw_golden_fractional_sync` to `test_moog_saw.c`. Assert exact output bits and final phase for each case.

- [ ] **Step 3: Run the native C tests against the unchanged implementation**

Run: `make test -C packages/native/c`

Expected: PASS, including all three golden tests.

- [ ] **Step 4: Commit the baseline fixtures and tests**

```bash
git add packages/native/c/tests
git commit -m "test(native): capture legacy saw output"
```

## Task 2: Resolving Equations and Measurement Criteria

**Files:**

- Create: `docs/superpowers/specs/2026-10-19-model-d-waveform-oscillator-implementation-notes.md`
- Read: `packages/native/c/src/moog_saw.c`
- Read: `packages/native/c/src/moog_saw_math.h`
- Read: `packages/native/c/BENCHMARKS.md`

**Interfaces:**

- Consumes: Approved design in the spec and the golden inputs from Task 1.
- Produces: Approved equations, waveform-helper signatures, normalization/phase rules, test invariants, anti-aliasing method, and predeclared measurement thresholds for Tasks 3–4.

- [ ] **Step 1: Analyze the existing saw phase transform**

Document the exact legacy $P(f)$ and waveform operation order. Evaluate the candidate $\theta$ representation for periodicity, monotonicity, phase alignment, and behavior at $x=P$; reject it as a shared phase coordinate if it fails those checks.

- [ ] **Step 2: Define every anchor and interval transition**

Give exact candidate equations for triangle, sharktooth, square, 75% pulse, and 25% pulse. Define phase origin, polarity, amplitude, DC convention, and discontinuities. Define all five transition laws; retain the approved duty curves for square→wide and wide→narrow pulse. Specify the exact internal function signatures in `moog_waveforms.h`.

- [ ] **Step 3: Define test invariants and alias measurements before selecting an algorithm**

Specify periodicity, symmetry/asymmetry, phase landmarks, peak-to-peak level, DC, and pulse-duty assertions. Define the pitch/sample-rate matrix, high-rate reference and downsampling method, FFT window/bin classification, RMS and peak error, alias-energy ratio, CPU cost, and a rationale for proposed thresholds.

- [ ] **Step 4: Record sync and anti-aliasing decisions**

Keep sync edge detection and fractional reset in the generic core. Describe how candidate PolyBLEP/PolyBLAMP or table methods handle waveform edges and sync discontinuities; explicitly exempt the exact legacy saw path from new corrections.

- [ ] **Step 5: Stop for approval before DSP implementation**

Review the implementation note with the user. Expected: approval of equations, helper interfaces, and proposed metrics before starting Tasks 3–4.

## Task 3: Implementing the Generic Native Core and Waveforms

**Files:**

- Create: `packages/native/c/include/moog_oscillator.h`
- Move: `packages/native/c/src/moog_saw.c` to `packages/native/c/src/moog_oscillator.c`
- Create: `packages/native/c/src/moog_waveforms.h`
- Create: `packages/native/c/src/moog_waveforms.c`
- Create: `packages/native/c/src/moog_saw_compat.c`
- Move: `packages/native/c/src/moog_saw_math.h` to `packages/native/c/src/moog_oscillator_math.h`
- Modify: `packages/native/c/include/moog_saw.h`
- Modify: `packages/native/c/tests/test_moog_saw.c`
- Create: `packages/native/c/tests/test_moog_oscillator.c`
- Create: `packages/native/c/tests/test_moog_waveforms.c`
- Move: `packages/native/c/tests/test_moog_saw_math.c` to `packages/native/c/tests/test_moog_oscillator_math.c`
- Modify: `packages/native/c/Makefile`

**Interfaces:**

- Consumes: Approved `moog_waveforms.h` signatures and equations from Task 2; golden fixtures from Task 1.
- Produces:

  ```c
  typedef struct MoogOscillator MoogOscillator;

  MoogOscillator *moog_oscillator_create(double sample_rate);
  void moog_oscillator_destroy(MoogOscillator *osc);
  void moog_oscillator_reset(MoogOscillator *osc, double phase);
  void moog_oscillator_set_frequency(MoogOscillator *osc, float frequency_hz);
  double moog_oscillator_phase(const MoogOscillator *osc);
  void moog_oscillator_process(
      MoogOscillator *osc,
      const float *frequency,
      const float *detune,
      const float *sync,
      const float *waveform,
      float *output,
      uint32_t frames);
  ```

- [ ] **Step 1: Write failing anchor and API tests**

Add tests named `test_waveform_anchor_values`, `test_waveform_periodicity_and_level`, `test_pulse_duty_cycles`, `test_waveform_value_sanitization`, `test_waveform_automation_preserves_phase`, `test_generic_instance_state_isolation`, and `test_generic_process_null_waveform_uses_saw`. Assert exact anchor dispatch, approved shape invariants, 50%/75%/25% duty, finite clamping, NaN→2, infinities→endpoints, unchanged phase progression under waveform automation, independent phase state for two handles, and exact equality with the legacy saw when the buffer is null or every value is 2.

- [ ] **Step 2: Run targeted native tests and confirm the new tests fail**

Run: `make test -C packages/native/c`

Expected: FAIL only on the new generic API/shape tests because the generic symbols do not exist yet.

- [ ] **Step 3: Extract generic oscillator state and preserve the legacy API**

Move phase, frequency, detune, and sync processing into `moog_oscillator.c`. Implement the opaque `MoogSaw` compatibility handle in `moog_saw_compat.c`; keep existing `moog_saw_*` declarations and behavior saw-only, with no casts between opaque handle types.

- [ ] **Step 4: Implement approved shape and morph helpers**

Implement the equations and five interval transitions from the approved implementation note in `moog_waveforms.c`. Keep the legacy saw expression and floating-point operation order unchanged; explicitly dispatch value 2 to that path.

- [ ] **Step 5: Run native C tests**

Run: `make test -C packages/native/c`

Expected: PASS for generic anchor tests, waveform invariants, null-buffer compatibility, and all legacy golden vectors.

- [ ] **Step 6: Commit the generic native API**

```bash
git add packages/native/c
git commit -m "feat(native): add generic oscillator waveform core"
```

## Task 4: Band-Limiting and Sync Validation

**Files:**

- Modify: `packages/native/c/src/moog_waveforms.c`
- Modify: `packages/native/c/src/moog_oscillator.c`
- Modify: `packages/native/c/tests/test_moog_waveforms.c`
- Modify: `packages/native/c/tests/test_moog_oscillator.c`
- Rename: `packages/native/c/tests/bench_moog_saw.c` to `packages/native/c/tests/bench_moog_oscillator.c`
- Rename generated benchmark outputs from `bench_moog_saw` to `bench_moog_oscillator` in `packages/native/c/Makefile` (`dist/native/` and `dist/bench/`).
- Modify: `packages/native/c/Makefile`
- Modify: `packages/native/c/BENCHMARKS.md`

**Interfaces:**

- Consumes: Approved anti-aliasing procedure and thresholds from Task 2; generic oscillator and waveform APIs from Task 3.
- Produces: Measured band-limited new-shape path, with the existing legacy saw output untouched.

The periodic-shape oracle is the converged Fourier reference in the
implementation note, not the failed $32\times/64\times$ FIR procedure. Keep periodic
free-running evaluation unblocked. Evaluate sync-reference and any required
sync-correction work using the approved $T=3/(2f)$ event cadence: the
free-running phase advances $1.5$ oscillator cycles between resets, with
coherent-cycle bin $m$ a multiple of $3$ and $J=2m/3$ event periods in each
$N=65{,}536$-sample record. Use the event-aware Fourier reference and the
fractional-sample phases plus integer-alignment controls specified in the
implementation note. Keep the committed sync tests and benchmark rename
unchanged. Do not relax any existing RMS, peak, reference-residual, or CPU
threshold.

**Qualification checkpoint (2026-10-20):** The generic zero-sample sync
fix improved the full event-aware matrix from 817/1,155 to 1,045/1,155.
Only saw morphs `1.5`/`2.5` and narrow pulse `5.0` still fail. A numerical
event-split sinc filter at the approved 84-sample latency clears selected
failing cases, but is not yet realtime-capable. The 768-oscillator stress
measurement also exceeds the fixed $\le90\%$ deadline for the unchanged
legacy saw baseline. Measurements, machine, date, and the base commit
appear in the implementation note; the source remains uncommitted. A
subsequent 688/1,155 result used a renderer accidentally built without
the deterministic RNG flag; its oscillator drift invalidates that run.
With deterministic drift, the smoke matrix passes 8/8 and the full
matrix reproduces 1,045/1,155; the remaining 110 cases still block Task 4.
The generic WASM bridge and worklet parameter were committed together
in `6f8219a` because the module rename and worklet consumer share a build
boundary. A follow-up saw startup parity test is in `6bebca2`. Their
release still depends on Task 4.

Before treating Tasks 5–7 as complete:

1. Retain the generic zero-crossing regression and legacy saw bit parity.
   Add a varying-frequency regression for natural-edge detection: the
   preceding phase interval must use the increment actually traversed,
   including around sync. Recheck the full periodic and event-aware
   matrices after each DSP change.
2. Prototype a bounded-cost filter that reproduces the event-split sinc
   result for arbitrary fractional resets and changing sync cadence. Do
   not ship a fixed-cadence Fourier shortcut or direct quadrature in the
   audio render loop.
3. Measure worst-case native and WASM costs for all shapes and the specified
   stress topology. Reject candidates that miss any unchanged spectral
   gate or deadline; document a measured tradeoff for approval if no
   candidate can meet the existing deadline.

- [ ] **Step 1: Add failing signal and sync tests**

Add `test_new_shapes_are_finite_near_nyquist`, `test_sync_phase_reset_for_each_anchor`, and `test_sync_fractional_event_output`. Verify finite output, identical common phase-reset timing for every shape, and shape-appropriate output around the reset.

- [ ] **Step 2: Compare candidate anti-aliasing methods**

For free-running records, render the approved anchors and selected half-step morphs over the approved pitch/sample-rate matrix and compare PolyBLEP for value jumps and PolyBLAMP for slope jumps against the Fourier oracle. Evaluate hard-sync records against the separate event-aware Fourier reference and the $T=3/(2f)$ schedule; do not substitute free-running coefficients. Measure the $16\times3\times16$ stress topology as well as one oscillator for each evaluation.

- [ ] **Step 3: Select and implement the measured new-shape method**

Compare periodic results against the unchanged thresholds declared in Task 2. Apply corrections only to new shapes; do not alter legacy saw code or golden output. Add waveform-dependent sync correction only if the event-aware measurements on the $T=3/(2f)$ schedule require it. Compare event-aware results against those same unchanged thresholds; do not relax a threshold.

- [ ] **Step 4: Verify pulse transitions and legacy sync**

Run native tests and benchmark. Expected: pulse duty follows the approved curves, all new shapes pass the committed sync tests, legacy golden sync vectors remain bit-exact, and measured results meet or document deviations from the predeclared thresholds. Do not change or recapture the committed sync tests or repeat the benchmark rename as part of this reference-method revision.

Run: `make test -C packages/native/c && make bench -C packages/native/c`

- [ ] **Step 5: Record benchmark and listening evidence**

Update `BENCHMARKS.md` with environment, per-sample/block cost, alias metrics, and legacy saw baseline. Record deterministic WAV locations and listening/spectrum notes in the implementation note.

- [ ] **Step 6: Commit anti-aliasing results**

```bash
git add packages/native/c docs/superpowers/specs/2026-10-19-model-d-waveform-oscillator-implementation-notes.md
git commit -m "feat(native): band-limit new oscillator shapes"
```

## Task 5: Renaming and Extending the WASM Bridge

**Files:**

- Move: `packages/native/c/src/moog_saw_wasm.c` to `packages/native/c/src/moog_oscillator_wasm.c`
- Modify: `packages/native/c/Makefile`
- Modify: `packages/native/src/wasm-holder.ts`
- Modify: `packages/native/src/worker/initiate-module.ts`
- Create: `packages/native/c/tests/test_moog_oscillator_wasm.c`

**Interfaces:**

- Consumes: Generic C API from Task 3 and selected shape behavior from Task 4.
- Produces: `moog_oscillator_wasm_*` wrappers and `moog_oscillator.js`, `.wasm`, `.d.ts`; old `moog_saw_wasm_*` exports continue to call only the compatibility API.

- [x] **Step 1: Add failing bridge tests**

Test generic create/destroy/reset/frequency/process calls, null waveform behavior, clamping and non-finite sanitization through the WASM wrappers. Verify the compatibility WASM process still matches legacy golden output.

- [x] **Step 2: Add generic and compatibility wrappers**

Implement `moog_oscillator_wasm_*` wrappers around the generic API and retain `moog_saw_wasm_*` wrappers around the saw-only compatibility API. Export both symbol sets from the build.

- [x] **Step 3: Rename generated module and TypeScript imports**

Generate `c/dist/wasm/moog_oscillator.js`, `.wasm`, and `.d.ts`; update module imports and the WASM URL. Remove obsolete generated `moog_saw` artifacts only after all consumers use the generic module.

- [x] **Step 4: Run WASM build and bridge tests**

Run: `pnpm --filter @axiom/native build`

Expected: PASS; generated types expose the generic wrappers and the compatibility exports remain present.

- [x] **Step 5: Commit the WASM bridge**

```bash
git add packages/native/c packages/native/src
git commit -m "feat(native): expose generic oscillator through wasm"
```

## Task 6: Integrating the AudioWorklet Parameter

**Files:**

- Modify: `packages/native/src/worker/moog-oscillator-processor.ts`
- Modify: `packages/native/src/worker/worker.ts`
- Modify: `packages/native/src/worker/moog-oscillator-processor.test.ts`
- Modify: `packages/native/src/nodes/moog-oscillator-worklet-node.ts`
- Modify: `packages/native/src/nodes/moog-oscillator-worklet-node.test.ts`

**Interfaces:**

- Consumes: Generic WASM exports from Task 5.
- Produces: Worklet registration `moog-oscillator-processor`, a waveform AudioParam, and `MoogOscillatorWorkletNode.waveform: AudioParam`. Do not add waveform state to app/synth configuration.

- [x] **Step 1: Add failing processor descriptor and buffer tests**

Assert descriptor `name: 'waveform'`, `minValue: 0`, `maxValue: 5`, `defaultValue: 2`, `automationRate: 'a-rate'`. Test scalar-length and per-sample waveform arrays at both normal 128-frame and shorter output lengths; verify the heap buffer uses its non-zero pointer offset and only current output frames are copied.

- [x] **Step 2: Add waveform WASM buffer lifecycle**

Allocate one reusable waveform heap buffer during WASM initialization, populate only the current output frame count, pass its pointer to `moog_oscillator_wasm_process`, and free it through the existing idempotent teardown path. Do not add sync AudioParam exposure in this feature.

- [x] **Step 3: Rename processor registration and expose the AudioParam**

Register and construct the worklet as `moog-oscillator-processor`. Add the `waveform` getter to `MoogOscillatorWorkletNode`; leave its existing lifecycle behavior unchanged.

- [x] **Step 4: Verify real-time and lifecycle tests**

Run: `pnpm --filter @axiom/native test:js`

Expected: PASS for registration, descriptors, scalar/per-sample array copying, pointer argument order and offsets, output copying, no malloc calls during `process()`, destroy-before-init, cleanup, and no use-after-destroy.

- [x] **Step 5: Commit worklet integration**

```bash
git add packages/native/src
git commit -m "feat(native): add waveform AudioParam to oscillator worklet"
```

## Task 7: Updating Documentation and Running Final Verification

**Files:**

- Modify: `packages/native/README.md`
- Modify: `packages/native/c/BENCHMARKS.md`
- Modify: `docs/superpowers/specs/2026-10-19-model-d-waveform-oscillator-implementation-notes.md`
- Modify: `docs/superpowers/plans/2026-10-19-model-d-waveform-oscillator.md`

**Interfaces:**

- Consumes: Implemented generic native/WASM/AudioWorklet API and recorded measurements from Tasks 3–6.
- Produces: Package documentation, completed measurements, and a plan annotated with actual deviations.

- [x] **Step 1: Update package documentation**

Describe the generic oscillator and waveform module as the package's current native primitive. Document the saw-only compatibility API and generic WASM module names.

- [ ] **Step 2: Run focused and full verification**

Run:

```bash
make test -C packages/native/c
pnpm --filter @axiom/native test:js
pnpm --filter @axiom/native build
pnpm build
pnpm test
pnpm lint
```

Expected: all commands pass; `pnpm build` runs with Emscripten available, and `pnpm test` runs after the WASM build.

- [ ] **Step 3: Review behavior against the spec**

Confirm all six anchors, all five interval transitions, invalid-value behavior, bit-exact legacy saw, sync behavior, alias measurements, generated exports, and AudioWorklet buffer cleanup. Confirm app UI/configuration remains unchanged.

- [ ] **Step 4: Record remaining deviations and commit documentation**

Update the implementation note and check off completed plan steps; explain any measured deviation from the approved equations or thresholds.

```bash
git add packages/native/README.md packages/native/c/BENCHMARKS.md docs/superpowers
git commit -m "docs(native): document generic oscillator"
```
