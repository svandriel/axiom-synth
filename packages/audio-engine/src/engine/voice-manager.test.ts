import { describe, expect, it, vi } from 'vitest';

import { FakeAudioContext } from './test/fake-audio-context';
import { Synth } from './synth';
import { Voice } from './voice';
import { VoiceManager } from './voice-manager';

class TestVoice extends Voice {
  readonly noteOnCalls: {
    noteNumber: number;
    velocity: number;
    startTimeOffset: number;
  }[] = [];
  readonly noteOffSpy = vi.fn();
  readonly fastChokeSpy = vi.fn();
  readonly destroySpy = vi.fn();

  override noteOn(
    noteNumber: number,
    velocity: number,
    startTimeOffset: number,
  ): void {
    this.noteOnCalls.push({ noteNumber, velocity, startTimeOffset });
    this.currentNote = noteNumber;
    this.lastUsed = this.ctxt.currentTime + startTimeOffset;
    this.endTime = Infinity;
  }

  override noteOff(): void {
    this.noteOffSpy();
    this.currentNote = null;
  }

  override fastChoke(now: number): void {
    this.fastChokeSpy(now);
  }

  override destroy(): void {
    this.destroySpy();
  }

  protected override onSoundStop(): void {}
  protected override internalFastChoke(
    _chokeTime: number,
    _now: number,
  ): void {}
  protected override internalNoteOn(): void {}
  protected override internalNoteOff(): { silentAt: number } {
    return { silentAt: 0 };
  }
}

function createManager(
  context: FakeAudioContext,
  voices: TestVoice[],
  maxVoices = 2,
): VoiceManager<TestVoice> {
  return new VoiceManager(
    () => {
      const voice = new TestVoice(
        context as unknown as AudioContext,
        context.destination as unknown as AudioNode,
      );
      voices.push(voice);
      return voice;
    },
    { maxVoices },
  );
}

class TestSynth extends Synth<TestVoice> {
  readonly voices: TestVoice[] = [];

  protected override createVoice(): TestVoice {
    const voice = new TestVoice(this.ctxt, this.audioSink);
    this.voices.push(voice);
    return voice;
  }
}

describe('VoiceManager', () => {
  it('keeps Synth destruction guard while delegating voice lifecycle', () => {
    const context = new FakeAudioContext();
    const synth = new TestSynth(
      context as unknown as AudioContext,
      context.destination as unknown as AudioNode,
      {
        maxVoices: 16,
      },
    );

    synth.noteOn(60, 1);
    const voice = synth.voices[0]!;
    synth.noteOff(60);
    synth.destroy();
    synth.noteOn(61, 1);

    expect(voice.noteOffSpy).toHaveBeenCalledOnce();
    expect(voice.destroySpy).toHaveBeenCalledOnce();
    expect(synth.voices).toHaveLength(16);
  });

  it('creates voices lazily and assigns an available voice', () => {
    const context = new FakeAudioContext();
    const voices: TestVoice[] = [];
    const manager = createManager(context, voices);

    expect(voices).toHaveLength(0);
    manager.noteOn(60, 0.8, context.currentTime);
    expect(voices).toHaveLength(2);
    expect(voices[0]!.noteOnCalls).toEqual([
      { noteNumber: 60, velocity: 0.8, startTimeOffset: 0 },
    ]);
  });

  it('releases an active note before retriggering it', () => {
    const context = new FakeAudioContext();
    const voices: TestVoice[] = [];
    const manager = createManager(context, voices);

    manager.noteOn(60, 0.8, context.currentTime);
    manager.noteOn(60, 0.5, context.currentTime);

    expect(voices[0]!.noteOffSpy).toHaveBeenCalledOnce();
    expect(voices[0]!.noteOnCalls).toEqual([
      { noteNumber: 60, velocity: 0.8, startTimeOffset: 0 },
      { noteNumber: 60, velocity: 0.5, startTimeOffset: 0 },
    ]);
  });

  it('releases the voice mapped to a note', () => {
    const context = new FakeAudioContext();
    const voices: TestVoice[] = [];
    const manager = createManager(context, voices);

    manager.noteOn(60, 0.8, context.currentTime);
    manager.noteOff(60);
    manager.noteOff(60);

    expect(voices[0]!.noteOffSpy).toHaveBeenCalledOnce();
  });

  it('steals the oldest voice at capacity with choke delay', () => {
    const context = new FakeAudioContext();
    const voices: TestVoice[] = [];
    const manager = createManager(context, voices);

    manager.noteOn(60, 0.8, context.currentTime);
    context.currentTime = 1;
    manager.noteOn(62, 0.8, context.currentTime);
    voices[0]!.lastUsed = 0.1;
    voices[1]!.lastUsed = 0.2;
    context.currentTime = 2;

    manager.noteOn(64, 0.8, context.currentTime);

    expect(voices[0]!.fastChokeSpy).toHaveBeenCalledWith(2);
    expect(voices[0]!.noteOnCalls.at(-1)).toEqual({
      noteNumber: 64,
      velocity: 0.8,
      startTimeOffset: voices[0]!.chokeDuration,
    });
  });

  it('cleans up the stolen note mapping before assigning the new note', () => {
    const context = new FakeAudioContext();
    const voices: TestVoice[] = [];
    const manager = createManager(context, voices);

    manager.noteOn(60, 0.8, context.currentTime);
    context.currentTime = 1;
    manager.noteOn(62, 0.8, context.currentTime);
    voices[0]!.lastUsed = 0.1;
    voices[1]!.lastUsed = 0.2;

    manager.noteOn(64, 0.8, context.currentTime);
    manager.noteOff(60);
    manager.noteOff(64);

    expect(voices[0]!.noteOffSpy).toHaveBeenCalledOnce();
    expect(voices[1]!.noteOffSpy).not.toHaveBeenCalled();
  });

  it('releases all active voices', () => {
    const context = new FakeAudioContext();
    const voices: TestVoice[] = [];
    const manager = createManager(context, voices);

    manager.noteOn(60, 0.8, context.currentTime);
    manager.noteOn(62, 0.8, context.currentTime);
    manager.allNotesOff();

    expect(voices[0]!.noteOffSpy).toHaveBeenCalledOnce();
    expect(voices[1]!.noteOffSpy).toHaveBeenCalledOnce();
  });

  it('destroys the lazily-created voice pool', () => {
    const context = new FakeAudioContext();
    const voices: TestVoice[] = [];
    const manager = createManager(context, voices);

    manager.destroy();
    expect(voices).toHaveLength(0);

    manager.noteOn(60, 0.8, context.currentTime);
    manager.destroy();
    expect(voices[0]!.destroySpy).toHaveBeenCalledOnce();
    expect(voices[1]!.destroySpy).toHaveBeenCalledOnce();
  });

  it('preserves allocation lifecycle logs', () => {
    const context = new FakeAudioContext();
    const voices: TestVoice[] = [];
    const manager = createManager(context, voices);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      manager.noteOn(60, 0.8, context.currentTime);
      manager.noteOn(60, 0.5, context.currentTime);
      manager.noteOff(60);
      manager.noteOff(60);
      manager.noteOn(62, 0.8, context.currentTime);
      manager.noteOn(64, 0.8, context.currentTime);
      manager.noteOn(65, 0.8, context.currentTime);
      manager.allNotesOff();

      expect(logSpy).toHaveBeenCalledWith(
        `Voice ${voices[0]!.id} available for note 60`,
      );
      expect(logSpy).toHaveBeenCalledWith(
        'noteOn(60) - already active, retriggering',
      );
      expect(logSpy).toHaveBeenCalledWith('noteOff(60) - releasing voice');
      expect(logSpy).toHaveBeenCalledWith(
        'noteOff(60) - no active voice found',
      );
      expect(logSpy).toHaveBeenCalledWith('allNotesOff');
      expect(warnSpy).toHaveBeenCalledWith(
        `Voice stealing triggered for note 65 - victim is ${voices[0]!.id}`,
      );
    } finally {
      logSpy.mockRestore();
      warnSpy.mockRestore();
    }
  });
});
