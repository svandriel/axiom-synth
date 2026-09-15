import { Analyser } from './analyser';

export class Meter {
  private analyser: Analyser;

  constructor(ctxt: AudioContext) {
    this.analyser = new Analyser(ctxt, {
      size: 256,
      smoothing: 0.8,
    });
  }

  get input(): AudioNode {
    return this.analyser.input;
  }

  /**
   * Gets the root mean square (RMS) value of the audio signal.
   */
  get value(): number {
    const buffer = this.analyser.getBuffer();
    const squaredSum = buffer.reduce((acc, value) => acc + value * value, 0);
    return Math.sqrt(squaredSum / buffer.length);
  }

  connect(node: AudioNode): void {
    this.analyser.connect(node);
  }

  disconnect(): void;
  disconnect(node: AudioNode): void;
  disconnect(node?: AudioNode): void {
    if (node) {
      this.analyser.disconnect(node);
    } else {
      this.analyser.disconnect();
    }
  }

  destroy() {
    this.analyser.destroy();
  }
}
