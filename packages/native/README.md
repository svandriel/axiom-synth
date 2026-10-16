# Native DSP

This package holds native C and WebAssembly DSP modules for custom oscillators,
filters, and other synthesis building blocks that are either too expensive for
JavaScript or benefit from deterministic native processing.

The long-term intent is to keep all custom native synthesis primitives here as
we expand the library beyond the browser runtime. This is the home for
non-standard oscillator and filter implementations that do not fit the generic
Web Audio graph.

## Current scope

At the moment, the package contains the native implementation of a Moog-like saw
oscillator based on Pekonen's phase-distortion model. The code lives under
`c/` and is compiled to WebAssembly for use by the synth runtime.

## Moog saw implementation

The current oscillator is a native implementation of the discrete-time Moog
sawtooth model described by Pekonen et al. It uses a fitted phase distortion
parameter `P(f0)` and evaluates the waveform from the normalized phase signal.

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

For now, the Moog saw implementation is the first native primitive and the
foundation for future additions in this space.
