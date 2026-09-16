# Extract Filter Class

Date: 2026-09-15

## Goal

Extract the per-voice `BiquadFilterNode` wiring out of `AxiomVoice` into a
dedicated `Filter` class, mirroring the earlier `Oscillator` extraction. The
abstracted class wraps the biquad filter (plus a pre-filter `GainNode`) and
exposes its audio-rate inputs as `AudioParam` getters.

Future filter types (including custom WASM ones) are explicitly out of scope;
they will be new classes. This class stays concrete and YAGNI.

## Scope

- Only the biquad filter is extracted. The filter `Envelope` and
  `keyTrackGain` remain owned by `AxiomVoice`; only their _connections_ into
  the filter's `detune` change (now via the `Filter` class getter).
- No `engine.ts` changes. `AxiomVoiceConfig` already carries the four shared
  filter sources (`filterCutoff`, `filterResonance`, `filterEnvAmount`,
  `filterKeyTrack`).

## Filter class

New file `packages/audio-engine/src/engine/filter.ts` (authored by the user,
with one addition):

```
class Filter:
  fields:
    ctxt: AudioContext
    gain: GainNode           # pre-filter input gain, drive
    filter: BiquadFilterNode # default type 'lowpass'

  constructor(ctxt):
    gain = createGain()
    filter = createBiquadFilter()
    gain.connect(filter)     # gain -> filter

  get input(): AudioNode     # returns gain                 (waveshaper output lands here)
  get detune(): AudioParam   # returns filter.detune
  get drive(): AudioParam    # returns gain.gain            (unused for now, future drive control)
  get frequency(): AudioParam# returns filter.frequency
  get q(): AudioParam        # returns filter.Q             <-- ADDED for resonance wiring

  connect(destination: AudioNode): filter.connect(destination)
  disconnect(destination?: AudioNode): filter.disconnect(destination) / filter.disconnect()
```

### Added getter

`get q(): AudioParam` — required so `filterResonance` can drive `filter.Q`,
as it did before the abstraction.

## AxiomVoice changes

`packages/audio-engine/src/engine/axiom-voice.ts`:

1. Field `filter: BiquadFilterNode` → `filter: Filter`; import `Filter`.
2. Constructor:
   - `this.filter = new Filter(ctxt);`
   - Drop `this.filter.type = 'lowpass'` — biquad default, no behavior change.
   - Keep `this.filter.frequency.value = 0`.
   - `config.filterCutoff.connect(this.filter.frequency)` (unchanged call).
   - `config.filterResonance.connect(this.filter.q)` (was `.Q`).
   - Envelope path unchanged in the voice:
     `config.filterEnvAmount.connect(this.filterEnvelope.node)` and
     `filterEnvelope.node.connect(this.filter.detune)`.
   - Key track unchanged in the voice:
     `this.keyTrackGain = ctxt.createGain()`, gain 0,
     `config.filterKeyTrack.connect(this.keyTrackGain)`,
     `this.keyTrackGain.connect(this.filter.detune)`.
   - Signal chain:
     `this.waveShaper.output.connect(this.filter.input)` (was `.connect(this.filter)`)
     and `this.filter.connect(this.ampEnvelope.node)` (unchanged call, now a proxy).
3. `destroy()`: `this.filter.disconnect()` — unchanged call, now a proxy to the
   biquad.

## Behavior parity

- Signal path identical: `waveshaper -> filter.input (gain 1) -> biquad ->
ampEnvelope`.
- All four shared sources drive the same params as before (frequency, Q,
  detune via envelope + key track).
- Filter type remains `lowpass` (biquad default).

## Testing / verification

No test runner configured; the build is the gate. Verify with `pnpm build`
and `pnpm lint`.
