import type { ActivitySink } from '../engine/activity-sink';
import { Synth } from '../engine/synth';
import { TestVoice } from './test-voice';

export class TestSynth extends Synth<TestVoice> {
  readonly voices: TestVoice[] = [];

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    maxVoices: number,
    activity?: ActivitySink,
  ) {
    super(ctxt, audioSink, { maxVoices, activity });
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
