# Native Oscillator Lifecycle — Design

Date: 2026-10-11
Status: Approved

## Problem

`packages/native/src/nodes/moog-oscillator.ts` was copied from
`packages/audio-engine/src/engine/web-audio-oscillator.ts`, which drives a
native `OscillatorNode`. It now drives `MoogOscillatorWorkletNode`, but neither
the wrapper nor the `AudioWorkletProcessor` implements the lifecycle the
`Oscillator` interface needs:

- The wrapper has no `start`, `stop`, `onended`, or `disconnect`.
- The processor has no notion of a scheduled start or stop; it only has a
  hard `DESTROY` message.
- `MoogOscillator` still assigns `osc.type = this.wave` (no such member) and
  treats `stop(time)` as a native node method.

`MoogOscillator` must satisfy `Oscillator` (see
`docs/superpowers/specs/2026-10-06-oscillator-abstraction-design.md`) so the
engine can use the native oscillator transparently. Because an AudioWorklet
node has no native `stop(time)`/`onended`, the stop time and the end
confirmation must travel over the message port.

## Goals

1. `MoogOscillator` implements `Oscillator` against the worklet node.
2. `start(now)` begins rendering at audio-clock time `now`; silence before.
3. `stop(time)` destroys the worklet node **and** its processor/WASM resources
   at audio-clock time `time`, then confirms teardown back to the main thread.
4. `onended` fires exactly once per node, mirroring `OscillatorNode.onended`.
5. Teardown detaches inbound source→param links (Rule 4) and frees WASM.
6. Behavior is unit-testable without a real `AudioContext` or WASM.

## Design

### 1. Messages (`packages/native/src/shared/worklet-messages.ts`)

Add three messages and widen the union:

```ts
export interface WorkletStartMessage extends BaseWorkletMessage {
  type: 'START';
  when: number; // AudioContext time to begin rendering
}

export interface WorkletStopMessage extends BaseWorkletMessage {
  type: 'STOP';
  when: number; // AudioContext time to destroy
}

export interface WorkletEndedMessage extends BaseWorkletMessage {
  type: 'ENDED';
}

export type WorkletMessage =
  | WorkletDestroyMessage
  | WorkletStartMessage
  | WorkletStopMessage
  | WorkletEndedMessage
  | ReportRenderTimeMessage;
```

`START`/`STOP`/`DESTROY` flow main → processor; `ENDED`/`REPORT_RENDER_TIME`
flow processor → main. The single union keeps both directions type-checked, as
today.

### 2. Processor (`packages/native/src/worker/moog-oscillator-processor.ts`)

New fields: `started = false`, `startTime = 0`, `stopTime: number | undefined`.

Message handling:

- `START` → `started = true; startTime = event.data.when`.
- `STOP` → `stopTime = event.data.when`.
- `DESTROY` → `destroyResources()` (unchanged).

`process()` order:

1. If `destroyed` → return `false` (unchanged).
2. If `stopTime !== undefined && currentTime >= stopTime` → `destroyResources()`,
   `port.postMessage({ type: 'ENDED' })`, return `false`.
3. If `!started || currentTime < startTime` → zero the output buffer and return
   `true` (keep the processor alive, emit silence).
4. Otherwise render through WASM (unchanged).

`currentTime` is the `AudioWorkletGlobalScope` global (declared by
`@types/audioworklet`). Stop is checked before the start gate so a node that is
stopped before it ever starts still tears down. A `STOP` whose `when` is in the
past (`<= currentTime`) tears down on the next `process()`.

**Timing.** Port messages are delivered before the next `process()` call, so a
stop lands within one render quantum (128 samples ≈ 2.7 ms at 48 kHz). This is
acceptable: the engine's choke fade is 3 ms and is driven by the amp envelope,
not by oscillator teardown.

### 3. Wrapper (`packages/native/src/nodes/moog-oscillator-worklet-node.ts`)

New members:

- `onended: (() => void) | null = null` — mirrors `OscillatorNode.onended`.
- `started = false`, `stopped = false`, `ended = false` guards.
- `start(when: number)`: if not started and not destroyed, post
  `{ type: 'START', when }`, set `started`.
- `stop(when: number)`: if not stopped and not destroyed, post
  `{ type: 'STOP', when }`, set `stopped`.
- `disconnect()` overloads (`AudioNode` / `AudioParam` / none) delegating to
  `this.node.disconnect`.
- `port.onmessage` gains `case 'ENDED'`: if not already ended, set `ended`,
  invoke `onended` once. `REPORT_RENDER_TIME` handling unchanged.
- `destroy()`: existing DESTROY post + `node.disconnect()`; also clear
  `node.port.onmessage` and `onended` so a late `ENDED` cannot fire.

`onended` fires on the `ENDED` message, not on a native event (AudioWorkletNode
has none).

### 4. `MoogOscillator` (`packages/native/src/nodes/moog-oscillator.ts`)

- Keep `waveform` as stored state only (worklet is saw-only); drop
  `osc.type = this.wave`.
- `createVoiceNodes`: `osc.start(now)` (wrapper method); `osc.onended` handler
  unchanged (detaches inbound source→param links, deletes bookkeeping,
  disconnects, fires subscribers).
- `stop(time?)`: delegate `osc.stop(time ?? this.ctxt.currentTime)`. Immediate
  stop uses the current audio-clock time; the processor tears down on its next
  quantum.
- `detachNode(osc: MoogOscillatorWorkletNode)`: call `osc.destroy()` (posts
  `DESTROY` and disconnects the outgoing link) instead of a bare `disconnect()`,
  so hard teardown frees the processor/WASM.
- Constructor, `connect`, `onEnded`, subscriber bookkeeping, and
  `activeNodes`/`stoppedNodes`/`current` state stay as-is.

## Testing

- **`moog-oscillator-worklet-node.test.ts`** (extend the existing fake
  `AudioWorkletNode`): `start`/`stop` post START/STOP once; `ENDED` on the port
  fires `onended` exactly once; `disconnect` delegates to the worklet node;
  `destroy` remains idempotent and clears the port handler.
- **`moog-oscillator-processor.test.ts`**: with a controllable global
  `currentTime`, assert that before `START` (and before `startTime`) the output
  is silence and `process` returns `true`; that `STOP` posts `ENDED`, frees WASM
  (`_free` × 3, `_moog_saw_wasm_destroy`), and returns `false`; existing DESTROY
  and parameter tests unchanged.
- **New `moog-oscillator.test.ts`** (mirrors `web-audio-oscillator.test.ts`
  using `FakeAudioContext`, `installFakeAudioParam`, and a fake global
  `AudioWorkletNode`): no node created before `start`; a fresh node per
  generation; each end subscriber called once with idempotent unsubscribe;
  `destroy` drops subscribers and disconnects owned graph nodes.

Gates: `pnpm test`, `pnpm build`, `pnpm lint`.

## Out of scope (YAGNI)

- No waveform selection in the worklet (saw only).
- No sample-accurate (sub-quantum) stop; one-quantum latency accepted.
- No change to the engine's voice/steal or envelope timing.
- No changes to `WebAudioOscillator` or the `Oscillator` interface.
