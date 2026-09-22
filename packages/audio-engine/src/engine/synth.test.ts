import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Synth } from './synth';
import { Voice } from './voice';
import { FakeAudioContext, FakeAudioNode } from './test/fake-audio-context';

class TestVoice extends Voice {
  readonly label: string;
  noteOnCalls: Array<{ note: number; velocity: number; now: number }> = [];
  fastChokeCalls: Array<{ chokeTime: number; now: number }> = [];
  noteOffCount = 0;
  silentAt = 0.2;

  constructor(ctxt: AudioContext, audioSink: AudioNode, label: string) {
    super(ctxt, audioSink);
    this.label = label;
  }

  protected internalNoteOn(note: number, velocity: number, now: number): void {
    this.noteOnCalls.push({ note, velocity, now });
  }

  protected internalNoteOff(_now: number): { silentAt: number } {
    this.noteOffCount++;
    return { silentAt: this.silentAt };
  }

  protected internalFastChoke(chokeTime: number, now: number): void {
    this.fastChokeCalls.push({ chokeTime, now });
  }

  protected onSoundStop(): void {}
}

class TestSynth extends Synth<TestVoice> {
  readonly voices: TestVoice[] = [];

  constructor(ctxt: AudioContext, audioSink: AudioNode, maxVoices: number) {
    super(ctxt, audioSink, { maxVoices });
  }

  protected createVoice(): TestVoice {
    const voice = new TestVoice(
      this.ctxt,
      this.audioSink,
      `v${this.voices.length}`,
    );
    this.voices.push(voice);
    return voice;
  }
}

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
});
