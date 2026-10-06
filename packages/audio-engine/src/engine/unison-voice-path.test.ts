import { describe, expect, it } from 'vitest';
import { FakeAudioContext, installFakeAudioParam } from '@axiom/audio-testing';
import type { Oscillator } from './oscillator';
import { UnisonVoicePathPool } from './unison-voice-path';

function createPool() {
  const context = new FakeAudioContext();
  const outputGain = context.createGain();
  const detuneSource = context.createConstantSource();
  const depthSource = context.createConstantSource();
  const blendSource = context.createConstantSource();
  return {
    context,
    outputGain,
    detuneSource,
    depthSource,
    blendSource,
    pool: new UnisonVoicePathPool(
      context as unknown as AudioContext,
      outputGain as unknown as GainNode,
      detuneSource as unknown as ConstantSourceNode,
      depthSource as unknown as ConstantSourceNode,
      blendSource as unknown as ConstantSourceNode,
    ),
  };
}

function createOscillator(context: FakeAudioContext): Oscillator & {
  readonly detune: ReturnType<FakeAudioContext['createOscillator']>['detune'];
  readonly connections: Array<AudioNode | AudioParam>;
} {
  const oscillator = context.createOscillator();
  const connections: Array<AudioNode | AudioParam> = [];
  return {
    waveform: 'sawtooth',
    frequency: oscillator.frequency as unknown as AudioParam,
    detune: oscillator.detune as unknown as AudioParam,
    gain: oscillator.detune as unknown as AudioParam,
    connections,
    connect(destination) {
      connections.push(destination);
    },
    disconnect(destination) {
      if (destination === undefined || destination === null) {
        connections.length = 0;
        return;
      }
      const index = connections.indexOf(destination);
      if (index >= 0) connections.splice(index, 1);
    },
    start() {},
    stop() {},
    onEnded() {
      return { unsubscribe() {} };
    },
    destroy() {},
  };
}

describe('UnisonVoicePathPool', () => {
  it('does not return a draining path before its source ends', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool } = createPool();
      const lease = pool.acquire(4);
      const oscillators = Array.from({ length: 4 }, () =>
        createOscillator(context),
      );

      lease.paths.forEach((path, index) => path.arm(oscillators[index]!));
      lease.paths.forEach(path => path.beginDrain());

      expect(pool.acquire(4).usesOverflow).toBe(true);
    } finally {
      restoreAudioParam();
    }
  });

  it('maps Blend through gain 2 and offset -1', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { pool } = createPool();
      const lease = pool.acquire(2);
      const path = lease.paths[0]! as unknown as {
        blendMapper: { gain: { value: number } };
        blendOffset: { offset: { value: number } };
      };

      expect(path.blendMapper.gain.value).toBe(2);
      expect(path.blendOffset.offset.value).toBe(-1);
    } finally {
      restoreAudioParam();
    }
  });

  it('resets reusable gain and position before reattachment', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool } = createPool();
      const first = pool.acquire(2);
      const oscillator = createOscillator(context);
      first.paths[0]!.arm(oscillator);
      first.paths[0]!.beginDrain();
      first.paths[0]!.disarm(oscillator);
      pool.release(first);

      const second = pool.acquire(2);
      const path = second.paths[0]! as unknown as {
        audioGain: { gain: { value: number } };
        detuneScale: { gain: { value: number } };
        depthScale: { gain: { value: number } };
        panner: { pan: { value: number } };
      };
      expect(path.audioGain.gain.value).toBe(0);
      expect(path.detuneScale.gain.value).toBe(-1);
      expect(path.depthScale.gain.value).toBe(-1);
      expect(path.panner.pan.value).toBe(0);
    } finally {
      restoreAudioParam();
    }
  });

  it('returns a disarmed path after its matching source ends', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool } = createPool();
      const lease = pool.acquire(4);
      const oscillators = Array.from({ length: 4 }, () =>
        createOscillator(context),
      );
      lease.paths.forEach((path, index) => path.arm(oscillators[index]!));

      lease.paths.forEach(path => path.beginDrain());
      lease.paths.forEach((path, index) => path.disarm(oscillators[index]!));
      pool.release(lease);

      const next = pool.acquire(4);
      expect(next.usesOverflow).toBe(false);
      expect(next.paths[0]).toBe(lease.paths[0]);
    } finally {
      restoreAudioParam();
    }
  });

  it('ignores a stale source when a path has a newer source', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool } = createPool();
      const first = pool.acquire(2);
      const firstSource = createOscillator(context);
      first.paths[0]!.arm(firstSource);
      first.paths[0]!.beginDrain();
      first.paths[0]!.disarm(firstSource);
      pool.release(first);

      const second = pool.acquire(2);
      const secondSource = createOscillator(context);
      second.paths[0]!.arm(secondSource);
      second.paths[0]!.beginDrain();
      second.paths[0]!.disarm(firstSource);

      expect(pool.acquire(2).usesOverflow).toBe(true);
    } finally {
      restoreAudioParam();
    }
  });

  it('disconnects the exact source detune link when disarming', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool, detuneSource } = createPool();
      const lease = pool.acquire(2);
      const oscillator = createOscillator(context);
      lease.paths[0]!.arm(oscillator);
      lease.paths[0]!.beginDrain();
      lease.paths[0]!.disarm(oscillator);

      expect(
        context.operations.some(
          operation =>
            operation.type === 'disconnect' &&
            (operation.source as unknown) ===
              (lease.paths[0]!.detuneScale as unknown) &&
            operation.destination === oscillator.detune,
        ),
      ).toBe(true);
      expect(
        detuneSource.connections.some(
          connection =>
            (connection.destination as unknown) ===
            (lease.paths[0]!.detuneScale as unknown),
        ),
      ).toBe(true);
    } finally {
      restoreAudioParam();
    }
  });

  it('has no direct oscillator-to-output path', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool, outputGain } = createPool();
      const lease = pool.acquire(2);
      const oscillator = createOscillator(context);
      lease.paths[0]!.arm(oscillator);

      expect(
        oscillator.connections.some(
          connection => connection.destination === outputGain,
        ),
      ).toBe(false);
    } finally {
      restoreAudioParam();
    }
  });

  it('destroys overflow paths after their source ends', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool } = createPool();
      const stable = pool.acquire(2);
      const stableSources = stable.paths.map(() => createOscillator(context));
      stable.paths.forEach((path, index) => {
        path.arm(stableSources[index]!);
        path.beginDrain();
      });
      const overflow = pool.acquire(2);
      const sources = overflow.paths.map(() => createOscillator(context));
      overflow.paths.forEach((path, index) => {
        path.arm(sources[index]!);
        path.beginDrain();
        path.disarm(sources[index]!);
      });
      pool.release(overflow);

      expect(overflow.paths[0]!.state).toBe('destroyed');
    } finally {
      restoreAudioParam();
    }
  });

  it('disconnects raw audio and every shared source link on destroy', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool, detuneSource, depthSource, blendSource } =
        createPool();
      const lease = pool.acquire(2);
      const oscillator = createOscillator(context);
      lease.paths[0]!.arm(oscillator);
      pool.destroy();

      expect(oscillator.connections).toHaveLength(0);
      expect(detuneSource.connections).toHaveLength(0);
      expect(depthSource.connections).toHaveLength(0);
      expect(blendSource.connections).toHaveLength(0);
      expect(lease.paths[0]!.state).toBe('destroyed');
    } finally {
      restoreAudioParam();
    }
  });

  it('stops each path offset source during destroy', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool } = createPool();
      pool.acquire(2);
      const offsetSources = context.constantSources.slice(-2);
      pool.destroy();

      expect(offsetSources.every(source => source.stopped)).toBe(true);
    } finally {
      restoreAudioParam();
    }
  });

  it('allows repeated release and destroy after disconnect failure', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { pool } = createPool();
      const lease = pool.acquire(2);
      (
        lease.paths[0]!.audioGain as unknown as { throwOnDisconnect: boolean }
      ).throwOnDisconnect = true;

      pool.release(lease);
      pool.release(lease);
      expect(pool.counters.released).toBe(1);
      expect(() => pool.destroy()).not.toThrow();
      expect(() => pool.destroy()).not.toThrow();
      expect(lease.paths[1]!.state).toBe('destroyed');
    } finally {
      restoreAudioParam();
    }
  });
});
