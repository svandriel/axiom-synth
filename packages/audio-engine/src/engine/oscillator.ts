import type { WaveFormType } from '../types';
import type { Destroyable } from './destroyable';

export interface Oscillator extends Destroyable {
  waveform: WaveFormType;
  readonly frequency: AudioParam;
  readonly detune: AudioParam;
  readonly gain: AudioParam;
  connect(destination: AudioNode | AudioParam): void;
  disconnect(destination?: AudioNode | AudioParam | null): void;
  start(noteHz: number, now: number): void;
  stop(time?: number): void;
  onEnded(subscriber: () => void): OscillatorEndSubscription;
}

export interface OscillatorEndSubscription {
  unsubscribe(): void;
}
