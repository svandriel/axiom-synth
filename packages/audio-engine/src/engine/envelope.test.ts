import { describe, expect, it } from 'vitest';

import { Envelope } from './envelope';
import { FakeAudioContext, FakeGainNode } from './test/fake-audio-context';
import type { EnvelopeConfig } from '../types';

const SHORT_ATTACK_SECONDS = 0.001;
const TARGET_VOLUME = 1;

const shortAttackConfig: EnvelopeConfig = {
  attackSeconds: SHORT_ATTACK_SECONDS,
  attackCurve: 'linear',
  decaySeconds: 0.1,
  decayCurve: 'linear',
  sustainLevel: 0.5,
  releaseSeconds: 0.1,
  releaseCurve: 'linear',
};

describe('Envelope', () => {
  it('holds the peak for one render quantum after a short attack', () => {
    const context = new FakeAudioContext();
    const envelope = new Envelope(context as unknown as AudioContext);

    envelope.noteOn(
      TARGET_VOLUME * 127,
      shortAttackConfig,
      context.currentTime,
    );

    const gain = envelope.node as unknown as FakeGainNode;
    const decay = gain.gain.operations.find(
      operation => 'value' in operation && operation.value === 0.5,
    );
    const renderQuantumSeconds = 128 / context.sampleRate;

    expect(decay).toEqual({
      type: 'linearRampToValueAtTime',
      value: 0.5,
      time:
        SHORT_ATTACK_SECONDS +
        renderQuantumSeconds +
        shortAttackConfig.decaySeconds,
    });
  });
});
