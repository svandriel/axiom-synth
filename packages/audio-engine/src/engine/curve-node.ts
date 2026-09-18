import type { Destroyable } from './destroyable';

export type CurveFunction = (input: number) => number;

export interface CurveNodeOptions {
  inputMin: number;
  inputMax: number;
}

const CURVE_SAMPLES = 1024;

export class CurveNode implements Destroyable {
  private readonly inputGain: GainNode;
  private readonly waveShaper: WaveShaperNode;
  private readonly offset: ConstantSourceNode;
  private destroyed = false;

  constructor(
    ctxt: AudioContext,
    curveFunction: CurveFunction,
    { inputMin, inputMax }: CurveNodeOptions,
  ) {
    if (!(inputMin < inputMax)) {
      throw new Error('CurveNode inputMin must be less than inputMax');
    }

    this.inputGain = ctxt.createGain();
    this.inputGain.gain.value = 2 / (inputMax - inputMin);
    this.waveShaper = ctxt.createWaveShaper();
    this.waveShaper.curve = Float32Array.from(
      { length: CURVE_SAMPLES },
      (_, index) =>
        curveFunction(
          inputMin + (index / (CURVE_SAMPLES - 1)) * (inputMax - inputMin),
        ),
    );
    this.offset = ctxt.createConstantSource();
    this.offset.offset.value = -(inputMax + inputMin) / (inputMax - inputMin);
    this.offset.start();
    this.inputGain.connect(this.waveShaper);
    this.offset.connect(this.waveShaper);
  }

  get input(): AudioNode {
    return this.inputGain;
  }

  get output(): AudioNode {
    return this.waveShaper;
  }

  connect(destination: AudioNode | AudioParam): void {
    if (destination instanceof AudioParam) {
      this.waveShaper.connect(destination);
    } else {
      this.waveShaper.connect(destination);
    }
  }

  disconnect(destination: AudioNode | AudioParam | null = null): void {
    if (destination === null) {
      this.waveShaper.disconnect();
    } else if (destination instanceof AudioParam) {
      this.waveShaper.disconnect(destination);
    } else {
      this.waveShaper.disconnect(destination);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.offset.disconnect();
    this.offset.stop();
    this.inputGain.disconnect();
    this.waveShaper.disconnect();
  }
}
