import { Synth } from '../engine/synth';
import { SpyVoice } from './spy-voice';

export class SpySynth extends Synth<SpyVoice> {
  readonly voices: SpyVoice[] = [];

  protected override createVoice(): SpyVoice {
    const voice = new SpyVoice(this.ctxt, this.audioSink);
    this.voices.push(voice);
    return voice;
  }
}
