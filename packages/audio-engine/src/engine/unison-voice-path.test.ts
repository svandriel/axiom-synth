import { describe, expect, it } from 'vitest';
import {
  FakeAudioContext,
  installFakeAudioParam,
} from './test/fake-audio-context';
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

function asOscillator(
  oscillator: ReturnType<FakeAudioContext['createOscillator']>,
) {
  return oscillator as unknown as OscillatorNode;
}

describe('UnisonVoicePathPool', () => {
  it('does not return a draining path before its source ends', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const { context, pool } = createPool();
      const lease = pool.acquire(4);
      const oscillators = Array.from({ length: 4 }, () =>
        context.createOscillator(),
      );

      lease.paths.forEach((path, index) =>
        path.arm(asOscillator(oscillators[index]!)),
      );
      lease.paths.forEach(path => path.beginDrain());

      expect(pool.acquire(4).usesOverflow).toBe(true);
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
        context.createOscillator(),
      );
      lease.paths.forEach((path, index) =>
        path.arm(asOscillator(oscillators[index]!)),
      );

      lease.paths.forEach(path => path.beginDrain());
      lease.paths.forEach((path, index) =>
        path.disarm(asOscillator(oscillators[index]!)),
      );
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
      const firstSource = context.createOscillator();
      first.paths[0]!.arm(asOscillator(firstSource));
      first.paths[0]!.beginDrain();
      first.paths[0]!.disarm(asOscillator(firstSource));
      pool.release(first);

      const second = pool.acquire(2);
      const secondSource = context.createOscillator();
      second.paths[0]!.arm(asOscillator(secondSource));
      second.paths[0]!.beginDrain();
      second.paths[0]!.disarm(asOscillator(firstSource));

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
      const oscillator = context.createOscillator();
      lease.paths[0]!.arm(asOscillator(oscillator));
      lease.paths[0]!.beginDrain();
      lease.paths[0]!.disarm(asOscillator(oscillator));

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
      const oscillator = context.createOscillator();
      lease.paths[0]!.arm(asOscillator(oscillator));

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
      const stableSources = stable.paths.map(() => context.createOscillator());
      stable.paths.forEach((path, index) => {
        path.arm(asOscillator(stableSources[index]!));
        path.beginDrain();
      });
      const overflow = pool.acquire(2);
      const sources = overflow.paths.map(() => context.createOscillator());
      overflow.paths.forEach((path, index) => {
        path.arm(asOscillator(sources[index]!));
        path.beginDrain();
        path.disarm(asOscillator(sources[index]!));
      });
      pool.release(overflow);

      expect(overflow.paths[0]!.state).toBe('destroyed');
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
      expect(() => pool.destroy()).not.toThrow();
      expect(() => pool.destroy()).not.toThrow();
    } finally {
      restoreAudioParam();
    }
  });
});
