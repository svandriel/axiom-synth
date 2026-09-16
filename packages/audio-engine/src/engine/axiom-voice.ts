import type { FixedArray } from '../types';
import { Observable } from '../utils/observable';
import type { AxiomVoiceConfig } from './axiom-voice-config';
import {
  OSCILLATOR_COUNT,
  type OscillatorCount,
  type OscillatorIndex,
} from './constants';
import type { Destroyable } from './destroyable';
import { Envelope } from './envelope';
import { Filter } from './filter';
import { freqOf } from './helpers';
import { Oscillator } from './oscillator';
import { Voice } from './voice';
import { Waveshaper } from './waveshaper';

export class AxiomVoice extends Voice implements Destroyable {
  private areOscillatorsActive = false;
  private oscillators: FixedArray<Oscillator, OscillatorCount>;

  private readonly config: AxiomVoiceConfig;
  private readonly ampEnvelope: Envelope;
  // private readonly gainNodes: FixedArray<GainNode, OscillatorCount>;
  private readonly filterEnvelope: Envelope;
  private readonly filter: Filter;
  private readonly oscillatorNormalizeGain: GainNode;
  private readonly waveShaper: Waveshaper;
  private readonly waveformUnsubscribers: Array<() => void> = [];
  private voiceDestroyed = false;

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

    this.filter = new Filter(ctxt);
    this.filter.frequency.value = 0;

    // Hook up base values
    this.config.filterCutoff.connect(this.filter.frequency);
    this.config.filterResonance.connect(this.filter.q);

    // Filter Env Amount -> Filter Envelope -> Filter Detune
    this.config.filterEnvAmount.connect(this.filterEnvelope.node);
    this.filterEnvelope.node.connect(this.filter.detune);

    this.config.filterKeyTrack.connect(this.filter.keytrack);

    this.oscillatorNormalizeGain = ctxt.createGain();
    this.oscillatorNormalizeGain.gain.value = 1 / OSCILLATOR_COUNT;
    this.oscillatorNormalizeGain.connect(this.waveShaper.input);

    // [[ Oscillators -> Gain ]] Normalize -> WaveShaper -> Filter -> Amp Envelope -> Gain -> Audio Sink
    const oscillatorAudioSink = this.oscillatorNormalizeGain;
    this.waveShaper.output.connect(this.filter.input);
    this.filter.connect(this.ampEnvelope.node);

    config.waveshaperDrive.connect(this.waveShaper.drive);

    this.oscillators = new Array(OSCILLATOR_COUNT)
      .fill(null)
      .map((_value, index) => {
        const waveForm = new Observable(
          this.config.oscillatorWaveForms.value[index as OscillatorIndex],
        );
        const { unsubscribe } = this.config.oscillatorWaveForms.subscribe(
          newValue => {
            waveForm.value = newValue[index as OscillatorIndex];
          },
        );
        this.waveformUnsubscribers.push(unsubscribe);
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
  }

  override internalNoteOn(
    noteNumber: number,
    velocity: number,
    now: number,
  ): void {
    this.onSoundStart(noteNumber, now);
    this.ampEnvelope.noteOn(velocity, this.config.ampEnvelope, now);
    this.filterEnvelope.noteOn(velocity, this.config.filterEnvelope, now);
    this.filter.noteOn(noteNumber, now);
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

  private onSoundStart(noteNumber: number, now: number): void {
    if (this.areOscillatorsActive) {
      // Voice stealing: let the old oscillators ring through the choke fade
      // until the new note's attack time, rather than cutting them instantly.
      this.oscillators.forEach(osc => osc.stop(now));
    } else {
      this.ampEnvelope.node.connect(this.audioSink);
    }

    const frequency = freqOf(noteNumber);
    this.oscillators.forEach(osc => {
      osc.start(frequency, now);
    });

    this.areOscillatorsActive = true;
  }

  override onSoundStop(): void {
    this.oscillators.forEach(osc => osc.stop());

    try {
      this.ampEnvelope.node.disconnect(this.audioSink);
    } catch (exp) {
      // Was not connected, it's ok
    }

    this.areOscillatorsActive = false;
  }

  override destroy(): void {
    if (this.voiceDestroyed) {
      return;
    }
    this.voiceDestroyed = true;
    this.onSoundStop();
    this.config.filterCutoff.disconnect(this.filter.frequency);
    this.config.filterResonance.disconnect(this.filter.q);
    this.config.filterEnvAmount.disconnect(this.filterEnvelope.node);
    this.config.filterKeyTrack.disconnect(this.filter.keytrack);
    this.config.waveshaperDrive.disconnect(this.waveShaper.drive);
    this.waveformUnsubscribers.forEach(unsubscribe => unsubscribe());
    this.waveformUnsubscribers.length = 0;
    this.ampEnvelope.destroy();
    this.filterEnvelope.destroy();
    this.filter.destroy();
    this.oscillatorNormalizeGain.disconnect();
    this.oscillators.forEach(osc => osc.destroy());
    this.waveShaper.destroy();
    super.destroy();
  }
}
