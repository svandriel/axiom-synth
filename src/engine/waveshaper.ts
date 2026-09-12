import type { WaveshaperCurve } from './waveshaper-curve';

export type { WaveshaperType } from './waveshaper-curve';

export class Waveshaper {
  private readonly driveNode: GainNode;
  private readonly wsNode: WaveShaperNode;
  private readonly curve: WaveshaperCurve;

  constructor(ctxt: AudioContext, curve: WaveshaperCurve) {
    this.curve = curve;
    this.driveNode = ctxt.createGain();
    this.driveNode.gain.setValueAtTime(1, ctxt.currentTime);
    this.wsNode = ctxt.createWaveShaper();
    this.curve.subscribe(this.wsNode);
    this.driveNode.connect(this.wsNode);
  }

  get drive(): AudioParam {
    return this.driveNode.gain;
  }

  get input(): AudioNode {
    return this.driveNode;
  }

  get output(): AudioNode {
    return this.wsNode;
  }

  destroy(): void {
    this.curve.unsubscribe(this.wsNode);
    this.driveNode.disconnect();
    this.wsNode.disconnect();
  }
}
