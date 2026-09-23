# Voice Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move generic voice allocation from `Synth` into a public
`VoiceManager` without changing note behavior.

**Architecture:** `VoiceManager<V extends Voice>` owns lazy pool creation,
active-note routing, stealing, release, and voice destruction. `Synth` keeps
its context, output sink, destroyed guard, and `createVoice()` seam, then
delegates public note operations to its manager.

**Tech Stack:** TypeScript 6, Web Audio API types, Vitest 4, existing
`FakeAudioContext`.

## Global Constraints

- Keep first-available allocation, oldest-voice stealing, 3 ms choke delay,
  logging, and note behavior unchanged.
- Add `VoiceManager` to both public engine barrels.
- Use the existing `FakeAudioContext`; do not create another audio-context fake.
- Keep `VoiceManager` generic and free of Axiom identifiers.
- Add automated tests for changed behavior.
- Run `pnpm test`, `pnpm build`, and `pnpm lint` before completion.

---

## File structure

- Create `packages/audio-engine/src/engine/voice-manager.ts`: generic pool and
  note allocation lifecycle.
- Create `packages/audio-engine/src/engine/voice-manager.test.ts`: allocation
  behavior tests using `FakeAudioContext` and test voices.
- Modify `packages/audio-engine/src/engine/synth.ts`: delegate allocation to
  `VoiceManager`.
- Modify `packages/audio-engine/src/engine/index.ts`: export `VoiceManager`.
- Modify `docs/codebase/ARCHITECTURE.md`: assign allocation responsibility to
  `VoiceManager` and update evidence.

### Task 1: Add tested `VoiceManager`

**Files:**

- Create: `packages/audio-engine/src/engine/voice-manager.ts`
- Create: `packages/audio-engine/src/engine/voice-manager.test.ts`

**Interfaces:**

- Consumes: `Voice` fields and methods: `id`, `lastUsed`, `isAvailable(now)`,
  `noteOn(note, velocity, startDelay)`, `noteOff()`, `fastChoke(now)`,
  `chokeDuration`, and `destroy()`.
- Produces: `VoiceManager<V extends Voice>` with constructor
  `(ctxt: AudioContext, createVoice: () => V, options?: { maxVoices?: number })`
  and methods `noteOn(noteNumber: number, velocity: number): void`,
  `noteOff(noteNumber: number): void`, `allNotesOff(): void`, and
  `destroy(): void`.

- [ ] **Step 1: Write failing allocation tests**

Create `voice-manager.test.ts`. Import `describe`, `expect`, `it`, and `vi`
from `vitest`; `VoiceManager`; `Voice`; and `FakeAudioContext`. Define a
`TestVoice` that extends `Voice`, records `noteOn` calls, spies on `noteOff`,
`fastChoke`, and `destroy`, and supplies no-op implementations of abstract
sound hooks.

```ts
class TestVoice extends Voice {
  readonly noteOnCalls: {
    noteNumber: number;
    velocity: number;
    startTimeOffset: number;
  }[] = [];
  readonly noteOffSpy = vi.fn();
  readonly fastChokeSpy = vi.fn();
  readonly destroySpy = vi.fn();

  override noteOn(
    noteNumber: number,
    velocity: number,
    startTimeOffset: number,
  ): void {
    this.noteOnCalls.push({ noteNumber, velocity, startTimeOffset });
    this.currentNote = noteNumber;
    this.lastUsed = this.ctxt.currentTime + startTimeOffset;
    this.endTime = Infinity;
  }

  override noteOff(): void {
    this.noteOffSpy();
  }

  override fastChoke(now: number): void {
    this.fastChokeSpy(now);
  }

  override destroy(): void {
    this.destroySpy();
  }

  protected override onSoundStop(): void {}
  protected override internalFastChoke(
    _chokeTime: number,
    _now: number,
  ): void {}
  protected override internalNoteOn(): void {}
  protected override internalNoteOff(): { silentAt: number } {
    return { silentAt: 0 };
  }
}
```

Write tests that assert:

```ts
it('creates voices lazily and assigns an available voice', () => {
  const context = new FakeAudioContext();
  const voices: TestVoice[] = [];
  const manager = new VoiceManager(
    context as unknown as AudioContext,
    () => {
      const voice = new TestVoice(
        context as unknown as AudioContext,
        context.destination as unknown as AudioNode,
      );
      voices.push(voice);
      return voice;
    },
    { maxVoices: 2 },
  );

  expect(voices).toHaveLength(0);
  manager.noteOn(60, 0.8);
  expect(voices).toHaveLength(2);
  expect(voices[0]!.noteOnCalls).toEqual([
    { noteNumber: 60, velocity: 0.8, startTimeOffset: 0 },
  ]);
});
```

Add separate tests for retriggering the same note, releasing a mapped note,
stealing oldest voice at capacity, releasing all active voices, and destroying
the lazily-created pool. In stealing test, mark both voices unavailable,
assign `lastUsed` values, and expect oldest voice to receive `fastChoke(now)`
and new `noteOn` with its `chokeDuration` as offset.

- [ ] **Step 2: Run tests and confirm failure**

Run: `pnpm --filter @axiom/audio-engine exec vitest run src/engine/voice-manager.test.ts`

Expected: FAIL because `./voice-manager` does not exist.

- [ ] **Step 3: Implement `VoiceManager`**

Create `voice-manager.ts`. Move allocation state and algorithm from the current
`Synth`: default `maxVoices` to 16; lazily create voices; release duplicate
notes before allocation; use first available voice; otherwise select minimum
`lastUsed`, remove every map entry that points to it, choke it, and set start
delay to `chokeDuration`.

```ts
import { resumeIfSuspended } from './helpers';
import type { Voice } from './voice';

export class VoiceManager<V extends Voice> {
  private readonly maxVoices: number;
  private voicePool: V[] | undefined;
  private readonly noteToVoiceMap = new Map<number, V>();

  constructor(
    private readonly ctxt: AudioContext,
    private readonly createVoice: () => V,
    options?: { maxVoices?: number },
  ) {
    this.maxVoices = options?.maxVoices ?? 16;
  }

  noteOn(noteNumber: number, velocity: number): void {
    resumeIfSuspended(this.ctxt);
    const now = this.ctxt.currentTime;
    const voicePool = this.ensureVoicePool();

    if (this.noteToVoiceMap.has(noteNumber)) {
      console.log(
        `[${now.toFixed(4)}] noteOn(${noteNumber}) - already active, retriggering`,
      );
      this.noteOff(noteNumber);
    }

    let targetVoice = voicePool.find(voice => voice.isAvailable(now));
    let startDelay = 0;
    if (targetVoice) {
      console.log(
        `[${now.toFixed(4)}] Voice ${targetVoice.id} available for note ${noteNumber}`,
      );
    } else {
      let oldestTime = Infinity;
      let oldestVoice: V | null = null;
      for (const voice of voicePool) {
        if (voice.lastUsed < oldestTime) {
          oldestTime = voice.lastUsed;
          oldestVoice = voice;
        }
      }
      if (oldestVoice) {
        const age = now - oldestTime;
        console.warn(
          `[${now.toFixed(4)}] Voice stealing triggered for note ${noteNumber} - oldest voice is ${oldestVoice.id}, age ${age.toFixed(1)} s`,
        );
        targetVoice = oldestVoice;
        for (const [note, voice] of this.noteToVoiceMap.entries()) {
          if (voice === targetVoice) {
            this.noteToVoiceMap.delete(note);
          }
        }
        targetVoice.fastChoke(now);
        startDelay = targetVoice.chokeDuration;
      }
    }

    if (targetVoice) {
      targetVoice.noteOn(noteNumber, velocity, startDelay);
      this.noteToVoiceMap.set(noteNumber, targetVoice);
    }
  }

  noteOff(noteNumber: number): void {
    const voice = this.noteToVoiceMap.get(noteNumber);
    if (voice) {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - releasing voice`,
      );
      voice.noteOff();
      this.noteToVoiceMap.delete(noteNumber);
    } else {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - no active voice found`,
      );
    }
  }

  allNotesOff(): void {
    console.log('allNotesOff');
    for (const [note, voice] of this.noteToVoiceMap.entries()) {
      voice.noteOff();
      this.noteToVoiceMap.delete(note);
    }
  }

  destroy(): void {
    this.noteToVoiceMap.clear();
    this.voicePool?.forEach(voice => voice.destroy());
  }

  private ensureVoicePool(): V[] {
    if (this.voicePool === undefined) {
      this.voicePool = Array.from({ length: this.maxVoices }, () =>
        this.createVoice(),
      );
    }
    return this.voicePool;
  }
}
```

Use a private `ensureVoicePool(): V[]` copied from `Synth`. Do not add a
destroyed guard to `VoiceManager`; `Synth` owns that lifecycle guard.

- [ ] **Step 4: Run focused tests and confirm pass**

Run: `pnpm --filter @axiom/audio-engine exec vitest run src/engine/voice-manager.test.ts`

Expected: PASS with all `VoiceManager` tests green.

- [ ] **Step 5: Commit tested manager**

```bash
git add packages/audio-engine/src/engine/voice-manager.ts packages/audio-engine/src/engine/voice-manager.test.ts
git commit -m "feat: add voice manager"
```

### Task 2: Make `Synth` delegate and export manager

**Files:**

- Modify: `packages/audio-engine/src/engine/synth.ts`
- Modify: `packages/audio-engine/src/engine/index.ts`
- Test: `packages/audio-engine/src/engine/voice-manager.test.ts`

**Interfaces:**

- Consumes: `VoiceManager` constructor and public methods from Task 1.
- Produces: unchanged public `Synth<V>` note API backed by `VoiceManager<V>`;
  package exports include `VoiceManager`.

- [ ] **Step 1: Extend test with `Synth` delegation coverage**

In `voice-manager.test.ts`, define a small `TestSynth extends Synth<TestVoice>`
whose `createVoice()` returns and records `TestVoice` instances. Add a test
that calls `synth.noteOn(60, 1)`, `synth.noteOff(60)`, and `synth.destroy()`.
Assert voice creation, `noteOffSpy`, and `destroySpy`. Then call
`synth.noteOn(61, 1)` after destruction and assert it creates no new voice.

```ts
it('keeps Synth destruction guard while delegating voice lifecycle', () => {
  const synth = new TestSynth(context);
  synth.noteOn(60, 1);
  const voice = synth.voices[0]!;
  synth.noteOff(60);
  synth.destroy();
  synth.noteOn(61, 1);

  expect(voice.noteOffSpy).toHaveBeenCalledOnce();
  expect(voice.destroySpy).toHaveBeenCalledOnce();
  expect(synth.voices).toHaveLength(16);
});
```

- [ ] **Step 2: Run delegation test and confirm failure**

Run: `pnpm --filter @axiom/audio-engine exec vitest run src/engine/voice-manager.test.ts`

Expected: FAIL until `Synth` delegates to `VoiceManager`.

- [ ] **Step 3: Refactor `Synth` and export manager**

Replace `Synth` pool and map fields with:

```ts
private readonly voiceManager: VoiceManager<V>;
```

Initialize it in constructor after assigning `ctxt` and `audioSink`:

```ts
this.voiceManager = new VoiceManager(ctxt, () => this.createVoice(), options);
```

Keep each existing `Synth` destroyed guard. Replace note-method bodies with
the matching manager call:

```ts
this.voiceManager.noteOn(noteNumber, velocity);
this.voiceManager.noteOff(noteNumber);
this.voiceManager.allNotesOff();
```

In `destroy()`, set `this.destroyed = true` and call
`this.voiceManager.destroy()`. Remove allocation imports, fields, and helper
methods. Add this engine-barrel line:

```ts
export * from './voice-manager';
```

`packages/audio-engine/src/index.ts` already re-exports the engine barrel, so
no direct change is needed there.

- [ ] **Step 4: Run full engine tests and type build**

Run: `pnpm test && pnpm --filter @axiom/audio-engine build`

Expected: all Vitest tests pass; package build exits 0.

- [ ] **Step 5: Commit delegation and export**

```bash
git add packages/audio-engine/src/engine/synth.ts packages/audio-engine/src/engine/index.ts packages/audio-engine/src/engine/voice-manager.test.ts
git commit -m "refactor: delegate synth allocation to voice manager"
```

### Task 3: Record architectural ownership and verify repository

**Files:**

- Modify: `docs/codebase/ARCHITECTURE.md`

**Interfaces:**

- Consumes: public `VoiceManager` established in Tasks 1 and 2.
- Produces: architecture documentation matching code ownership.

- [ ] **Step 1: Update ownership and evidence documentation**

In the system-flow section, replace `Synth.voicePool` with
`Synth.voiceManager`. In the responsibility table, change `Synth` ownership to
delegation and add `VoiceManager` ownership for pool, note map, stealing,
choke, `allNotesOff`, and allocated voice destruction. Update reused-pattern
and evidence references to name `voice-manager.ts` for allocation and
`synth.ts` for delegation.

- [ ] **Step 2: Format changed documentation**

Run: `pnpm exec prettier --write docs/codebase/ARCHITECTURE.md`

Expected: exits 0.

- [ ] **Step 3: Run final verification**

Run: `pnpm test && pnpm build && pnpm lint`

Expected: all commands exit 0.

- [ ] **Step 4: Inspect final changes**

Run: `git status --short && git diff --check && git log --oneline -5`

Expected: only intended uncommitted documentation change; no whitespace errors.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/codebase/ARCHITECTURE.md
git commit -m "docs: document voice manager ownership"
```
