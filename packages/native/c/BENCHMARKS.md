# moog_oscillator_process benchmarks

Running log of oscillator performance work. Historical numbers below were
printed by the harness in `tests/bench_moog_oscillator.c`; nothing here is
estimated.

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

### Refactor: `moog_oscillator_math.h`

The trig (`wrap_phase`, `cos_poly`, `sin_poly`, `quadrant_cos`) and the cents ->
ratio conversion moved to `src/moog_oscillator_math.h` as `static inline` functions.
Header-only keeps them inlined into the render loop; a separate `.c` unit would
not inline across translation units without LTO and would cost realtime
headroom. This is a pure move — every number above is unchanged to the tenth of
a nanosecond. `tests/test_moog_oscillator_math.c` locks the extracted math against libm.

## Generic waveform benchmark

`tests/bench_moog_waveforms.c` measures the generic oscillator at 440 Hz for
waveform selectors 0.0 through 5.0. The full matrix uses 0.5 steps; focused
CLI runs accept any selector value in that range. Each selector runs at fixed
440 Hz and with a repeating 110–330 Hz pitch sweep. Both pitch modes run
without sync and with a periodic 880 Hz sync signal. The ramp sync signal gives
linearly interpolated zero crossings, allowing the repeated-sync path to
activate consistently when pitch is fixed.

The pitch sweep is a 128-sample sine that repeats every block. This gives an
a-rate pitch change every sample and isolates cache churn from waveform
automation. Sync reconstruction cannot lock to a stable period during the
sweep. Cases use 128-frame blocks, 250 ms warmup, five timed runs of 750 ms,
and best/median reporting. Run the full matrix with:

```
make -C packages/native/c bench-waveforms
make -C packages/native/c bench-waveforms-wasm
```

Run one case for focused comparisons:

```
packages/native/c/dist/native/bench_moog_waveforms 1.5 static off
packages/native/c/dist/native/bench_moog_waveforms 1.5 static sync
packages/native/c/dist/native/bench_moog_waveforms 1.5 sweep off
```

Replace the binary path with `node packages/native/c/dist/bench/bench_moog_waveforms.cjs`
for WASM. The waveform argument accepts any value in the 0.0–5.0 range; pitch
is `static` or `sweep`; sync is `off` or `sync`.

Environment: Apple M1 Max, macOS 27.0.0, Apple clang 21 via the `gcc` command,
emcc 6.0.10, node 24.2.0. Results below report the best ns/sample, matching the
existing harness convention. Sync-case medians showed more run-to-run variance
than unsynced cases; compare repeated runs before treating small changes as
meaningful.

### Baseline results

Measured before simplification experiments. Values are ns/sample.

| Waveform | Native 440 off | Native 440 sync | Native sweep off | Native sweep sync | WASM 440 off | WASM 440 sync | WASM sweep off | WASM sweep sync |
| -------: | -------------: | --------------: | ---------------: | ----------------: | -----------: | ------------: | -------------: | --------------: |
|      0.0 |           15.2 |            86.9 |             34.9 |              39.8 |         21.1 |         114.2 |           38.6 |            49.5 |
|      0.5 |           18.9 |            90.5 |             39.4 |              45.2 |         26.0 |         116.9 |           44.2 |            55.1 |
|      1.0 |          103.4 |            86.7 |             43.2 |              41.3 |        124.3 |         112.9 |           46.5 |            50.8 |
|      1.5 |          211.9 |           312.5 |             48.0 |              57.0 |        253.2 |         333.5 |           53.6 |            64.8 |
|      2.0 |            9.0 |            13.0 |             12.6 |              13.0 |         10.4 |          14.7 |           13.3 |            14.2 |
|      2.5 |          213.7 |           311.9 |             47.4 |              55.8 |        252.3 |         333.5 |           54.1 |            64.8 |
|      3.0 |          103.6 |            87.8 |             36.0 |              42.3 |        123.2 |         113.0 |           39.6 |            50.5 |
|      3.5 |          103.4 |            97.2 |             35.9 |              43.1 |        123.5 |         127.8 |           40.2 |            53.0 |
|      4.0 |          103.6 |            95.6 |             35.9 |              46.5 |        122.9 |         128.1 |           40.1 |            57.4 |
|      4.5 |          103.8 |            88.3 |             36.3 |              43.3 |        121.9 |         113.9 |           39.5 |            52.6 |
|      5.0 |          104.1 |            86.6 |             35.8 |              42.2 |        121.6 |         112.7 |           39.6 |            50.0 |

Steady-pitch morph selectors 1.5 and 2.5 are the highest unsynced costs:
212–214 ns/sample native and 252–253 ns/sample WASM. Their synced costs peak
at about 312 ns/sample native and 334 ns/sample WASM. Under pitch sweep, these
two selectors become much cheaper because their harmonic count selects the
edge-correction path instead of the high-accuracy direct Fourier path.

### Isolated simplification experiments

Each experiment changed only its target logic, ran `make -C packages/native/c
test`, and measured focused cases against the baseline above. Native C tests
passed for all three variants. Simplification 1 has since been applied more
broadly: prepared-waveform evaluation no longer uses direct Fourier at any
harmonic count. Simplification 2 is now applied. Its updated measurements
compare the committed code before this optimization with the current build,
using the same focused benchmark command. Simplification 3 remains an
experiment and is not in the current code.

**1. Cap direct Fourier sums at eight harmonics.** Removed the selector-specific
high-accuracy exception, which previously allowed up to 64 harmonics. For
selectors 1.5 and 2.5 at fixed 440 Hz without sync, native fell from 211.9/213.7
to 27.3/26.9 ns/sample; WASM fell from 253.2/252.3 to 32.5/32.8 ns/sample.
Under pitch sweep, native rose from 48.0/47.4 to 50.0/50.0 ns/sample and WASM
from 53.6/54.1 to 54.6/54.8 ns/sample. Existing tests passed, but do not
measure perceptual or spectral error for these morphs. The main tradeoff is
weaker alias rejection and less accurate shape reconstruction at selector 1.5
and 2.5.

|              Selector | Native baseline | Native cap 8 | WASM baseline | WASM cap 8 |
| --------------------: | --------------: | -----------: | ------------: | ---------: |
| 1.5, 440 Hz, sync off |           211.9 |         27.3 |         253.2 |       32.5 |
| 2.5, 440 Hz, sync off |           213.7 |         26.9 |         252.3 |       32.8 |
|  1.5, sweep, sync off |            48.0 |         50.0 |          53.6 |       54.6 |
|  2.5, sweep, sync off |            47.4 |         50.0 |          54.1 |       54.8 |

**2. Skip frequency-driven shape rebuilds when the cached shape has no saw
component (applied).** Harmonic limit and correction scaling still update per
sample; frequency-independent edge data and saw-fit values are not rebuilt.
Under pitch sweep without sync, eight non-saw selectors improved 32–38% native
and 21–27% WASM. Values are best ns/sample:

| Selector | Native before | Native applied | WASM before | WASM applied |
| -------: | ------------: | -------------: | ----------: | -----------: |
|      0.0 |          33.7 |           22.8 |        36.9 |         29.1 |
|      0.5 |          38.1 |           24.9 |        43.2 |         32.3 |
|      1.0 |          41.0 |           27.8 |        45.6 |         34.5 |
|      3.0 |          34.2 |           21.7 |        38.3 |         28.4 |
|      3.5 |          34.2 |           21.7 |        38.8 |         28.5 |
|      4.0 |          34.5 |           21.7 |        38.6 |         28.5 |
|      4.5 |          34.8 |           21.6 |        38.5 |         28.5 |
|      5.0 |          34.4 |           21.7 |        38.3 |         28.6 |

This change is semantics-preserving for those waveforms because their cached
edge shape does not depend on the saw phase-fit parameter. It does not apply to
shapes with a nonzero saw component, including selectors between 1 and 3.

**3. Cap periodic sync reconstruction at eight harmonics.** Kept the periodic
series path but limited its per-sample sum from up to 76 to eight terms. For
fixed 440 Hz and 880 Hz sync, selector 1.5 improved from 312.5 to 265.4
ns/sample native and 333.5 to 289.5 WASM; selector 2.5 improved from 311.9 to
268.7 native and 333.5 to 290.3 WASM. Triangle and square selectors improved
from 86.9/87.8 to 53.8/54.3 native and 114.2/113.0 to 72.2/67.6 WASM. This
reduces periodic-sync spectral accuracy by omitting harmonics above eight.

|         Selector | Native baseline | Native cap 8 | WASM baseline | WASM cap 8 |
| ---------------: | --------------: | -----------: | ------------: | ---------: |
| 0.0, sync 880 Hz |            86.9 |         53.8 |         114.2 |       72.2 |
| 1.5, sync 880 Hz |           312.5 |        265.4 |         333.5 |      289.5 |
| 2.5, sync 880 Hz |           311.9 |        268.7 |         333.5 |      290.3 |
| 3.0, sync 880 Hz |            87.8 |         54.3 |         113.0 |       67.6 |

The benchmark tests one change at a time. It does not measure interactions
between simplifications; retest after selecting any changes for production.

### Continuous knob-value spot check

Simplification 1 removes the high-accuracy Fourier exception for exact selector
values. A knob is likely to produce fractional values instead. To check that
case, 19 values spanning 0.1–4.9 were run at static 440 Hz, sync off, against
baseline and cap-8 builds. The spot check used a short 25 ms warmup and three
100 ms measurements per case; use the full-duration benchmark for small
deltas. Values below are best ns/sample for representative points:

| Selector | Native baseline | Native cap 8 | WASM baseline | WASM cap 8 |
| -------: | --------------: | -----------: | ------------: | ---------: |
|      0.1 |            18.6 |         18.2 |          25.3 |       23.8 |
|      0.9 |            18.5 |         18.4 |          25.3 |       23.8 |
|      1.4 |            25.8 |         26.9 |          32.4 |       31.8 |
|      1.9 |            25.7 |         26.9 |          32.4 |       31.8 |
|      2.4 |            25.1 |         26.4 |          32.8 |       32.2 |
|      2.9 |            25.0 |         26.4 |          33.6 |       32.2 |
|      3.4 |            14.0 |         13.8 |          19.9 |       18.4 |
|      3.9 |            14.1 |         13.9 |          19.9 |       18.4 |
|      4.4 |            13.9 |         13.8 |          19.6 |       18.4 |
|      4.9 |            14.0 |         13.8 |          19.8 |       18.4 |

No fractional selector showed the large drop measured at exact 1.5 and 2.5.
That matches the code: the high-accuracy exception is selected by exact float
equality, so ordinary knob values already use the lower-cost path. Small
differences here are not reliable gains; the cap change does not simplify the
main path for these fractional values.
