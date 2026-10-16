# Native Oscillator Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `MoogOscillator` a working start/stop lifecycle over an `AudioWorkletProcessor`, destroying the worklet node + WASM resources on `stop(time)` with an `ENDED` confirmation handshake.

**Architecture:** A `START`/`STOP` message carries an AudioContext time to the processor; the processor gates silence until start, and at stop time frees its resources, posts `ENDED`, and returns `false`. The wrapper node re-exposes `start`/`stop`/`onended`/`disconnect`; `MoogOscillator` stays structurally identical to `WebAudioOscillator`.

**Tech Stack:** TypeScript (strict), Vue/Vite workspace, vitest, `@axiom/audio-testing` fakes.

**Spec:** `docs/superpowers/specs/2026-10-11-native-oscillator-lifecycle-design.md`

## Global Constraints

- All commands run from repo root. Work on branch `feature/native` (already checked out).
- TDD: write the failing test, run it, confirm FAIL, then implement, then confirm PASS.
- No magic numbers: every meaningful literal gets a named constant.
- Per-note onended must detach inbound source→param connections (Rule 4) before/at end.
- Gate: `pnpm test` (vitest, runs every package), `pnpm build`, `pnpm lint` (`prettier --check .`).
- Commit style: `feat:` / `test:` short messages. Never commit to `main`.
- Once a processor or node is destroyed, all later calls are no-ops (destroyed guards).

---

### Task 1: Processor START/STOP lifecycle with ENDED confirmation

**Files:**

- Modify: `packages/native/src/shared/worklet-messages.ts`
- Modify: `packages/native/src/worker/moog-oscillator-processor.ts`
- Test: `packages/native/src/worker/moog-oscillator-processor.test.ts`

**Interfaces:**

- Consumes: nothing new (existing `WorkletMessage`, `ReportRenderTimeMessage`).
- Produces (used by Task 2/3):
  - `WorkletStartMessage { type: 'START'; when: number }`
  - `WorkletStopMessage { type: 'STOP'; when: number }`
  - `WorkletEndedMessage { type: 'ENDED' }`
  - Processor posts `{ type: 'ENDED' }` on the port immediately before returning `false` at stop time.
  - `process()` returns `true` with a zeroed output until started/until `startTime`; `false` after stop.

- [ ] **Step 1: Add the lifecycle message types**

Replace the whole file `packages/native/src/shared/worklet-messages.ts` with:

```ts
export type WorkletMessage =
  | WorkletDestroyMessage
  | WorkletStartMessage
  | WorkletStopMessage
  | WorkletEndedMessage
  | ReportRenderTimeMessage;

export interface BaseWorkletMessage {
  type: string;
}

export interface WorkletDestroyMessage extends BaseWorkletMessage {
  type: 'DESTROY';
}

export interface WorkletStartMessage extends BaseWorkletMessage {
  type: 'START';
  when: number;
}

export interface WorkletStopMessage extends BaseWorkletMessage {
  type: 'STOP';
  when: number;
}

export interface WorkletEndedMessage extends BaseWorkletMessage {
  type: 'ENDED';
}

export interface ReportRenderTimeMessage extends BaseWorkletMessage {
  type: 'REPORT_RENDER_TIME';
  renderTimeMs: number;
}
```

- [ ] **Step 2: Add lifecycle state + STOP handling to the processor, and gate silence**

In `packages/native/src/worker/moog-oscillator-processor.ts`:

1. Add three fields next to the existing `destroyed` field:

```ts
  private started = false;
  private startTime = 0;
  private stopTime: number | undefined;
```

2. In the constructor's `port.onmessage` switch, add `START` and `STOP` cases above `DESTROY`:

```ts
        case 'START':
          this.started = true;
          this.startTime = event.data.when;
          break;
        case 'STOP':
          this.stopTime = event.data.when;
          break;
```

3. In `process()`, insert the stop check immediately after the existing
   `if (this.destroyed) { return false; }` block, and the start gate right after
   the existing `if (!output || !mainModule || sawHandle === undefined)` block:

```ts
if (this.stopTime !== undefined && currentTime >= this.stopTime) {
  this.destroyResources();
  this.port.postMessage({ type: 'ENDED' });
  return false;
}
```

```ts
if (!this.started || currentTime < this.startTime) {
  output.fill(0);
  return true;
}
```

`currentTime` is the `AudioWorkletGlobalScope` global (already provided by the
`audioworklet` types via `declare var currentTime: number`).

- [ ] **Step 3: Extend the processor test with a controllable clock and lifecycle tests**

In `packages/native/src/worker/moog-oscillator-processor.test.ts`:

1. Give `FakeAudioWorkletProcessor.port` a `postMessage` spy:

```ts
class FakeAudioWorkletProcessor {
  readonly port = {
    onmessage: undefined as ((event: MessageEvent) => void) | undefined,
    postMessage: vi.fn(),
  };
}
```

2. In the `Object.assign(globalThis, ...)` block, add the clock:

```ts
  currentTime: 0,
```

3. Append these two tests at the END of the `describe` block (after the existing
   "does not initialize WASM when destroyed before initialization" test):

```ts
it('emits silence until START and until its start time, then renders', async () => {
  const processor = new MoogOscillatorProcessor({
    processorOptions: {
      wasmModule: {} as WebAssembly.Module,
    },
  });
  await vi.waitFor(() => {
    expect(wasmModule._moog_saw_wasm_create).toHaveBeenCalled();
  });
  const output = new Float32Array([3, 3, 3, 3]);
  const parameters = {
    frequency: new Float32Array([1, 1, 1, 1]),
    detune: new Float32Array([0, 0, 0, 0]),
  };
  const process = processor.process.bind(processor) as (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) => boolean;

  Object.assign(globalThis, { currentTime: 0.5 });
  expect(process([], [[output]], parameters)).toBe(true);
  expect(Array.from(output)).toEqual([0, 0, 0, 0]);

  processor.port.onmessage?.({
    data: { type: 'START', when: 1 },
  } as unknown as MessageEvent);

  Object.assign(globalThis, { currentTime: 0.75 });
  expect(process([], [[output]], parameters)).toBe(true);
  expect(Array.from(output)).toEqual([0, 0, 0, 0]);

  Object.assign(globalThis, { currentTime: 1 });
  expect(process([], [[output]], parameters)).toBe(true);
  expect(Array.from(output)).toEqual([2, 2, 2, 2]);
});

it('tears down, confirms ENDED, and stops processing at the stop time', async () => {
  const freeCallsBefore = wasmModule._free.mock.calls.length;
  const destroyCallsBefore =
    wasmModule._moog_saw_wasm_destroy.mock.calls.length;
  const processor = new MoogOscillatorProcessor({
    processorOptions: {
      wasmModule: {} as WebAssembly.Module,
    },
  });
  await vi.waitFor(() => {
    expect(wasmModule._moog_saw_wasm_create).toHaveBeenCalled();
  });
  const output = new Float32Array(4);
  const process = processor.process.bind(processor) as (
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) => boolean;

  processor.port.onmessage?.({
    data: { type: 'STOP', when: 2 },
  } as unknown as MessageEvent);
  Object.assign(globalThis, { currentTime: 1 });
  expect(
    process([], [[output]], {
      frequency: new Float32Array([1]),
      detune: new Float32Array([0]),
    }),
  ).toBe(true);

  Object.assign(globalThis, { currentTime: 2 });
  const keepAlive = process([], [[output]], {
    frequency: new Float32Array([1]),
    detune: new Float32Array([0]),
  });

  expect(processor.port.postMessage).toHaveBeenCalledWith({ type: 'ENDED' });
  expect(wasmModule._moog_saw_wasm_destroy.mock.calls.length).toBe(
    destroyCallsBefore + 1,
  );
  expect(wasmModule._free.mock.calls.length).toBe(freeCallsBefore + 3);
  expect(
    process([], [[output]], {
      frequency: new Float32Array([1]),
      detune: new Float32Array([0]),
    }),
  ).toBe(false);
  expect(keepAlive).toBe(false);
});
```

- [ ] **Step 4: Run the processor tests and confirm they pass**

Run: `pnpm --filter @axiom/native test:js -- src/worker/moog-oscillator-processor.test.ts`
Expected: all processor tests pass (the two new ones included, existing ones still green).

- [ ] **Step 5: Commit**

```bash
git add packages/native/src/shared/worklet-messages.ts packages/native/src/worker/moog-oscillator-processor.ts packages/native/src/worker/moog-oscillator-processor.test.ts
git commit -m "feat: gate native saw processor on START, teardown on STOP with ENDED confirmation"
```

---

### Task 2: Worklet node wrapper start/stop/onended/disconnect

**Files:**

- Modify: `packages/native/src/nodes/moog-oscillator-worklet-node.ts`
- Test: `packages/native/src/nodes/moog-oscillator-worklet-node.test.ts`

**Interfaces:**

- Consumes: `WorkletMessage`, `WorkletDestroyMessage` (existing imports); processor `ENDED` messages from Task 1.
- Produces (used by Task 3):
  - `onended: (() => void) | null`
  - `start(when: number): void` — posts `{ type: 'START', when }` once.
  - `stop(when: number): void` — posts `{ type: 'STOP', when }` once.
  - `disconnect(destination?: null | AudioNode | AudioParam): void` — delegates to the worklet node.

- [ ] **Step 1: Write the failing wrapper tests**

Extend `packages/native/src/nodes/moog-oscillator-worklet-node.test.ts`:

1. Give the fake worklet's port an `onmessage` field so tests can dispatch `ENDED`:

```ts
class FakeAudioWorkletNode {
  readonly parameters = new Map([['frequency', {}]]);
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly port = {
    onmessage: undefined as ((event: MessageEvent) => void) | undefined,
    postMessage: vi.fn(),
  };
  readonly options: AudioWorkletNodeOptions;
  readonly context: AudioContext;
  readonly name: string;

  constructor(
    context: AudioContext,
    name: string,
    options: AudioWorkletNodeOptions,
  ) {
    this.context = context;
    this.name = name;
    this.options = options;
  }
}
```

2. Append these tests inside the existing `describe`:

```ts
it('posts START once and STOP once with their times', () => {
  const node = new MoogOscillatorWorkletNode(
    {} as AudioContext,
    new ArrayBuffer(0),
  );
  const workletNode = node as unknown as { node: FakeAudioWorkletNode };

  node.start(1);
  node.start(2);

  expect(workletNode.node.port.postMessage).toHaveBeenCalledTimes(1);
  expect(workletNode.node.port.postMessage).toHaveBeenCalledWith({
    type: 'START',
    when: 1,
  });

  node.stop(3);
  node.stop(4);

  expect(workletNode.node.port.postMessage).toHaveBeenCalledTimes(2);
  expect(workletNode.node.port.postMessage).toHaveBeenLastCalledWith({
    type: 'STOP',
    when: 3,
  });
});

it('fires onended exactly once on ENDED', () => {
  const node = new MoogOscillatorWorkletNode(
    {} as AudioContext,
    new ArrayBuffer(0),
  );
  const workletNode = node as unknown as { node: FakeAudioWorkletNode };
  const onended = vi.fn();
  node.onended = onended;
  const receive = workletNode.node.port.onmessage!;

  receive({ data: { type: 'ENDED' } } as MessageEvent);
  receive({ data: { type: 'ENDED' } } as MessageEvent);

  expect(onended).toHaveBeenCalledTimes(1);
});

it('delegates disconnect to the worklet node', () => {
  const node = new MoogOscillatorWorkletNode(
    {} as AudioContext,
    new ArrayBuffer(0),
  );
  const workletNode = node as unknown as { node: FakeAudioWorkletNode };
  const destinationNode = {} as AudioNode;
  const destinationParam = {} as AudioParam;

  node.disconnect();
  node.disconnect(destinationNode);
  node.disconnect(destinationParam);

  expect(workletNode.node.disconnect).toHaveBeenCalledTimes(3);
});

it('ignores start and stop after destroy', () => {
  const node = new MoogOscillatorWorkletNode(
    {} as AudioContext,
    new ArrayBuffer(0),
  );
  const workletNode = node as unknown as { node: FakeAudioWorkletNode };

  node.destroy();
  node.destroy();
  node.start(1);
  node.stop(1);

  expect(workletNode.node.port.postMessage).toHaveBeenCalledTimes(1);
  expect(workletNode.node.disconnect).toHaveBeenCalledTimes(1);
  expect(workletNode.node.port.onmessage).toBeNull();
});

it('does not fire onended after destroy', () => {
  const node = new MoogOscillatorWorkletNode(
    {} as AudioContext,
    new ArrayBuffer(0),
  );
  const workletNode = node as unknown as { node: FakeAudioWorkletNode };
  const onended = vi.fn();
  node.onended = onended;

  node.destroy();
  workletNode.node.port.onmessage?.({
    data: { type: 'ENDED' },
  } as MessageEvent);

  expect(onended).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the wrapper tests and confirm they fail**

Run: `pnpm --filter @axiom/native test:js -- src/nodes/moog-oscillator-worklet-node.test.ts`
Expected: FAIL — `node.start is not a function`, `node.stop is not a function`, `node.disconnect is not a function`.

- [ ] **Step 3: Implement the wrapper lifecycle**

Rewrite `packages/native/src/nodes/moog-oscillator-worklet-node.ts` to:

```ts
import type { WasmWorkletOptions } from '../shared/wasm-worklet-options';
import type {
  WorkletDestroyMessage,
  WorkletMessage,
} from '../shared/worklet-messages';

export interface MoogOscillatorOptions {
  // empty for now
}

export class MoogOscillatorWorkletNode {
  private readonly node: AudioWorkletNode;
  private destroyed = false;
  private started = false;
  private stopped = false;
  private ended = false;
  onended: (() => void) | null = null;

  constructor(
    ctxt: AudioContext,
    wasmModule: WebAssembly.Module,
    _options: Partial<MoogOscillatorOptions> = {},
  ) {
    this.node = new AudioWorkletNode(ctxt, 'saw-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {},
      processorOptions: {
        wasmModule,
      },
    } satisfies WasmWorkletOptions);

    this.node.port.onmessage = (event: MessageEvent<WorkletMessage>) => {
      switch (event.data.type) {
        case 'REPORT_RENDER_TIME':
          const sampleRate = ctxt.sampleRate;
          const blockSize = 128;
          const blockSizeMs = (blockSize / sampleRate) * 1_000;
          const speed = blockSizeMs / event.data.renderTimeMs;
          console.log(
            `Average render time: ${Math.round(event.data.renderTimeMs * 1000)} μs (${Math.round(speed)}x real-time)`,
          );
          break;
        case 'ENDED':
          if (!this.ended) {
            this.ended = true;
            this.onended?.();
          }
          break;
        default:
          console.warn(`Unrecognized message: ${event.data.type}`);
      }
    };
  }

  get frequency(): AudioParam {
    return this.node.parameters.get('frequency')!;
  }

  get detune(): AudioParam {
    return this.node.parameters.get('detune')!;
  }

  connect(destination: AudioNode): void;
  connect(destination: AudioParam): void;
  connect(destination: AudioParam | AudioNode): void {
    this.node.connect(destination as AudioNode);
  }

  disconnect(): void;
  disconnect(destination: AudioNode): void;
  disconnect(destination: AudioParam): void;
  disconnect(destination?: null | AudioNode | AudioParam): void {
    if (destination === undefined || destination === null) {
      this.node.disconnect();
    } else {
      this.node.disconnect(destination as AudioNode);
    }
  }

  start(when: number): void {
    if (this.started || this.destroyed) {
      return;
    }
    this.started = true;
    this.node.port.postMessage({
      type: 'START',
      when,
    } satisfies WorkletMessage);
  }

  stop(when: number): void {
    if (this.stopped || this.destroyed) {
      return;
    }
    this.stopped = true;
    this.node.port.postMessage({
      type: 'STOP',
      when,
    } satisfies WorkletMessage);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.node.port.postMessage({
      type: 'DESTROY',
    } satisfies WorkletDestroyMessage);
    this.node.port.onmessage = null;
    this.node.disconnect();
    this.onended = null;
  }
}
```

- [ ] **Step 4: Run the wrapper tests and confirm they pass**

Run: `pnpm --filter @axiom/native test:js -- src/nodes/moog-oscillator-worklet-node.test.ts`
Expected: PASS (all new + existing tests).

- [ ] **Step 5: Commit**

```bash
git add packages/native/src/nodes/moog-oscillator-worklet-node.ts packages/native/src/nodes/moog-oscillator-worklet-node.test.ts
git commit -m "feat: add start/stop/onended lifecycle to MoogOscillatorWorkletNode"
```

---

### Task 3: Wire MoogOscillator to the worklet lifecycle

**Files:**

- Modify: `packages/native/src/nodes/moog-oscillator.ts`
- Create: `packages/native/src/nodes/moog-oscillator.test.ts`

**Interfaces:**

- Consumes: `MoogOscillatorWorkletNode` (Task 2): `start(when)`, `stop(when)`, `onended`, `connect`, `disconnect`, `frequency`, `detune`, `destroy`.
- Produces: `MoogOscillator` implementing `Oscillator` from `@axiom/audio-engine`, with `waveform` stored-only (worklet is saw-only).

- [ ] **Step 1: Write the failing MoogOscillator tests**

Create `packages/native/src/nodes/moog-oscillator.test.ts`:

```ts
import {
  FakeAudioContext,
  FakeAudioParam,
  installFakeAudioParam,
} from '@axiom/audio-testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';

class FakeAudioWorkletNode {
  readonly parameters = new Map<string, FakeAudioParam>([
    ['frequency', new FakeAudioParam()],
    ['detune', new FakeAudioParam()],
  ]);
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly port = {
    onmessage: undefined as ((event: MessageEvent) => void) | undefined,
    postMessage: vi.fn(),
  };
  readonly options: AudioWorkletNodeOptions;
  readonly context: AudioContext;
  readonly name: string;

  constructor(
    context: AudioContext,
    name: string,
    options: AudioWorkletNodeOptions,
  ) {
    this.context = context;
    this.name = name;
    this.options = options;
  }
}

const createdNodes: FakeAudioWorkletNode[] = [];
Object.assign(globalThis, {
  AudioWorkletNode: class extends FakeAudioWorkletNode {
    constructor(
      context: AudioContext,
      name: string,
      options: AudioWorkletNodeOptions,
    ) {
      super(context, name, options);
      createdNodes.push(this);
    }
  },
});

const { MoogOscillator } = await import('./moog-oscillator');

describe('MoogOscillator', () => {
  beforeEach(() => {
    createdNodes.splice(0, createdNodes.length);
  });
  it('does not create a worklet node before start', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();

    try {
      new MoogOscillator(
        context as unknown as AudioContext,
        new ArrayBuffer(0),
      );

      expect(createdNodes).toHaveLength(0);
    } finally {
      restoreAudioParam();
    }
  });

  it('starts a fresh worklet node per generation and schedules its frequency', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();

    try {
      const oscillator = new MoogOscillator(
        context as unknown as AudioContext,
        new ArrayBuffer(0),
      );

      oscillator.start(440, 1);
      expect(createdNodes).toHaveLength(1);
      const first = createdNodes[0]!;
      expect(first.port.postMessage).toHaveBeenCalledWith({
        type: 'START',
        when: 1,
      });
      expect(first.parameters.get('frequency')!.operations).toEqual([
        { type: 'setValueAtTime', value: 440, time: 1 },
      ]);
      expect(first.connect).toHaveBeenCalledTimes(1);
      expect(context.connections.length).toBeGreaterThan(0);
    } finally {
      restoreAudioParam();
    }
  });

  it('stops with the context time by default and the given time explicitly', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();
    context.currentTime = 5;

    try {
      const oscillator = new MoogOscillator(
        context as unknown as AudioContext,
        new ArrayBuffer(0),
      );

      oscillator.start(440, 6);
      oscillator.stop();
      expect(createdNodes[0]!.port.postMessage).toHaveBeenCalledWith({
        type: 'STOP',
        when: 5,
      });

      oscillator.stop();
      oscillator.stop(7);
      expect(createdNodes[0]!.port.postMessage).not.toHaveBeenCalledWith({
        type: 'STOP',
        when: 7,
      });

      oscillator.start(220, 8);
      oscillator.stop(9);
      expect(createdNodes[1]!.port.postMessage).toHaveBeenCalledWith({
        type: 'STOP',
        when: 9,
      });
    } finally {
      restoreAudioParam();
    }
  });

  it('notifies each active end subscriber once and supports idempotent unsubscribe', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();

    try {
      const oscillator = new MoogOscillator(
        context as unknown as AudioContext,
        new ArrayBuffer(0),
      );
      let calls = 0;
      const subscription = oscillator.onEnded(() => calls++);

      oscillator.start(440, 0);
      createdNodes[0]!.port.onmessage?.({
        data: { type: 'ENDED' },
      } as MessageEvent);
      subscription.unsubscribe();
      subscription.unsubscribe();

      expect(calls).toBe(1);
    } finally {
      restoreAudioParam();
    }
  });

  it('creates a fresh source after the previous source completes', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();

    try {
      const oscillator = new MoogOscillator(
        context as unknown as AudioContext,
        new ArrayBuffer(0),
      );

      oscillator.start(440, 0);
      createdNodes[0]!.port.onmessage?.({
        data: { type: 'ENDED' },
      } as MessageEvent);
      oscillator.start(220, 1);

      expect(createdNodes).toHaveLength(2);
    } finally {
      restoreAudioParam();
    }
  });

  it('removes all subscribers and owned graph nodes and destroys nodes on destroy', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();

    try {
      const oscillator = new MoogOscillator(
        context as unknown as AudioContext,
        new ArrayBuffer(0),
      );
      let calls = 0;
      oscillator.onEnded(() => calls++);
      oscillator.start(440, 0);
      const first = createdNodes[0]!;

      oscillator.destroy();
      first.port.onmessage?.({ data: { type: 'ENDED' } } as MessageEvent);

      expect(calls).toBe(0);
      expect(context.connections).toHaveLength(0);
      expect(first.port.postMessage).toHaveBeenCalledWith({ type: 'DESTROY' });
    } finally {
      restoreAudioParam();
    }
  });
});
```

The fake must not use constructor parameter properties — `erasableSyntaxOnly`
(`tsconfig.base.json`) forbids them.

- [ ] **Step 2: Run the MoogOscillator tests and confirm they fail**

Run: `pnpm --filter @axiom/native test:js -- --run src/nodes/moog-oscillator.test.ts`
Expected: FAIL — `createdNodes[0]` is undefined; `MoogOscillator`/`createVoiceNodes` fails because `osc.type` does not exist and `osc.start` receives a worklet node.

- [ ] **Step 3: Rewrite MoogOscillator against the worklet node**

Apply to `packages/native/src/nodes/moog-oscillator.ts`:

1. `stop(time?: number)` — delegate with the context-time fallback (replace the whole `stop` method):

```ts
  stop(time?: number) {
    if (!this.current) {
      return;
    }
    const osc = this.current;
    this.current = null;
    if (this.stoppedNodes.has(osc)) {
      return;
    }
    this.stoppedNodes.add(osc);
    osc.stop(time ?? this.ctxt.currentTime);
  }
```

2. `createVoiceNodes` — remove the `osc.type = this.wave;` line (worklet is
   saw-only; `wave` stays as stored state for `waveform`).

3. `detachNode` — destroy the worklet (frees the processor) instead of a bare
   disconnect; change the parameter type from `OscillatorNode` to
   `MoogOscillatorWorkletNode`:

```ts
  private detachNode(osc: MoogOscillatorWorkletNode): void {
    this.frequencySource.disconnect(osc.frequency);
    this.detuneSource.disconnect(osc.detune);
    osc.destroy();
  }
```

No other method changes: `connect`, `disconnect`, `start`, `onEnded`,
`destroy`, `createVoiceNodes`, and the `onended` handler stay as copied from
`WebAudioOscillator`.

- [ ] **Step 4: Run the MoogOscillator tests and confirm they pass**

Run: `pnpm --filter @axiom/native test:js -- --run src/nodes/moog-oscillator.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the full native JS test suite**

Run: `pnpm --filter @axiom/native test:js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/native/src/nodes/moog-oscillator.ts packages/native/src/nodes/moog-oscillator.test.ts
git commit -m "feat: drive MoogOscillator lifecycle over the worklet node"
```

---

### Task 4: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Build**

Run: `pnpm build`
Expected: type-check passes (`tsc --noEmit` across app + processor projects) and the native WASM builds.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: every package's tests pass, including the C test suite.

- [ ] **Step 3: Lint**

Run: `pnpm lint`
Expected: `prettier --check` passes (no formatting changes needed). If it reports
any file, run `pnpm format` and re-run `pnpm lint`.

- [ ] **Step 4: Confirm clean tree and trailing state**

Run: `git status`
Expected: nothing uncommitted except any `pnpm format` fixes (commit those with
`chore: format` and re-run steps 1-3).
