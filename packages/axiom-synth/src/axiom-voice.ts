import {
  LFO_COUNT,
  LFO_TARGET_INDEX,
  OSCILLATOR_COUNT,
  type LfoCount,
  type OscillatorCount,
  type OscillatorIndex,
} from '@axiom/audio-engine';
import type { FixedArray } from '@axiom/audio-engine';
import { Envelope } from '@axiom/audio-engine';
import { Filter } from '@axiom/audio-engine';
import { freqOf } from '@axiom/audio-engine';
import { Lfo } from '@axiom/audio-engine';
import { ModulationRouter } from '@axiom/audio-engine';
import { UnisonOscillator } from '@axiom/audio-engine';
import { Voice } from '@axiom/audio-engine';
import { Waveshaper } from '@axiom/audio-engine';
import type { AxiomVoiceConfig } from './axiom-voice-config';

export class AxiomVoice extends Voice {
  private areOscillatorsActive = false;
  private oscillators: FixedArray<UnisonOscillator, OscillatorCount>;

  private readonly config: AxiomVoiceConfig;
  private readonly ampEnvelope: Envelope;
  // private readonly gainNodes: FixedArray<GainNode, OscillatorCount>;
  private readonly filterEnvelope: Envelope;
  private readonly filter: Filter;
  private readonly oscillatorNormalizeGain: GainNode;
  private readonly waveShaper: Waveshaper;
  private readonly modulationRouter: ModulationRouter;
  private oscillatorWaveformSubscription: { unsubscribe: () => void } | null =
    null;
  private oscillatorUnisonVoicesSubscription: {
    unsubscribe: () => void;
  } | null = null;
  private readonly lfos: FixedArray<Lfo, LfoCount>;
  private readonly ampModGain: GainNode;
  private voiceDestroyed = false;

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    config: AxiomVoiceConfig,
  ) {
    super(ctxt, audioSink);

    this.config = config;

    this.modulationRouter = new ModulationRouter();

    this.ampEnvelope = new Envelope(ctxt);
    this.filterEnvelope = new Envelope(ctxt);
    this.waveShaper = new Waveshaper(ctxt, config.waveshaperCurve);

    this.filter = new Filter(ctxt, {
      resonance: this.config.filterResonance,
      type: this.config.filterType,
    });

    this.modulationRouter.patch(this.config.filterCutoff, this.filter.cutoff);

    // filterEnvAmount -> filterEnvelope.node is a node-to-node signal wire,
    // intentionally not patched (ModulationRouter is node-to-param only).
    this.config.filterEnvAmount.connect(this.filterEnvelope.node);
    this.filterEnvelope.node.connect(this.filter.detune);

    this.modulationRouter.patch(
      this.config.filterKeyTrack,
      this.filter.keytrack,
    );

    this.oscillatorNormalizeGain = ctxt.createGain();
    this.oscillatorNormalizeGain.gain.value = 1 / OSCILLATOR_COUNT;
    this.oscillatorNormalizeGain.connect(this.waveShaper.input);

    // [[ Oscillators -> Gain ]] Normalize -> WaveShaper -> Filter -> Amp Envelope -> Gain -> Audio Sink
    const oscillatorAudioSink = this.oscillatorNormalizeGain;
    this.waveShaper.output.connect(this.filter.input);
    this.filter.connect(this.ampEnvelope.node);

    this.modulationRouter.patch(
      this.config.waveshaperDrive,
      this.waveShaper.drive,
    );

    // Create LFO instances — depth gains are wired to shared depth sources
    this.lfos = Array.from(
      { length: LFO_COUNT },
      (_, lfoIdx) =>
        new Lfo(
          ctxt,
          config.lfoWaveforms[lfoIdx]!,
          config.lfoRateSources[lfoIdx]!,
          config.lfoDepthSources[lfoIdx]!,
        ),
    ) as FixedArray<Lfo, LfoCount>;

    // Create ampModGain (bias 1.0, sits between envelope and sink)
    this.ampModGain = ctxt.createGain();
    this.ampModGain.gain.value = 1.0;
    this.ampModGain.connect(this.audioSink);

    // Wire LFO non-osc targets (cutoff, amp, drive)
    for (const lfo of this.lfos) {
      this.modulationRouter.patch(
        lfo.targetOutput(LFO_TARGET_INDEX.cutoff),
        this.filter.detune,
      );
      this.modulationRouter.patch(
        lfo.targetOutput(LFO_TARGET_INDEX.amp),
        this.ampModGain.gain,
      );
      this.modulationRouter.patch(
        lfo.targetOutput(LFO_TARGET_INDEX.drive),
        this.waveShaper.drive,
      );
    }

    this.oscillators = new Array(OSCILLATOR_COUNT)
      .fill(null)
      .map((_value, index) => {
        const osc = new UnisonOscillator(ctxt);
        osc.voices =
          this.config.oscillatorUnisonVoices.value[index as OscillatorIndex];
        osc.waveform =
          this.config.oscillatorWaveForms.value[index as OscillatorIndex];
        this.modulationRouter.patch(
          this.config.oscillatorDetuneSources[index as OscillatorIndex],
          osc.detune,
        );
        this.modulationRouter.patch(
          this.config.oscillatorGainSources[index as OscillatorIndex],
          osc.gain,
        );
        this.modulationRouter.patch(
          this.config.oscillatorUnisonDetuneSources[index as OscillatorIndex],
          osc.unisonDetune,
        );
        this.modulationRouter.patch(
          this.config.oscillatorUnisonDepthSources[index as OscillatorIndex],
          osc.unisonDepth,
        );
        this.modulationRouter.patch(
          this.config.oscillatorUnisonBlendSources[index as OscillatorIndex],
          osc.unisonBlend,
        );
        osc.connect(oscillatorAudioSink);
        return osc;
      }) as FixedArray<UnisonOscillator, OscillatorCount>;

    // LFO oscN depth outputs patch into each oscillator's detune jack.
    for (const lfo of this.lfos) {
      this.modulationRouter.patch(
        lfo.targetOutput(LFO_TARGET_INDEX.osc1),
        this.oscillators[0]!.detune,
      );
      this.modulationRouter.patch(
        lfo.targetOutput(LFO_TARGET_INDEX.osc2),
        this.oscillators[1]!.detune,
      );
      this.modulationRouter.patch(
        lfo.targetOutput(LFO_TARGET_INDEX.osc3),
        this.oscillators[2]!.detune,
      );
    }

    this.oscillatorWaveformSubscription =
      this.config.oscillatorWaveForms.subscribe(newValue => {
        this.oscillators.forEach((osc, index) => {
          osc.waveform = newValue[index as OscillatorIndex];
        });
      });
    this.oscillatorUnisonVoicesSubscription =
      this.config.oscillatorUnisonVoices.subscribe(newValue => {
        this.oscillators.forEach((osc, index) => {
          osc.voices = newValue[index as OscillatorIndex];
        });
      });
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
      this.lfos.forEach(lfo => lfo.stop());
    } else {
      // ampEnvelope.node <-> ampModGain is a per-note audio-path switch,
      // intentionally not patched (ModulationRouter is static node-to-param only).
      this.ampEnvelope.node.connect(this.ampModGain);
    }

    const frequency = freqOf(noteNumber);
    this.oscillators.forEach(osc => {
      osc.start(frequency, now);
    });
    this.lfos.forEach(lfo => lfo.start(now));

    this.areOscillatorsActive = true;
  }

  override onSoundStop(): void {
    this.oscillators.forEach(osc => osc.stop());
    this.lfos.forEach(lfo => lfo.stop());

    try {
      this.ampEnvelope.node.disconnect(this.ampModGain);
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
    this.modulationRouter.destroy();
    this.config.filterEnvAmount.disconnect(this.filterEnvelope.node);
    this.oscillatorWaveformSubscription?.unsubscribe();
    this.oscillatorUnisonVoicesSubscription?.unsubscribe();
    this.ampEnvelope.destroy();
    this.filter.destroy();
    this.filterEnvelope.destroy();
    this.oscillatorNormalizeGain.disconnect();
    this.oscillators.forEach(osc => osc.destroy());
    this.lfos.forEach(lfo => lfo.destroy());
    this.ampModGain.disconnect();
    this.waveShaper.destroy();
    super.destroy();
  }
}
