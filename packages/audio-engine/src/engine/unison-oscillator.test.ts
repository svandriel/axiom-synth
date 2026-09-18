import { describe, expect, it } from 'vitest';
import { UnisonOscillator } from './unison-oscillator';
import {
  FakeAudioContext,
  installFakeAudioParam,
} from './test/fake-audio-context';

describe('UnisonOscillator', () => {
  it('creates one direct oscillator for one voice', () => {
    const restoreAudioParam = installFakeAudioParam();
    const ctxt = new FakeAudioContext();
    try {
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);

      oscillator.start(440, 0);

      const [fakeOscillator] = ctxt.oscillators;
      const [frequencySource, detuneSource] = ctxt.constantSources;
      expect(ctxt.oscillators).toHaveLength(1);
      expect(ctxt.stereoPanners).toHaveLength(0);
      expect(fakeOscillator?.startCalls).toEqual([{ when: 0 }]);
      expect(
        ctxt.connections.some(
          connection =>
            connection.source === fakeOscillator &&
            connection.destination === ctxt.gains[0],
        ),
      ).toBe(true);
      expect(
        ctxt.connections.some(
          connection =>
            connection.source === frequencySource &&
            connection.destination === fakeOscillator?.frequency,
        ),
      ).toBe(true);
      expect(
        ctxt.connections.some(
          connection =>
            connection.source === detuneSource &&
            connection.destination === fakeOscillator?.detune,
        ),
      ).toBe(true);

      oscillator.stop(0.25);
      expect(fakeOscillator?.stopCalls).toEqual([{ when: 0.25 }]);
      fakeOscillator?.end();
      expect(ctxt.connections).toHaveLength(0);
      expect(
        ctxt.operations.filter(operation => operation.type === 'disconnect'),
      ).toHaveLength(3);
    } finally {
      restoreAudioParam();
    }
  });

  it('starts with unison blend at the public default', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);

      expect(oscillator.unisonBlend.value).toBe(1);
    } finally {
      restoreAudioParam();
    }
  });

  it('reuses warmed paths while allocating fresh oscillator sources', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);

      oscillator.voices = 3;
      oscillator.start(440, 0);
      const firstSources = [...ctxt.oscillators];
      const warmedGainCount = ctxt.gains.length;
      oscillator.stop();
      firstSources.forEach(source => source.end());
      oscillator.start(440, 1);

      expect(ctxt.oscillators).toHaveLength(6);
      expect(ctxt.gains.length).toBe(warmedGainCount);
    } finally {
      restoreAudioParam();
    }
  });

  it('uses no pool path for voices equal to one', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);

      oscillator.start(440, 0);

      expect(ctxt.stereoPanners).toHaveLength(0);
      expect(ctxt.waveShapers).toHaveLength(0);
    } finally {
      restoreAudioParam();
    }
  });

  it('does not reuse a path until matching oscillator end callback', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;

      oscillator.start(440, 0);
      oscillator.stop();
      oscillator.start(440, 1);

      expect(ctxt.stereoPanners).toHaveLength(4);
      expect(ctxt.oscillators).toHaveLength(4);
    } finally {
      restoreAudioParam();
    }
  });

  it('keeps every bundle path reserved until the final sibling ends', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;
      oscillator.start(440, 0);
      oscillator.stop();
      ctxt.oscillators[0]!.end();
      oscillator.start(440, 1);

      expect(ctxt.stereoPanners).toHaveLength(4);
    } finally {
      restoreAudioParam();
    }
  });

  it('keeps an out-of-order old end callback from detaching a newer source', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;

      oscillator.start(440, 0);
      const oldSources = [...ctxt.oscillators];
      oldSources.forEach(source => source.end());
      oscillator.start(440, 1);
      oldSources[0]?.end();

      expect(
        ctxt.oscillators
          .slice(2)
          .every(source =>
            source.connections.some(
              connection => connection.destination === ctxt.gains[0],
            ),
          ),
      ).toBe(false);
      expect(ctxt.oscillators.slice(2)).toHaveLength(2);
    } finally {
      restoreAudioParam();
    }
  });

  it('removes direct and pooled inbound AudioParam links on end', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);

      oscillator.start(440, 0);
      const direct = ctxt.oscillators[0]!;
      oscillator.stop();
      direct.end();
      expect(direct.connections).toHaveLength(0);

      oscillator.voices = 2;
      oscillator.start(440, 1);
      const pooledSources = ctxt.oscillators.slice(1);
      oscillator.stop();
      pooledSources.forEach(source => source.end());
      expect(
        pooledSources.every(source => source.connections.length === 0),
      ).toBe(true);
      const [frequencySource, detuneSource] = ctxt.constantSources;
      expect(
        pooledSources.every(source =>
          ctxt.operations.some(
            operation =>
              operation.type === 'disconnect' &&
              operation.source === frequencySource &&
              operation.destination === source.frequency,
          ),
        ),
      ).toBe(true);
      expect(
        pooledSources.every(source =>
          ctxt.operations.some(
            operation =>
              operation.type === 'disconnect' &&
              operation.source === detuneSource &&
              operation.destination === source.detune,
          ),
        ),
      ).toBe(true);
    } finally {
      restoreAudioParam();
    }
  });

  it('rolls back all acquired paths when setup fails', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;
      const originalStart = ctxt.oscillators;

      oscillator.start(440, 0);
      originalStart.forEach(source => source.end());
      const originalCreate = ctxt.createOscillator.bind(ctxt);
      ctxt.createOscillator = () => {
        const source = originalCreate();
        if (ctxt.oscillators.length === 3) {
          source.start = () => {
            throw new Error('setup failed');
          };
        }
        return source;
      };

      expect(() => oscillator.start(440, 1)).toThrow('setup failed');
      expect(
        ctxt.oscillators
          .slice(2)
          .every(source => source.connections.length === 0),
      ).toBe(true);
    } finally {
      restoreAudioParam();
    }
  });

  it('rolls back every path when cached path configuration fails', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;
      oscillator.start(440, 0);
      const warmedGainCount = ctxt.gains.length;
      const firstSources = [...ctxt.oscillators];
      oscillator.stop();
      firstSources.forEach(source => source.end());
      ctxt.waveShapers[0]!.throwOnCurveSet = true;

      expect(() => oscillator.start(440, 1)).toThrow(
        'FakeWaveShaperNode curve assignment failed',
      );
      ctxt.waveShapers[0]!.throwOnCurveSet = false;
      oscillator.start(440, 2);
      expect(ctxt.gains).toHaveLength(warmedGainCount);
    } finally {
      restoreAudioParam();
    }
  });

  it('rolls back every path when path arm connection fails', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;
      oscillator.start(440, 0);
      const firstSources = [...ctxt.oscillators];
      oscillator.stop();
      firstSources.forEach(source => source.end());
      const originalCreate = ctxt.createOscillator.bind(ctxt);
      ctxt.createOscillator = () => {
        const source = originalCreate();
        source.throwOnConnect = true;
        return source;
      };

      expect(() => oscillator.start(440, 1)).toThrow(
        'FakeAudioNode connect failed',
      );
      ctxt.createOscillator = originalCreate;
      oscillator.start(440, 2);
      expect(ctxt.oscillators).toHaveLength(5);
    } finally {
      restoreAudioParam();
    }
  });

  it('rolls back direct setup when an output connection fails', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      const originalCreate = ctxt.createOscillator.bind(ctxt);
      ctxt.createOscillator = () => {
        const source = originalCreate();
        source.throwOnConnect = true;
        return source;
      };

      expect(() => oscillator.start(440, 0)).toThrow(
        'FakeAudioNode connect failed',
      );
      expect(ctxt.oscillators[0]!.connections).toHaveLength(0);
      expect(ctxt.oscillators[0]!.onended).toBeNull();
      ctxt.createOscillator = originalCreate;
      oscillator.start(440, 1);
      expect(ctxt.oscillators).toHaveLength(2);
    } finally {
      restoreAudioParam();
    }
  });

  it('tracks a pooled source before pre-arm setup can fail', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;
      const originalCreate = ctxt.createOscillator.bind(ctxt);
      ctxt.createOscillator = () => {
        const source = originalCreate();
        source.throwOnTypeSet = true;
        return source;
      };

      expect(() => oscillator.start(440, 0)).toThrow(
        'FakeOscillatorNode type assignment failed',
      );
      expect(ctxt.oscillators[0]!.stopCalls).toHaveLength(1);
      ctxt.createOscillator = originalCreate;
      oscillator.start(440, 1);
      expect(ctxt.oscillators).toHaveLength(3);
    } finally {
      restoreAudioParam();
    }
  });

  it('clears source callbacks after normal cleanup', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.start(440, 0);
      const direct = ctxt.oscillators[0]!;
      oscillator.stop();
      direct.end();
      expect(direct.onended).toBeNull();

      oscillator.voices = 2;
      oscillator.start(440, 1);
      const pooled = ctxt.oscillators.slice(1);
      oscillator.stop();
      pooled.forEach(source => source.end());
      expect(pooled.every(source => source.onended === null)).toBe(true);
    } finally {
      restoreAudioParam();
    }
  });

  it('keeps live a-rate links and silent free paths after sibling cleanup', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;
      oscillator.start(440, 0);
      const source = ctxt.oscillators[0]!;
      expect(
        ctxt.connections.some(
          connection => connection.destination === source.detune,
        ),
      ).toBe(true);
      oscillator.stop();
      ctxt.oscillators.forEach(item => item.end());
      expect(
        [ctxt.gains[1]!, ctxt.gains[6]!].every(gain => gain.gain.value === 0),
      ).toBe(true);
    } finally {
      restoreAudioParam();
    }
  });

  it('releases pooled paths when stopping a source fails', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;
      oscillator.start(440, 0);
      ctxt.oscillators[0]!.throwOnStop = true;

      oscillator.stop();
      ctxt.oscillators.forEach(source => source.end());
      const failedSources = [...ctxt.oscillators];
      const [frequencySource, detuneSource] = ctxt.constantSources;
      const disconnectsBeforeReuse = ctxt.operations.filter(
        operation =>
          operation.type === 'disconnect' &&
          (operation.source === frequencySource ||
            operation.source === detuneSource) &&
          failedSources.some(
            source =>
              operation.destination === source.frequency ||
              operation.destination === source.detune,
          ),
      );
      oscillator.start(440, 1);

      expect(ctxt.oscillators).toHaveLength(4);
      expect(disconnectsBeforeReuse).toEqual([
        {
          type: 'disconnect',
          source: frequencySource,
          destination: failedSources[0]?.frequency,
        },
        {
          type: 'disconnect',
          source: detuneSource,
          destination: failedSources[0]?.detune,
        },
        {
          type: 'disconnect',
          source: frequencySource,
          destination: failedSources[1]?.frequency,
        },
        {
          type: 'disconnect',
          source: detuneSource,
          destination: failedSources[1]?.detune,
        },
      ]);
    } finally {
      restoreAudioParam();
    }
  });

  it('is idempotent when destroyed while sources drain', () => {
    const restoreAudioParam = installFakeAudioParam();
    try {
      const ctxt = new FakeAudioContext();
      const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);
      oscillator.voices = 2;
      oscillator.start(440, 0);
      oscillator.stop();

      expect(() => oscillator.destroy()).not.toThrow();
      expect(() => oscillator.destroy()).not.toThrow();
      const [frequencySource, detuneSource] = ctxt.constantSources;
      const pooledSources = ctxt.oscillators;
      expect(
        ctxt.operations.filter(
          operation =>
            operation.type === 'disconnect' &&
            (operation.source === frequencySource ||
              operation.source === detuneSource) &&
            (operation.destination === pooledSources[0]?.frequency ||
              operation.destination === pooledSources[0]?.detune ||
              operation.destination === pooledSources[1]?.frequency ||
              operation.destination === pooledSources[1]?.detune),
        ),
      ).toEqual([
        ...pooledSources.flatMap(source => [
          {
            type: 'disconnect' as const,
            source: frequencySource,
            destination: source.frequency,
          },
          {
            type: 'disconnect' as const,
            source: detuneSource,
            destination: source.detune,
          },
        ]),
      ]);
      ctxt.oscillators.forEach(source => source.end());
      expect(ctxt.connections).toHaveLength(0);
    } finally {
      restoreAudioParam();
    }
  });
});
