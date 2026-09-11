import type { FixedArray } from '../types';
import type { AxiomVoiceConfig } from './axiom-voice-config';
import {
  OSCILLATOR_COUNT,
  type OscillatorCount,
  type OscillatorIndex,
} from './constants';
import { Envelope } from './envelope';
import { freqOf } from './helpers';
import { Voice } from './voice';

export class AxiomVoice extends Voice {
  private areOscillatorsActive = false;
  private oscillators: FixedArray<OscillatorNode, OscillatorCount> | [] = [];

  private readonly config: AxiomVoiceConfig;
  private readonly ampEnvelope: Envelope;
  private readonly gainNodes: FixedArray<GainNode, OscillatorCount>;
  private readonly filterEnvelope: Envelope;
  private readonly filter: BiquadFilterNode;
  private readonly keyTrackGain: GainNode;

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    config: AxiomVoiceConfig,
  ) {
    super(ctxt, audioSink);

    this.config = config;

    this.ampEnvelope = new Envelope(ctxt);
    this.filterEnvelope = new Envelope(ctxt);

    this.filter = ctxt.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 0;

    // Hook up base values
    this.config.filterCutoff.connect(this.filter.frequency);
    this.config.filterResonance.connect(this.filter.Q);

    // Filter Env Amount -> Filter Envelope -> Filter Detune
    this.config.filterEnvAmount.connect(this.filterEnvelope.node);
    this.filterEnvelope.node.connect(this.filter.detune);

    this.keyTrackGain = ctxt.createGain();
    this.keyTrackGain.gain.value = 0;
    this.config.filterKeyTrack.connect(this.keyTrackGain);
    this.keyTrackGain.connect(this.filter.detune);

    this.gainNodes = this.config.oscillatorGainSources.map(source => {
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
    this.ampEnvelope.noteOn(velocity, this.config.ampEnvelope, now);
    this.filterEnvelope.noteOn(velocity, this.config.filterEnvelope, now);
    this.keyTrackGain.gain.setValueAtTime(100 * noteNumber, now);
  }

  override internalNoteOff(now: number): { silentAt: number } {
    this.ampEnvelope.noteOff(this.config.ampEnvelope, now);
    this.filterEnvelope.noteOff(this.config.filterEnvelope, now);
    return {
      silentAt: this.config.ampEnvelope.releaseSeconds,
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

    this.oscillators = new Array(OSCILLATOR_COUNT)
      .fill(null)
      .map((_, index) => {
        const osc = this.ctxt.createOscillator();
        osc.type =
          this.config.oscillatorWaveForms.value[index as OscillatorIndex];
        const { unsubscribe } = this.config.oscillatorWaveForms.subscribe(
          value => {
            osc.type = value[index as OscillatorIndex];
          },
        );
        osc.onended = () => {
          unsubscribe();
        };

        return osc;
      }) as FixedArray<OscillatorNode, OscillatorCount>;

    this.config.oscillatorDetuneSources[0].connect(this.oscillators[0].detune);
    this.config.oscillatorDetuneSources[1].connect(this.oscillators[1].detune);
    this.config.oscillatorDetuneSources[2].connect(this.oscillators[2].detune);

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
    if (this.oscillators.length > 0) {
      // Disconnect all things connected to the oscillators
      this.config.oscillatorDetuneSources[0].disconnect(
        this.oscillators[0]!.detune,
      );
      this.config.oscillatorDetuneSources[1].disconnect(
        this.oscillators[1]!.detune,
      );
      this.config.oscillatorDetuneSources[2].disconnect(
        this.oscillators[2]!.detune,
      );
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
    this.keyTrackGain.disconnect();
    super.destroy();
  }
}
