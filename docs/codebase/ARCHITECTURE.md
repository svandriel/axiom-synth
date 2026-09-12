# Architecture

## Core Sections (Required)

### 1) Architectural Style

- Primary style: **layered engine/UI** — a Web Audio graph layer (`src/engine/`) exposed to a Vue UI layer (`src/components/`) through a module-singleton composable (`useAudioEngine`). UI never touches audio nodes directly.
- Why this classification: all audio graph construction and audio-parameter automation live in `AudioEngine`/`AxiomVoice`; components only call public setters (`engine.value.filterCutOff = …`) or `noteOn`/`noteOff`/`getScopeData`. `src/engine/index.ts` re-exports the engine as the public facade.
- Primary constraints:
  1. Browser single-thread audio; voice pool is fixed at 16 (`MAX_VOICES` in `engine.ts`).
  2. UI controls must react live (knob moves drive shared `ConstantSourceNode`s that reach already-playing voices).
  3. Shared audio state must be computed once per change and fanned out to all voices (the `WaveshaperCurve` design).

### 2) System Flow

```text
Keyboard events (Keyboard.vue) -> AudioEngine.noteOn/noteOff -> voicePool (16 AxiomVoice)
   -> per-voice chain: 3x OscillatorNode -> Gain -> WaveShaper(drive gain -> WaveShaperNode)
        -> BiquadFilter(lowpass) -> amp Envelope Gain -> shared dry Gain
   -> AudioEngine master chain: dry -> master Gain(0.5) -> DynamicsCompressor -> Analyser -> destination
   -> ScopePanel rAF loop reads analyser time-domain data -> canvas
```

Factors that shape the audio continuously (all via shared `ConstantSourceNode`s created in the engine constructor):
`filterCutOffSource`, `filterQSource`, `filterEnvAmountSource`, `filterKeyTrackSource`, `oscillatorDetuneSources[]`, `oscillatorGainSources[]`, `waveShaperDriveSource`; plus three `Observable`s (`oscillatorWaveForms`, `_distortionAmount`, `_waveshaperType`) that voices subscribe to directly (waveforms, waveshaper curve).

Note the signal chain in a voice is `Oscillator → WaveShaper → Filter → Amp Envelope → Sink` (Config 2 in `axiom-voice.ts`). The filter-key-track cents factor and filter envelope both modulate `filter.detune`. The engine master chain is `dry → master → comp → analyser → destination`, where `dry.gain = 0.2` then `master.gain = 0.5`.

### 3) Layer/Module Responsibilities

| Layer or module    | Owns                                                                                     | Must not own                                         | Evidence                               |
| ------------------ | ---------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------- |
| `AudioEngine`      | Master/effects chain, shared `ConstantSourceNode`s, voice pool, note routing, scope data | Per-note ADSR scheduling                             | `src/engine/engine.ts`                 |
| `Voice` (abstract) | Note lifecycle state machine (`isAvailable`, `fastChoke`, `noteOff` cleanup timer)       | Audio graph construction beyond what subclasses wire | `src/engine/voice.ts`                  |
| `AxiomVoice`       | Per-voice oscillators, envelopes, filter, waveshaper; wire-up to shared sources          | Voice-pool bookkeeping                               | `src/engine/axiom-voice.ts`            |
| `WaveshaperCurve`  | One shared 1024-sample `Float32Array`, curve math, node registry                         | Drive gain (owned by `Waveshaper`)                   | `src/engine/waveshaper-curve.ts`       |
| `Waveshaper`       | Per-voice drive gain + `WaveShaperNode`, registers with shared curve                     | Curve math                                           | `src/engine/waveshaper.ts`             |
| `Envelope`         | ADSR scheduling on a per-voice gain node                                                 | Config storage                                       | `src/engine/envelope.ts`               |
| `Observable`       | Tiny pub/sub value holder                                                                | Anything else                                        | `src/utils/observable.ts`              |
| `useAudioEngine`   | Module-singleton semantics, re-create engine if `AudioContext` closed                    | UI concerns                                          | `src/composables/use-audio-context.ts` |
| Components         | UI state, `defineModel` binds, canvas drawing                                            | Audio graph wiring                                   | `src/components/Synth.vue`             |

### 4) Reused Patterns

| Pattern                                   | Where found                                                                              | Why it exists                                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Module-singleton                          | `useAudioEngine()` (one engine for all consumers), `useThemeMode()` module-scope default | Avoid multiple `AudioContext`s; share one synth instance across components                           |
| Shared `ConstantSourceNode` per parameter | Engine constructor: cutoff/Q/env-amount/key-track/drive/detune/gain sources              | One source fans out to all 16 voices, bypassing per-voice recompute; live ramps reach playing voices |
| Shared-curve + node registry              | `WaveshaperCurve` owns `Set<WaveShaperNode>`, recomputes once and re-assigns             | Avoids 16× duplicate curve math per knob move                                                        |
| Pub/sub (`Observable`)                    | `oscillatorWaveForms`, `_distortionAmount`, `_waveshaperType`                            | Push value changes to reactive subscribers (voices subscribe to shared waveform changes)             |
| Fixed-capacity typed arrays               | `FixedArray` type for oscillator configs/sources                                         | Compile-time length guarantees for the 3-osc/16-voice configuration                                  |
| `defineModel` + `watch` bridge            | `Synth.vue` watches each panel v-model and calls engine setters                          | UI models store config; engine is the single source of truth for audio parameters                    |

### 5) Known Architectural Risks

- `use-audio-context.ts` constructs `new AudioContext()` at **module scope** (eager, on import), which can be rejected by browser autoplay policy until a user gesture; `ensureStarted()` (`engine.ts`) calls `resume()` on first note as mitigation — no graceful re-create if the first context is created suspended.
- Voice-stealing uses a `Map<note, Voice>` plus a fixed 16-pool; when the pool is exhausted it steals the oldest voice by `lastUsed` and chokes it over 3ms, delaying the new note by 3ms (`startDelay = 0.003`). Chord-heavy playing (>>16 notes) at 3ms steal latency may feel laggy.
- `src/types/index.ts` barrel excludes `numeric-keys.ts` and `waveshaper-config.ts`; those must be imported by direct path (mixed import style across files).

### 6) Evidence

- `src/engine/engine.ts` (sources, pool, constants)
- `src/engine/axiom-voice.ts` (voice chain topology)
- `src/engine/waveshaper-curve.ts` + `src/engine/waveshaper.ts` (shared-curve pattern)
- `src/composables/use-audio-context.ts` (singleton)
- `src/engine/voice.ts` (voice lifecycle state machine)
