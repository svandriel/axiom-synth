import type { Destroyable } from './destroyable';

export class Analyser implements Destroyable {
  private readonly analyser: AnalyserNode;
  private readonly buffer: Float32Array<ArrayBuffer>;
  private readonly type: AnalyzerType;
  private destroyed = false;

  constructor(ctxt: AudioContext, options: Partial<AnalyserOptions>) {
    const opts = { ...Analyser.defaultOptions, ...options };
    this.type = opts.type;
    this.analyser = ctxt.createAnalyser();
    this.analyser.fftSize = opts.size;
    this.analyser.smoothingTimeConstant = 0.82;
    this.buffer = new Float32Array(opts.size);
  }

  get input(): AudioNode {
    return this.analyser;
  }

  connect(node: AudioNode): void {
    this.analyser.connect(node);
  }

  disconnect(): void;
  disconnect(node: AudioNode): void;
  disconnect(node?: AudioNode): void {
    if (node) {
      this.analyser.disconnect(node);
    } else {
      this.analyser.disconnect();
    }
  }

  get smoothing(): number {
    return this.analyser.smoothingTimeConstant;
  }

  set smoothing(value: number) {
    this.analyser.smoothingTimeConstant = value;
  }

  getBuffer(): Float32Array<ArrayBuffer> {
    if (this.type === 'timeDomain') {
      this.analyser.getFloatTimeDomainData(this.buffer);
    } else {
      this.analyser.getFloatFrequencyData(this.buffer);
    }
    return this.buffer;
  }

  static defaultOptions: AnalyserOptions = {
    size: 2048,
    smoothing: 0.82,
    type: 'timeDomain',
  };

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.analyser.disconnect();
  }
}

export type AnalyzerType = 'fft' | 'timeDomain';

export interface AnalyserOptions {
  size: number; // Power of 2
  smoothing: number;
  type: AnalyzerType;
}
