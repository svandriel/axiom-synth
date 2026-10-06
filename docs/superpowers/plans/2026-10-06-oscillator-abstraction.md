# Oscillator Abstraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `UnisonOscillator` use an injectable `Oscillator` abstraction for every subvoice while renaming the Web Audio implementation to `WebAudioOscillator`.

**Architecture:** `Oscillator` becomes the public lifecycle and audio-parameter interface. `WebAudioOscillator` privately owns one lazily-created `OscillatorNode` at a time and publishes completion through `onEnded()` subscriptions. `UnisonOscillator` and `UnisonVoicePath` store only interface instances, with a default factory for `WebAudioOscillator` and injectable factories for future custom sources.

**Tech Stack:** TypeScript, Web Audio API, Vitest, `@axiom/audio-testing` fake nodes, pnpm workspaces.

## Global Constraints

- Preserve delayed-stop path reservation until each oscillator completion event.
- Preserve direct and pooled unison behavior, waveform updates, modulation links, rollback, and idempotent destruction.
- Do not expose or store `OscillatorNode` in `UnisonOscillator` or `UnisonVoicePath`.
- Every owned Web Audio source is created and destroyed by its oscillator implementation.
- `onEnded(subscriber)` returns `{ unsubscribe: () => void }`; unsubscribe is idempotent.
- No AudioWorklet implementation is included in this change.
- Add automated tests for every lifecycle behavior change.
- Use named constants for meaningful numeric literals.

---

## File Map

- Modify: `packages/audio-engine/src/engine/oscillator.ts` — define `Oscillator`, rename the concrete class to `WebAudioOscillator`, and implement subscription-based completion.
- Create: `packages/audio-engine/src/engine/oscillator.test.ts` — test the abstraction contract through `WebAudioOscillator`.
- Modify: `packages/audio-engine/src/engine/unison-voice-path.ts` — replace raw `OscillatorNode` path ownership with `Oscillator` ownership.
- Modify: `packages/audio-engine/src/engine/unison-voice-path.test.ts` — adapt path tests to an oscillator test double.
- Modify: `packages/audio-engine/src/engine/unison-oscillator.ts` — create all subvoices through an `Oscillator` factory and manage subscription handles.
- Modify: `packages/audio-engine/src/engine/unison-oscillator.test.ts` — retain graph coverage and add factory/subscription lifecycle assertions.
- Modify: `packages/audio-engine/src/engine/index.ts` — continue exporting the renamed module's interface and implementation.
- Modify: `packages/axiom-synth/src/axiom-voice.ts` only if imports or construction types require adjustment; behavior must remain unchanged.
- Modify: `docs/codebase/ARCHITECTURE.md` — document abstraction ownership after implementation.

---

### Task 1: Define and test the oscillator abstraction

**Files:**

- Modify: `packages/audio-engine/src/engine/oscillator.ts`
- Create: `packages/audio-engine/src/engine/oscillator.test.ts`

**Interfaces:**

- Produces `Oscillator`, `WebAudioOscillator`, and `OscillatorEndSubscription`.
- `Oscillator` must expose:

```ts
export interface Oscillator extends Destroyable {
  waveform: WaveFormType;
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  readonly gain: AudioParam;
  connect(destination: AudioNode | AudioParam): void;
  disconnect(destination?: AudioNode | AudioParam | null): void;
  start(noteHz: number, now: number): void;
  stop(time?: number): void;
  onEnded(subscriber: () => void): OscillatorEndSubscription;
}

export interface OscillatorEndSubscription {
  unsubscribe(): void;
}
```

- [ ] **Step 1: Write failing contract tests**

Add tests using `FakeAudioContext` and `installFakeAudioParam()`:

```ts
it('does not create a Web Audio oscillator before start', () => {
  const oscillator = new WebAudioOscillator(context as unknown as AudioContext);

  expect(context.oscillators).toHaveLength(0);
});

it('notifies each active end subscriber once and supports idempotent unsubscribe', () => {
  const oscillator = new WebAudioOscillator(context as unknown as AudioContext);
  let calls = 0;
  const subscription = oscillator.onEnded(() => calls++);

  oscillator.start(440, 0);
  context.oscillators[0]!.end();
  subscription.unsubscribe();
  subscription.unsubscribe();

  expect(calls).toBe(1);
});

it('creates a fresh source after the previous source completes', () => {
  const oscillator = new WebAudioOscillator(context as unknown as AudioContext);

  oscillator.start(440, 0);
  context.oscillators[0]!.end();
  oscillator.start(220, 1);

  expect(context.oscillators).toHaveLength(2);
});

it('removes all subscribers and owned graph nodes on destroy', () => {
  const oscillator = new WebAudioOscillator(context as unknown as AudioContext);
  let calls = 0;
  oscillator.onEnded(() => calls++);
  oscillator.start(440, 0);
  const source = context.oscillators[0]!;

  oscillator.destroy();
  source.end();

  expect(calls).toBe(0);
  expect(context.connections).toHaveLength(0);
});
```

- [ ] **Step 2: Run the focused test to verify failure**

Run: `pnpm --filter @axiom/audio-engine test -- oscillator.test.ts`

Expected: FAIL because `WebAudioOscillator`, `Oscillator`, and `onEnded()` do not yet exist.

- [ ] **Step 3: Rename the implementation and add the contract**

Change `export class Oscillator` to `export class WebAudioOscillator implements Oscillator`. Add the two interfaces and keep the existing `waveform`, `frequency`, `detune`, `gain`, connect, disconnect, start, stop, and destroy behavior.

Replace the single `current` node callback model with:

```ts
private readonly endedSubscribers = new Set<() => void>();
private current: OscillatorNode | null = null;

onEnded(subscriber: () => void): OscillatorEndSubscription {
  this.endedSubscribers.add(subscriber);
  let subscribed = true;
  return {
    unsubscribe: () => {
      if (!subscribed) return;
      subscribed = false;
      this.endedSubscribers.delete(subscriber);
    },
  };
}
```

When the internal node ends, disconnect its frequency/detune links and output, clear `current`, then notify a snapshot of `endedSubscribers`. Subscribers remain registered across note starts so one subscription can observe every source generated by one abstraction instance. `destroy()` clears subscribers before stopping and detaching owned nodes.

- [ ] **Step 4: Run focused tests to verify the abstraction**

Run: `pnpm --filter @axiom/audio-engine test -- oscillator.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the abstraction**

```bash
git add packages/audio-engine/src/engine/oscillator.ts packages/audio-engine/src/engine/oscillator.test.ts
git commit -m "refactor: extract oscillator abstraction"
```

### Task 2: Make reusable unison paths depend on `Oscillator`

**Files:**

- Modify: `packages/audio-engine/src/engine/unison-voice-path.ts`
- Modify: `packages/audio-engine/src/engine/unison-voice-path.test.ts`

**Interfaces:**

- Consumes `Oscillator` from `./oscillator`.
- `UnisonVoicePath.arm(source: Oscillator): void`.
- `UnisonVoicePath.disarm(source: Oscillator): void`.
- `UnisonVoicePath` must connect through `source.connect(this.audioGain)` and route fixed detune through `source.detune`.

- [ ] **Step 1: Add an abstraction test double**

In `unison-voice-path.test.ts`, replace `asOscillator()` with a minimal typed fake that records `connect`, `disconnect`, and exposes a fake `detune` parameter. Keep the existing assertions about exact path detune disconnects, but assert against the fake oscillator’s `detune` parameter.

- [ ] **Step 2: Run path tests to establish the old-type failure**

Run: `pnpm --filter @axiom/audio-engine test -- unison-voice-path.test.ts`

Expected: FAIL after the test double is typed against `Oscillator` because the production path still accepts `OscillatorNode`.

- [ ] **Step 3: Replace raw node types in the path implementation**

Import `Oscillator`. Change `source: Oscillator | null`, `arm(source: Oscillator)`, `disarm(source: Oscillator)`, and all matching local variables. Keep the path’s existing state machine and graph behavior unchanged.

- [ ] **Step 4: Run path tests**

Run: `pnpm --filter @axiom/audio-engine test -- unison-voice-path.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the path abstraction**

```bash
git add packages/audio-engine/src/engine/unison-voice-path.ts packages/audio-engine/src/engine/unison-voice-path.test.ts
git commit -m "refactor: decouple unison paths from oscillator nodes"
```

### Task 3: Route every unison subvoice through the abstraction

**Files:**

- Modify: `packages/audio-engine/src/engine/unison-oscillator.ts`
- Modify: `packages/audio-engine/src/engine/unison-oscillator.test.ts`

**Interfaces:**

- Consumes `Oscillator`, `OscillatorEndSubscription`, and `WebAudioOscillator`.
- Add an exported factory type:

```ts
export type OscillatorFactory = (context: AudioContext) => Oscillator;
```

- Constructor shape:

```ts
constructor(
  ctxt: AudioContext,
  oscillatorFactory: OscillatorFactory = context =>
    new WebAudioOscillator(context),
)
```

- `DirectSource` stores `oscillator: Oscillator` and its `endedSubscription`.
- `PooledSource` stores `oscillator: Oscillator`, its `path`, and its `endedSubscription`.

- [ ] **Step 1: Add a factory test**

Construct `UnisonOscillator` with a factory that records created fake oscillators. Assert `voices = 1` creates one abstraction instance and `voices = 3` creates three abstraction instances, with no production code access to `ctxt.createOscillator()` from `UnisonOscillator`.

- [ ] **Step 2: Add subscription cleanup assertions**

Extend lifecycle tests to assert that each fake oscillator’s returned `unsubscribe()` is called when a direct source ends, all pooled siblings end, setup rolls back, and `destroy()` runs while sources drain.

- [ ] **Step 3: Run unison tests to verify failure**

Run: `pnpm --filter @axiom/audio-engine test -- unison-oscillator.test.ts`

Expected: FAIL because unison still constructs and manipulates `OscillatorNode` values.

- [ ] **Step 4: Replace direct source creation**

Use `this.oscillatorFactory(this.ctxt)` in both direct and pooled start paths. Set `oscillator.waveform`, call `oscillator.start(noteHz, now)`, and connect the abstraction output to the direct output gain or pooled path.

Subscribe before starting:

```ts
const endedSubscription = oscillator.onEnded(() => {
  this.onDirectEnded(bundle);
});
```

For pooled sources, callback dispatch must identify both the bundle and source record before calling `onPooledEnded`. Store the subscription handle and call `unsubscribe()` before removing a source record, aborting setup, or destroying the parent.

- [ ] **Step 5: Preserve stop and rollback semantics**

Call `oscillator.stop(time)` for normal and timed stops. If it throws, unsubscribe and detach immediately, disarm or abort the path, and finish the bundle exactly as current code does. Do not call `oscillator.destroy()` before detaching the path’s source connection if that would prevent path cleanup; destroy each source after ownership is released.

- [ ] **Step 6: Remove all concrete node references from unison**

Delete `OscillatorNode` type annotations and `createOscillator()` calls from `unison-oscillator.ts`. The only remaining raw-node references in the audio-engine oscillator feature may live inside `WebAudioOscillator` and fake test infrastructure.

- [ ] **Step 7: Run all audio-engine tests**

Run: `pnpm --filter @axiom/audio-engine test`

Expected: PASS, including existing delayed-stop, path-reuse, rollback, waveform, and destroy tests.

- [ ] **Step 8: Commit the unison migration**

```bash
git add packages/audio-engine/src/engine/unison-oscillator.ts packages/audio-engine/src/engine/unison-oscillator.test.ts
git commit -m "refactor: use oscillator abstraction in unison"
```

### Task 4: Update exports, integration, and architecture documentation

**Files:**

- Modify: `packages/audio-engine/src/engine/index.ts` if export changes are required.
- Modify: `packages/axiom-synth/src/axiom-voice.ts` only if the renamed class appears in type imports.
- Modify: `docs/codebase/ARCHITECTURE.md`.

**Interfaces:**

- Public package export includes `Oscillator`, `OscillatorEndSubscription`, `OscillatorFactory`, `WebAudioOscillator`, and `UnisonOscillator`.

- [ ] **Step 1: Verify exports and compile consumers**

Run: `pnpm --filter @axiom/audio-engine build`

Expected: PASS with no missing or stale `Oscillator` class references.

- [ ] **Step 2: Update architecture ownership text**

Change the oscillator responsibility entry to state that `WebAudioOscillator` owns Web Audio source-node creation and teardown, while `UnisonOscillator` owns oscillator abstraction instances, bundle subscriptions, and path leases. State that `UnisonVoicePath` accepts `Oscillator`, not `OscillatorNode`.

- [ ] **Step 3: Run workspace verification**

Run: `pnpm test`

Expected: PASS.

Run: `pnpm build`

Expected: PASS.

Run: `pnpm lint`

Expected: PASS with `prettier --check .`.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff HEAD~4..HEAD --check`

Expected: no whitespace errors. Confirm no unrelated files changed and no `.superpowers/` files are staged.

- [ ] **Step 5: Commit integration documentation**

```bash
git add packages/audio-engine/src/engine/index.ts packages/axiom-synth/src/axiom-voice.ts docs/codebase/ARCHITECTURE.md
git commit -m "docs: record oscillator abstraction ownership"
```

## Self-Review

- Spec coverage: abstraction rename and contract are Task 1; subscription lifecycle is Tasks 1 and 3; all unison paths use the abstraction in Tasks 2 and 3; failure handling is Task 3; tests are Tasks 1 through 3; scope limits are Global Constraints.
- Placeholder scan: no `TBD`, `TODO`, or unspecified implementation step appears in the plan.
- Type consistency: `Oscillator` is defined in Task 1, consumed by path methods in Task 2 and unison source records in Task 3; `OscillatorFactory` is defined before constructor use; exports are verified in Task 4.
- Existing waveform behavior is explicit in the interface because unison must update active and draining sources without exposing `OscillatorNode`.
