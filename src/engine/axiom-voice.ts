import type { EnvelopeConfig, FixedArray } from '../types';
import {
  OSCILLATOR_COUNT,
  type OscillatorCount,
  type OscillatorIndex,
} from './constants';
import { Envelope } from './envelope';
import { freqOf } from './helpers';
import { Voice } from './voice';

export class AxiomVoice extends Voice {
  private readonly ampEnvelopeConfig: EnvelopeConfig;
  private readonly filterEnvelopeConfig: EnvelopeConfig;

  private areOscillatorsActive = false;
  private oscillators: FixedArray<OscillatorNode, OscillatorCount> | [] = [];

  private readonly ampEnvelope: Envelope;
  private readonly gainNodes: FixedArray<GainNode, OscillatorCount>;
  private readonly filterCutoff: ConstantSourceNode;
  private readonly filterResonance: ConstantSourceNode;
  private readonly filterEnvelope: Envelope;
  private readonly filter: BiquadFilterNode;
  private readonly filterEnvAmount: ConstantSourceNode;
  private readonly oscillatorDetuneSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  private readonly oscillatorGainSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    ampEnvelopeConfig: EnvelopeConfig,
    filterEnvelopeConfig: EnvelopeConfig,
    filterCutoff: ConstantSourceNode,
    filterResonance: ConstantSourceNode,
    filterEnvAmount: ConstantSourceNode,
    oscillatorDetuneSources: FixedArray<ConstantSourceNode, OscillatorCount>,
    oscillatorGainSources: FixedArray<ConstantSourceNode, OscillatorCount>,
  ) {
    super(ctxt, audioSink);
    this.ampEnvelopeConfig = ampEnvelopeConfig;
    this.filterEnvelopeConfig = filterEnvelopeConfig;
    this.filterCutoff = filterCutoff;
    this.filterResonance = filterResonance;
    this.filterEnvAmount = filterEnvAmount;
    this.oscillatorDetuneSources = oscillatorDetuneSources;
    this.oscillatorGainSources = oscillatorGainSources;

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

    this.gainNodes = this.oscillatorGainSources.map(source => {
      const gain = ctxt.createGain();
      gain.gain.value = 0;
      source.connect(gain.gain);
      gain.connect(this.filter);
      return gain;
    }) as FixedArray<GainNode, OscillatorCount>;

    // [[ Oscillators -> Gain ]] -> Filter -> Amp Envelope -> Gain -> Audio Sink
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

    this.oscillators = new Array(OSCILLATOR_COUNT).fill(null).map(() => {
      const osc = this.ctxt.createOscillator();
      osc.type = 'sawtooth';
      return osc;
    }) as FixedArray<OscillatorNode, OscillatorCount>;

    this.oscillatorDetuneSources[0].connect(this.oscillators[0].detune);
    this.oscillatorDetuneSources[1].connect(this.oscillators[1].detune);
    this.oscillatorDetuneSources[2].connect(this.oscillators[2].detune);

    this.oscillators.forEach((osc, index) => {
      osc.connect(this.gainNodes[index as OscillatorIndex]);
    });
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
    this.gainNodes.forEach(node => node.disconnect());
    super.destroy();
  }
}
