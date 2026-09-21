import {
  FilterResonance,
  LFO_COUNT,
  LFO_TARGET_COUNT,
  LFO_TARGET_INDEX,
  LFO_TARGETS,
  Observable,
  Synth,
  WaveshaperCurve,
  type EnvelopeConfig,
  type FilterConfig,
  type FilterType,
  type FixedArray,
  type LfoConfig,
  type LfoCount,
  type LfoIndex,
  type LfoTarget,
  type LfoTargetCount,
  type LfoWaveformType,
  type OscillatorConfig,
  type OscillatorCount,
  type OscillatorIndex,
  type WaveFormType,
  type WaveshaperConfig,
  type WaveshaperType,
} from '@axiom/audio-engine';
import { AxiomVoice } from './axiom-voice';
import type { AxiomVoiceConfig } from './axiom-voice-config';

const MAX_VOICES = 16;
const UNISON_RAMP_SECONDS = 0.01;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

interface UnisonRampState {
  startTime: number;
  startValue: number;
  target: number;
}

const LFO_DEPTH_SCALES: Record<LfoTarget, number> = {
  osc1: 150,
  osc2: 150,
  osc3: 150,
  cutoff: 1200,
  amp: 1,
  drive: 4,
};

export class AxiomSynth extends Synth<AxiomVoice> {
  public readonly output: GainNode;

  private readonly _oscillatorConfigs: FixedArray<
    OscillatorConfig,
    OscillatorCount
  > = [
    {
      octave: 0,
      semi: 0,
      detune: 5,
      waveform: 'sawtooth',
      gain: 1,
      unison: { voices: 2, detune: 20, depth: 0.5, blend: 1 },
    },
    {
      octave: 2,
      semi: 0,
      detune: 0,
      waveform: 'sawtooth',
      gain: 1,
      unison: { voices: 1, detune: 0, depth: 0, blend: 1 },
    },
    {
      octave: -1,
      semi: 0,
      detune: 0,
      waveform: 'triangle',
      gain: 1,
      unison: { voices: 1, detune: 0, depth: 0, blend: 1 },
    },
  ];

  private readonly _ampEnvelope: EnvelopeConfig = {
    attackSeconds: 0.032,
    attackCurve: 'analog',
    decaySeconds: 0.3,
    decayCurve: 'analog',
    sustainLevel: 0.6,
    releaseSeconds: 0.62,
    releaseCurve: 'analog',
  };

  public readonly filterConfig: FilterConfig = {
    type: 'lowpass24',
    frequency: 3000,
    q: 6,
    envAmount: 4800,
    tracking: 0.9,
  };

  private readonly _filterEnvelope: EnvelopeConfig = {
    attackSeconds: 0.2,
    attackCurve: 'linear',
    decaySeconds: 0.7,
    decayCurve: 'analog',
    sustainLevel: 0.4,
    releaseSeconds: 3,
    releaseCurve: 'analog',
  };

  public readonly lfoConfigs: FixedArray<LfoConfig, LfoCount> = [
    { rateHz: 2, waveform: 'sine', depths: [-0.11, 0.09, 0, 0, -0.1, 0] },
    { rateHz: 3.47, waveform: 'sine', depths: [0, 0, 0, 0.2, 0, 0] },
    { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
    { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
  ];

  private readonly waveshaperConfig: WaveshaperConfig = {
    distortion: 70,
    drive: 2,
    type: 'hard-clipper',
  };

  private readonly oscillatorWaveForms: Observable<
    FixedArray<WaveFormType, OscillatorCount>
  >;
  private readonly filterCutOffSource: ConstantSourceNode;
  private readonly filterResonance: FilterResonance;
  private readonly _filterType: Observable<FilterType>;
  private readonly filterEnvAmountSource: ConstantSourceNode;
  private readonly filterKeyTrackSource: ConstantSourceNode;
  private readonly oscillatorDetuneSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  private readonly oscillatorGainSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  private readonly oscillatorUnisonDetuneSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  private readonly oscillatorUnisonDepthSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  private readonly oscillatorUnisonBlendSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  private readonly oscillatorUnisonVoices: Observable<
    FixedArray<number, OscillatorCount>
  >;
  private readonly unisonRampStates = new Map<
    ConstantSourceNode,
    UnisonRampState
  >();
  private readonly waveShaperDriveSource: ConstantSourceNode;
  private readonly waveshaperCurve: WaveshaperCurve;
  private readonly _distortionAmount: Observable<number>;
  private readonly _waveshaperType: Observable<WaveshaperType>;
  private readonly lfoWaveforms: FixedArray<
    Observable<LfoWaveformType>,
    LfoCount
  >;
  private readonly lfoRateSources: FixedArray<ConstantSourceNode, LfoCount>;
  private readonly lfoDepthSources: FixedArray<
    FixedArray<ConstantSourceNode, LfoTargetCount>,
    LfoCount
  >;

  private readonly voiceConfig: AxiomVoiceConfig;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    super(ctxt, audioSink, { maxVoices: MAX_VOICES });

    this.output = ctxt.createGain();
    this.output.gain.value = 0.6;

    this.filterCutOffSource = this.createConstantSource(
      this.filterConfig.frequency,
    );
    this.filterResonance = new FilterResonance(ctxt, this.filterConfig.q);
    this._filterType = new Observable<FilterType>(this.filterConfig.type);
    this.filterEnvAmountSource = this.createConstantSource(
      this.filterConfig.envAmount,
    );
    this.filterKeyTrackSource = this.createConstantSource(
      this.filterConfig.tracking,
    );

    this.oscillatorDetuneSources = this.createConstantSources(
      this._oscillatorConfigs.map(c => c.detune) as FixedArray<
        number,
        OscillatorCount
      >,
    );
    this.oscillatorGainSources = this.createConstantSources(
      this._oscillatorConfigs.map(c => c.gain) as FixedArray<
        number,
        OscillatorCount
      >,
    );
    this.oscillatorUnisonDetuneSources = this.createConstantSources(
      this._oscillatorConfigs.map(c => c.unison.detune) as FixedArray<
        number,
        OscillatorCount
      >,
    );
    this.oscillatorUnisonDepthSources = this.createConstantSources(
      this._oscillatorConfigs.map(c => c.unison.depth) as FixedArray<
        number,
        OscillatorCount
      >,
    );
    this.oscillatorUnisonBlendSources = this.createConstantSources(
      this._oscillatorConfigs.map(c => c.unison.blend) as FixedArray<
        number,
        OscillatorCount
      >,
    );
    this.oscillatorUnisonVoices = new Observable(
      this._oscillatorConfigs.map(c => c.unison.voices) as FixedArray<
        number,
        OscillatorCount
      >,
    );

    this.oscillatorWaveForms = new Observable(
      this._oscillatorConfigs.map(c => c.waveform) as FixedArray<
        WaveFormType,
        OscillatorCount
      >,
    );

    this._distortionAmount = new Observable(this.waveshaperConfig.distortion);
    this.waveShaperDriveSource = this.createConstantSource(
      this.waveshaperConfig.drive,
    );
    this._waveshaperType = new Observable(this.waveshaperConfig.type);

    this.waveshaperCurve = new WaveshaperCurve(
      this.waveshaperConfig.distortion,
      this.waveshaperConfig.type,
    );
    this._distortionAmount.subscribe(amount => {
      this.waveshaperCurve.amount = amount;
    });
    this._waveshaperType.subscribe(type => {
      this.waveshaperCurve.type = type;
    });

    this.lfoWaveforms = Array.from(
      { length: LFO_COUNT },
      (_, i) => new Observable<LfoWaveformType>(this.lfoConfigs[i]!.waveform),
    ) as FixedArray<Observable<LfoWaveformType>, LfoCount>;
    this.lfoRateSources = Array.from({ length: LFO_COUNT }, (_, i) =>
      this.createConstantSource(this.lfoConfigs[i]!.rateHz),
    ) as FixedArray<ConstantSourceNode, LfoCount>;
    this.lfoDepthSources = Array.from({ length: LFO_COUNT }, (_, i) =>
      Array.from({ length: LFO_TARGET_COUNT }, (_, j) =>
        this.createConstantSource(this.lfoConfigs[i]!.depths[j]!),
      ),
    ) as FixedArray<FixedArray<ConstantSourceNode, LfoTargetCount>, LfoCount>;

    this._oscillatorConfigs.forEach((config, index) => {
      this.oscillatorDetuneSources[
        index as OscillatorIndex
      ].offset.setValueAtTime(
        config.detune + config.semi * 100 + config.octave * 1200,
        this.ctxt.currentTime,
      );
    });

    this.voiceConfig = {
      ampEnvelope: this._ampEnvelope,
      filterEnvelope: this._filterEnvelope,
      filterCutoff: this.filterCutOffSource,
      filterResonance: this.filterResonance,
      filterType: this._filterType,
      filterEnvAmount: this.filterEnvAmountSource,
      filterKeyTrack: this.filterKeyTrackSource,
      oscillatorDetuneSources: this.oscillatorDetuneSources,
      oscillatorGainSources: this.oscillatorGainSources,
      oscillatorUnisonDetuneSources: this.oscillatorUnisonDetuneSources,
      oscillatorUnisonDepthSources: this.oscillatorUnisonDepthSources,
      oscillatorUnisonBlendSources: this.oscillatorUnisonBlendSources,
      oscillatorUnisonVoices: this.oscillatorUnisonVoices,
      oscillatorWaveForms: this.oscillatorWaveForms,
      waveshaperCurve: this.waveshaperCurve,
      waveshaperDrive: this.waveShaperDriveSource,
      lfoWaveforms: this.lfoWaveforms,
      lfoRateSources: this.lfoRateSources,
      lfoDepthSources: this.lfoDepthSources,
    };
  }

  protected override createVoice(): AxiomVoice {
    return new AxiomVoice(this.ctxt, this.output, this.voiceConfig);
  }

  get oscillatorConfigs(): FixedArray<OscillatorConfig, OscillatorCount> {
    return structuredClone(this._oscillatorConfigs);
  }

  get ampEnvelope(): EnvelopeConfig {
    return structuredClone(this._ampEnvelope);
  }

  set ampEnvelope(config: EnvelopeConfig) {
    Object.assign(this._ampEnvelope, config);
  }

  get filterEnvelope(): EnvelopeConfig {
    return structuredClone(this._filterEnvelope);
  }

  set filterEnvelope(config: EnvelopeConfig) {
    Object.assign(this._filterEnvelope, config);
  }

  get filterCutOff(): number {
    return this.filterConfig.frequency;
  }

  set filterCutOff(value: number) {
    this.filterCutOffSource.offset.exponentialRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
    this.filterConfig.frequency = value;
  }

  get filterQ(): number {
    return this.filterResonance.q;
  }

  set filterQ(q: number) {
    this.filterResonance.q = q;
    this.filterConfig.q = q;
  }

  get filterType(): FilterType {
    return this._filterType.value;
  }

  set filterType(val: FilterType) {
    this.filterConfig.type = val;
    this._filterType.value = val;
  }

  get filterEnvAmount(): number {
    return this.filterConfig.envAmount;
  }

  set filterEnvAmount(value: number) {
    this.filterEnvAmountSource.offset.linearRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
    this.filterConfig.envAmount = value;
  }

  get filterKeyTrack(): number {
    return this.filterConfig.tracking;
  }

  set filterKeyTrack(value: number) {
    this.filterKeyTrackSource.offset.linearRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
    this.filterConfig.tracking = value;
  }

  get distortionAmount(): number {
    return this._distortionAmount.value;
  }

  set distortionAmount(newValue: number) {
    this._distortionAmount.value = newValue;
  }

  get waveshaperDrive(): number {
    return this.waveshaperConfig.drive;
  }

  set waveshaperDrive(value: number) {
    this.waveshaperConfig.drive = value;
    const now = this.ctxt.currentTime;
    this.waveShaperDriveSource.offset.cancelScheduledValues(now);
    this.waveShaperDriveSource.offset.linearRampToValueAtTime(
      value,
      now + 0.01,
    );
  }

  get waveshaperType(): WaveshaperType {
    return this.waveshaperConfig.type;
  }

  set waveshaperType(val: WaveshaperType) {
    this.waveshaperConfig.type = val;
    this._waveshaperType.value = val;
  }

  get shaperCurve(): Float32Array {
    return this.waveshaperCurve.curve;
  }

  setOscillatorConfiguration(index: OscillatorIndex, config: OscillatorConfig) {
    const currentConfig = this._oscillatorConfigs[index];
    const unison = {
      voices: Math.min(16, Math.max(1, Math.round(config.unison.voices))),
      detune: clamp(config.unison.detune, 0, 50),
      depth: clamp(config.unison.depth, 0, 1),
      blend: clamp(config.unison.blend, 0, 1),
    };
    if (
      currentConfig.octave !== config.octave ||
      currentConfig.semi !== config.semi ||
      currentConfig.detune !== config.detune
    ) {
      this.oscillatorDetuneSources[index].offset.linearRampToValueAtTime(
        config.detune + config.semi * 100 + config.octave * 1200,
        this.ctxt.currentTime + 0.01,
      );
    }
    if (currentConfig.waveform !== config.waveform) {
      this.oscillatorWaveForms.value = this.oscillatorWaveForms.value.map(
        (v, i) => (i === index ? config.waveform : v),
      ) as FixedArray<WaveFormType, OscillatorCount>;
    }
    if (currentConfig.gain !== config.gain) {
      this.oscillatorGainSources[index].offset.linearRampToValueAtTime(
        config.gain,
        this.ctxt.currentTime + 0.01,
      );
    }
    if (currentConfig.unison.voices !== unison.voices) {
      this.oscillatorUnisonVoices.value = this.oscillatorUnisonVoices.value.map(
        (voices, i) => (i === index ? unison.voices : voices),
      ) as FixedArray<number, OscillatorCount>;
    }
    this.rampUnisonSource(
      this.oscillatorUnisonDetuneSources[index],
      unison.detune,
    );
    this.rampUnisonSource(
      this.oscillatorUnisonDepthSources[index],
      unison.depth,
    );
    this.rampUnisonSource(
      this.oscillatorUnisonBlendSources[index],
      unison.blend,
    );
    this._oscillatorConfigs[index] = {
      ...config,
      unison,
    };
  }

  setLfoConfiguration(index: LfoIndex, config: LfoConfig) {
    this.lfoConfigs[index] = {
      ...config,
      depths: [...config.depths] as FixedArray<number, LfoTargetCount>,
    };
    const now = this.ctxt.currentTime;

    this.lfoRateSources[index]!.offset.linearRampToValueAtTime(
      config.rateHz,
      now + 0.01,
    );
    this.lfoWaveforms[index]!.value = config.waveform;

    for (const target of LFO_TARGETS) {
      const targetIndex = LFO_TARGET_INDEX[target];
      const depth =
        target === 'drive'
          ? Math.max(0, config.depths[targetIndex]!)
          : config.depths[targetIndex]!;
      this.lfoDepthSources[index]![targetIndex]!.offset.linearRampToValueAtTime(
        depth * LFO_DEPTH_SCALES[target],
        now + 0.01,
      );
    }
  }

  override destroy() {
    if (this.destroyed) {
      return;
    }
    super.destroy();
    this.filterCutOffSource.disconnect();
    this.filterCutOffSource.stop();
    this.filterResonance.destroy();
    this.filterEnvAmountSource.disconnect();
    this.filterEnvAmountSource.stop();
    this.filterKeyTrackSource.disconnect();
    this.filterKeyTrackSource.stop();
    this.oscillatorDetuneSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.oscillatorGainSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.oscillatorUnisonDetuneSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.oscillatorUnisonDepthSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.oscillatorUnisonBlendSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.waveShaperDriveSource.disconnect();
    this.waveShaperDriveSource.stop();
    this.waveshaperCurve.destroy();
    this.lfoRateSources.forEach(source => {
      source.disconnect();
      source.stop();
    });
    this.lfoDepthSources.forEach(sources => {
      sources.forEach(source => {
        source.disconnect();
        source.stop();
      });
    });
    this.output.disconnect();
  }

  private createConstantSources<N extends number>(
    offsets: FixedArray<number, N>,
  ): FixedArray<ConstantSourceNode, N> {
    return offsets.map(offset =>
      this.createConstantSource(offset),
    ) as FixedArray<ConstantSourceNode, N>;
  }

  private rampUnisonSource(
    source: ConstantSourceNode,
    nextValue: number,
  ): void {
    const previous = this.unisonRampStates.get(source);
    if (previous?.target === nextValue || source.offset.value === nextValue) {
      return;
    }
    const now = this.ctxt.currentTime;
    const elapsed = Math.max(0, now - (previous?.startTime ?? now));
    const progress = Math.min(1, elapsed / UNISON_RAMP_SECONDS);
    const currentValue = previous
      ? previous.startValue + (previous.target - previous.startValue) * progress
      : source.offset.value;
    source.offset.cancelScheduledValues(now);
    source.offset.setValueAtTime(currentValue, now);
    source.offset.linearRampToValueAtTime(nextValue, now + UNISON_RAMP_SECONDS);
    this.unisonRampStates.set(source, {
      startTime: now,
      startValue: currentValue,
      target: nextValue,
    });
  }

  private createConstantSource(offset: number = 0) {
    const source = this.ctxt.createConstantSource();
    source.offset.value = offset;
    source.start();
    return source;
  }
}
