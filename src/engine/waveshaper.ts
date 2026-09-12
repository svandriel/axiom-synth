const CURVE_SAMPLES = 1024;
export type WaveshaperType = 'classic' | 'tanh';

export class Waveshaper {
  private readonly driveNode: GainNode;
  private readonly wsNode: WaveShaperNode;
  private readonly curve: Float32Array<ArrayBuffer>;

  private _amount: number = 0;
  private _type: WaveshaperType = 'classic';

  constructor(ctxt: AudioContext) {
    this.curve = new Float32Array(CURVE_SAMPLES);
    this.driveNode = ctxt.createGain();
    this.driveNode.gain.setValueAtTime(1, ctxt.currentTime);
    this.wsNode = ctxt.createWaveShaper();
    this.wsNode.curve = this.curve;

    this.driveNode.connect(this.wsNode);

    this.recomputeCurve();
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

  /**
   * Amount of distortion, 0 is none, 40 is heavy, 100 is extreme
   */
  get amount() {
    return this._amount;
  }

  set amount(newAmount: number) {
    if (this._amount !== newAmount) {
      this._amount = newAmount;
      this.recomputeCurve();
    }
  }

  get type(): WaveshaperType {
    return this._type;
  }

  set type(type: WaveshaperType) {
    if (this._type !== type) {
      console.log('type set to', type);
      this._type = type;
      this.recomputeCurve();
    }
  }

  destroy() {
    this.driveNode.disconnect();
    this.wsNode.disconnect();
  }

  private recomputeCurve() {
    switch (this._type) {
      case 'classic':
        this.curveForClassicalDistortion();
        break;
      case 'tanh':
        this.curveForTanH();
        break;
    }
    // const min = this.curve.reduce(
    //   (acc, item) => Math.min(acc, item),
    //   Number.POSITIVE_INFINITY,
    // );
    // const max = this.curve.reduce(
    //   (acc, item) => Math.max(acc, item),
    //   Number.NEGATIVE_INFINITY,
    // );
    // console.log('curve', { min, max });
    this.wsNode.curve = this.curve;

    // console.log(this.curve.join(', '));
  }

  private curveForClassicalDistortion() {
    const k = this._amount;
    const deg = Math.PI / 180;

    for (let i = 0; i < CURVE_SAMPLES; ++i) {
      // Map array index to a range between -1 and 1
      const x = (i * 2) / CURVE_SAMPLES - 1;
      // Classic mathematical formula for standard audio saturation/clipping
      this.curve[i] =
        (3 * ((3 + k) * x * 20 * deg)) / (Math.PI + k * Math.abs(x));
    }
  }

  private curveForTanH() {
    // EN: Exponential mapping from 0-100 to 1-16
    const k = 1 + Math.pow(this._amount / 100, 2) * 15;

    for (let i = 0; i < CURVE_SAMPLES; ++i) {
      const x = (i * 2) / CURVE_SAMPLES - 1;

      // Classic full-range soft-clipping formula
      this.curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
  }
}
