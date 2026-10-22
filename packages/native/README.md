# Native DSP

This package holds native C and WebAssembly DSP modules for custom oscillators,
filters, and other synthesis building blocks that are either too expensive for
JavaScript or benefit from deterministic native processing.

The long-term intent is to keep all custom native synthesis primitives here as
we expand the library beyond the browser runtime. This is the home for
non-standard oscillator and filter implementations that do not fit the generic
Web Audio graph.

## Current scope

The package contains a six-anchor waveform oscillator with triangle,
sharktooth, legacy saw, square, 75% pulse, and 25% pulse shapes. The
native C core lives under `c/` and compiles to WebAssembly for the
AudioWorklet. The new-shape anti-alias and sync path is still under
[qualification](../../docs/superpowers/specs/2026-10-19-model-d-waveform-oscillator-implementation-notes.md);
the native and WASM APIs should not be treated as a finished release.

## Oscillator interfaces

`c/include/moog_oscillator.h` declares the generic phase, detune, sync,
and waveform renderer. A null waveform buffer selects the legacy saw for
the entire block. Otherwise, the renderer reads one waveform value per
sample, clamps it to $[0, 5]$, and maps NaN to saw. The AudioWorklet
registers `moog-oscillator-processor` with an a-rate `waveform` parameter
from $0$ to $5$, default $2$. Its wrapper exposes that AudioParam as
`MoogOscillatorWorkletNode.waveform`. The app does not yet expose waveform
selection in its UI or configuration.

Emscripten generates `c/dist/wasm/moog_oscillator.js`, `.wasm`, and
`.d.ts`. The module exports `moog_oscillator_wasm_*` functions. The
existing `moog_saw_*` C interface and `moog_saw_wasm_*` exports remain
saw-only compatibility APIs.

## Legacy Moog saw

The saw anchor is a native implementation of the discrete-time Moog
sawtooth model described by Pekonen et al. It uses a fitted phase distortion
parameter $P(f_0)$ and evaluates the waveform from the normalized phase signal.

This is the reference implementation used here:

J. Pekonen, V. Lazzarini, J. Timoney, J. Kleimola, and V. Välimäki,
"Discrete-Time Modelling of the Moog Sawtooth Oscillator Waveform", 2011.[^paper]

[^paper]: https://www.researchgate.net/publication/220057893_Discrete-Time_Modelling_of_the_Moog_Sawtooth_Oscillator_Waveform

## Package layout

- `c/` — native C sources, header files, and Emscripten build files
- `src/` — TypeScript-side bridge and worker integration
- `wasm-holder.ts` — WebAssembly module host wrapper
- `worker/` — AudioWorklet worker integration for the native DSP path

## Build and test

From the repo root:

```bash
pnpm --filter @axiom/native build
pnpm --filter @axiom/native test
```

The native build compiles the C sources with Emscripten and the JavaScript side
checks the TypeScript bridge with `tsc`.

## Future direction

This package is intended to grow into a dedicated native DSP library for
Axiom:

- custom oscillators
- custom filter topologies
- phase-distortion and waveshaping algorithms
- any native-only synthesis primitive needed by the synth engine

The saw model remains the bit-exact compatibility baseline for the generic
oscillator.
