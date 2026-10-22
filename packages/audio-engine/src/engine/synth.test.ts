import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakeAudioNode } from '@axiom/audio-testing';
import { TestSynth } from '../testing/test-synth';

function makeSynth(maxVoices: number) {
  const ctx = new FakeAudioContext();
  const sink = new FakeAudioNode(ctx);
  const synth = new TestSynth(
    ctx as unknown as AudioContext,
    sink as unknown as AudioNode,
    maxVoices,
  );
  return { ctx, synth };
}

describe('Synth voice allocation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses a free voice before stealing', () => {
    const { ctx, synth } = makeSynth(2);
    ctx.currentTime = 10;
    synth.noteOn(60, 1);
    const v0 = synth.voices[0]!;
    const v1 = synth.voices[1]!;

    expect(v0.noteOnCalls).toEqual([{ note: 60, velocity: 1, now: 10 }]);
    expect(v0.fastChokeCalls).toHaveLength(0);

    synth.noteOn(62, 1);
    expect(v1.noteOnCalls).toEqual([{ note: 62, velocity: 1, now: 10 }]);
    expect(v1.fastChokeCalls).toHaveLength(0);
    expect(v0.fastChokeCalls).toHaveLength(0);
  });

  it('sets releasedAt on noteOff and clears it after the release tail ends', () => {
    const { ctx, synth } = makeSynth(1);

    ctx.currentTime = 4;
    synth.noteOn(60, 1);
    const v0 = synth.voices[0]!;
    expect(v0.releasedAt).toBeNull();

    ctx.currentTime = 5;
    synth.noteOff(60);
    expect(v0.releasedAt).toBe(5);
    expect(v0.currentNote).toBe(60);

    // silentAt 0.2 -> endTime 5 + 0.2*5 = 6, cleanup timer fires at 1000ms.
    vi.advanceTimersByTime(1001);
    expect(v0.releasedAt).toBeNull();
    expect(v0.currentNote).toBeNull();
  });

  it('clears releasedAt when retriggered by a steal', () => {
    const { ctx, synth } = makeSynth(1);

    ctx.currentTime = 0;
    synth.noteOn(60, 1);
    const v0 = synth.voices[0]!;
    ctx.currentTime = 1;
    synth.noteOff(60);
    expect(v0.releasedAt).toBe(1);

    ctx.currentTime = 1.95;
    synth.noteOn(64, 1);
    expect(v0.releasedAt).toBeNull();
    expect(v0.currentNote).toBe(64);
  });

  it('retriggers an active note on its own released voice when the pool is full', () => {
    const { ctx, synth } = makeSynth(2);
    ctx.currentTime = 0;
    synth.noteOn(60, 1); // v0 held
    synth.noteOn(62, 1); // v1 held
    const v0 = synth.voices[0]!;
    const v1 = synth.voices[1]!;

    ctx.currentTime = 1;
    synth.noteOn(60, 1); // retrigger: v0 noteOff'd (released), then noteOn 60

    expect(v0.fastChokeCalls).toHaveLength(1);
    expect(v1.fastChokeCalls).toHaveLength(0);
    expect(v0.currentNote).toBe(60);
    expect(v1.currentNote).toBe(62);
  });

  it('steals a mature release tail instead of a held voice', () => {
    const { ctx, synth } = makeSynth(2);
    ctx.currentTime = 0;
    synth.noteOn(60, 1); // v0 held
    synth.noteOn(62, 1); // v1 held
    ctx.currentTime = 1;
    synth.noteOff(62); // v1 released, endTime = 1 + 0.2*5 = 2
    const v0 = synth.voices[0]!;
    const v1 = synth.voices[1]!;

    ctx.currentTime = 1.95; // v1 progress 0.95, tail not over
    synth.noteOn(64, 1);

    expect(v1.fastChokeCalls).toHaveLength(1);
    expect(v0.fastChokeCalls).toHaveLength(0);
    expect(v1.noteOnCalls.some(call => call.note === 64)).toBe(true);
    expect(v0.noteOnCalls.some(call => call.note === 64)).toBe(false);
  });

  it('prefers a released voice over a held voice even when the release is young', () => {
    const { ctx, synth } = makeSynth(2);
    ctx.currentTime = 0;
    synth.noteOn(60, 1); // v0 held from 0, then released young
    ctx.currentTime = 1;
    synth.noteOn(62, 1); // v1 held (lastUsed 1)
    const v0 = synth.voices[0]!;
    const v1 = synth.voices[1]!;
    ctx.currentTime = 1;
    synth.noteOff(60); // v0 released young, tail to 1 + 0.2*5 = 2
    ctx.currentTime = 1.8; // v0 progress 0.8 (young, still loud)
    synth.noteOn(64, 1);

    // Any released voice beats a held voice, even a freshly-released loud one.
    expect(v0.fastChokeCalls).toHaveLength(1);
    expect(v1.fastChokeCalls).toHaveLength(0);
    expect(v0.noteOnCalls.some(call => call.note === 64)).toBe(true);
    expect(v1.noteOnCalls.some(call => call.note === 64)).toBe(false);
  });

  it('steals the release tail closest to silence', () => {
    const { ctx, synth } = makeSynth(3);
    ctx.currentTime = 0;
    synth.noteOn(60, 1);
    synth.noteOn(61, 1);
    synth.noteOn(62, 1);
    ctx.currentTime = 1;
    synth.noteOff(61); // v1 tail to 2
    ctx.currentTime = 1.5;
    synth.noteOff(62); // v2 tail to 2.5
    const v0 = synth.voices[0]!;
    const v1 = synth.voices[1]!;
    const v2 = synth.voices[2]!;

    ctx.currentTime = 1.95; // v1 progress 0.95, v2 progress 0.45
    synth.noteOn(64, 1);

    expect(v1.fastChokeCalls).toHaveLength(1);
    expect(v2.fastChokeCalls).toHaveLength(0);
    expect(v0.fastChokeCalls).toHaveLength(0);
    expect(v1.noteOnCalls.some(call => call.note === 64)).toBe(true);
  });

  it('reuses a free voice when retriggering an active note', () => {
    const { ctx, synth } = makeSynth(2);
    ctx.currentTime = 5;
    synth.noteOn(60, 1);
    const v0 = synth.voices[0]!;
    const v1 = synth.voices[1]!;

    synth.noteOn(60, 1); // noteOff(60) on v0, then free v1 picks it up

    expect(v0.noteOffCount).toBe(1);
    expect(v1.noteOnCalls).toEqual([{ note: 60, velocity: 1, now: 5 }]);
    expect(v1.fastChokeCalls).toHaveLength(0);
  });
});

describe('Synth activity notification', () => {
  it('activates the activity sink on noteOn', () => {
    const ctx = new FakeAudioContext();
    const sink = new FakeAudioNode(ctx);
    let activated = 0;
    const synth = new TestSynth(
      ctx as unknown as AudioContext,
      sink as unknown as AudioNode,
      1,
      {
        activate: () => {
          activated++;
        },
      },
    );

    synth.noteOn(60, 1);

    expect(activated).toBe(1);
  });

  it('does not activate the activity sink after destroy', () => {
    const ctx = new FakeAudioContext();
    const sink = new FakeAudioNode(ctx);
    let activated = 0;
    const synth = new TestSynth(
      ctx as unknown as AudioContext,
      sink as unknown as AudioNode,
      1,
      {
        activate: () => {
          activated++;
        },
      },
    );

    synth.destroy();
    synth.noteOn(60, 1);

    expect(activated).toBe(0);
  });
});
