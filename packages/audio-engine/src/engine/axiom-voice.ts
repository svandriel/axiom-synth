import type { FixedArray } from '../types';
import { Observable } from '../utils/observable';
import type { AxiomVoiceConfig } from './axiom-voice-config';
import {
  OSCILLATOR_COUNT,
  type OscillatorCount,
  type OscillatorIndex,
} from './constants';
import { Envelope } from './envelope';
import { freqOf } from './helpers';
import { Oscillator } from './oscillator';
import { Voice } from './voice';
import { Waveshaper } from './waveshaper';

export class AxiomVoice extends Voice {
  private areOscillatorsActive = false;
  private oscillators: FixedArray<Oscillator, OscillatorCount>;

  private readonly config: AxiomVoiceConfig;
  private readonly ampEnvelope: Envelope;
  // private readonly gainNodes: FixedArray<GainNode, OscillatorCount>;
  private readonly filterEnvelope: Envelope;
  private readonly filter: BiquadFilterNode;
  private readonly keyTrackGain: GainNode;
  private readonly oscillatorNormalizeGain: GainNode;
  private readonly waveShaper: Waveshaper;

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    config: AxiomVoiceConfig,
  ) {
    super(ctxt, audioSink);

    this.config = config;

    this.ampEnvelope = new Envelope(ctxt);
    this.filterEnvelope = new Envelope(ctxt);
    this.waveShaper = new Waveshaper(ctxt, config.waveshaperCurve);

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

    this.oscillatorNormalizeGain = ctxt.createGain();
    this.oscillatorNormalizeGain.gain.value = 1 / OSCILLATOR_COUNT;
    this.oscillatorNormalizeGain.connect(this.waveShaper.input);

    // [[ Oscillators -> Gain ]] Normalize -> WaveShaper -> Filter -> Amp Envelope -> Gain -> Audio Sink
    const oscillatorAudioSink = this.oscillatorNormalizeGain;
    this.waveShaper.output.connect(this.filter);
    this.filter.connect(this.ampEnvelope.node);

    config.waveshaperDrive.connect(this.waveShaper.drive);

    this.oscillators = new Array(OSCILLATOR_COUNT)
      .fill(null)
      .map((_value, index) => {
        const waveForm = new Observable(
          this.config.oscillatorWaveForms.value[index as OscillatorIndex],
        );
        this.config.oscillatorWaveForms.subscribe(newValue => {
          waveForm.value = newValue[index as OscillatorIndex];
        });
        const osc = new Oscillator(ctxt, {
          detuneSource:
            this.config.oscillatorDetuneSources[index as OscillatorIndex],
          gainSource:
            this.config.oscillatorGainSources[index as OscillatorIndex],
          waveForm,
        });
        osc.connect(oscillatorAudioSink);
        return osc;
      }) as FixedArray<Oscillator, OscillatorCount>;

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

    const frequency = freqOf(noteNumber);
    this.oscillators.forEach(osc => {
      osc.start(frequency);
    });

    this.areOscillatorsActive = true;
  }

  override destroyOscillators(): void {
    this.oscillators.forEach(osc => osc.stop());

    this.areOscillatorsActive = false;
  }

  override destroy(): void {
    this.destroyOscillators();
    this.ampEnvelope.disconnect();
    this.filterEnvelope.disconnect();
    this.filter.disconnect();
    this.oscillators.forEach(osc => osc.disconnect());
    this.keyTrackGain.disconnect();
    this.waveShaper.destroy();
    super.destroy();
  }
}
