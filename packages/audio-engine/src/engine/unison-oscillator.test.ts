import { describe, expect, it } from 'vitest';
import { UnisonOscillator } from './unison-oscillator';
import { FakeAudioContext } from './test/fake-audio-context';

describe('UnisonOscillator', () => {
  it('creates one direct oscillator for one voice', () => {
    const ctxt = new FakeAudioContext();
    const oscillator = new UnisonOscillator(ctxt as unknown as AudioContext);

    oscillator.start(440, 0);

    expect(ctxt.oscillators).toHaveLength(1);
    expect(ctxt.stereoPanners).toHaveLength(0);
  });
});
