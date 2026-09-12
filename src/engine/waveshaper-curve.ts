const CURVE_SAMPLES = 1024;

export type WaveshaperType =
  | 'atan'
  | 'soft-algebraic'
  | 'asymmetric-tube'
  | 'hard-clipper'
  | 'sine-shaper'
  | 'chebyshev';

export class WaveshaperCurve {
  private readonly nodes = new Set<WaveShaperNode>();
  private readonly curve = new Float32Array(CURVE_SAMPLES);

  private _amount: number;
  private _type: WaveshaperType;

  constructor(amount: number, type: WaveshaperType) {
    this._amount = amount;
    this._type = type;
    this.computeCurve();
  }

  subscribe(node: WaveShaperNode): void {
    this.nodes.add(node);
    node.curve = this.curve;
  }

  unsubscribe(node: WaveShaperNode): void {
    this.nodes.delete(node);
  }

  get amount(): number {
    return this._amount;
  }

  set amount(value: number) {
    if (this._amount === value) {
      return;
    }
    this._amount = value;
    this.apply();
  }

  get type(): WaveshaperType {
    return this._type;
  }

  set type(value: WaveshaperType) {
    if (this._type === value) {
      return;
    }
    this._type = value;
    this.apply();
  }

  private apply(): void {
    this.computeCurve();
    this.nodes.forEach(node => {
      node.curve = this.curve;
    });
  }

  private computeCurve(): void {
    const m = this._amount / 100;
    for (let i = 0; i < CURVE_SAMPLES; ++i) {
      const x = (i * 2) / CURVE_SAMPLES - 1;
      switch (this._type) {
        case 'atan': {
          const k = 1 + m * m * 24;
          this.curve[i] = Math.atan(k * x) / Math.atan(k);
          break;
        }
        case 'soft-algebraic': {
          const k = m * m * 10;
          this.curve[i] = x / Math.sqrt(1 + k * x * x);
          break;
        }
        case 'asymmetric-tube': {
          const k = 1 + m * 9;
          this.curve[i] = x < 0 ? Math.tanh(k * x) : x;
          break;
        }
        case 'hard-clipper': {
          const k = 1 - m * 0.95;
          this.curve[i] = Math.max(-k, Math.min(k, x)) / k;
          break;
        }
        case 'sine-shaper': {
          const k = 1 + m * 4;
          this.curve[i] = Math.sin((k * x * Math.PI) / 2);
          break;
        }
        case 'chebyshev': {
          this.curve[i] = (1 - m) * x + m * (4 * Math.pow(x, 3) - 3 * x);
          break;
        }
      }
    }
  }
}
