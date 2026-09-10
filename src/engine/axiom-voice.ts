import type { EnvelopeConfig } from '../types';
import { Envelope } from './envelope';
import { freqOf } from './helpers';
import { Voice } from './voice';

export class AxiomVoice extends Voice {
  private readonly ampEnvelopeConfig: EnvelopeConfig;
  private readonly filterEnvelopeConfig: EnvelopeConfig;

  private areOscillatorsActive = false;
  private oscillators: OscillatorNode[] = [];

  private readonly ampEnvelope: Envelope;
  private readonly filterCutoff: ConstantSourceNode;
  private readonly filterResonance: ConstantSourceNode;
  private readonly filterEnvelope: Envelope;
  private readonly filter: BiquadFilterNode;
  private readonly filterEnvAmount: ConstantSourceNode;

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    ampEnvelopeConfig: EnvelopeConfig,
    filterEnvelopeConfig: EnvelopeConfig,
    filterCutoff: ConstantSourceNode,
    filterResonance: ConstantSourceNode,
    filterEnvAmount: ConstantSourceNode,
  ) {
    super(ctxt, audioSink);
    this.ampEnvelopeConfig = ampEnvelopeConfig;
    this.filterEnvelopeConfig = filterEnvelopeConfig;
    this.filterCutoff = filterCutoff;
    this.filterResonance = filterResonance;
    this.filterEnvAmount = filterEnvAmount;

    this.ampEnvelope = new Envelope(ctxt);
    this.filterEnvelope = new Envelope(ctxt);

    this.filter = ctxt.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 0;

    // Hook up base values
    this.filterCutoff.connect(this.filter.frequency);
    this.filterResonance.connect(this.filter.Q);

    // Filter Env Amount -> Filter Envelope -> Filter Detune
    this.filterEnvAmount.connect(this.filterEnvelope.node);
    this.filterEnvelope.node.connect(this.filter.detune);

    // Oscillators -> Filter -> Amp Envelope -> Audio Sink
    this.filter.connect(this.ampEnvelope.node);
    this.ampEnvelope.node.connect(audioSink);
  }

  override internalNoteOn(
    noteNumber: number,
    velocity: number,
    now: number,
  ): void {
    this.createOscillators(noteNumber, now);
    this.ampEnvelope.noteOn(velocity, this.ampEnvelopeConfig, now);
    this.filterEnvelope.noteOn(velocity, this.filterEnvelopeConfig, now);
  }

  override internalNoteOff(now: number): { silentAt: number } {
    this.ampEnvelope.noteOff(this.ampEnvelopeConfig, now);
    this.filterEnvelope.noteOff(this.filterEnvelopeConfig, now);
    return {
      silentAt: this.ampEnvelopeConfig.releaseSeconds,
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

    this.oscillators.forEach(osc => osc.connect(this.filter));
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
    this.filterEnvelope.disconnect;
    this.filter.disconnect();
    super.destroy();
  }
}
