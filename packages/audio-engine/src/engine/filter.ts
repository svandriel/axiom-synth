import type { Observable } from '../utils/observable';
import type { Destroyable } from './destroyable';
import type { FilterResonance } from './filter-resonance';

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

interface FilterInputs {
  cutoff: ConstantSourceNode;
  resonance: FilterResonance;
  type: Observable<FilterType>;
}

export class Filter implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly gain: GainNode;
  private readonly output: GainNode;
  private readonly resonance: FilterResonance;
  private readonly cutoff: ConstantSourceNode;
  private readonly keytrackSource: ConstantSourceNode;
  private readonly keytrackGain: GainNode;
  private readonly modulationNodes: AudioNode[] = [];
  private readonly typeSubscription: { unsubscribe: () => void };
  private stages: BiquadFilterNode[] = [];
  private currentSlope: 1 | 2 | 3 | 4 = 1;
  private destroyed = false;

  constructor(ctxt: AudioContext, config: FilterInputs) {
    this.ctxt = ctxt;
    this.cutoff = config.cutoff;
    this.resonance = config.resonance;

    this.gain = ctxt.createGain();
    this.output = ctxt.createGain();
    this.output.gain.value = 1;

    this.keytrackSource = ctxt.createConstantSource();
    this.keytrackSource.offset.value = 0;
    this.keytrackSource.start();

    this.keytrackGain = ctxt.createGain();
    this.keytrackGain.gain.value = 0;
    this.keytrackSource.connect(this.keytrackGain);

    this.typeSubscription = config.type.subscribe(type => this.rebuild(type));
    this.rebuild(config.type.value);
  }

  get input(): AudioNode {
    return this.gain;
  }

  get drive(): AudioParam {
    return this.gain.gain;
  }

  get keytrack(): AudioParam {
    return this.keytrackGain.gain;
  }

  connectModulation(node: AudioNode): void {
    this.modulationNodes.push(node);
    this.stages.forEach(stage => node.connect(stage.detune));
  }

  noteOn(noteNumber: number, now: number): void {
    this.keytrackSource.offset.setValueAtTime(100 * noteNumber, now);
  }

  connect(destination: AudioNode): void {
    this.output.connect(destination);
  }

  disconnect(): void;
  disconnect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void {
    if (destination) {
      this.output.disconnect(destination);
    } else {
      this.output.disconnect();
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.typeSubscription.unsubscribe();
    this.stages.forEach(stage => this.teardownStage(stage));
    this.stages = [];
    this.gain.disconnect();
    this.output.disconnect();
    this.keytrackSource.disconnect();
    this.keytrackSource.stop();
    this.keytrackGain.disconnect();
  }

  private rebuild(type: FilterType): void {
    const spec = filterTypeToSpec(type);
    const cur = this.stages.length;

    this.stages.forEach(stage => {
      stage.type = spec.shape;
    });

    if (spec.stages !== cur) {
      this.stages.forEach(stage => {
        this.resonance.stageQFor(this.currentSlope).disconnect(stage.Q);
        this.resonance.stageQFor(spec.stages).connect(stage.Q);
      });
      this.currentSlope = spec.stages;
    }

    if (spec.stages > cur) {
      for (let i = cur; i < spec.stages; ++i) {
        const stage = this.ctxt.createBiquadFilter();
        stage.type = spec.shape;
        stage.frequency.value = 0;
        this.cutoff.connect(stage.frequency);
        this.keytrackGain.connect(stage.detune);
        this.modulationNodes.forEach(node => node.connect(stage.detune));
        this.resonance.stageQFor(spec.stages).connect(stage.Q);
        this.stages.push(stage);
      }
    } else if (spec.stages < cur) {
      for (let i = spec.stages; i < cur; ++i) {
        this.teardownStage(this.stages[i]!);
      }
      this.stages.length = spec.stages;
    }

    this.wireChain();
  }

  private wireChain(): void {
    this.gain.disconnect();
    this.stages.forEach(stage => stage.disconnect());
    if (this.stages.length === 0) {
      return;
    }
    this.gain.connect(this.stages[0]!);
    for (let i = 1; i < this.stages.length; ++i) {
      this.stages[i - 1]!.connect(this.stages[i]!);
    }
    this.stages[this.stages.length - 1]!.connect(this.output);
  }

  private teardownStage(stage: BiquadFilterNode): void {
    stage.disconnect();
    this.cutoff.disconnect(stage.frequency);
    this.keytrackGain.disconnect(stage.detune);
    this.resonance.stageQFor(this.currentSlope).disconnect(stage.Q);
  }
}
