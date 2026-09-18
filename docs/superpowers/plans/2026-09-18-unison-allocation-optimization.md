# Unison Allocation Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate recurring unison processing-path and Blend-curve allocation while preserving audio behavior and safe Web Audio teardown.

**Architecture:** Keep `UnisonOscillator` as the public module. Add private Blend-curve Flyweight data and a lazy context-bound reusable voice-path pool behind it. Only raw `OscillatorNode`s remain per-note allocations. Add Vitest with an instrumented fake Web Audio context to test cache, lease, and cleanup behavior deterministically.

**Tech Stack:** TypeScript 6, Vitest, Vue 3, Web Audio API, pnpm, Prettier.

## Global Constraints

- Preserve `UnisonOscillator` public interface and a-rate Detune, Depth, and Blend behavior.
- `OscillatorNode` and `ConstantSourceNode` are one-shot and are never pooled or restarted.
- Cache Blend data only; never cache `CurveNode` or Web Audio nodes across contexts.
- `V = 1` remains direct `OscillatorNode -> outputGain` with no pooled path.
- A path is never reused before its raw oscillator fires `onended` and exact inbound links are detached.
- Blend curve input maps logical `[0, 1]` to WaveShaper `[-1, 1]` with gain `2` and offset `-1`.
- Pool only retains current plus one normal draining generation. Additional overlap uses temporary paths that are destroyed after release.
- Comments explain one-shot source, cache key, drain lease, remapping, exact teardown, and temporary overflow intent.

---

## File Structure

- Modify `packages/audio-engine/package.json`: add Vitest test script and dev dependency.
- Modify root `package.json`: add root test command delegating to audio engine.
- Create `packages/audio-engine/src/engine/unison-voice-path.ts`: private reusable path and path-pool implementation.
- Create `packages/audio-engine/src/engine/blend-curve-cache.ts`: private immutable table cache.
- Modify `packages/audio-engine/src/engine/curve-node.ts`: accept precomputed internal curve data without exposing mutation publicly.
- Modify `packages/audio-engine/src/engine/unison-oscillator.ts`: replace per-note processing graph with cache/pool leases.
- Create `packages/audio-engine/src/engine/unison-oscillator.test.ts`: fake Web Audio graph tests.

### Task 1: Add Audio Engine Test Harness

**Files:**

- Modify: `packages/audio-engine/package.json`
- Modify: `package.json`
- Create: `packages/audio-engine/src/engine/test/fake-audio-context.ts`

**Interfaces:**

- Produces: `pnpm test` and a fake context that records created nodes, exact `connect`/`disconnect` operations, `stop`, and manually triggered `onended` callbacks.

- [ ] **Step 1: Add Vitest**

Add to `packages/audio-engine/package.json`:

```json
"scripts": {
  "build": "tsc --noEmit",
  "test": "vitest run"
},
"devDependencies": {
  "@vue/tsconfig": "^0.9.1",
  "typescript": "~6.0.2",
  "vitest": "^4.0.18"
}
```

Add root command:

```json
"test": "pnpm --filter @axiom/audio-engine test"
```

- [ ] **Step 2: Add failing fake-context test**

Create fake implementations sufficient for `UnisonOscillator`: oscillator,
gain, stereo panner, waveshaper, constant source, and `AudioParam`. Record
every exact source-to-destination connection. Add a test that constructs
`UnisonOscillator` with the fake context and fails until the fake supports
every needed node method.

```ts
import { describe, expect, it } from 'vitest';
import { UnisonOscillator } from '../unison-oscillator';
import { FakeAudioContext } from './fake-audio-context';

describe('UnisonOscillator', () => {
  it('creates one direct oscillator for one voice', () => {
    const ctxt = new FakeAudioContext();
    const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
    oscillator.start(440, 0);
    expect(ctxt.oscillators).toHaveLength(1);
    expect(ctxt.stereoPanners).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Run red test**

Run: `pnpm test`

Expected: FAIL because Vitest or fake context support does not yet exist.

- [ ] **Step 4: Implement fake context and make test pass**

Implement only Web Audio methods used by current engine modules. `FakeOscillatorNode.end()` invokes stored `onended`, allowing tests to dispatch callbacks in any order. `FakeAudioNode.disconnect(destination)` records exact destination removal and throws only when configured by a test.

- [ ] **Step 5: Verify and commit**

Run: `pnpm test && pnpm build && pnpm lint`

Expected: exit code 0.

```bash
git add package.json packages/audio-engine/package.json packages/audio-engine/src/engine/test/fake-audio-context.ts packages/audio-engine/src/engine/unison-oscillator.test.ts
git commit -m "test(engine): add unison audio graph harness"
```

### Task 2: Add Blend Curve Flyweight Tests And Cache

**Files:**

- Create: `packages/audio-engine/src/engine/blend-curve-cache.ts`
- Create: `packages/audio-engine/src/engine/blend-curve-cache.test.ts`
- Modify: `packages/audio-engine/src/engine/curve-node.ts`

**Interfaces:**

- Produces: package-private `BlendCurveCache.curveFor(voiceCount, index): Float32Array`.
- Consumes: 1024-sample curve resolution and existing Blend equations.

- [ ] **Step 1: Write failing cache tests**

Test repeat lookup identity, invalid input, and equation samples:

```ts
it('returns cached data for repeated voice role lookup', () => {
  expect(curveFor(5, 2)).toBe(curveFor(5, 2));
});

it.each([
  [1, 0],
  [17, 0],
  [3, -1],
  [3, 3],
])('rejects invalid role (%i, %i)', (voices, index) => {
  expect(() => curveFor(voices, index)).toThrow(RangeError);
});
```

For `V = 3`, verify first, midpoint, and last samples against direct formula at
Blend `0`, `0.5`, and `1` within `1e-5`.

- [ ] **Step 2: Run red tests**

Run: `pnpm test -- blend-curve-cache.test.ts`

Expected: FAIL because cache module does not exist.

- [ ] **Step 3: Implement private Flyweight cache**

Use module-private `Map<string, Float32Array>`. Validate `Number.isInteger`,

```ts
const blend = sampleIndex / 1023;
const position = -1 + (2 * index) / (voices - 1);
const weight = 1 / (1 + Math.abs(position));
const rawGain = weight + blend * (1 - weight);
const totalPower = Array.from({ length: voices }, (_, voiceIndex) => {
  const voicePosition = -1 + (2 * voiceIndex) / (voices - 1);
  const voiceWeight = 1 / (1 + Math.abs(voicePosition));
  const voiceRawGain = voiceWeight + blend * (1 - voiceWeight);
  return voiceRawGain * voiceRawGain;
}).reduce((sum, power) => sum + power, 0);
curve[sampleIndex] = rawGain / Math.sqrt(totalPower);
```

Do not export cache from package barrel. Add a package-private curve assignment
path in `CurveNode` only if required; it must not expose mutable curve data to
package consumers.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test && pnpm build && pnpm lint`

Expected: exit code 0.

```bash
git add packages/audio-engine/src/engine/blend-curve-cache.ts packages/audio-engine/src/engine/blend-curve-cache.test.ts packages/audio-engine/src/engine/curve-node.ts
git commit -m "perf(engine): cache unison blend curves"
```

### Task 3: Add Private Reusable Path Pool

**Files:**

- Create: `packages/audio-engine/src/engine/unison-voice-path.ts`
- Create: `packages/audio-engine/src/engine/unison-voice-path.test.ts`

**Interfaces:**

- Consumes: fake context and `BlendCurveCache`.
- Produces: package-private `UnisonVoicePathPool.acquire(voices)` lease,
  `release(lease)`, and idempotent `destroy()`.

- [ ] **Step 1: Write failing pool lifecycle tests**

Test states through observable fake-node connections:

```ts
it('does not return a draining path before its source ends', () => {
  const lease = pool.acquire(4);
  lease.paths.forEach((path, index) => path.arm(oscillators[index]!));
  lease.paths.forEach(path => path.beginDrain());
  expect(pool.acquire(4).usesOverflow).toBe(true);
});

it('returns a disarmed path after its matching source ends', () => {
  path.disarm(oscillator);
  pool.release(lease);
  expect(pool.acquire(4).usesOverflow).toBe(false);
});
```

Test stale source identity, exact per-source detune disconnect, direct-path
absence, overflow destruction, repeated release, and destroy after configured
disconnect failure.

- [ ] **Step 2: Run red tests**

Run: `pnpm test -- unison-voice-path.test.ts`

Expected: FAIL because pool module does not exist.

- [ ] **Step 3: Implement path and pool**

`UnisonVoicePath` permanently owns gain, panner, detune/depth scaling gains,

`UnisonVoicePathPool` keeps stable paths for current plus one draining

Use private state discriminant `free | leased | armed | draining | destroyed`.
Throw on invalid internal transition. Keep exact source-to-AudioParam
disconnection in path disarm method, but let caller own frequency/normal-detune
source cleanup.

- [ ] **Step 4: Verify and commit**

Run: `pnpm test && pnpm build && pnpm lint`

Expected: exit code 0.

```bash
git add packages/audio-engine/src/engine/unison-voice-path.ts packages/audio-engine/src/engine/unison-voice-path.test.ts
git commit -m "perf(engine): pool unison voice paths"
```

### Task 4: Integrate Pool Into UnisonOscillator

**Files:**

- Modify: `packages/audio-engine/src/engine/unison-oscillator.ts`
- Modify: `packages/audio-engine/src/engine/unison-oscillator.test.ts`

**Interfaces:**

- Consumes: private `BlendCurveCache` and `UnisonVoicePathPool`.
- Preserves: every existing public `UnisonOscillator` interface and behavior.

- [ ] **Step 1: Write failing integration tests**

Add tests covering:

```ts
it('reuses warmed paths while allocating fresh oscillator sources');
it('uses no pool path for voices equal to one');
it('does not reuse a path until matching oscillator end callback');
it('keeps out-of-order old end callback from detaching newer source');
it('removes direct and pooled inbound AudioParam links on end');
it('rolls back all acquired paths when setup fails');
it('is idempotent when destroyed while sources drain');
```

Use fake-context counts and recorded exact connections. Trigger `end()` on
sources in reverse order to test stale callback safety.

- [ ] **Step 2: Run red tests**

Run: `pnpm test -- unison-oscillator.test.ts`

Expected: FAIL because current implementation creates a complete processing
graph per note.

- [ ] **Step 3: Replace per-note path allocation**

For `voices === 1`, retain direct oscillator-to-output setup and dedicated
cleanup. For `voices > 1`, acquire full lease, configure every path, create and
connect every raw oscillator, attach callbacks, start all only after setup
succeeds, then set `current`.

On setup failure, detach/stop created sources, disarm paths, release lease,

- [ ] **Step 4: Add required comments and counters**

Add concise comments at one-shot oscillator allocation, cache role selection,

- [ ] **Step 5: Verify and commit**

Run: `pnpm test && pnpm build && pnpm lint && git diff --check`

Expected: exit code 0.

```bash
git add packages/audio-engine/src/engine/unison-oscillator.ts packages/audio-engine/src/engine/unison-oscillator.test.ts
git commit -m "perf(engine): reuse unison processing paths"
```

### Task 5: Browser Validation And Final Review

**Files:**

- Verify: all changed files.

- [ ] **Step 1: Run automated gates**

Run: `pnpm test && pnpm build && pnpm lint && git diff main...HEAD --check`

Expected: exit code 0.

- [ ] **Step 2: Profile warm behavior**

Run: `pnpm dev`

Open browser performance/allocation profiler. Warm `V = 16` on all three
oscillators, release all notes, then replay equivalent chords. Confirm repeated
notes allocate only fresh `OscillatorNode`s and small bookkeeping. Confirm no
new 1024-sample Blend arrays after cache warm-up. Confirm overlapping drains
create temporary overflow paths and later release them.

- [ ] **Step 3: Smoke test audio behavior**

Verify `V = 1`, `2`, `3`, and `16`; symmetric detune/pan; Blend `0`, `0.5`, and
`1`; held-note Blend/Detune/Depth updates; release tails; rapid retrigger; and
more than 16 played notes to exercise stealing. Confirm no console errors,

- [ ] **Step 4: Inspect final status**

Run: `git status --short`

Expected: clean worktree.
