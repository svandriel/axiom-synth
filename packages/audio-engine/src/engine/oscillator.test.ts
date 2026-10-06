import { FakeAudioContext, installFakeAudioParam } from '@axiom/audio-testing';
import { describe, expect, it } from 'vitest';
import { WebAudioOscillator } from './oscillator';

describe('WebAudioOscillator', () => {
  it('does not create a Web Audio oscillator before start', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();

    try {
      const oscillator = new WebAudioOscillator(
        context as unknown as AudioContext,
      );

      expect(context.oscillators).toHaveLength(0);
    } finally {
      restoreAudioParam();
    }
  });

  it('notifies each active end subscriber once and supports idempotent unsubscribe', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();

    try {
      const oscillator = new WebAudioOscillator(
        context as unknown as AudioContext,
      );
      let calls = 0;
      const subscription = oscillator.onEnded(() => calls++);

      oscillator.start(440, 0);
      context.oscillators[0]!.end();
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
      const oscillator = new WebAudioOscillator(
        context as unknown as AudioContext,
      );

      oscillator.start(440, 0);
      context.oscillators[0]!.end();
      oscillator.start(220, 1);

      expect(context.oscillators).toHaveLength(2);
    } finally {
      restoreAudioParam();
    }
  });

  it('removes all subscribers and owned graph nodes on destroy', () => {
    const restoreAudioParam = installFakeAudioParam();
    const context = new FakeAudioContext();

    try {
      const oscillator = new WebAudioOscillator(
        context as unknown as AudioContext,
      );
      let calls = 0;
      oscillator.onEnded(() => calls++);
      oscillator.start(440, 0);
      const source = context.oscillators[0]!;

      oscillator.destroy();
      source.end();

      expect(calls).toBe(0);
      expect(context.connections).toHaveLength(0);
    } finally {
      restoreAudioParam();
    }
  });
});
