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
