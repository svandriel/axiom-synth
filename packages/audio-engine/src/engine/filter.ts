export class Filter {
  private readonly ctxt: AudioContext;
  private readonly gain: GainNode;
  private readonly filter: BiquadFilterNode;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;
    this.gain = ctxt.createGain();
    this.filter = ctxt.createBiquadFilter();
    this.gain.connect(this.filter);
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
}
