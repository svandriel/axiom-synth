# Note-Stealing Priority Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop `Synth` from stealing held voices while released-but-ringing voices exist, by stealing the release tail closest to silence first.

**Architecture:** `Synth.noteOn` currently steals the voice with the smallest `lastUsed` (LRU) across the whole pool. Add a transitive-release-aware steal picker: when no free voice exists, prefer a released voice whose release tail is > 90% spent (pure clock ratio `(now - releasedAt) / (endTime - releasedAt)`, no envelope config knowledge), picking the one closest to silence; fall back to the oldest triggered (held) voice only when no release qualifies. `Voice` gains a `releasedAt` field set on `noteOff` and cleared on `noteOn`/cleanup.

**Tech Stack:** TypeScript, Web Audio API, Vitest (engine package), fake Web Audio context test helper.

## Global Constraints

- Run engine tests: `pnpm --filter @axiom/audio-engine test src/engine/synth.test.ts` (Vitest). Full suite: `pnpm test`.
- Gate all work: `pnpm test`, `pnpm build`, `pnpm lint`.
- New behavior requires automated tests in the same change (AGENTS.md).
- Prettier is enforced by the pre-commit hook; commit messages use conventional style (`feat:`, `test:`, `docs:`).
- Do not touch `AxiomVoice`, envelopes, the audible choke (3ms `chokeDuration`), or the audio graph.
- Work happens on branch `note-stealing-priority` (already created). Never commit to `main`.

---

## File Structure

- `packages/audio-engine/src/engine/voice.ts` — add `releasedAt` field; set in `noteOff`, clear in `noteOn` and in the cleanup timer.
- `packages/audio-engine/src/engine/synth.ts:59-91` — replace the LRU steal block with a call to a new private `pickStealVictim(now, voicePool)` method.
- `packages/audio-engine/src/engine/test/fake-audio-context.ts` — add `state` + no-op `resume()` to `FakeAudioContext` so the shared `resumeIfSuspended` helper (read in `Synth.noteOn`) is safe with the fake.
- `packages/audio-engine/src/engine/synth.test.ts` — new test file: stub `TestVoice`/`TestSynth`, harness, and all behavior tests.

---

### Task 1: Test scaffolding and baseline guard

**Files:**

- Modify: `packages/audio-engine/src/engine/test/fake-audio-context.ts`
- Create: `packages/audio-engine/src/engine/synth.test.ts`

**Interfaces:**

- Produces: `TestVoice` (label per voice, records `noteOnCalls`/`fastChokeCalls`/`noteOffCount`, `silentAt` default `0.2`), `TestSynth` (`voices: TestVoice[]` in pool order), `makeSynth(maxVoices)` returning `{ ctx, synth }`. Later tasks build on these.

- [ ] **Step 1: Add fake-context state helpers**

In `packages/audio-engine/src/engine/test/fake-audio-context.ts`, add `state` and `resume()` to `FakeAudioContext` (after the `currentTime = 0;` field, before the `operations` getter):

```ts
  state: AudioContextState = 'running';
  resume(): Promise<void> {
    return Promise.resolve();
  }
```

- [ ] **Step 2: Write the scaffold file**

Create `packages/audio-engine/src/engine/synth.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Synth } from './synth';
import { Voice } from './voice';
import { FakeAudioContext, FakeAudioNode } from './test/fake-audio-context';

class TestVoice extends Voice {
  readonly label: string;
  noteOnCalls: Array<{ note: number; velocity: number; now: number }> = [];
  fastChokeCalls: Array<{ chokeTime: number; now: number }> = [];
  noteOffCount = 0;
  silentAt = 0.2;

  constructor(ctxt: AudioContext, audioSink: AudioNode, label: string) {
    super(ctxt, audioSink);
    this.label = label;
  }

  protected internalNoteOn(note: number, velocity: number, now: number): void {
    this.noteOnCalls.push({ note, velocity, now });
  }

  protected internalNoteOff(_now: number): { silentAt: number } {
    this.noteOffCount++;
    return { silentAt: this.silentAt };
  }

  protected internalFastChoke(chokeTime: number, now: number): void {
    this.fastChokeCalls.push({ chokeTime, now });
  }

  protected onSoundStop(): void {}
}

class TestSynth extends Synth<TestVoice> {
  readonly voices: TestVoice[] = [];

  constructor(ctxt: AudioContext, audioSink: AudioNode, maxVoices: number) {
    super(ctxt, audioSink, { maxVoices });
  }

  protected createVoice(): TestVoice {
    const voice = new TestVoice(
      this.ctxt,
      this.audioSink,
      `v${this.voices.length}`,
    );
    this.voices.push(voice);
    return voice;
  }
}

function makeSynth(maxVoices: number) {
  const ctx = new FakeAudioContext();
  const sink = new FakeAudioNode(ctx);
  const synth = new TestSynth(
    ctx as unknown as AudioContext,
    sink as unknown as AudioNode,
    maxVoices,
  );
  return { ctx, synth };
}

describe('Synth voice allocation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a free voice before stealing', () => {
    const { ctx, synth } = makeSynth(2);
    ctx.currentTime = 10;
    synth.noteOn(60, 1);
    const v0 = synth.voices[0]!;
    const v1 = synth.voices[1]!;

    expect(v0.noteOnCalls).toEqual([{ note: 60, velocity: 1, now: 10 }]);
    expect(v0.fastChokeCalls).toHaveLength(0);

    synth.noteOn(62, 1);
    expect(v1.noteOnCalls).toEqual([{ note: 62, velocity: 1, now: 10 }]);
    expect(v1.fastChokeCalls).toHaveLength(0);
    expect(v0.fastChokeCalls).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run the baseline test**

Run: `pnpm --filter @axiom/audio-engine test src/engine/synth.test.ts`
Expected: PASS (this behavior already exists; the test guards the regression net before the steal logic changes).

Type-check a fresh eye on the `expect(v0.noteOnCalls).toEqual(...)` — the `now` recorded in `internalNoteOn` is `this.ctxt.currentTime` at call time, which for free voices is `10` with `startDelay === 0`.

- [ ] **Step 4: Commit**

```bash
git add packages/audio-engine/src/engine/test/fake-audio-context.ts packages/audio-engine/src/engine/synth.test.ts
```

Commit message: `test: add synth voice-allocation test scaffold`

---

### Task 2: Track when a release started (`Voice.releasedAt`)

**Files:**

- Modify: `packages/audio-engine/src/engine/voice.ts`
- Test: `packages/audio-engine/src/engine/synth.test.ts`

**Interfaces:**

- Consumes: `TestVoice`/`makeSynth` from Task 1.
- Produces: `Voice.releasedAt: number | null` — audio-clock time the current note's release began; `null` while silent or held. Set in `noteOff`, cleared in `noteOn` and in the cleanup timer.

- [ ] **Step 1: Write the failing tests**

Append two tests to the `describe('Synth voice allocation')` block in `synth.test.ts`:

```ts
it('sets releasedAt on noteOff and clears it after the release tail ends', () => {
  const { ctx, synth } = makeSynth(1);
  const v0 = synth.voices[0]!;

  ctx.currentTime = 4;
  synth.noteOn(60, 1);
  expect(v0.releasedAt).toBeNull();

  ctx.currentTime = 5;
  synth.noteOff(60);
  expect(v0.releasedAt).toBe(5);
  expect(v0.currentNote).toBe(60);

  // silentAt 0.2 -> endTime 5 + 0.2*5 = 6, cleanup timer fires at 1000ms.
  vi.advanceTimersByTime(1001);
  expect(v0.releasedAt).toBeNull();
  expect(v0.currentNote).toBeNull();
});

it('clears releasedAt when retriggered by a steal', () => {
  const { ctx, synth } = makeSynth(1);
  const v0 = synth.voices[0]!;

  ctx.currentTime = 0;
  synth.noteOn(60, 1);
  ctx.currentTime = 1;
  synth.noteOff(60);
  expect(v0.releasedAt).toBe(1);

  ctx.currentTime = 1.95;
  synth.noteOn(64, 1);
  expect(v0.releasedAt).toBeNull();
  expect(v0.currentNote).toBe(64);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @axiom/audio-engine test src/engine/synth.test.ts`
Expected: FAIL — `releasedAt` does not exist on `Voice` (type error) and both new tests fail.

- [ ] **Step 3: Implement `releasedAt`**

In `packages/audio-engine/src/engine/voice.ts`:

1. Add the field beside `lastUsed` (line 15):

```ts
  /**
   * Audio-clock time the current note's release began; null while silent or held.
   */
  public releasedAt: number | null = null;
```

2. In `noteOn`, clear it (next to the existing `this.lastUsed = ...` line):

```ts
this.lastUsed = this.ctxt.currentTime + startTimeOffset;
this.releasedAt = null;
```

3. In `noteOff`, record the release start (next to the existing `this.endTime = ...` line):

```ts
this.endTime = now + silentAt * 5;
this.releasedAt = now;
```

4. In the cleanup timer callback, clear it (next to the existing `this.currentNote = null;`):

```ts
this.onSoundStop();
this.currentNote = null;
this.releasedAt = null;
this.cleanupTimer = null;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @axiom/audio-engine test src/engine/synth.test.ts`
Expected: PASS — all three tests.

- [ ] **Step 5: Commit**

```bash
git add packages/audio-engine/src/engine/voice.ts packages/audio-engine/src/engine/synth.test.ts
```

Commit message: `feat: track release start time on Voice`

---

### Task 3: Steal mature release tails before held voices

**Files:**

- Modify: `packages/audio-engine/src/engine/synth.ts`
- Test: `packages/audio-engine/src/engine/synth.test.ts`

**Interfaces:**

- Consumes: `Voice.releasedAt` (Task 2), `TestVoice`/`makeSynth` (Task 1).
- Produces: `Synth.pickStealVictim(now: number, voicePool: V[]): V | null` — private; later tasks (none) and the review rely on its contract:

  - Ignore voices `isAvailable(now)` (the caller already found no free voice, but the guard keeps the ratio denominator safe).
  - Held voices (present in `noteToVoiceMap`): track the one with the smallest `lastUsed`.
  - Released voices (`releasedAt !== null`): compute progress `(now - releasedAt) / (endTime - releasedAt)`; consider only `progress > 0.9`; remember the one with the largest progress.
  - Return the best released voice if any, else the oldest held voice, else `null`.

- [ ] **Step 1: Write the failing tests**

Append four tests to the `describe('Synth voice allocation')` block in `synth.test.ts`:

```ts
it('steals a mature release tail instead of a held voice', () => {
  const { ctx, synth } = makeSynth(2);
  ctx.currentTime = 0;
  synth.noteOn(60, 1); // v0 held
  synth.noteOn(62, 1); // v1 held
  ctx.currentTime = 1;
  synth.noteOff(62); // v1 released, endTime = 1 + 0.2*5 = 2
  const v0 = synth.voices[0]!;
  const v1 = synth.voices[1]!;

  ctx.currentTime = 1.95; // v1 progress 0.95 > 0.9, tail not over
  synth.noteOn(64, 1);

  expect(v1.fastChokeCalls).toHaveLength(1);
  expect(v0.fastChokeCalls).toHaveLength(0);
  expect(v1.noteOnCalls.some(call => call.note === 64)).toBe(true);
  expect(v0.noteOnCalls.some(call => call.note === 64)).toBe(false);
});

it('skips a young release tail and steals the oldest held voice', () => {
  const { ctx, synth } = makeSynth(2);
  ctx.currentTime = 0;
  synth.noteOn(60, 1); // v0 held from 0
  synth.noteOn(62, 1); // v1 held from 0
  ctx.currentTime = 1;
  synth.noteOff(62); // v1 released, tail to 2
  const v0 = synth.voices[0]!;
  const v1 = synth.voices[1]!;

  ctx.currentTime = 1.8; // v1 progress 0.8 < 0.9
  synth.noteOn(64, 1);

  expect(v0.fastChokeCalls).toHaveLength(1);
  expect(v1.fastChokeCalls).toHaveLength(0);
  expect(v0.noteOnCalls.some(call => call.note === 64)).toBe(true);
});

it('steals the release tail closest to silence', () => {
  const { ctx, synth } = makeSynth(3);
  ctx.currentTime = 0;
  synth.noteOn(60, 1);
  synth.noteOn(61, 1);
  synth.noteOn(62, 1);
  ctx.currentTime = 1;
  synth.noteOff(61); // v1 tail to 2
  ctx.currentTime = 1.5;
  synth.noteOff(62); // v2 tail to 2.5
  const v0 = synth.voices[0]!;
  const v1 = synth.voices[1]!;
  const v2 = synth.voices[2]!;

  ctx.currentTime = 1.95; // v1 progress 0.95, v2 progress 0.45
  synth.noteOn(64, 1);

  expect(v1.fastChokeCalls).toHaveLength(1);
  expect(v2.fastChokeCalls).toHaveLength(0);
  expect(v0.fastChokeCalls).toHaveLength(0);
  expect(v1.noteOnCalls.some(call => call.note === 64)).toBe(true);
});

it('reuses a free voice when retriggering an active note', () => {
  const { ctx, synth } = makeSynth(2);
  ctx.currentTime = 5;
  synth.noteOn(60, 1);
  const v0 = synth.voices[0]!;
  const v1 = synth.voices[1]!;

  synth.noteOn(60, 1); // noteOff(60) on v0, then free v1 picks it up

  expect(v0.noteOffCount).toBe(1);
  expect(v1.noteOnCalls).toEqual([{ note: 60, velocity: 1, now: 5 }]);
  expect(v1.fastChokeCalls).toHaveLength(0);
});
```

- [ ] **Step 2: Run tests to verify the stealing tests fail**

Run: `pnpm --filter @axiom/audio-engine test src/engine/synth.test.ts`
Expected: FAIL — `mature release tail` and `closest to silence` steal tests fail (current code steals `v0`, the LRU voice), `young release tail` test fails (current code steals `v1`), `free voice when retriggering` passes.

- [ ] **Step 3: Implement `pickStealVictim`**

In `packages/audio-engine/src/engine/synth.ts`, replace the whole `if (!targetVoice) { ... }` block (currently lines 59-86) with:

```ts
if (!targetVoice) {
  targetVoice = this.pickStealVictim(now, voicePool);

  if (targetVoice) {
    const age = now - targetVoice.lastUsed;
    console.warn(
      `[${now.toFixed(4)}] Voice stealing triggered for note ${noteNumber} - victim is ${targetVoice.id}, age ${age.toFixed(1)} s`,
    );

    for (const [note, voice] of this.noteToVoiceMap.entries()) {
      if (voice === targetVoice) {
        this.noteToVoiceMap.delete(note);
      }
    }

    targetVoice.fastChoke(now);
    startDelay = targetVoice.chokeDuration;
  }
}
```

Add this private method to `Synth` (after `ensureVoicePool()`):

```ts
  /**
   * Chooses a victim when every voice is busy. Released voices whose release
   * tail is more than 90% spent are inaudible to cut, so steal the one closest
   * to silence (largest progress toward endTime). Only when no release tail
   * qualifies does it fall back to the oldest triggered (held) voice.
   */
  private pickStealVictim(now: number, voicePool: V[]): V | null {
    const heldVoices = new Set(this.noteToVoiceMap.values());
    let bestReleased: V | null = null;
    let bestProgress = -Infinity;
    let oldestHeld: V | null = null;
    let oldestTime = Infinity;

    for (const voice of voicePool) {
      if (voice.isAvailable(now)) {
        continue;
      }
      if (heldVoices.has(voice)) {
        if (voice.lastUsed < oldestTime) {
          oldestTime = voice.lastUsed;
          oldestHeld = voice;
        }
        continue;
      }
      if (voice.releasedAt === null) {
        continue;
      }
      const tailMs = voice.endTime - voice.releasedAt;
      const progress = tailMs > 0 ? (now - voice.releasedAt) / tailMs : 1;
      if (progress > 0.9 && progress > bestProgress) {
        bestProgress = progress;
        bestReleased = voice;
      }
    }

    return bestReleased ?? oldestHeld;
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @axiom/audio-engine test src/engine/synth.test.ts`
Expected: PASS — all seven tests.

- [ ] **Step 5: Commit**

```bash
git add packages/audio-engine/src/engine/synth.ts packages/audio-engine/src/engine/synth.test.ts
```

Commit message: `feat: steal mature release tails before held voices`

---

### Task 4: Full verification and docs touch-up

**Files:**

- Modify: `docs/codebase/ARCHITECTURE.md`

- [ ] **Step 1: Update the architecture doc**

In `docs/codebase/ARCHITECTURE.md`, replace the whole known-risk bullet:

```text
- Voice-stealing uses a `Map<note, Voice>` plus a fixed 16-pool (`packages/audio-engine/src/engine/synth.ts`); when the pool is exhausted it steals the oldest voice by `lastUsed` and chokes it over 3ms, delaying the new note by 3ms (`startDelay = 0.003`). Chord-heavy playing (>>16 notes) at 3ms steal latency may feel laggy.
```

with:

```text
- Voice-stealing uses a `Map<note, Voice>` plus a fixed 16-pool (`packages/audio-engine/src/engine/synth.ts`); when the pool is exhausted it first steals a released voice whose release tail is > 90% spent (the one closest to silence wins), falling back to the oldest triggered (held) voice only when no release qualifies, and always chokes the victim over 3ms (`startDelay = 0.003`). Chord-heavy playing (>>16 notes) at 3ms steal latency may feel laggy.
```

- [ ] **Step 2: Run the full verification gate**

Run: `pnpm test`
Expected: PASS (full engine suite).

Run: `pnpm build`
Expected: PASS.

Run: `pnpm lint`
Expected: PASS (prettier check; the pre-commit hook auto-formats on commit).

- [ ] **Step 3: Commit**

```bash
git add docs/codebase/ARCHITECTURE.md
```

Commit message: `docs: describe release-aware voice stealing`

---

## Execution Handoff

- All work stays on branch `note-stealing-priority`; the PR to `main` is the final step, done after this plan completes and all gates pass.
