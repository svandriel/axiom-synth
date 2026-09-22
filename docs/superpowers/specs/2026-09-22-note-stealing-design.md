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

1. **Released voice** — among voices with `currentNote !== null`,
   `now < endTime`, and `releasedAt !== null`, steal the one with the largest
   release progress `(now - releasedAt) / (endTime - releasedAt)` (closest to
   silence). The ratio is pure clock math, no envelope-config knowledge; it
   self-tunes to any release length. Any released voice is preferred over a
   held one, regardless of how recently it was released.
2. **Oldest triggered (held) voice** — fallback, unchanged current behavior:
   min `lastUsed`, including voices still in `noteToVoiceMap`. Used only when
   every busy voice is held.

When a qualifying releasing voice is stolen, the existing victim handling stays:
unmap its note from `noteToVoiceMap`, `fastChoke(now)`, `startDelay = chokeDuration`,
then `noteOn` the new note. `releasedAt` is cleared by the subsequent `noteOn`.

Rationale: a released voice is already decaying and key-up (a key the musician
no longer holds), so cutting it preserves every sustained note. Among released
voices, the one furthest through its tail is quietest, so cutting it is the
least audible. Young releases are sacrificed before any held note.

### 3. Edge cases

- **All voices held**: no released voice exists, so tier 2 steals the oldest
  triggered note. `noteToVoiceMap` signals all-held, exactly like today.
- **Young release tails only**: the young released voice is still the tier-1
  victim — every released voice beats a held one, so held notes stay protected.
- **Duplicate note retrigger** (`noteOn` of an active note): unchanged — the old
  voice is `noteOff`'d first, moving it into the release tier with progress ≈ 0.
  As a released voice it is now the natural tier-1 candidate, so the retrigger
  reuses that same voice when the pool is exhausted (still-ringing note cut is
  acceptable — it was the note being retriggered); if any voice is free, the
  free voice wins as usual.
- **Stolen voice then released again**: `releasedAt` only ever reflects the
  _current_ note's release; stale values are impossible because `noteOn` and the
  cleanup timer both clear it.

## Testing

New `packages/audio-engine/src/engine/synth.test.ts` (no real `AudioContext`,
reuses `test/fake-audio-context.ts`). A stub `Voice` subclass records
`internalNoteOn`/`internalNoteOff`/`internalFastChoke`/`onSoundStop` calls and
returns a configurable `silentAt` from `internalNoteOff`.

Covered behaviors:

- Held note not stolen while any released voice exists; the released voice is
  the victim (mature and young releases alike).
- Among released voices, the one closest to silence wins the steal.
- Free voice preferred before any theft.
- Victim unmapping from `noteToVoiceMap`; fastChoke + startDelay applied;
  `releasedAt` cleared after retrigger.
- `noteOff` sets `releasedAt`; cleanup path clears it (fake timers where
  needed).

`pnpm test` (engine Vitest), `pnpm build`, and `pnpm lint` gate the change.

## Out of scope (YAGNI)

- No amplitude meters / true loudness tracking.
- No sustain pedal; `releasedAt` is future-ready but no pedal exists.
- No configurable steal policy hooks.
- No UI changes.
- `AxiomVoice`, envelope, and choke internals untouched.
