# Test Double Homes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every `@axiom/audio-engine` test double a home under `packages/audio-engine/src/testing/`, unifying true duplicates, and record the two-clause rule in the codebase docs.

**Architecture:** Pure relocation with one unification. `TestOscillator` (`implements Oscillator`) is shared by two suites, so the two oscillator doubles merge into one helper with a `connections` getter. The two `Voice`/`Synth` pairs stay separate because they measure different seams: one records the base class's protected `internal*` hooks, the other overrides the public methods to spy on `VoiceManager` delegation. No production module changes, no barrel export changes.

**Tech Stack:** TypeScript, Vitest, pnpm workspace. Helpers import `@axiom/audio-testing` fakes and engine internals by relative path.

## Global Constraints

- Work in the worktree at `/Users/sander/Projects/me/axiom-synth/.worktrees/test-double-homes` (branch `refactor/test-double-homes`, off `main`).
- No production behavior change: every existing test must stay green (93 tests: 87 audio-engine, 6 axiom-synth).
- One class per helper file under `packages/audio-engine/src/testing/`.
- Helpers are never exported from a package barrel and never imported by production code.
- Reuse the existing `as unknown as` conversions from the doubles being moved; these helper files are test support and keep those conversions verbatim.
- Prettier formatting is enforced by the pre-commit hook; keep `printWidth: 80`, `singleQuote: true`, `arrowParens: avoid`.
- Commit messages use Conventional Commits; scopes `(engine)` and `docs`.

---

### Task 1: Extract `TestOscillator` and refactor `unison-oscillator.test.ts`

**Files:**

- Create: `packages/audio-engine/src/testing/test-oscillator.ts`
- Modify: `packages/audio-engine/src/engine/unison-oscillator.test.ts`

**Interfaces:**

- Consumes: `Oscillator` interface from `../engine/oscillator`; `FakeAudioContext`, `FakeAudioParam`, `type FakeAudioDestination`, `type FakeOscillatorNode` from `@axiom/audio-testing`.
- Produces: `export class TestOscillator implements Oscillator` with public fields `throwOnStart: boolean`, `endSynchronouslyOnStart: boolean`, `unsubscribeCalls: number`, a settable `throwOnStop: boolean`, constructor `(context: FakeAudioContext)`, and `export const createTestOscillator = (context: FakeAudioContext) => TestOscillator`.

- [ ] **Step 1: Create the helper file**

Create `packages/audio-engine/src/testing/test-oscillator.ts` with exactly:

```ts
import {
  FakeAudioContext,
  FakeAudioParam,
  type FakeAudioDestination,
  type FakeOscillatorNode,
} from '@axiom/audio-testing';
import type { Oscillator } from '../engine/oscillator';

export class TestOscillator implements Oscillator {
  private readonly node: FakeOscillatorNode;
  private readonly gainParam = new FakeAudioParam();
  throwOnStart = false;
  endSynchronouslyOnStart = false;
  unsubscribeCalls = 0;

  set throwOnStop(value: boolean) {
    this.node.throwOnStop = value;
  }

  constructor(context: FakeAudioContext) {
    this.node = context.createOscillator();
  }

  get waveform() {
    return this.node.type as Oscillator['waveform'];
  }

  set waveform(value: Oscillator['waveform']) {
    this.node.type = value;
  }

  get frequency() {
    return this.node.frequency as unknown as AudioParam;
  }

  get detune() {
    return this.node.detune as unknown as AudioParam;
  }

  get gain() {
    return this.gainParam as unknown as AudioParam;
  }

  connect(destination: AudioNode | AudioParam): void {
    this.node.connect(destination as unknown as FakeAudioDestination);
  }

  disconnect(destination?: AudioNode | AudioParam | null): void {
    this.node.disconnect(
      destination as unknown as FakeAudioDestination | undefined,
    );
  }

  start(_noteHz: number, now: number): void {
    if (this.throwOnStart) throw new Error('TestOscillator start failed');
    this.node.start(now);
    if (this.endSynchronouslyOnStart) this.node.end();
  }

  stop(time?: number): void {
    this.node.stop(time);
  }

  onEnded(subscriber: () => void) {
    this.node.onended = subscriber;
    return {
      unsubscribe: () => {
        this.unsubscribeCalls++;
        if (this.node.onended === subscriber) this.node.onended = null;
      },
    };
  }

  destroy(): void {
    this.node.disconnect();
  }
}

export const createTestOscillator = (context: FakeAudioContext) =>
  new TestOscillator(context);
```

- [ ] **Step 2: Point `unison-oscillator.test.ts` at the helper**

In `packages/audio-engine/src/engine/unison-oscillator.test.ts`, delete the entire local `class TestOscillator implements Oscillator { ... }` block (currently lines 13–81).

Replace the import block so it reads exactly:

```ts
import { describe, expect, it } from 'vitest';
import { UnisonOscillator } from './unison-oscillator';
import {
  FakeAudioContext,
  FakeConstantSourceNode,
  installFakeAudioParam,
} from '@axiom/audio-testing';
import { TestOscillator } from '../testing/test-oscillator';
```

(`FakeAudioParam`, `FakeAudioDestination`, `FakeOscillatorNode`, and `Oscillator` are now unused here and must not remain.)

- [ ] **Step 3: Type-check and run the engine suite**

Run: `pnpm --filter @axiom/audio-engine build && pnpm --filter @axiom/audio-engine test`
Expected: `tsc --noEmit` clean; Vitest reports `Test Files 8 passed (8)`, `Tests 87 passed (87)`.

- [ ] **Step 4: Commit**

```bash
git add packages/audio-engine/src/testing/test-oscillator.ts packages/audio-engine/src/engine/unison-oscillator.test.ts
git commit -m "refactor(engine): move TestOscillator into src/testing"
```

---

### Task 2: Add `connections` to `TestOscillator` and refactor `unison-voice-path.test.ts`

**Files:**

- Modify: `packages/audio-engine/src/testing/test-oscillator.ts`
- Modify: `packages/audio-engine/src/engine/unison-voice-path.test.ts`

**Interfaces:**

- Consumes: `TestOscillator` from Task 1; `type FakeConnection` from `@axiom/audio-testing`.
- Produces: `TestOscillator.connections: readonly FakeConnection[]` (getter delegating to the backing node).

- [ ] **Step 1: Add the `connections` getter**

In `packages/audio-engine/src/testing/test-oscillator.ts`, add `type FakeConnection` to the `@axiom/audio-testing` import, and add this getter immediately after the `gain` getter:

```ts
  get connections(): readonly FakeConnection[] {
    return this.node.connections;
  }
```

The import becomes:

```ts
import {
  FakeAudioContext,
  FakeAudioParam,
  type FakeAudioDestination,
  type FakeConnection,
  type FakeOscillatorNode,
} from '@axiom/audio-testing';
```

- [ ] **Step 2: Point `unison-voice-path.test.ts` at the shared helper**

In `packages/audio-engine/src/engine/unison-voice-path.test.ts`:

- Remove the local `function createOscillator(context: FakeAudioContext): Oscillator & { ... } { ... }` block (currently lines 28–61).
- Remove `import type { Oscillator } from './oscillator';` (currently line 3) — it is now unused.
- Add `import { createTestOscillator } from '../testing/test-oscillator';` after the `@axiom/audio-testing` import.
- Replace every call to `createOscillator(context)` with `createTestOscillator(context)` (11 call sites; the definition itself is removed).

The import block becomes:

```ts
import { describe, expect, it } from 'vitest';
import { FakeAudioContext, installFakeAudioParam } from '@axiom/audio-testing';
import { createTestOscillator } from '../testing/test-oscillator';
import { UnisonVoicePathPool } from './unison-voice-path';
```

- [ ] **Step 3: Type-check and run the engine suite**

Run: `pnpm --filter @axiom/audio-engine build && pnpm --filter @axiom/audio-engine test`
Expected: `tsc --noEmit` clean; `Test Files 8 passed (8)`, `Tests 87 passed (87)`. The `oscillator.connections` assertions (no direct oscillator→output path; cleared on destroy) still pass because `connect`/`disconnect` now record into the backing node and `destroy()` disconnects it.

- [ ] **Step 4: Commit**

```bash
git add packages/audio-engine/src/testing/test-oscillator.ts packages/audio-engine/src/engine/unison-voice-path.test.ts
git commit -m "refactor(engine): share TestOscillator across oscillator suites"
```

---

### Task 3: Extract `TestVoice`/`TestSynth` and refactor `synth.test.ts`

**Files:**

- Create: `packages/audio-engine/src/testing/test-voice.ts`
- Create: `packages/audio-engine/src/testing/test-synth.ts`
- Modify: `packages/audio-engine/src/engine/synth.test.ts`

**Interfaces:**

- Consumes: `Voice` from `../engine/voice`; `Synth` from `../engine/synth`; `type ActivitySink` from `../engine/activity-sink`.
- Produces: `export class TestVoice extends Voice` (constructor `(ctxt: AudioContext, audioSink: AudioNode, label: string)`, fields `noteOnCalls`, `fastChokeCalls`, `noteOffCount`, `silentAt`) and `export class TestSynth extends Synth<TestVoice>` (constructor `(ctxt, audioSink, maxVoices: number, activity?: ActivitySink)`, field `voices: TestVoice[]`).

- [ ] **Step 1: Create `test-voice.ts`**

```ts
import type { Voice } from '../engine/voice';

export class TestVoice extends Voice {
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
```

- [ ] **Step 2: Create `test-synth.ts`**

```ts
import type { ActivitySink } from '../engine/activity-sink';
import { Synth } from '../engine/synth';
import { TestVoice } from './test-voice';

export class TestSynth extends Synth<TestVoice> {
  readonly voices: TestVoice[] = [];

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    maxVoices: number,
    activity?: ActivitySink,
  ) {
    super(ctxt, audioSink, { maxVoices, activity });
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
```

- [ ] **Step 3: Point `synth.test.ts` at the helpers**

In `packages/audio-engine/src/engine/synth.test.ts`:

- Delete the local `class TestVoice extends Voice { ... }` block (currently lines 7–33).
- Delete the local `class TestSynth extends Synth<TestVoice> { ... }` block (currently lines 35–56).
- Remove `import type { ActivitySink } from './activity-sink';` and `import { Voice } from './voice';` (now unused).
- Keep `import { Synth } from './synth';` only if `Synth` is still referenced — it is not, so remove it too.
- Add `import { TestSynth } from '../testing/test-synth';`.

The import block becomes:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeAudioNode } from '@axiom/audio-testing';
import { TestSynth } from '../testing/test-synth';
```

Leave `makeSynth` and every test body unchanged — the `TestSynth` constructor signature `(ctxt, sink, maxVoices, activity?)` matches all existing call sites, including `new TestSynth(ctx, sink, 1, { activate: ... })`.

- [ ] **Step 4: Type-check and run the engine suite**

Run: `pnpm --filter @axiom/audio-engine build && pnpm --filter @axiom/audio-engine test`
Expected: `tsc --noEmit` clean; `Test Files 8 passed (8)`, `Tests 87 passed (87)`.

- [ ] **Step 5: Commit**

```bash
git add packages/audio-engine/src/testing/test-voice.ts packages/audio-engine/src/testing/test-synth.ts packages/audio-engine/src/engine/synth.test.ts
git commit -m "refactor(engine): move Voice/Synth recording doubles into src/testing"
```

---

### Task 4: Extract `SpyVoice`/`SpySynth` and refactor `voice-manager.test.ts`

**Files:**

- Create: `packages/audio-engine/src/testing/spy-voice.ts`
- Create: `packages/audio-engine/src/testing/spy-synth.ts`
- Modify: `packages/audio-engine/src/engine/voice-manager.test.ts`

**Interfaces:**

- Consumes: `Voice` from `../engine/voice`; `Synth` from `../engine/synth`; `vi` from `vitest`.
- Produces: `export class SpyVoice extends Voice` (fields `noteOnCalls`, `noteOffSpy`, `fastChokeSpy`, `destroySpy`) and `export class SpySynth extends Synth<SpyVoice>` (field `voices: SpyVoice[]`, uses the inherited `(ctxt, audioSink, { maxVoices })` constructor).

- [ ] **Step 1: Create `spy-voice.ts`**

```ts
import { vi } from 'vitest';
import { Voice } from '../engine/voice';

export class SpyVoice extends Voice {
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
    this.currentNote = null;
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

- [ ] **Step 2: Create `spy-synth.ts`**

```ts
import { Synth } from '../engine/synth';
import { SpyVoice } from './spy-voice';

export class SpySynth extends Synth<SpyVoice> {
  readonly voices: SpyVoice[] = [];

  protected override createVoice(): SpyVoice {
    const voice = new SpyVoice(this.ctxt, this.audioSink);
    this.voices.push(voice);
    return voice;
  }
}
```

- [ ] **Step 3: Point `voice-manager.test.ts` at the helpers**

In `packages/audio-engine/src/engine/voice-manager.test.ts`:

- Delete the local `class TestVoice extends Voice { ... }` block (currently lines 8–51).
- Delete the local `class TestSynth extends Synth<TestVoice> { ... }` block (currently lines 71–79).
- Remove `import { Synth } from './synth';` and `import { Voice } from './voice';` (now unused).
- Add `import { SpyVoice } from '../testing/spy-voice';` and `import { SpySynth } from '../testing/spy-synth';`.
- Keep `import { VoiceManager } from './voice-manager';` and keep `vi` in the vitest import (still used by `vi.spyOn`).
- Replace every `TestVoice` with `SpyVoice` (the `createManager` parameter and return types, and all `const voices: TestVoice[]` annotations).
- Replace `new TestSynth(` with `new SpySynth(` (the call passes `{ maxVoices: 16 }`, which matches the inherited constructor).

The import block becomes:

```ts
import { describe, expect, it, vi } from 'vitest';

import { FakeAudioContext } from '@axiom/audio-testing';
import { SpySynth } from '../testing/spy-synth';
import { SpyVoice } from '../testing/spy-voice';
import { VoiceManager } from './voice-manager';
```

And `createManager` becomes:

```ts
function createManager(
  context: FakeAudioContext,
  voices: SpyVoice[],
  maxVoices = 2,
): VoiceManager<SpyVoice> {
  return new VoiceManager(
    () => {
      const voice = new SpyVoice(
        context as unknown as AudioContext,
        context.destination as unknown as AudioNode,
      );
      voices.push(voice);
      return voice;
    },
    { maxVoices },
  );
}
```

- [ ] **Step 4: Type-check and run the engine suite**

Run: `pnpm --filter @axiom/audio-engine build && pnpm --filter @axiom/audio-engine test`
Expected: `tsc --noEmit` clean; `Test Files 8 passed (8)`, `Tests 87 passed (87)`.

- [ ] **Step 5: Commit**

```bash
git add packages/audio-engine/src/testing/spy-voice.ts packages/audio-engine/src/testing/spy-synth.ts packages/audio-engine/src/engine/voice-manager.test.ts
git commit -m "refactor(engine): move VoiceManager spy doubles into src/testing"
```

---

### Task 5: Record the rule in the codebase docs

**Files:**

- Modify: `docs/codebase/RULES.md`
- Modify: `docs/codebase/TESTING.md`

**Interfaces:**

- Consumes: nothing.
- Produces: nothing (documentation only).

- [ ] **Step 1: Add rule 10 to `RULES.md`**

In `docs/codebase/RULES.md`, insert a new section immediately before the `## History` heading:

```markdown
## Testing

### 10. Test doubles live with the layer they fake

`@axiom/audio-testing` holds doubles for the Web Audio API only (`AudioContext`,
audio nodes, `AudioParam`, `AudioWorklet` globals) and may use Vitest spies and
fns. It never imports a domain package (`@axiom/audio-engine`,
`@axiom/axiom-synth`, `@axiom/native`), so it stays a dependency leaf.

Doubles for a package's own modules live under `<package>/src/testing/`. They
are never exported from the package barrel and never imported by production
code, so they cannot reach a production bundle.

Reference: `packages/audio-engine/src/testing/` (engine `Oscillator`, `Voice`,
and `Synth` doubles).
```

- [ ] **Step 2: Update `TESTING.md` §2 Test Layout**

In `docs/codebase/TESTING.md`, append this bullet to section `### 2) Test Layout`
(after the `@axiom/audio-testing` bullet):

```markdown
- Doubles for a package's own modules live under `<package>/src/testing/`
  (for example `packages/audio-engine/src/testing/`). They are not
  barrel-exported and not imported by production code.
```

- [ ] **Step 3: Update `TESTING.md` §4 Mocking and Isolation Strategy**

In `docs/codebase/TESTING.md`, replace the `Main mocking approach` bullet in
section `### 4) Mocking and Isolation Strategy` with:

```markdown
- Main mocking approach: two layers of doubles. Web Audio API fakes from
  `@axiom/audio-testing` (context, nodes, `AudioParam`) instrument connections,
  disconnections, source stops, and manually dispatched `onended` events.
  Module doubles from a package's `src/testing/` (for example engine
  `Oscillator`, `Voice`, and `Synth`) record the seam under test.
```

- [ ] **Step 4: Format and commit**

Run: `pnpm lint`
Expected: `All matched files use Prettier code style!`

```bash
git add docs/codebase/RULES.md docs/codebase/TESTING.md
git commit -m "docs: record test double home rule"
```

---

### Task 6: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test`
Expected: `@axiom/audio-engine` reports `Test Files 8 passed (8)`, `Tests 87 passed (87)`; `@axiom/axiom-synth` reports `Test Files 1 passed (1)`, `Tests 6 passed (6)`.

- [ ] **Step 2: Run the full build**

Run: `pnpm build`
Expected: every package's `tsc --noEmit` (or `vue-tsc`) succeeds; the app bundles without error.

- [ ] **Step 3: Run the full lint**

Run: `pnpm lint`
Expected: `All matched files use Prettier code style!`

- [ ] **Step 4: Confirm no barrel or production imports**

Run: `rg -n "src/testing|from './testing|from '../testing" packages/audio-engine/src/index.ts packages/audio-engine/src/engine/index.ts`
Expected: no matches (helpers are reachable only from test files).

Run: `rg -n "src/testing" packages/axiom-synth/src packages/app 2>/dev/null; true`
Expected: no matches (nothing outside the engine tests imports the helpers).
