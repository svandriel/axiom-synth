import type { WaveFormType } from '../types';
import type { Observable } from '../utils/observable';

export interface OscillatorConfigSource {
  detuneSource: ConstantSourceNode;
  gainSource: ConstantSourceNode;
  waveForm: Observable<WaveFormType>;
}
