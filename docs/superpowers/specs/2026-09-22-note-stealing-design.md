# Note-Stealing Priority — Design

Date: 2026-09-22
Status: Approved

## Problem

`Synth.noteOn` (`packages/audio-engine/src/engine/synth.ts`) steals the voice
with the smallest `lastUsed` (LRU) across the whole 16-voice pool when the pool
is exhausted. A held note (key still pressed, present in `noteToVoiceMap`) can
therefore be cut even while released-but-ringing voices exist. Holding one note
and playing dense runs over it cuts the sustained note on overflow.

## Goals

1. Protect held notes: never steal a held voice while a releasable one exists.
2. Steal the "most silent" voice: reuse release-tail progress as a cheap,
   config-free proxy for loudness.
3. Keep behavior deterministic and unit-testable without a real `AudioContext`.
4. No change to the audio graph, levels, or the audible choke (3ms) mechanism.

## Design

### 1. `Voice` tracks when a release started

`packages/audio-engine/src/engine/voice.ts` gains one field:

```ts
/** Audio-clock time the current note's release began, or null while silent/held. */
public releasedAt: number | null = null;
```

- Set in `noteOff(now)`.
- Cleared in `noteOn` (a retriggered/stolen voice is held again).
- Cleared in the cleanup timer (`onSoundStop`), where `currentNote` is already
  set to `null`.

Held vs released needs no extra state: a voice whose `currentNote` is non-null
and that is **not** in `Synth.noteToVoiceMap` is released; a voice _in_ the map
is held.

### 2. Steal tiers in `Synth.noteOn`

When no voice satisfies `isAvailable(now)`:

1. **Releasing voice with mature release** — among voices with
   `currentNote !== null`, `now < endTime`, and release progress
   `(now - releasedAt) / (endTime - releasedAt) > 0.9`, steal the one with the
   largest progress (closest to silence). The ratio is pure clock math, no
   envelope-config knowledge; it self-tunes to any release length.
2. **Oldest triggered (held) voice** — fallback, unchanged current behavior:
   min `lastUsed`, including voices still in `noteToVoiceMap`.

When a qualifying releasing voice is stolen, the existing victim handling stays:
unmap its note from `noteToVoiceMap`, `fastChoke(now)`, `startDelay = chokeDuration`,
then `noteOn` the new note. `releasedAt` is cleared by the subsequent `noteOn`.

Rationale for the 0.9 progress guard: immediately after key-up the release tail
is at full loudness; cutting it there is as audible as cutting a held note. Past
90% of the tail the voice is near-instant-above-silence, so the cut is inaudible
and the new note keeps the 0-intrusion attack (`startDelay` unchanged).

### 3. Edge cases

- **All voices held**: no releasing voice qualifies, so tier 2 steals the oldest
  triggered note. `noteToVoiceMap` signals all-held, exactly like today.
- **Young release tails only**: no voice past 90%, tier 2 steals a held note.
  This preserves the chosen "oldest released when release over threshold,
  otherwise oldest triggered" policy.
- **Duplicate note retrigger** (`noteOn` of an active note): unchanged — the old
  voice is `noteOff`'d first, which moves it into the release tier and makes it
  the natural steal candidate for the retrigger.
- **Stolen voice then released again**: `releasedAt` only ever reflects the
  _current_ note's release; stale values are impossible because `noteOn` and the
  cleanup timer both clear it.

## Testing

New `packages/audio-engine/src/engine/synth.test.ts` (no real `AudioContext`,
reuses `test/fake-audio-context.ts`). A stub `Voice` subclass records
`internalNoteOn`/`internalNoteOff`/`internalFastChoke`/`onSoundStop` calls and
returns a configurable `silentAt` from `internalNoteOff`.

Covered behaviors:

- Held note not stolen while any mature releasing voice exists; the mature
  releasing voice is the victim.
- Young releasing tail (< 90% progress) is skipped; the oldest triggered held
  voice is stolen instead.
- Mature progress comparison: closes-to-silence releasing voice wins the steal.
- Free voice preferred before any theft.
- Victim unmapping from `noteToVoiceMap`; fastChoke + startDelay applied;
  `releasedAt` cleared after retrigger.
- `noteOff` sets `releasedAt`; cleanup path clears it (fake timers where
  needed).

`pnpm test` (engine Vitest), `pnpm build`, and `pnpm lint` gate the change.

## Out of scope (YAGNI)

- No amplitude meters / true loudness tracking.
- No sustain pedal; `releasedAt` is future-ready but no pedal exists.
- No configurable steal policy hooks; thresholds stay constants.
- No UI changes.
- `AxiomVoice`, envelope, and choke internals untouched.
