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
});
