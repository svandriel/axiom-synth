import { freqOf } from './helpers';
import { Voice } from './voice';

export class AxiomVoice extends Voice {
  private oscillators: OscillatorNode[] = [];

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    super(ctxt, audioSink);
  }

  override createOscillators(now: number): void {
    const osc1 = this.ctxt.createOscillator();
    osc1.type = 'sawtooth';
    osc1.detune.value = -12;

    const osc2 = this.ctxt.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.value = 0;

    const osc3 = this.ctxt.createOscillator();
    osc3.type = 'triangle';
    osc3.detune.value = 11;

    this.oscillators.push(osc1);
    this.oscillators.push(osc2);
    this.oscillators.push(osc3);

    this.oscillators.forEach(osc => osc.connect(this.ampEnv));
    this.oscillators.forEach(osc => osc.start(now));
  }

  override setOscillatorNote(noteNumber: number, now: number): void {
    const frequency = freqOf(noteNumber);
    this.oscillators.forEach(osc => {
      osc.frequency.setValueAtTime(frequency, now);
    });
  }

  override destroyOscillators(): void {
    if (this.oscillators.length > 0) {
      this.oscillators.forEach(osc => osc.stop());
      this.oscillators.forEach(osc => osc.disconnect());
      this.oscillators = [];
    }
  }
}
