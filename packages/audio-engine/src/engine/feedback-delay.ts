export class FeedbackDelay {
  private readonly _input: GainNode;
  private readonly _delay: DelayNode;
  private readonly _wetGain: GainNode;
  private readonly _output: GainNode;
  private readonly _filter: BiquadFilterNode;

  constructor(ctxt: AudioContext) {
    const now = ctxt.currentTime;
    this._input = ctxt.createGain();
    this._input.gain.setValueAtTime(1, now);

    this._wetGain = ctxt.createGain();
    this._wetGain.gain.setValueAtTime(0, now);

    this._delay = ctxt.createDelay(10);
    this._delay.delayTime.setValueAtTime(0.6, now);

    this._output = ctxt.createGain();
    this._output.gain.setValueAtTime(1, now);

    this._filter = ctxt.createBiquadFilter();
    this._filter.type = 'lowpass';
    this._filter.frequency.setValueAtTime(500, now);
    this._filter.Q.setValueAtTime(0, now);

    // input --> wetGain -> filter -> delay -> output
    //       |      ^                    |       ^
    //       |      |--------------------|.      |
    //       |-----------------------------------|

    this._input.connect(this._output);
    this._input.connect(this._wetGain);
    this._wetGain.connect(this._filter);
    this._filter.connect(this._delay);
    this._delay.connect(this._output);
    this._delay.connect(this._wetGain);
  }

  public get input(): AudioNode {
    return this._input;
  }

  public get wet(): AudioParam {
    return this._wetGain.gain;
  }

  public get delayTime(): AudioParam {
    return this._delay.delayTime;
  }

  public get cutoff(): AudioParam {
    return this._filter.frequency;
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
