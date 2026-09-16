import type { Destroyable } from './destroyable';

export type FilterType =
  | 'lowpass12'
  | 'lowpass24'
  | 'lowpass36'
  | 'lowpass48'
  | 'highpass12'
  | 'highpass24'
  | 'highpass36'
  | 'highpass48'
  | 'bandpass'
  | 'notch'
  | 'lowshelf'
  | 'highshelf'
  | 'peaking'
  | 'allpass';

export interface FilterSpec {
  shape: BiquadFilterType;
  stages: 1 | 2 | 3 | 4;
}

const FILTER_SPECS: Record<FilterType, FilterSpec> = {
  lowpass12: { shape: 'lowpass', stages: 1 },
  lowpass24: { shape: 'lowpass', stages: 2 },
  lowpass36: { shape: 'lowpass', stages: 3 },
  lowpass48: { shape: 'lowpass', stages: 4 },
  highpass12: { shape: 'highpass', stages: 1 },
  highpass24: { shape: 'highpass', stages: 2 },
  highpass36: { shape: 'highpass', stages: 3 },
  highpass48: { shape: 'highpass', stages: 4 },
  bandpass: { shape: 'bandpass', stages: 1 },
  notch: { shape: 'notch', stages: 1 },
  lowshelf: { shape: 'lowshelf', stages: 1 },
  highshelf: { shape: 'highshelf', stages: 1 },
  peaking: { shape: 'peaking', stages: 1 },
  allpass: { shape: 'allpass', stages: 1 },
};

export function filterTypeToSpec(type: FilterType): FilterSpec {
  return FILTER_SPECS[type];
}

export class Filter implements Destroyable {
  private readonly gain: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly keytrackSource: ConstantSourceNode;
  private readonly keytrackGain: GainNode;
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this.gain = ctxt.createGain();
    this.filter = ctxt.createBiquadFilter();
    this.gain.connect(this.filter);

    this.keytrackSource = ctxt.createConstantSource();
    this.keytrackSource.offset.value = 0;
    this.keytrackSource.start();

    this.keytrackGain = ctxt.createGain();
    this.keytrackGain.gain.value = 0;
    this.keytrackSource.connect(this.keytrackGain);
    this.keytrackGain.connect(this.filter.detune);
  }

  get input(): AudioNode {
    return this.gain;
  }

  get detune(): AudioParam {
    return this.filter.detune;
  }

  get drive(): AudioParam {
    return this.gain.gain;
  }

  get frequency(): AudioParam {
    return this.filter.frequency;
  }

  get q(): AudioParam {
    return this.filter.Q;
  }

  get keytrack(): AudioParam {
    return this.keytrackGain.gain;
  }

  noteOn(noteNumber: number, now: number): void {
    this.keytrackSource.offset.setValueAtTime(100 * noteNumber, now);
  }

  connect(destination: AudioNode): void {
    this.filter.connect(destination);
  }

  disconnect(): void;
  disconnect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void {
    if (destination) {
      this.filter.disconnect(destination);
    } else {
      this.filter.disconnect();
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.gain.disconnect();
    this.filter.disconnect();
    this.keytrackSource.disconnect();
    this.keytrackSource.stop();
    this.keytrackGain.disconnect();
  }
}
