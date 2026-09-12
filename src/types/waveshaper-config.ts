import type { WaveshaperType } from '../engine/waveshaper';

export interface WaveshaperConfig {
  drive: number;
  type: WaveshaperType;
  distortion: number; // 0 - 100
}
