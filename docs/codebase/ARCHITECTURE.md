# Architecture

Hard rules live in `RULES.md`. If a pattern documented here conflicts with a
rule there, the rule wins.

## Core Sections (Required)

### 1) Architectural Style

- Primary style: **layered engine/UI** — a three-layer Web Audio architecture exposed to a Vue UI layer (`app/src/components/`). Host `AudioEngine` (context, master bus, meter, scope) plus the abstract `Synth`/`Voice` bases and building-block units live in `packages/audio-engine/src/engine/` (`@axiom/audio-engine`); the concrete `AxiomSynth` lives in `packages/axiom-synth/` (`@axiom/axiom-synth`). The UI reaches the graph through `useAudioEngine()` + `useAxiomSynth()`. UI never touches audio nodes directly.
- Why this classification: audio-parameter automation lives in `AxiomSynth`/`AxiomVoice`, voice allocation lives in `Synth`, and the master chain lives in the host `AudioEngine`; components only call public setters (`synth.value.filterCutOff = …`) or `noteOn`/`noteOff`/`getScopeData`. `packages/audio-engine/src/index.ts` re-exports the engine facade + building blocks; `packages/axiom-synth/src/index.ts` re-exports `AxiomSynth`.
- Primary constraints:
  1. Browser single-thread audio; voice pool is fixed at 16 (`MAX_VOICES` in `packages/axiom-synth/src/axiom-synth.ts`).
  2. UI controls must react live (knob moves drive shared `ConstantSourceNode`s that reach already-playing voices).
  3. Shared audio state must be computed once per change and fanned out to all voices (the `WaveshaperCurve` design).

### 2) System Flow

```text
Keyboard events (Keyboard.vue) -> AxiomSynth.noteOn/noteOff -> Synth.voicePool (16 AxiomVoice)
   -> per-voice chain: 3x [UnisonOscillator pooled paths -> gain] -> normalize Gain(1/3)
        -> WaveShaper(drive gain -> WaveShaperNode) -> BiquadFilter(lowpass)
        -> amp Envelope Gain -> AxiomSynth.output Gain(0.6)   (disconnected while voice is silent)
   -> AudioEngine master chain: masterInput Gain(1.0) -> master Gain(0.5)
        -> DynamicsCompressor -> Analyser -> destination
   -> ScopePanel rAF loop reads analyser time-domain data -> canvas
```

Factors that shape the audio continuously (all via shared `ConstantSourceNode`s created in the `AxiomSynth` constructor):
`filterCutOffSource`, `filterEnvAmountSource`, `filterKeyTrackSource`, `oscillatorDetuneSources[]`, `oscillatorGainSources[]`, `waveShaperDriveSource`, `lfoRateSources[]`, `lfoDepthSources[][]` (Q is handled by a shared `FilterResonance`); plus `Observable`s (oscillator waveforms, distortion amount, waveshaper type, filter type, LFO waveforms) that voices subscribe to directly.

Note the signal chain in a voice is `Oscillator → WaveShaper → Filter → Amp Envelope → Sink` (see `packages/axiom-synth/src/axiom-voice.ts`). The filter-key-track cents factor and filter envelope both modulate `filter.detune`. The synth master chain is `AxiomSynth.output(0.6) → AudioEngine.masterInput(1.0) → master(0.5) → comp → analyser → destination`.

**Per-note vs persistent graph.** Each voice builds its persistent graph once in its constructor. Each oscillator index owns one `UnisonOscillator`: it keeps shared control sources and pooled `UnisonVoicePath` processing paths (`packages/audio-engine/src/engine/unison-voice-path.ts`) warm, while every note generation allocates fresh raw `OscillatorNode`s (`packages/audio-engine/src/engine/unison-oscillator.ts`). Raw nodes connect shared frequency/detune sources and a leased path, then stop, disconnect, and release on exact end callbacks. Concurrent generations reserve paths; overflow paths are temporary. `onSoundStop` disconnects the amp envelope from the sink and stops the current generation, so silent voices cost minimal audio-graph CPU until the next note. This is a deliberate performance optimization (documented in `CONCERNS.md`).

### 3) Layer/Module Responsibilities

| Layer or module       | Owns                                                                                                                                                                                  | Must not own                                         | Evidence                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `AudioEngine`         | Context, master bus (`masterInput → master → comp → analyser`), meter, scope data, `ctxt.close()`                                                                                     | Voice allocation, parameter configs, shared sources  | `packages/audio-engine/src/engine/engine.ts`                                                         |
| `Synth`               | Generic voice allocation: pool, `noteToVoiceMap`, stealing/choke, `allNotesOff`, `destroy`                                                                                            | Axiom-specific sources/configs                       | `packages/audio-engine/src/engine/synth.ts`                                                          |
| `AxiomSynth`          | Axiom shared sources, configs, setters; builds `AxiomVoiceConfig` + `output` bus; `createVoice()`                                                                                     | Context/master chain, voice-pool bookkeeping         | `packages/axiom-synth/src/axiom-synth.ts`                                                            |
| `Voice` (abstract)    | Note lifecycle state machine (`isAvailable`, `fastChoke`, `noteOff` cleanup timer); declares `onSoundStop()`; per-voice `id`                                                          | Audio graph construction beyond what subclasses wire | `packages/audio-engine/src/engine/voice.ts`                                                          |
| `AxiomVoice`          | Per-voice envelopes, filter, waveshaper; one persistent `UnisonOscillator` per index; connects/disconnects the voice sink on sound start/stop                                         | Voice-pool bookkeeping                               | `packages/axiom-synth/src/axiom-voice.ts`                                                            |
| `UnisonOscillator`    | Shared parameter sources, direct single-voice path, pooled reusable processing paths, and fresh raw oscillator per-note generations; exact source/path teardown and lease bookkeeping | Envelope or filter scheduling                        | `packages/audio-engine/src/engine/unison-oscillator.ts`                                              |
| `UnisonVoicePathPool` | Warm stable paths, temporary overflow paths, leases, reservation, release/abort/destroy bookkeeping                                                                                   | Note allocation and shared oscillator controls       | `packages/audio-engine/src/engine/unison-voice-path.ts`                                              |
| `WaveshaperCurve`     | One shared 1024-sample `Float32Array`, curve math, node registry                                                                                                                      | Drive gain (owned by `Waveshaper`)                   | `packages/audio-engine/src/engine/waveshaper-curve.ts`                                               |
| `Waveshaper`          | Per-voice drive gain + `WaveShaperNode`, registers with shared curve                                                                                                                  | Curve math                                           | `packages/audio-engine/src/engine/waveshaper.ts`                                                     |
| `Envelope`            | ADSR scheduling on a per-voice gain node                                                                                                                                              | Config storage                                       | `packages/audio-engine/src/engine/envelope.ts`                                                       |
| `Observable`          | Tiny pub/sub value holder                                                                                                                                                             | Anything else                                        | `packages/audio-engine/src/utils/observable.ts`                                                      |
| `useAudioEngine`      | Module-singleton engine ref, re-create engine if `AudioContext` closed                                                                                                                | UI concerns                                          | `app/src/composables/use-audio-context.ts` (exports `useAudioEngine`, imports `@axiom/audio-engine`) |
| `useAxiomSynth`       | Module-singleton `AxiomSynth` wired to `engine.masterInput`, rebuilds on engine replacement                                                                                           | Audio node logic                                     | `app/src/composables/use-axiom-synth.ts`                                                             |
| Components            | UI state, `defineModel` binds, canvas drawing                                                                                                                                         | Audio graph wiring                                   | `app/src/components/Synth.vue`                                                                       |

### 4) Reused Patterns

| Pattern                                       | Where found                                                                                                                                                                             | Why it exists                                                                                                   |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Module-singleton                              | `useAudioEngine()` + `useAxiomSynth()` (one engine + one synth for all consumers), `useThemeMode()` module-scope default                                                                | Avoid multiple `AudioContext`s; share one synth instance across components                                      |
| Shared `ConstantSourceNode` per parameter     | `AxiomSynth` constructor: cutoff/env-amount/key-track/drive/detune/gain/LFO rate/depth sources                                                                                          | One source fans out to all 16 voices, bypassing per-voice recompute; live ramps reach playing voices            |
| Shared-curve + node registry                  | `WaveshaperCurve` owns `Set<WaveShaperNode>`, recomputes once and re-assigns                                                                                                            | Avoids 16× duplicate curve math per knob move                                                                   |
| Pub/sub (`Observable`)                        | `oscillatorWaveForms`, `_distortionAmount`, `_waveshaperType`, `_filterType`, `lfoWaveforms`                                                                                            | Push value changes to reactive subscribers (voices subscribe to shared waveform changes)                        |
| Fixed-capacity typed arrays                   | `FixedArray` type for oscillator configs/sources                                                                                                                                        | Compile-time length guarantees for the 3-osc/16-voice configuration                                             |
| Persistent pooled graph + per-note generation | `UnisonOscillator` keeps paths and shared controls wired; fresh raw `OscillatorNode`s are created, linked, stopped, and disconnected per note (`AxiomVoice.onSoundStart`/`onSoundStop`) | Avoids rebuilding processing paths while preserving exact one-shot source lifecycle and silent-voice efficiency |
| `defineModel` + `watch` bridge                | `Synth.vue` watches each panel v-model and calls `AxiomSynth` setters                                                                                                                   | UI models store config; the synth is the single source of truth for audio parameters                            |

### 5) Known Architectural Risks

- `use-audio-context.ts` constructs `new AudioEngine(new AudioContext())` at **module scope** (eager, on import), which can be rejected by browser autoplay policy until a user gesture. `use-axiom-synth.ts` keeps the matching `AxiomSynth` as a module-scope singleton (created lazily, wired to `engine.masterInput`, rebuilt when the engine is re-created); `resumeIfSuspended()` on `Synth.noteOn` (`packages/audio-engine/src/engine/synth.ts`) mitigates a suspended context — no graceful re-create if the first context is created suspended.
- Voice-stealing uses a `Map<note, Voice>` plus a fixed 16-pool (`packages/audio-engine/src/engine/synth.ts`); when the pool is exhausted it steals the oldest voice by `lastUsed` and chokes it over 3ms, delaying the new note by 3ms (`startDelay = 0.003`). Chord-heavy playing (>>16 notes) at 3ms steal latency may feel laggy.
- `packages/audio-engine/src/types/index.ts` barrel excludes `waveshaper-config.ts` (exported via the package barrel `src/index.ts` instead); `app/src/types/index.ts` includes `numeric-keys.ts`. Config types are consumed through the package facade.

### 6) Evidence

- `packages/audio-engine/src/engine/engine.ts` (host: context, master bus, meter, scope data, destroy)
- `packages/audio-engine/src/engine/synth.ts` (voice allocation: pool, stealing, note routing)
- `packages/audio-engine/src/engine/voice.ts` (voice lifecycle state machine)
- `packages/audio-engine/src/engine/oscillator.ts` (per-osc node lifecycle)
- `packages/audio-engine/src/engine/unison-oscillator.ts` + `unison-voice-path.ts` (pooled paths and raw per-note generations)
- `packages/audio-engine/src/engine/waveshaper-curve.ts` + `waveshaper.ts` (shared-curve pattern)
- `packages/axiom-synth/src/axiom-synth.ts` (shared sources, configs, setter ramps, `output` bus)
- `packages/axiom-synth/src/axiom-voice.ts` (voice chain topology)
- `app/src/composables/use-audio-context.ts` (engine singleton, imports `@axiom/audio-engine`)
- `app/src/composables/use-axiom-synth.ts` (synth singleton, rebuilds on engine replacement)
