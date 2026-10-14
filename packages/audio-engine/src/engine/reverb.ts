export class Reverb {
  private readonly _input: GainNode;
  private readonly _convolver: ConvolverNode;
  private readonly _wetGain: GainNode;
  private readonly _output: GainNode;

  constructor(ctxt: AudioContext) {
    const now = ctxt.currentTime;
    this._input = ctxt.createGain();
    this._input.gain.setValueAtTime(1, now);

    this._wetGain = ctxt.createGain();
    this._wetGain.gain.setValueAtTime(0, now);

    this._convolver = ctxt.createConvolver();

    this._output = ctxt.createGain();
    this._output.gain.setValueAtTime(1, now);

    // input --> wetGain -> convolver -> output
    //       |                              |
    //       |------------------------------|

    this._input.connect(this._output);
    this._input.connect(this._wetGain);
    this._wetGain.connect(this._convolver);
    this._convolver.connect(this._output);
  }

  public get input(): AudioNode {
    return this._input;
  }

  public get wet(): AudioParam {
    return this._wetGain.gain;
  }

  public get buffer(): AudioBuffer | null {
    return this._convolver.buffer;
  }

  public set buffer(buffer: AudioBuffer | null) {
    this._convolver.buffer = buffer;
  }

  public connect(destination: AudioNode): void {
    this._output.connect(destination);
  }

  public disconnect(): void;
  public disconnect(destination: AudioNode): void;
  public disconnect(destination?: AudioNode): void {
    if (destination) {
      this._input.disconnect(destination);
    } else {
      this._input.disconnect();
    }
  }
}
