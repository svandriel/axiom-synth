import type { Destroyable } from './destroyable';

export class Filter implements Destroyable {
  private readonly gain: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly keytrackSource: ConstantSourceNode;
  private readonly keytrackGain: GainNode;
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this.gain = ctxt.createGain();
    this.filter = ctxt.createBiquadFilter();
    this.gain.connect(this.filter);

    this.keytrackSource = ctxt.createConstantSource();
    this.keytrackSource.offset.value = 0;
    this.keytrackSource.start();

    this.keytrackGain = ctxt.createGain();
    this.keytrackGain.gain.value = 0;
    this.keytrackSource.connect(this.keytrackGain);
    this.keytrackGain.connect(this.filter.detune);
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

  get q(): AudioParam {
    return this.filter.Q;
  }

  get keytrack(): AudioParam {
    return this.keytrackGain.gain;
  }

  noteOn(noteNumber: number, now: number): void {
    this.keytrackSource.offset.setValueAtTime(100 * noteNumber, now);
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

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.gain.disconnect();
    this.filter.disconnect();
    this.keytrackSource.disconnect();
    this.keytrackSource.stop();
    this.keytrackGain.disconnect();
  }
}
