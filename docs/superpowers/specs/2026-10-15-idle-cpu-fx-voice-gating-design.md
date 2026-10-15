# Idle CPU — Idle Gate & Idle-Voice Seam — Design

Date: 2026-10-15
Status: Draft (awaiting approval)

## Problem

The browser burns ~19–29% CPU with no notes playing. Measured within-session
(Chrome, fresh tab, play notes, wait 10 s, average 10 s):

| Chain present                   | Idle CPU                 |
| ------------------------------- | ------------------------ |
| Baseline (everything connected) | ~29%                     |
| FX off (delay + reverb)         | ~10.5%                   |
| All off + scope rAF stopped     | ~6–8%                    |
| Per idle voice (all FX off)     | ~0.34% per voice, linear |

- **FX ≈ 18.5%**: the dominant cost. `masterInput → feedbackDelay → reverb →
master → comp → destination` is always connected. Web Audio processes every
  connected node each render quantum regardless of signal level, and zero wet
  gain does not let Chrome prune the subgraph. The `ConvolverNode` (4 s IR) and
  the `BiquadFilterNode` inside the delay feedback loop dominate.
- **Idle voices ≈ 0.34% each**: `AxiomVoice.onSoundStop` cuts
  `ampEnvelope.node ↔ ampModGain`, but `ampModGain → audioSink` stays connected.
  `ampModGain` remains reachable from destination, so it and its four LFO
  amp-depth gains stay pulled, per voice. Cost scales linearly with voice count
  (1 ≈ 2%, 16 ≈ 7%, 100 ≈ 35.7%).
- **Floor ≈ 2%**: context + always-connected master/compressor.

Compressor (`~1%`) and analyser/meter taps measure ~0 — exonerated.

## Goals

1. Stop FX DSP when idle; keep it active while playing.
2. Remove idle voices from the audio graph entirely.
3. No audible change: fresh notes get full FX, and reverb/delay tails are never
   truncated.
4. Zero latency on the wake path (no first-note FX dropout).
5. Changes unit-testable without a real `AudioContext`.

## Non-goals (YAGNI)

- No changes to `FeedbackDelay` / `Reverb` internals.
- No scope-panel / VU-meter rAF work (separate ~6% concern).
- No rework of the compressor, analyser, or master gain.
- No configurable/idle-policy UI.

## Design

### A. Idle gate

#### Unit shape

`IdleGate` follows the inline-unit pattern of `Filter` and `Reverb`: upstream
connects into an `input` getter, and `connect(destination)` routes the unit's
output into the chain. It is generic — nothing about it is FX-specific.

```ts
export class IdleGate implements Destroyable {
  constructor(ctxt: AudioContext);

  get input(): AudioNode;
  connect(destination: AudioNode): void;
  disconnect(): void;
  disconnect(destination: AudioNode): void;

  activate(): void; // wake: reopen now, zero latency
  destroy(): void;
}
```

Internally the gate is an inline valve: `_input → _output` when open. Closing
cuts that single internal link. Because rendering is pulled from `destination`,
cutting `_input → _output` leaves everything **upstream** of the gate with no
path to `destination`, so the whole upstream subgraph stops rendering.

#### Placement

The gate must sit at the **tail** of the subgraph to sleep, so one link cut
prunes the entire island:

```
synth → masterInput → feedbackDelay → reverb → idleGate.input
idleGate.connect(master) → comp → destination
```

Cutting `_input → _output` severs `masterInput → … → reverb` from the graph.
This replaces the draft's `fxSend`/`fxReturn` boundary nodes — the gate _is_ the
boundary.

#### Activity detection

- The gate creates an `AnalyserNode` and taps **its own `_input`** (i.e. the
  post-FX signal). The analyser is a leaf tap (no output); RULES.md rule 8.
- A poll (`SILENCE_POLL_INTERVAL_MS`) reads the time-domain data. Any
  `|sample| > SILENCE_THRESHOLD` counts as activity.
- While open with sustained activity, a silent-accumulator stays at 0.
- After `IDLE_DEBOUNCE_SECONDS` of continuous silence, the gate closes.
- Reopening is event-driven (`activate()`); as a fallback, a poll that sees
  activity while closed also reopens.

Because the analyser watches the **post-FX** signal, it observes the actual tail
decay. No reverb-duration math and no FX-load timing are needed — only a small
debounce to avoid chattering on near-silent low-amplitude samples.

#### Wake path

`Synth` gains an optional activity port; `AudioEngine` implements it.

```ts
// @axiom/audio-engine
export interface ActivitySink {
  activate(): void;
}

export class AudioEngine implements Destroyable, ActivitySink {
  activate(): void {
    this.idleGate.activate();
  }
}
```

```ts
// Synth
constructor(ctxt, audioSink, options: { maxVoices: number; activity?: ActivitySink })

noteOn(noteNumber, velocity) {
  if (this.destroyed) return;
  resumeIfSuspended(this.ctxt);
  this.activity?.activate();          // before the voice starts
  this.voiceManager.noteOn(noteNumber, velocity, this.ctxt.currentTime);
}
```

`AxiomSynth` forwards the port: `super(ctxt, audioSink, { maxVoices: MAX_VOICES,
activity: options?.activity })`. App wiring:

```ts
new AxiomSynth(engine.ctxt, engine.masterInput, { activity: engine });
```

`activate()` runs synchronously before `voiceManager.noteOn`, so the first
render quantum of the note already passes through the reconnected gate — full
FX, no dropout.

#### Constants (no magic numbers)

`packages/audio-engine/src/engine/idle-gate.ts`:

- `SILENCE_FFT_SIZE = 32` — time-domain samples per check; power of two.
- `SILENCE_POLL_INTERVAL_MS = 250`
- `SILENCE_THRESHOLD = 1e-4`
- `IDLE_DEBOUNCE_SECONDS = 1`

#### Removed from the earlier draft

- `fxSend` / `fxReturn` boundary nodes (the gate is the boundary).
- The `reverbBuffer`-duration `tailSeconds` calculation and `reverbBuffer`
  setter change (post-FX silence detection replaces it).
- `FX_TAIL_MARGIN_SECONDS` / `DEFAULT_FX_TAIL_SECONDS`.

### B. Idle-voice seam

`AxiomVoice` (`packages/axiom-synth/src/axiom-voice.ts`) currently toggles
`ampEnvelope.node ↔ ampModGain`. Move the toggle one node downstream, to
`ampModGain ↔ audioSink`, so an idle voice leaves the graph entirely.

- Constructor: `ampEnvelope.node.connect(ampModGain)` permanently;
  **do not** connect `ampModGain → audioSink`.
- `onSoundStart`: in the `!areOscillatorsActive` branch,
  `ampModGain.connect(this.audioSink)` (replaces the envelope connect).
- `onSoundStop`: `ampModGain.disconnect(this.audioSink)` (replaces the envelope
  disconnect; keep the `try/catch` for already-disconnected).
- Stealing (`areOscillatorsActive === true`) is unchanged: the sink link is
  already up, so no re-connect.
- `destroy()` continues to call `onSoundStop()`, then
  `ampEnvelope.node.disconnect(ampModGain)`, then `ampModGain.disconnect()`.

Effect: while idle, `ampModGain` and its four LFO amp-depth gains (and, when all
voices are idle, the shared depth sources) are no longer pulled. Audio is
identical: the sink link is up for the whole note-on → release → cleanup window,
and the release fade still runs through `ampModGain` before `onSoundStop` cuts
it (the existing cleanup timer fires at `silentAt × 5`).

## Testing

Extend `@axiom/audio-testing` and add focused tests; no real `AudioContext`.

- `FakeAnalyserNode`: add controllable time-domain data (a settable
  `timeDomainData` used by `getFloatTimeDomainData`) so silence vs signal can be
  simulated.
- New `packages/audio-engine/src/engine/idle-gate.test.ts` (FakeAudioContext +
  `vi.useFakeTimers`), driving `ctx.analysers[0]`:
  - Starts open: `input ↔ output` linked.
  - Closes after `IDLE_DEBOUNCE_SECONDS` of silence; both the internal link is
    cut (`input` no longer connected to `output`).
  - Reopens when activity resumes while closed.
  - Sustained signal never closes.
  - `activate()` reopens immediately and resets the silent-accumulator.
  - `destroy()` clears the interval and detaches the analyser tap.
- `packages/audio-engine/src/engine/synth.test.ts`: with a stub `ActivitySink`,
  `noteOn` calls `activate()`; not called when destroyed.
- `packages/axiom-synth/src/axiom-synth.test.ts`: the voice's amp-mod gain is
  connected to the synth output after `noteOn` and disconnected after the
  release cleanup; `AxiomSynth` forwards `activity`.

Gates: `pnpm test`, `pnpm build`, `pnpm lint`.

## Cleanup (before the real diff)

- Revert the TEMP CPU-isolation URL flags in `engine.ts` and reapply only the
  gate wiring, **keeping analyser and meter as leaf taps** (`comp → destination`,
  `comp → analyser`, `comp → meter.input`).
- Revert `MAX_VOICES` back to `16` in `axiom-synth.ts`.
- Restore `ScopePanel.vue` (removed only for measurement).

## Acceptance criteria

- With no notes and after the debounce, the gate has cut the island from the
  graph and all voices are out of the graph: idle CPU falls to the ~2–3% floor
  (measured, not asserted in tests).
- Playing is audibly unchanged: notes and the reverb/delay tail are intact; the
  first note after idle has full FX with no dropout.
- `pnpm test`, `pnpm build`, `pnpm lint` all pass.
