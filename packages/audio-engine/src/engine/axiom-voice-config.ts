import type { EnvelopeConfig, FixedArray, WaveFormType } from '../types';
import type { Observable } from '../utils/observable';
import type { LfoCount, LfoTargetCount, OscillatorCount } from './constants';
import type { FilterType } from './filter';
import type { FilterResonance } from './filter-resonance';
import type { LfoWaveformType } from '../types/lfo-config';
import type { WaveshaperCurve } from './waveshaper-curve';

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
