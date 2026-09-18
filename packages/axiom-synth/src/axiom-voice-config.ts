import type {
  EnvelopeConfig,
  FixedArray,
  LfoWaveformType,
  WaveFormType,
} from '@axiom/audio-engine';
import type {
  FilterResonance,
  FilterType,
  OscillatorCount,
  WaveshaperCurve,
} from '@axiom/audio-engine';
import type { LfoCount, LfoTargetCount } from '@axiom/audio-engine';
import type { Observable } from '@axiom/audio-engine';

export interface AxiomVoiceConfig {
  ampEnvelope: EnvelopeConfig;
  filterEnvelope: EnvelopeConfig;
  filterCutoff: ConstantSourceNode;
  filterResonance: FilterResonance;
  filterType: Observable<FilterType>;
  filterEnvAmount: ConstantSourceNode;
  filterKeyTrack: ConstantSourceNode;
  oscillatorDetuneSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorGainSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorUnisonDetuneSources: FixedArray<
    ConstantSourceNode,
    OscillatorCount
  >;
  oscillatorUnisonDepthSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorUnisonBlendSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorUnisonVoices: Observable<FixedArray<number, OscillatorCount>>;
  oscillatorWaveForms: Observable<FixedArray<WaveFormType, OscillatorCount>>;
  waveshaperCurve: WaveshaperCurve;
  waveshaperDrive: ConstantSourceNode;
  lfoWaveforms: FixedArray<Observable<LfoWaveformType>, LfoCount>;
  lfoRateSources: FixedArray<ConstantSourceNode, LfoCount>;
  lfoDepthSources: FixedArray<
    FixedArray<ConstantSourceNode, LfoTargetCount>,
    LfoCount
  >;
}
