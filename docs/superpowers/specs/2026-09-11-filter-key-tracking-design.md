# Filter Key Tracking — Design

Date: 2026-09-11

## Goal

Add keyboard tracking to the filter: a `tracking` knob on the filter panel (0–200%) that
makes the filter cutoff follow the played note pitch. At 100% tracking, a note one octave
above the reference (C4) doubles the cutoff relative to the base cutoff knob position.

## Approach

Shared control source pattern, consistent with the existing `filterCutOffSource` /
`filterQSource` architecture in `AudioEngine`.

```
filterKeyTrackSource (ConstantSource, tracking 0–2)
  ──► keyTrackGain (Gain, per-note cents factor, one per voice)
        ──► filter.detune   (sums with the existing filter envelope output)
```

- The shared source carries the live knob value, ramped on change — held notes react to
  knob edits, same as the cutoff knob.
- Each voice's `keyTrackGain` gain is set once at note-on to `100 × noteNumber` cents
  (note 0 = C4, i.e. `freqOf(0)`; octave up = +1200 cents at 100% tracking).
- Key tracking lives on `filter.detune` (cents), consistent with the filter envelope which
  already modulates `filter.detune`. No conflict: multiple inputs to `detune` sum.

## Changes

### FilterConfig — `src/types/filter-config.ts`

Add `tracking: number`, range 0–2, default `0`.

### AudioEngine — `src/engine/engine.ts`

- New `filterKeyTrackSource: ConstantSourceNode` seeded with `filterConfig.tracking`
  (range 0–2, default 0), following the existing shared-source pattern.
- New `filterKeyTrack` setter: `linearRampToValueAtTime(tracking, now + 0.01)`.
- Pass `filterKeyTrackSource` to each voice in the constructor.

### AxiomVoice — `src/engine/axiom-voice.ts`

- New `keyTrackGain: GainNode`, gain seeded to `0`.
- Connect `filterKeyTrackSource → keyTrackGain → filter.detune` in the constructor,
  alongside the existing `filterEnvAmount → filterEnvelope.node → filter.detune`.
- In `internalNoteOn(noteNumber, velocity, now)`, after `createOscillators` and both
  envelope note-ons:
  `keyTrackGain.gain.setValueAtTime(100 * noteNumber, now)`.
  - `keyTrackGain` is a persistent node created once in the constructor; only its gain
    changes per note. `createOscillators` (`src/engine/axiom-voice.ts:113`) is not touched.
  - Note 0 = C4, so C4 → 0 cents offset, each semitone above → +100 cents at 100% tracking.
  - Tracking stays constant through release: the gain value persists across `noteOff`,
    matching how the held cutoff offset behaves.
- Clean up `keyTrackGain` in `destroy`.

### FilterPanel — `src/components/FilterPanel.vue`

Fourth knob: **Tracking**.

| Prop      | Value                                     |
| --------- | ----------------------------------------- |
| `from`    | 0                                         |
| `to`      | 2                                         |
| `default` | 0                                         |
| log       | linear                                    |
| format    | `fractionDisplay(0)(v * 100)` → % (0–200) |

New `defineModel<number>('tracking')`.

### Synth — `src/components/Synth.vue`

- `tracking = ref(engine.filterConfig.tracking)`.
- Watch → `engine.filterKeyTrack = tracking`.
- Pass `v-model:tracking` to `FilterPanel`.

## Behavior

- `tracking = 0`: no key tracking (current behavior).
- `tracking = 1`: cutoff tracks pitch 1:1 relative to the base cutoff knob (C4 → base).
- `tracking = 2`: over-tracking, steeper than pitch (yes, 200%).
- Envelope and key tracking both feed `filter.detune` and sum.

## Out of scope

- No per-voice scheduling of the shared source.
- No changes to the filter envelope or cutoff behavior.
