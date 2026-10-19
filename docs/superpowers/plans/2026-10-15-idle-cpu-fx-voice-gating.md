# Idle CPU — Idle Gate & Idle-Voice Seam Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop FX DSP and remove idle voices from the audio graph when nothing plays, so idle CPU drops to the ~2% floor without changing the sound.

**Architecture:** A new engine unit `IdleGate` is an inline valve (`input`/`connect`/`disconnect`, like `Filter`/`Reverb`) placed at the tail of the FX island. It cuts its single internal `input → output` link once its own (post-FX) input has been silent for a debounce, and `Synth.noteOn` reopens it synchronously through a small `ActivitySink` port implemented by `AudioEngine`. Separately, `AxiomVoice` moves its idle unlink from `ampEnvelope.node ↔ ampModGain` to `ampModGain ↔ audioSink` so an idle voice leaves the graph.

**Tech Stack:** TypeScript (strict), Web Audio API, Vitest, `@axiom/audio-testing` fakes, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-10-15-idle-cpu-fx-voice-gating-design.md`

## Global Constraints

- TypeScript strict; `noUnusedLocals` and `noUnusedParameters` are `true` — no unused variables or imports.
- No magic numbers: every meaningful literal gets a named constant (AGENTS.md).
- Never commit to `main`; work on a feature branch and open a PR.
- Formatting is Prettier (`pnpm format`); CI runs `pnpm lint` (`prettier --check .`).
- Tests: `pnpm test` (Vitest for `@axiom/audio-engine` and `@axiom/axiom-synth`). Package-scoped: `pnpm --filter @axiom/audio-engine test`.
- Analysers and meters are leaf taps, never in the audio chain (RULES.md rule 8).
- Static node→AudioParam modulations stay in `ModulationRouter`; per-note audio-path switches stay in the voice (RULES.md rule 2).
- Inline units expose `get input()`, `connect(destination)`, `disconnect(destination?)` (pattern of `Filter`/`Reverb`).

## File Structure

- `packages/audio-engine/src/engine/activity-sink.ts` — **new**. `ActivitySink` interface (`activate()`), the wake port.
- `packages/audio-engine/src/engine/idle-gate.ts` — **new**. `IdleGate` unit + silence constants. Not exported from the barrel (internal plumbing; RULES.md rule 7).
- `packages/audio-engine/src/engine/index.ts` — export only `activity-sink`.
- `packages/audio-engine/src/engine/synth.ts` — add `activity?: ActivitySink` option; call it in `noteOn`.
- `packages/audio-engine/src/engine/engine.ts` — replace TEMP flags with the idle gate at the island tail; leaf-tap analyser/meter; implement `ActivitySink`.
- `packages/audio-engine/src/engine/idle-gate.test.ts` — **new**. `IdleGate` behavior tests.
- `packages/audio-engine/src/engine/synth.test.ts` — activity-notification tests.
- `packages/audio-testing/src/fake-audio-context.ts` — controllable `FakeAnalyserNode` time-domain data.
- `packages/axiom-synth/src/axiom-voice.ts` — move the idle unlink to `ampModGain ↔ audioSink`.
- `packages/axiom-synth/src/axiom-synth.ts` — forward `activity`; `MAX_VOICES` restored to 16 in Task 0.
- `packages/axiom-synth/src/axiom-synth.test.ts` — idle-seam and activity-forwarding tests.
- `app/src/composables/use-audio-environment.ts` — pass `{ activity: engine }`.

---

### Task 0: Clean workspace and branch

The working tree holds local measurement scaffolding (TEMP URL flags in `engine.ts`, `MAX_VOICES = 100` in `axiom-synth.ts`, a `<ScopePanel>` usage removed from `Synth.vue`) plus the deliverable docs. Discard the scaffolding, keep and commit the docs, then branch from `main`.

**Files:**

- Restore: `packages/audio-engine/src/engine/engine.ts`
- Restore: `packages/axiom-synth/src/axiom-synth.ts`
- Restore: `app/src/components/Synth.vue`
- Commit: `docs/codebase/RULES.md`, `docs/superpowers/specs/2026-10-15-idle-cpu-fx-voice-gating-design.md`, `docs/superpowers/plans/2026-10-15-idle-cpu-fx-voice-gating.md`
- Delete: `gemini-handoff.md`

- [ ] **Step 1: Confirm what is dirty**

Run: `git status --short`
Expected: modified `engine.ts`, `axiom-synth.ts`, `Synth.vue`, `docs/codebase/RULES.md`; untracked spec, plan, `gemini-handoff.md`.

- [ ] **Step 2: Discard the measurement edits**

Run: `git restore packages/audio-engine/src/engine/engine.ts packages/axiom-synth/src/axiom-synth.ts app/src/components/Synth.vue`
Expected: no output.

- [ ] **Step 3: Remove the leftover handoff artifact**

Run: `rm -f gemini-handoff.md`
Expected: no output.

- [ ] **Step 4: Create the feature branch**

Run: `git switch -c fix/idle-cpu-fx-voice-gating`
Expected: `Switched to a new branch 'fix/idle-cpu-fx-voice-gating'`.

- [ ] **Step 5: Commit the design deliverables**

Run:

```bash
git add docs/codebase/RULES.md docs/superpowers/specs/2026-10-15-idle-cpu-fx-voice-gating-design.md docs/superpowers/plans/2026-10-15-idle-cpu-fx-voice-gating.md
git commit -m "docs: add idle-gate design, plan, and monitor leaf-tap rule"
```

Expected: one commit.

- [ ] **Step 6: Confirm clean**

Run: `git status --short`
Expected: empty.

- [ ] **Step 7: Confirm baseline tests pass**

Run: `pnpm test`
Expected: all suites pass on the clean tree.

---

### Task 1: ActivitySink port + Synth wake hook

**Files:**

- Create: `packages/audio-engine/src/engine/activity-sink.ts`
- Modify: `packages/audio-engine/src/engine/index.ts`
- Modify: `packages/audio-engine/src/engine/synth.ts`
- Test: `packages/audio-engine/src/engine/synth.test.ts`

**Interfaces:**

- Produces: `export interface ActivitySink { activate(): void; }` (from `@axiom/audio-engine`).
- Produces: `Synth` constructor options become `{ maxVoices: number; activity?: ActivitySink }`.

- [ ] **Step 1: Write the failing tests**

In `packages/audio-engine/src/engine/synth.test.ts`, add the import:

```ts
import type { ActivitySink } from './activity-sink';
```

Change `TestSynth`'s constructor to accept and forward the port:

```ts
class TestSynth extends Synth<TestVoice> {
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

Add a new `describe` block at the end of the file:

```ts
describe('Synth activity notification', () => {
  it('activates the activity sink on noteOn', () => {
    const ctx = new FakeAudioContext();
    const sink = new FakeAudioNode(ctx);
    let activated = 0;
    const synth = new TestSynth(
      ctx as unknown as AudioContext,
      sink as unknown as AudioNode,
      1,
      {
        activate: () => {
          activated++;
        },
      },
    );

    synth.noteOn(60, 1);

    expect(activated).toBe(1);
  });

  it('does not activate the activity sink after destroy', () => {
    const ctx = new FakeAudioContext();
    const sink = new FakeAudioNode(ctx);
    let activated = 0;
    const synth = new TestSynth(
      ctx as unknown as AudioContext,
      sink as unknown as AudioNode,
      1,
      {
        activate: () => {
          activated++;
        },
      },
    );

    synth.destroy();
    synth.noteOn(60, 1);

    expect(activated).toBe(0);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @axiom/audio-engine test -- synth`
Expected: FAIL — `activate` is never called (`expected 0 to be 1`); `Synth` has no activity port yet.

- [ ] **Step 3: Create the port**

Create `packages/audio-engine/src/engine/activity-sink.ts`:

```ts
/**
 * A sink notified when audio activity begins, so a host (e.g. AudioEngine) can
 * wake gated DSP synchronously before the first render quantum of a new note.
 */
export interface ActivitySink {
  activate(): void;
}
```

- [ ] **Step 4: Export the port from the barrel**

In `packages/audio-engine/src/engine/index.ts`, add after `export * from './analyser';`:

```ts
export * from './activity-sink';
```

- [ ] **Step 5: Implement the wake hook in Synth**

In `packages/audio-engine/src/engine/synth.ts`, add the import:

```ts
import type { ActivitySink } from './activity-sink';
```

Add the field:

```ts
  protected readonly audioSink: AudioNode;
  private readonly activity: ActivitySink | undefined;
```

Change the constructor to store it:

```ts
  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    options: { maxVoices: number; activity?: ActivitySink },
  ) {
    if (ctxt.state === 'closed') {
      throw new Error('Cannot create Synth with a closed AudioContext');
    }
    this.ctxt = ctxt;
    this.audioSink = audioSink;
    this.activity = options.activity;
    this.voiceManager = new VoiceManager(() => this.createVoice(), options);
  }
```

Change `noteOn` to wake the port before the voice starts:

```ts
  noteOn(noteNumber: number, velocity: number) {
    if (this.destroyed) {
      return;
    }
    resumeIfSuspended(this.ctxt);
    this.activity?.activate();
    this.voiceManager.noteOn(noteNumber, velocity, this.ctxt.currentTime);
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @axiom/audio-engine test -- synth`
Expected: PASS.

- [ ] **Step 7: Typecheck and format**

Run: `pnpm --filter @axiom/audio-engine build && pnpm format`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/audio-engine/src/engine/activity-sink.ts packages/audio-engine/src/engine/index.ts packages/audio-engine/src/engine/synth.ts packages/audio-engine/src/engine/synth.test.ts
git commit -m "feat(engine): add ActivitySink wake hook to Synth"
```

---

### Task 2: IdleGate unit + controllable analyser fake

**Files:**

- Modify: `packages/audio-testing/src/fake-audio-context.ts`
- Create: `packages/audio-engine/src/engine/idle-gate.ts`
- Test: `packages/audio-engine/src/engine/idle-gate.test.ts`

**Interfaces:**

- Consumes: `Analyser` from `./analyser`.
- Produces: `export class IdleGate implements Destroyable` with `constructor(ctxt: AudioContext)`, `get input(): AudioNode`, `connect(destination: AudioNode): void`, `disconnect(): void`, `disconnect(destination: AudioNode): void`, `activate(): void`, `destroy(): void`.
- Produces: `export const SILENCE_FFT_SIZE`, `SILENCE_POLL_INTERVAL_MS`, `SILENCE_THRESHOLD`, `IDLE_DEBOUNCE_SECONDS`.

- [ ] **Step 1: Extend the fake analyser**

In `packages/audio-testing/src/fake-audio-context.ts`, replace `FakeAnalyserNode`:

```ts
export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;
  timeDomainData: ArrayLike<number> | null = null;

  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void {
    const data = this.timeDomainData;
    if (data === null) {
      array.fill(0);
      return;
    }
    for (let i = 0; i < array.length; i++) {
      array[i] = data[i] ?? 0;
    }
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `packages/audio-engine/src/engine/idle-gate.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeGainNode } from '@axiom/audio-testing';
import {
  IDLE_DEBOUNCE_SECONDS,
  IdleGate,
  SILENCE_POLL_INTERVAL_MS,
} from './idle-gate';

function makeGate() {
  const ctx = new FakeAudioContext();
  const destination = ctx.createGain();
  const gate = new IdleGate(ctx as unknown as AudioContext);
  gate.connect(destination as unknown as AudioNode);

  const analyser = ctx.analysers[0]!;
  const input = gate.input as unknown as FakeGainNode;
  const output = ctx.gains.find(gain =>
    gain.connections.some(connection => connection.destination === destination),
  )!;
  const isOpen = () =>
    input.connections.some(connection => connection.destination === output);
  const tapsAnalyser = () =>
    input.connections.some(connection => connection.destination === analyser);
  const ticks = (ms: number) => vi.advanceTimersByTime(ms);
  return { gate, analyser, input, isOpen, tapsAnalyser, ticks };
}

describe('IdleGate', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts open and taps its own input', () => {
    const { isOpen, tapsAnalyser } = makeGate();
    expect(isOpen()).toBe(true);
    expect(tapsAnalyser()).toBe(true);
  });

  it('closes after the debounce of silence', () => {
    const { analyser, isOpen, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0, 0, 0]);

    ticks(IDLE_DEBOUNCE_SECONDS * 1000 - SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(true);

    ticks(SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(false);
  });

  it('reopens when activity resumes while closed', () => {
    const { analyser, isOpen, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0, 0, 0]);
    ticks(IDLE_DEBOUNCE_SECONDS * 1000 + SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(false);

    analyser.timeDomainData = new Float32Array([0.5, 0, 0]);
    ticks(SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(true);
  });

  it('never closes while the input carries signal', () => {
    const { analyser, isOpen, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0.5, 0.5, 0.5]);
    ticks(SILENCE_POLL_INTERVAL_MS * 10);
    expect(isOpen()).toBe(true);
  });

  it('activate() reopens immediately', () => {
    const { gate, analyser, isOpen, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0, 0, 0]);
    ticks(IDLE_DEBOUNCE_SECONDS * 1000 + SILENCE_POLL_INTERVAL_MS);
    expect(isOpen()).toBe(false);

    gate.activate();

    expect(isOpen()).toBe(true);
  });

  it('destroy() stops polling and detaches the analyser tap', () => {
    const { gate, analyser, tapsAnalyser, ticks } = makeGate();
    analyser.timeDomainData = new Float32Array([0, 0, 0]);
    gate.destroy();

    expect(tapsAnalyser()).toBe(false);
    expect(() => ticks(SILENCE_POLL_INTERVAL_MS * 8)).not.toThrow();
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @axiom/audio-engine test -- idle-gate`
Expected: FAIL — cannot resolve `./idle-gate`.

- [ ] **Step 4: Implement IdleGate**

Create `packages/audio-engine/src/engine/idle-gate.ts`:

```ts
import { Analyser } from './analyser';
import type { Destroyable } from './destroyable';

/** Time-domain samples per silence check; power of two, cheap to analyse. */
export const SILENCE_FFT_SIZE = 32;
/** How often the gate checks for silence, in milliseconds. */
export const SILENCE_POLL_INTERVAL_MS = 250;
/** Time-domain magnitude at or below which a sample counts as silence. */
export const SILENCE_THRESHOLD = 1e-4;
/** Continuous silence, in seconds, before the gate closes. */
export const IDLE_DEBOUNCE_SECONDS = 1;

/**
 * An inline valve (same shape as Filter/Reverb) placed at the tail of a
 * subgraph. While its input is silent it cuts the internal input -> output link,
 * leaving the whole upstream subgraph unreachable from the destination so it
 * stops rendering. `activate()` restores the link synchronously.
 */
export class IdleGate implements Destroyable {
  private readonly _input: GainNode;
  private readonly _output: GainNode;
  private readonly analyser: Analyser;
  private readonly pollIntervalId: ReturnType<typeof setInterval>;
  private silentSeconds = 0;
  private open = true;
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this._input = ctxt.createGain();
    this._output = ctxt.createGain();
    this._input.connect(this._output);

    this.analyser = new Analyser(ctxt, {
      size: SILENCE_FFT_SIZE,
      type: 'timeDomain',
    });
    this._input.connect(this.analyser.input);

    this.pollIntervalId = setInterval(
      () => this.poll(),
      SILENCE_POLL_INTERVAL_MS,
    );
  }

  get input(): AudioNode {
    return this._input;
  }

  connect(destination: AudioNode): void {
    this._output.connect(destination);
  }

  disconnect(): void;
  disconnect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void {
    if (destination) {
      this._output.disconnect(destination);
    } else {
      this._output.disconnect();
    }
  }

  activate(): void {
    if (this.destroyed) {
      return;
    }
    this.silentSeconds = 0;
    if (!this.open) {
      this.open = true;
      this._input.connect(this._output);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    clearInterval(this.pollIntervalId);
    if (this.open) {
      this.close();
    }
    try {
      this._input.disconnect(this.analyser.input);
    } catch {
      // Already disconnected.
    }
    this.analyser.destroy();
    this._input.disconnect();
    this._output.disconnect();
  }

  private poll(): void {
    if (this.destroyed) {
      return;
    }
    if (this.isQuiet()) {
      this.silentSeconds += SILENCE_POLL_INTERVAL_MS / 1000;
      if (this.open && this.silentSeconds >= IDLE_DEBOUNCE_SECONDS) {
        this.close();
      }
      return;
    }
    this.silentSeconds = 0;
    if (!this.open) {
      this.activate();
    }
  }

  private isQuiet(): boolean {
    const buffer = this.analyser.getBuffer();
    for (let i = 0; i < buffer.length; i++) {
      if (Math.abs(buffer[i]!) > SILENCE_THRESHOLD) {
        return false;
      }
    }
    return true;
  }

  private close(): void {
    this.open = false;
    this._input.disconnect(this._output);
  }
}
```

Do **not** add `idle-gate` to `engine/index.ts` — internal plumbing (RULES.md rule 7); the test imports the module directly.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @axiom/audio-engine test -- idle-gate`
Expected: PASS (6 tests).

- [ ] **Step 6: Typecheck and format**

Run: `pnpm --filter @axiom/audio-engine build && pnpm format`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/audio-testing/src/fake-audio-context.ts packages/audio-engine/src/engine/idle-gate.ts packages/audio-engine/src/engine/idle-gate.test.ts
git commit -m "feat(engine): add IdleGate inline sleep valve"
```

---

### Task 3: Wire IdleGate into AudioEngine

No automated test covers `AudioEngine` (it constructs a real `AudioContext`); the gate behavior is covered by Task 2 and the wiring is verified by build, lint, and the manual CPU measurement in Task 6.

**Files:**

- Modify: `packages/audio-engine/src/engine/engine.ts`

**Interfaces:**

- Consumes: `IdleGate` from `./idle-gate`; `ActivitySink` from `./activity-sink`.
- Produces: `AudioEngine implements ActivitySink` with `activate(): void`.

- [ ] **Step 1: Update imports**

At the top of `packages/audio-engine/src/engine/engine.ts`, add:

```ts
import type { ActivitySink } from './activity-sink';
import { IdleGate } from './idle-gate';
```

- [ ] **Step 2: Update fields and declare ActivitySink**

Change the class declaration and fields (remove `fxSend`/`fxReturn`/`fxGate` if present; none exist on the clean tree, only `idleGate` is added):

```ts
export class AudioEngine implements Destroyable, ActivitySink {
  public readonly ctxt: AudioContext;
  public readonly masterInput: GainNode;
  private readonly master: GainNode;
  private readonly meter: Meter;
  private readonly analyser: AnalyserNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly feedbackDelay: FeedbackDelay;
  private readonly reverb: Reverb;
  private readonly idleGate: IdleGate;
  private destroyed = false;
  public readonly id: number;
```

- [ ] **Step 3: Replace the TEMP-flag wiring**

Replace the block that starts at the `// TEMP CPU-isolation flags` comment (the `const debugFlags = ...` block) through the end of the constructor's `if (useComp) { ... } else { ... }` chain with:

```ts
this.masterInput.connect(this.feedbackDelay.input);
this.feedbackDelay.connect(this.reverb.input);
this.reverb.connect(this.idleGate.input);
this.idleGate.connect(this.master);

// Master chain; analyser and meter are leaf taps, not in the path.
this.master.connect(this.comp);
this.comp.connect(this.ctxt.destination);
this.comp.connect(this.analyser);
this.comp.connect(this.meter.input);
```

Then add the gate creation immediately after `this.reverb.wet.setValueAtTime(0.4, this.ctxt.currentTime);`:

```ts
this.idleGate = new IdleGate(this.ctxt);
```

Leave `masterInput`, `master`, `meter`, `analyser`, `comp`, `feedbackDelay`, `reverb` creation and their value assignments unchanged.

- [ ] **Step 4: Add activate()**

Add next to `ensureStarted()`:

```ts
  activate(): void {
    this.idleGate.activate();
  }
```

Leave the `reverbBuffer` getter/setter unchanged.

- [ ] **Step 5: Update destroy()**

In `destroy()`, add the gate teardown before `this.ctxt.close();`:

```ts
this.idleGate.destroy();
```

Keep `this.meter.destroy()`, `this.comp.disconnect()`, `this.analyser.disconnect()`, `this.masterInput.disconnect()`, `this.master.disconnect()`, `this.ctxt.close()`.

- [ ] **Step 6: Typecheck, format, and lint**

Run: `pnpm --filter @axiom/audio-engine build && pnpm format && pnpm lint`
Expected: no unused-locals errors (the TEMP flag locals are gone); Prettier clean.

- [ ] **Step 7: Run the full engine test suite**

Run: `pnpm --filter @axiom/audio-engine test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/audio-engine/src/engine/engine.ts
git commit -m "feat(engine): gate the FX island with IdleGate; leaf-tap analyser and meter"
```

---

### Task 4: Move the AxiomVoice idle unlink seam

**Files:**

- Modify: `packages/axiom-synth/src/axiom-voice.ts`
- Test: `packages/axiom-synth/src/axiom-synth.test.ts`

**Interfaces:**

- Behavior: an idle `AxiomVoice` has no `ampModGain → audioSink` connection; the link exists only between `onSoundStart` and `onSoundStop`.

- [ ] **Step 1: Write the failing test**

In `packages/axiom-synth/src/axiom-synth.test.ts`, add at the end of the file:

```ts
describe('AxiomVoice idle seam', () => {
  it('drops the voice amp-mod gain from the output when idle', () => {
    vi.useFakeTimers();
    const { ctx, synth } = makeSynth();

    synth.noteOn(60, 1);
    const voiceAmpMod = ctx.gains.find(gain =>
      gain.connections.some(c => c.destination === synth.output),
    );
    expect(voiceAmpMod).toBeDefined();

    synth.noteOff(60);
    vi.advanceTimersByTime(4_000);

    expect(
      voiceAmpMod!.connections.some(c => c.destination === synth.output),
    ).toBe(false);
    synth.destroy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @axiom/axiom-synth test -- axiom-synth`
Expected: FAIL — the amp-mod gain stays connected to the output after cleanup (today it is wired in the constructor and never removed).

- [ ] **Step 3: Move the constructor connection**

In `packages/axiom-synth/src/axiom-voice.ts`, replace:

```ts
// Create ampModGain (bias 1.0, sits between envelope and sink)
this.ampModGain = ctxt.createGain();
this.ampModGain.gain.value = 1.0;
this.ampModGain.connect(this.audioSink);
```

with:

```ts
// Create ampModGain (bias 1.0, sits between envelope and sink). The
// envelope link is permanent; the sink link is a per-note switch so idle
// voices leave the graph entirely.
this.ampModGain = ctxt.createGain();
this.ampModGain.gain.value = 1.0;
this.ampEnvelope.node.connect(this.ampModGain);
```

- [ ] **Step 4: Update onSoundStart**

In `onSoundStart`, replace the `else` branch body:

```ts
    } else {
      // ampEnvelope.node <-> ampModGain is a per-note audio-path switch,
      // intentionally not patched (ModulationRouter is static node-to-param only).
      this.ampEnvelope.node.connect(this.ampModGain);
    }
```

with:

```ts
    } else {
      // ampModGain <-> sink is a per-note audio-path switch so idle voices
      // leave the graph, intentionally not patched (ModulationRouter is static
      // node-to-param only).
      this.ampModGain.connect(this.audioSink);
    }
```

- [ ] **Step 5: Update onSoundStop**

Replace the disconnect in `onSoundStop`:

```ts
try {
  this.ampEnvelope.node.disconnect(this.ampModGain);
} catch (exp) {
  // Was not connected, it's ok
}
```

with:

```ts
try {
  this.ampModGain.disconnect(this.audioSink);
} catch (exp) {
  // Was not connected, it's ok
}
```

- [ ] **Step 6: Update destroy()**

In `destroy()`, add the permanent-link teardown before `this.ampEnvelope.destroy();`:

```ts
this.ampEnvelope.node.disconnect(this.ampModGain);
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `pnpm --filter @axiom/axiom-synth test`
Expected: PASS.

- [ ] **Step 8: Typecheck and format**

Run: `pnpm --filter @axiom/axiom-synth build && pnpm format`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/axiom-synth/src/axiom-voice.ts packages/axiom-synth/src/axiom-synth.test.ts
git commit -m "fix(voice): remove idle voices from the graph at the sink seam"
```

---

### Task 5: Forward the activity port through AxiomSynth and the app

**Files:**

- Modify: `packages/axiom-synth/src/axiom-synth.ts`
- Modify: `packages/axiom-synth/src/axiom-synth.test.ts`
- Modify: `app/src/composables/use-audio-environment.ts`

**Interfaces:**

- Consumes: `ActivitySink` from `@axiom/audio-engine`.
- Produces: `AxiomSynth` constructor `(ctxt: AudioContext, audioSink: AudioNode, options?: { activity?: ActivitySink })`.

- [ ] **Step 1: Write the failing test**

In `packages/axiom-synth/src/axiom-synth.test.ts`, add at the end:

```ts
describe('AxiomSynth activity forwarding', () => {
  it('activates the activity sink on noteOn', () => {
    vi.useFakeTimers();
    const ctx = new FakeAudioContext();
    const sink = new FakeAudioNode(ctx);
    let activated = 0;
    const synth = new AxiomSynth(
      ctx as unknown as AudioContext,
      sink as unknown as AudioNode,
      {
        activity: {
          activate: () => {
            activated++;
          },
        },
      },
    );

    synth.noteOn(60, 1);

    expect(activated).toBe(1);
    synth.destroy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @axiom/axiom-synth test -- axiom-synth`
Expected: FAIL — `AxiomSynth`'s constructor does not accept a third argument / does not forward activity.

- [ ] **Step 3: Forward the port in AxiomSynth**

In `packages/axiom-synth/src/axiom-synth.ts`, add `ActivitySink` to the type imports from `@axiom/audio-engine`:

```ts
  type EnvelopeConfig,
  type FilterConfig,
  type FilterType,
  type FixedArray,
  type ActivitySink,
```

Change the constructor:

```ts
  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    options: { activity?: ActivitySink } = {},
  ) {
    super(ctxt, audioSink, {
      maxVoices: MAX_VOICES,
      activity: options.activity,
    });
```

- [ ] **Step 4: Pass the engine as the activity sink in the app**

In `app/src/composables/use-audio-environment.ts`, replace `createSynth`:

```ts
function createSynth(engine: AudioEngine): AxiomSynth {
  const synth = markRaw(
    new AxiomSynth(engine.ctxt, engine.masterInput, { activity: engine }),
  );
  synth.output.connect(engine.masterInput);
  return synth;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @axiom/axiom-synth test`
Expected: PASS.

- [ ] **Step 6: Typecheck everything, format, lint**

Run: `pnpm build && pnpm format && pnpm lint`
Expected: all packages typecheck (including `@axiom/app`); Prettier clean.

- [ ] **Step 7: Commit**

```bash
git add packages/axiom-synth/src/axiom-synth.ts packages/axiom-synth/src/axiom-synth.test.ts app/src/composables/use-audio-environment.ts
git commit -m "feat(synth): forward activity port to wake the idle gate"
```

---

### Task 6: Manual verification and PR

**Files:** none.

- [ ] **Step 1: Run the full gate**

Run: `pnpm test && pnpm build && pnpm lint`
Expected: all pass.

- [ ] **Step 2: Measure idle CPU**

Run: `pnpm dev`, open `http://localhost:4000/` in Chrome, play notes, release, wait 10 s, then average 10 s in Chrome's Task Manager (tab row). Expected: idle CPU at the ~2–3% floor, well below the ~19–29% baseline.

- [ ] **Step 3: Verify sound is unchanged**

Play a note immediately after a long idle period; confirm the first note has full delay/reverb (no dropout) and the tail rings out normally.

- [ ] **Step 4: Open the PR**

Run: `git push -u origin fix/idle-cpu-fx-voice-gating`
Then open a PR to `main` summarizing the idle gate and the voice-seam fix, linking the spec.

---

## Self-Review

**Spec coverage:**

- Idle gate unit shape (`input`/`connect`/`disconnect`, `activate`) → Task 2.
- Gate at the island tail; `masterInput → feedbackDelay → reverb → idleGate.input` → Task 3.
- Post-FX silence detection + debounce, no tail constant → Task 2.
- Wake path via `ActivitySink` in `Synth` → Task 1; engine implements + app wires → Tasks 3/5.
- Voice seam move → Task 4.
- Leaf-tap analyser/meter → Task 3.
- Testing (fake analyser, idle gate, synth activity, voice seam) → Tasks 1, 2, 4, 5.
- Cleanup (TEMP flags, `MAX_VOICES`, `Synth.vue` ScopePanel usage) → Tasks 0, 3, 5.
- Acceptance (idle CPU, no audible change, gates) → Task 6.

**Placeholder scan:** No TBD/TODO/"handle edge cases"; every code step ships full code.

**Type consistency:** `ActivitySink` (Task 1) is consumed by `synth.ts` (Task 1), `engine.ts` (Task 3), `axiom-synth.ts` (Task 5). `IdleGate`'s `input`/`connect`/`activate`/`destroy` (Task 2) match the calls in Task 3. `FakeAnalyserNode.timeDomainData` is defined in Task 2 and used in its tests. `MAX_VOICES` stays `16` after Task 0.
