import type { EnvelopeConfig } from '../types';
import { Envelope } from './envelope';
import { freqOf } from './helpers';
import { Voice } from './voice';

export class AxiomVoice extends Voice {
  private areOscillatorsActive = false;
  private oscillators: OscillatorNode[] = [];

  protected readonly ampEnvelope: Envelope;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    super(ctxt, audioSink);
    this.ampEnvelope = new Envelope(ctxt, audioSink);
  }

  override internalNoteOn(
    noteNumber: number,
    velocity: number,
    ampEnvelopeConfig: EnvelopeConfig,
    now: number,
  ): void {
    this.createOscillators(noteNumber, now);
    this.ampEnvelope.noteOn(velocity, ampEnvelopeConfig, now);
  }

  override internalNoteOff(
    ampEnvelopeConfig: EnvelopeConfig,
    now: number,
  ): { silentAt: number } {
    this.ampEnvelope.noteOff(ampEnvelopeConfig, now);
    return {
      silentAt: ampEnvelopeConfig.releaseSeconds,
    };
  }

  /**
   * Executes a micro-fade parameter envelope to truncate a stolen note cleanly
   */
  override internalFastChoke(chokeTime: number, now: number): void {
    this.ampEnvelope.fastChoke(chokeTime, now);
  }

  private createOscillators(noteNumber: number, now: number): void {
    if (this.areOscillatorsActive) {
      this.destroyOscillators();
    }

    const osc1 = this.ctxt.createOscillator();
    osc1.type = 'sawtooth';
    osc1.detune.value = -12;

    const osc2 = this.ctxt.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.value = 0;

    const osc3 = this.ctxt.createOscillator();
    osc3.type = 'sawtooth';
    osc3.detune.value = 11;

    this.oscillators.push(osc1);
    this.oscillators.push(osc2);
    this.oscillators.push(osc3);

    this.oscillators.forEach(osc => osc.connect(this.ampEnvelope.node));
    this.oscillators.forEach(osc => osc.start(now));

    const frequency = freqOf(noteNumber);
    this.oscillators.forEach(osc => {
      osc.frequency.setValueAtTime(frequency, now);
    });

    this.areOscillatorsActive = true;
  }

  override destroyOscillators(): void {
    console.log(
      `[${this.ctxt.currentTime.toFixed(4)}] AxiomVoice.destroyOscillators()`,
    );
    if (this.oscillators.length > 0) {
      this.oscillators.forEach(osc => osc.stop());
      this.oscillators.forEach(osc => osc.disconnect());
      this.oscillators = [];
    }
    this.areOscillatorsActive = false;
  }

  override destroy(): void {
    this.destroyOscillators();
    this.ampEnvelope.disconnect();
    super.destroy();
  }
}
