import type { EnvelopeConfig, FixedArray, WaveFormType } from '../types';
import type { Observable } from '../utils/observable';
import type { OscillatorCount } from './constants';
import type { WaveshaperType } from './waveshaper';

export interface AxiomVoiceConfig {
  ampEnvelope: EnvelopeConfig;
  filterEnvelope: EnvelopeConfig;
  filterCutoff: ConstantSourceNode;
  filterResonance: ConstantSourceNode;
  filterEnvAmount: ConstantSourceNode;
  filterKeyTrack: ConstantSourceNode;
  oscillatorDetuneSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorGainSources: FixedArray<ConstantSourceNode, OscillatorCount>;
  oscillatorWaveForms: Observable<FixedArray<WaveFormType, OscillatorCount>>;
  distortionAmount: Observable<number>;
  waveshaperDrive: ConstantSourceNode;
  waveshaperType: Observable<WaveshaperType>;
}
