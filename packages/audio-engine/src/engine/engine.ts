import type {
  EnvelopeConfig,
  FilterConfig,
  FixedArray,
  OscillatorConfig,
  WaveFormType,
} from '../types';
import type { WaveshaperConfig } from '../types/waveshaper-config';
import type {
  LfoConfig,
  LfoTarget,
  LfoWaveformType,
} from '../types/lfo-config';
import { Observable } from '../utils/observable';
import { AxiomVoice } from './axiom-voice';
import type { AxiomVoiceConfig } from './axiom-voice-config';
import {
  LFO_COUNT,
  LFO_TARGET_COUNT,
  LFO_TARGET_INDEX,
  LFO_TARGETS,
  type LfoCount,
  type LfoIndex,
  type LfoTargetCount,
  type OscillatorCount,
  type OscillatorIndex,
} from './constants';
import { FilterResonance } from './filter-resonance';
import type { FilterType } from './filter';
import { Meter } from './meter';
import { Voice } from './voice';
import type { WaveshaperType } from './waveshaper';
import { WaveshaperCurve } from './waveshaper-curve';
import type { Destroyable } from './destroyable';

const MAX_VOICES = 16;

// Per-target depth scales: raw -1..1 × scale → final modulation amount
const LFO_DEPTH_SCALES: Record<LfoTarget, number> = {
  osc1: 150,
  osc2: 150,
  osc3: 150,
  cutoff: 1200,
  amp: 1,
  drive: 4,
};

export class AudioEngine implements Destroyable {
  public readonly ctxt: AudioContext;
  private readonly master: GainNode;
  private readonly meter: Meter;
  private readonly analyser: AnalyserNode;
  private readonly dry: GainNode;
  private readonly comp: DynamicsCompressorNode;

  private readonly noteToVoiceMap: Map<number, Voice> = new Map();

  private readonly voicePool: Voice[] = [];

  private readonly filterCutOffSource: ConstantSourceNode;
  private readonly filterResonance: FilterResonance;
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

  public readonly oscillatorConfigs: FixedArray<
    OscillatorConfig,
    OscillatorCount
  > = [
    {
      octave: 0,
      semi: 0,
      detune: 5,
      waveform: 'sawtooth',
      gain: 1,
    },
    {
      octave: 0,
      semi: 0,
      detune: -5,
      waveform: 'square',
      gain: 1,
    },
    {
      octave: -2,
      semi: 0,
      detune: 0,
      waveform: 'triangle',
      gain: 1,
    },
  ];

  public readonly ampEnvelope: EnvelopeConfig = {
    attackSeconds: 0.02,
    attackCurve: 'analog',
    decaySeconds: 0.3,
    decayCurve: 'analog',
    sustainLevel: 0.6,
    releaseSeconds: 0.62,
    releaseCurve: 'analog',
  };

  public readonly filterConfig: FilterConfig = {
    type: 'lowpass24',
    frequency: 360,
    q: 6,
    envAmount: 4800, // cents, -9600 to 9600
    tracking: 0.9,
  };

  public readonly filterEnvelope: EnvelopeConfig = {
    attackSeconds: 0.01,
    attackCurve: 'linear',
    decaySeconds: 0.2,
    decayCurve: 'analog',
    sustainLevel: 0.4,
    releaseSeconds: 3,
    releaseCurve: 'analog',
  };

  private readonly waveshaperConfig: WaveshaperConfig = {
    distortion: 50,
    drive: 0,
    type: 'soft-algebraic',
  };

  private readonly oscillatorWaveForms: Observable<
    FixedArray<WaveFormType, OscillatorCount>
  >;

  private readonly waveShaperDriveSource: ConstantSourceNode;
  private readonly waveshaperCurve: WaveshaperCurve;

  private readonly _distortionAmount: Observable<number>;
  private readonly _waveshaperType: Observable<WaveshaperType>;
  private readonly _filterType: Observable<FilterType>;

  private readonly lfoWaveforms: FixedArray<
    Observable<LfoWaveformType>,
    LfoCount
  >;
  private readonly lfoRateSources: FixedArray<ConstantSourceNode, LfoCount>;
  private readonly lfoDepthSources: FixedArray<
    FixedArray<ConstantSourceNode, LfoTargetCount>,
    LfoCount
  >;

  public readonly lfoConfigs: FixedArray<LfoConfig, LfoCount> = [
    { rateHz: 2, waveform: 'sine', depths: [-0.11, 0.09, 0, 0, -0.1, 0] },
    { rateHz: 3.47, waveform: 'sine', depths: [0, 0, 0, 0.2, 0, 0] },
    { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
    { rateHz: 2, waveform: 'sine', depths: [0, 0, 0, 0, 0, 0] },
  ];
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    console.log('Initializing AudioEngine, ctxt.state:', ctxt.state);

    this.master = ctxt.createGain();
    this.master.gain.value = 0.5;
    this.meter = new Meter(ctxt);
    this.analyser = ctxt.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.dry = ctxt.createGain();
    this.dry.gain.value = 0.8;

    this.comp = ctxt.createDynamicsCompressor();

    this.dry.connect(this.master);
    this.dry.connect(this.meter.input);

    this.master.connect(this.comp);
    this.comp.connect(this.analyser);
    this.analyser.connect(ctxt.destination);

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
      this.oscillatorConfigs.map(c => c.detune) as FixedArray<
        number,
        OscillatorCount
      >,
    );
    this.oscillatorGainSources = this.createConstantSources(
      this.oscillatorConfigs.map(c => c.gain) as FixedArray<
        number,
        OscillatorCount
      >,
    );

    this.oscillatorWaveForms = new Observable(
      this.oscillatorConfigs.map(c => c.waveform) as FixedArray<
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

    const voiceConfig: AxiomVoiceConfig = {
      ampEnvelope: this.ampEnvelope,
      filterEnvelope: this.filterEnvelope,
      filterCutoff: this.filterCutOffSource,
      filterResonance: this.filterResonance,
      filterType: this._filterType,
      filterEnvAmount: this.filterEnvAmountSource,
      filterKeyTrack: this.filterKeyTrackSource,
      oscillatorDetuneSources: this.oscillatorDetuneSources,
      oscillatorGainSources: this.oscillatorGainSources,
      oscillatorWaveForms: this.oscillatorWaveForms,
      waveshaperCurve: this.waveshaperCurve,
      waveshaperDrive: this.waveShaperDriveSource,
      lfoWaveforms: this.lfoWaveforms,
      lfoRateSources: this.lfoRateSources,
      lfoDepthSources: this.lfoDepthSources,
    };

    this.voicePool = Array.from(
      { length: MAX_VOICES },
      () => new AxiomVoice(this.ctxt, this.dry, voiceConfig),
    );
  }

  getScopeData(buffer: Float32Array<ArrayBuffer>) {
    this.analyser.getFloatTimeDomainData(buffer);
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
    const currentConfig = this.oscillatorConfigs[index];
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
    this.oscillatorConfigs[index] = { ...config };
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
      this.lfoDepthSources[index]![targetIndex]!.offset.linearRampToValueAtTime(
        config.depths[targetIndex]! * LFO_DEPTH_SCALES[target],
        now + 0.01,
      );
    }
  }

  get meterLevel(): number {
    return this.meter.value;
  }

  ensureStarted() {
    if (this.ctxt.state === 'suspended') {
      this.ctxt.resume();
    }
  }

  noteOn(noteNumber: number, velocity: number) {
    this.ensureStarted();
    const now = this.ctxt.currentTime;

    if (this.noteToVoiceMap.has(noteNumber)) {
      console.log(
        `[${now.toFixed(4)}] noteOn(${noteNumber}) - already active, retriggering`,
      );
      this.noteOff(noteNumber);
    }

    // 1. Evaluate available voices in the pool
    let targetVoice = this.voicePool.find(v => v.isAvailable(now));
    let startDelay = 0;

    if (targetVoice) {
      console.log(
        `[${now.toFixed(4)}] Voice ${targetVoice.id} available for note ${noteNumber}`,
      );
    }

    // 2. Thread-Safe Voice Stealing Logic
    if (!targetVoice) {
      let oldestTime = Infinity;
      let oldestVoice: Voice | null = null;

      for (const voice of this.voicePool) {
        if (voice.lastUsed < oldestTime) {
          oldestTime = voice.lastUsed;
          oldestVoice = voice;
        }
      }

      if (oldestVoice) {
        const age = now - oldestTime;
        console.warn(
          `[${now.toFixed(4)}] Voice stealing triggered for note ${noteNumber} - oldest voice is ${oldestVoice?.id}, age ${age.toFixed(1)} s`,
        );
        targetVoice = oldestVoice;

        for (const [note, voice] of this.noteToVoiceMap.entries()) {
          if (voice === targetVoice) {
            this.noteToVoiceMap.delete(note);
          }
        }

        // Choke the stolen voice instantly over a micro-fade window
        targetVoice.fastChoke(now);
        // Delays the new note's execution so the old note can fade completely
        startDelay = targetVoice.chokeDuration;
      }
    }

    if (targetVoice) {
      targetVoice.noteOn(noteNumber, velocity, startDelay);
      this.noteToVoiceMap.set(noteNumber, targetVoice);
    }
  }

  noteOff(noteNumber: number) {
    const voice = this.noteToVoiceMap.get(noteNumber);
    if (voice) {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - releasing voice`,
      );
      voice.noteOff();
      this.noteToVoiceMap.delete(noteNumber);
    } else {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - no active voice found`,
      );
    }
  }

  allNotesOff() {
    console.log('allNotesOff');
    for (const [note, voice] of this.noteToVoiceMap.entries()) {
      voice.noteOff();
      this.noteToVoiceMap.delete(note);
    }
  }

  private createConstantSources<N extends number>(
    offsets: FixedArray<number, N>,
  ): FixedArray<ConstantSourceNode, N> {
    return offsets.map(offset =>
      this.createConstantSource(offset),
    ) as FixedArray<ConstantSourceNode, N>;
  }

  private createConstantSource(offset: number = 0) {
    const source = this.ctxt.createConstantSource();
    source.offset.value = offset;
    source.start();
    return source;
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.noteToVoiceMap.clear();
    this.voicePool.forEach(voice => voice.destroy());
    this.meter.destroy();
    this.comp.disconnect();
    this.analyser.disconnect();
    this.master.disconnect();
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
    this.dry.disconnect();
    this.ctxt.close();
  }
}
