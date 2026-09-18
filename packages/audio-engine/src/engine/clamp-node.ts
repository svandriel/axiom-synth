import { CurveNode } from './curve-node';

export class ClampNode extends CurveNode {
  constructor(ctxt: AudioContext, inputMin: number, inputMax: number) {
    super(ctxt, value => value, { inputMin, inputMax });
  }
}
