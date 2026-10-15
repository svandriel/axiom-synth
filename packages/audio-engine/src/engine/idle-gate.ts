import { Analyser } from './analyser';
import type { Destroyable } from './destroyable';
import { Observable } from '../utils/observable';

/** Time-domain samples per silence check; power of two, cheap to analyse. */
export const SILENCE_FFT_SIZE = 32;
/** How often the gate checks for silence, in milliseconds. */
export const SILENCE_POLL_INTERVAL_MS = 250;
/** Time-domain magnitude at or below which a sample counts as silence. */
export const SILENCE_THRESHOLD = 1e-4;
/** Continuous silence, in seconds, before the gate closes. */
export const IDLE_DEBOUNCE_SECONDS = 1;

/**
 * An inline valve (same shape as Filter/Reverb) placed at the tail of a
 * subgraph. While its input is silent it cuts the internal input -> output link,
 * leaving the whole upstream subgraph unreachable from the destination so it
 * stops rendering. `activate()` restores the link synchronously.
 */
export class IdleGate implements Destroyable {
  private readonly _input: GainNode;
  private readonly _output: GainNode;
  private readonly analyser: Analyser;
  private readonly pollIntervalId: ReturnType<typeof setInterval>;
  private silentSeconds = 0;
  private open = true;
  private destroyed = false;
  public readonly idle = new Observable<boolean>(false);

  constructor(ctxt: AudioContext) {
    this._input = ctxt.createGain();
    this._output = ctxt.createGain();
    this._input.connect(this._output);

    this.analyser = new Analyser(ctxt, {
      size: SILENCE_FFT_SIZE,
      type: 'timeDomain',
    });
    this._output.connect(this.analyser.input);

    this.pollIntervalId = setInterval(
      () => this.poll(),
      SILENCE_POLL_INTERVAL_MS,
    );
  }

  get input(): AudioNode {
    return this._input;
  }

  connect(destination: AudioNode): void {
    this._output.connect(destination);
  }

  disconnect(): void;
  disconnect(destination: AudioNode): void;
  disconnect(destination?: AudioNode): void {
    if (destination) {
      this._output.disconnect(destination);
    } else {
      this._output.disconnect();
    }
  }

  activate(): void {
    if (this.destroyed) {
      return;
    }
    this.silentSeconds = 0;
    if (!this.open) {
      this.open = true;
      this._input.connect(this._output);
      this.idle.value = false;
      console.log('[IdleGate] opened — activity resumed, FX island active');
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    clearInterval(this.pollIntervalId);
    if (this.open) {
      this.close();
    }
    try {
      this._output.disconnect(this.analyser.input);
    } catch {
      // Already disconnected.
    }
    this.analyser.destroy();
    this._input.disconnect();
    this._output.disconnect();
  }

  private poll(): void {
    if (this.destroyed) {
      return;
    }
    if (this.isQuiet()) {
      this.silentSeconds += SILENCE_POLL_INTERVAL_MS / 1000;
      if (this.open && this.silentSeconds >= IDLE_DEBOUNCE_SECONDS) {
        this.close();
      }
      return;
    }
    this.silentSeconds = 0;
    if (!this.open) {
      this.activate();
    }
  }

  private isQuiet(): boolean {
    const buffer = this.analyser.getBuffer();
    for (let i = 0; i < buffer.length; i++) {
      if (Math.abs(buffer[i]!) > SILENCE_THRESHOLD) {
        return false;
      }
    }
    return true;
  }

  private close(): void {
    this.open = false;
    this._input.disconnect(this._output);
    this.idle.value = true;
    console.log('[IdleGate] closed — output silent, FX island asleep');
  }
}
