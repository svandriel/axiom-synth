# moog_saw_process benchmarks

Running log of `moog_saw_process` performance work. Every number below was
printed by the harness in `tests/bench_moog_saw.c`; nothing here is estimated.

## Harness

- Blocks of 128 frames, sample rate 48000 Hz (the worklet render quantum).
- Per case: one untimed run, then 5 timed runs of ~750 ms each after a 250 ms
  warmup; the reported value is the **best** (minimum) of the 5.
- `ns/sample` is wall-time per rendered sample; `x realtime` is the render
  budget for one 128-frame block divided by the measured block time.
- Three cases: `static` (440 Hz, 0 cents), `detuned` (440 Hz, +700 cents, the
  same value in every frame), and `varying` (220 Hz +/- 50 %, detune +/- 600
  cents sweeping within the block).

Commands:

```
make -C packages/native/c bench        # native, clang -O3
make -C packages/native/c bench-wasm   # emcc -O3, run under node
```

Environment: Apple M1 Max, macOS, clang 21, emcc 6.0.10, node 24.2.0.

## Results

Baseline is commit `e7c66cd` (exp2f fix, no perf work). "WASM" is the emcc
build; "native" is clang `-O3`.

| State                          | native const | native vary | wasm const | wasm vary |
| ------------------------------ | -----------: | ----------: | ---------: | --------: |
| Baseline (`e7c66cd`)           |      13.6 ns |     13.3 ns |    18.1 ns |   17.8 ns |
| A: reciprocal hoist            |      13.0 ns |     12.6 ns |    17.8 ns |   17.5 ns |
| A2: unwrapped waveform         |      11.9 ns |     11.5 ns |    17.6 ns |   17.2 ns |
| B: fast `saw_cos` polynomial   |      10.4 ns |     10.4 ns |    13.3 ns |   12.9 ns |
| C: skip exp2f when detune == 0 |       6.9 ns |     10.5 ns |     9.4 ns |   13.1 ns |

Step B replaces the imported libm `cos` with a quadrant-reduced minimax
polynomial (`quadrant_cos`). Max deviation from the libm reference over a full
phase x P sweep (20000 phases x 999 fits) is **5.4e-8**, far below the 1e-6
guard asserted by `test_waveform_accuracy`.

### Component costs (throwaway builds)

Measured by removing `cos` / `exp2f` from a scratch copy (not committed), to see
where the time goes:

| Variant (vs baseline) | native const | native vary | wasm const | wasm vary |
| --------------------- | -----------: | ----------: | ---------: | --------: |
| baseline              |      13.6 ns |     13.3 ns |    18.1 ns |   17.8 ns |
| no `cos`              |       8.0 ns |      8.1 ns |     9.9 ns |    9.9 ns |
| no `exp2f`            |       9.1 ns |      8.7 ns |    12.8 ns |   12.5 ns |
| no `cos`, no `exp2f`  |       5.2 ns |      5.2 ns |     6.2 ns |    6.1 ns |

So on WASM `cos` costs ~8.2 ns/sample and `exp2f` ~5.3 ns/sample; the rest of
the loop is ~6.2 ns/sample.

### Rejected experiments

| Experiment                      | native const | native vary | wasm const | wasm vary |
| ------------------------------- | -----------: | ----------: | ---------: | --------: |
| ternary removal (non-NULL path) |      11.7 ns |     11.4 ns |    17.9 ns |   17.6 ns |

Dropping the `frequency ? ... : ...` / `detune ? ... : ...` ternaries (measured
with a scratch copy that hardcodes the non-NULL path) changes nothing
meaningful: ~0.2 ns native, within noise on WASM. Branch prediction already
handles them, so buffer materialization would add complexity for no gain.

| Experiment                   | native const | native vary | wasm const | wasm vary |
| ---------------------------- | -----------: | ----------: | ---------: | --------: |
| fast float `exp2` (degree-6) |      11.3 ns |     11.3 ns |    16.1 ns |   15.7 ns |

Replacing libm `exp2f` with a degree-6 polynomial plus exponent bit-scale is
**slower** than musl's `exp2f` on both targets (WASM 13.3 -> 16.1 at the time of
measurement). Rejected; keep libm `exp2f`.

Step C skips `exp2f` when the detune sample is exactly zero, the common case for
a static patch with no fine-tune or LFO. The varying case (non-zero detune every
sample) is unchanged within noise.

### Step D: uniform non-zero detune

A block whose detune is a single non-zero value (a transpose, octave, or
fine-tune with no per-sample modulation) folds its one `exp2f` into a block
ratio and renders with no detune lookup. Uniform-zero blocks stay on the general
path, already cheap via Step C. Added to the harness as the `detuned` case.

| State                      | native static | native detuned | native varying | wasm static | wasm detuned | wasm varying |
| -------------------------- | ------------: | -------------: | -------------: | ----------: | -----------: | -----------: |
| C (baseline for D)         |        6.9 ns |        10.6 ns |        10.5 ns |      9.4 ns |      14.1 ns |      13.1 ns |
| D: uniform non-zero detune |        6.9 ns |         7.2 ns |        10.8 ns |      9.3 ns |      10.2 ns |      14.6 ns |

Step D lifts the common transposed / fine-tuned patch (wasm 14.1 -> 10.2,
native 10.6 -> 7.2 ns/sample). The cost is a wasm-only ~1.5 ns/sample regression
on the fully varying path; native varying is unchanged. That regression is a V8
codegen artifact of the added branch (the same loop compiled alone measures
13.3 ns), not extra per-sample work, and every shape tried (macro two-loop,
scale factor, single call, `static inline` helper) paid it. At < 15 ns/sample
the oscillator uses ~0.07 % of the realtime budget, so the trade favours the
common uniform-detune path.

### Refactor: `moog_saw_math.h`

The trig (`wrap_phase`, `cos_poly`, `sin_poly`, `quadrant_cos`) and the cents ->
ratio conversion moved to `src/moog_saw_math.h` as `static inline` functions.
Header-only keeps them inlined into the render loop; a separate `.c` unit would
not inline across translation units without LTO and would cost realtime
headroom. This is a pure move — every number above is unchanged to the tenth of
a nanosecond. `tests/test_moog_saw_math.c` locks the extracted math against libm.
