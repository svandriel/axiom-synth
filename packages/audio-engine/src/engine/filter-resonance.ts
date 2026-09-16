import type { Destroyable } from './destroyable';

const CURVE_SAMPLES = 1024;
const SCALE = 20;
const SLOPES = [2, 3, 4] as const;

export class FilterResonance implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly source: ConstantSourceNode;
  private readonly transforms = new Map<1 | 2 | 3 | 4, AudioNode>();
  private destroyed = false;

  constructor(ctxt: AudioContext, startQ: number) {
    this.ctxt = ctxt;
    this.source = ctxt.createConstantSource();
    this.source.offset.value = startQ;
    this.source.start();
    this.transforms.set(1, this.source);

    for (const slope of SLOPES) {
      const scale = ctxt.createGain();
      scale.gain.value = 1 / SCALE;
      const shaper = ctxt.createWaveShaper();
      shaper.curve = this.buildCurve(slope);
      this.source.connect(scale);
      scale.connect(shaper);
      this.transforms.set(slope, shaper);
    }
  }

  get q(): number {
    return this.source.offset.value;
  }

  set q(value: number) {
    this.source.offset.linearRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
  }

  stageQFor(slope: 1 | 2 | 3 | 4): AudioNode {
    return this.transforms.get(slope) ?? this.source;
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.source.disconnect();
    this.source.stop();
    this.transforms.forEach(node => {
      if (node !== this.source) {
        node.disconnect();
      }
    });
  }

  private buildCurve(slope: number): Float32Array<ArrayBuffer> {
    const curve = new Float32Array(CURVE_SAMPLES);
    for (let i = 0; i < CURVE_SAMPLES; ++i) {
      const input = (i / (CURVE_SAMPLES - 1)) * 2 - 1;
      curve[i] = input < 0 ? 0 : Math.pow(SCALE * input, 1 / slope);
    }
    return curve;
  }
}
