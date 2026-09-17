import type { WaveFormType } from '../types';
import type { Destroyable } from './destroyable';

export class Oscillator implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly outputGain: GainNode;
  private readonly frequencySource: ConstantSourceNode;
  private readonly detuneSource: ConstantSourceNode;
  private readonly activeNodes: Set<OscillatorNode> = new Set();
  private readonly stoppedNodes: Set<OscillatorNode> = new Set();
  private current: OscillatorNode | null = null;
  private wave: WaveFormType = 'sawtooth';
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    this.outputGain = ctxt.createGain();
    this.outputGain.gain.setValueAtTime(0, ctxt.currentTime);

    this.frequencySource = ctxt.createConstantSource();
    this.frequencySource.offset.setValueAtTime(0, ctxt.currentTime);
    this.frequencySource.start();

    this.detuneSource = ctxt.createConstantSource();
    this.detuneSource.offset.setValueAtTime(0, ctxt.currentTime);
    this.detuneSource.start();
  }

  set waveform(w: WaveFormType) {
    this.wave = w;
    this.activeNodes.forEach(node => {
      node.type = w;
    });
    this.stoppedNodes.forEach(node => {
      node.type = w;
    });
  }

  /** Modulation-input jack only; never schedule on it directly. Engine ramps
   *  live on engine-owned sources, which flow a-rate through this offset. */
  get frequency(): AudioParam {
    return this.frequencySource.offset;
  }

  /** Modulation-input jack only; never schedule on it directly. */
  get detune(): AudioParam {
    return this.detuneSource.offset;
  }

  /** Modulation-input jack only; never schedule on it directly. */
  get gain(): AudioParam {
    return this.outputGain.gain;
  }

  connect(destination: AudioNode | AudioParam) {
    if (destination instanceof AudioParam) {
      this.outputGain.connect(destination);
    } else {
      this.outputGain.connect(destination);
    }
  }

  disconnect(destination: null | AudioNode | AudioParam = null) {
    if (destination === null) {
      this.outputGain.disconnect();
    } else if (destination instanceof AudioParam) {
      this.outputGain.disconnect(destination);
    } else {
      this.outputGain.disconnect(destination);
    }
  }

  start(noteHz: number, now: number) {
    if (this.current) {
      this.stop();
    }
    this.createVoiceNodes(noteHz, now);
  }

  /**
   * Stop the oscillator. With no argument it stops immediately; with a time it
   * stops silently at that time (used when a voice is stolen so the old note
   * can ring through the choke fade). Either way the node detaches itself from
   * the graph in onended.
   */
  stop(): void;
  stop(time: number): void;
  stop(time?: number) {
    if (!this.current) {
      return;
    }
    const osc = this.current;
    this.current = null;
    if (this.stoppedNodes.has(osc)) {
      return;
    }
    this.stoppedNodes.add(osc);
    if (time === undefined) {
      osc.stop();
    } else {
      osc.stop(time);
    }
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.activeNodes.forEach(osc => {
      osc.onended = null;
      if (!this.stoppedNodes.has(osc)) {
        osc.stop();
      }
    });
    this.activeNodes.forEach(osc => this.detachNode(osc));
    this.activeNodes.clear();
    this.stoppedNodes.clear();
    this.current = null;
    this.frequencySource.disconnect();
    this.frequencySource.stop();
    this.detuneSource.disconnect();
    this.detuneSource.stop();
    this.outputGain.disconnect();
  }

  /**
   * Builds the per-note oscillator node(s) and returns them. Unison will later
   * loop here, applying a per-voice detune intrinsic on each node.
   */
  private createVoiceNodes(noteHz: number, now: number): OscillatorNode[] {
    const osc = this.ctxt.createOscillator();
    osc.type = this.wave;
    osc.frequency.setValueAtTime(noteHz, now);
    this.frequencySource.connect(osc.frequency);
    this.detuneSource.connect(osc.detune);
    osc.onended = () => {
      this.frequencySource.disconnect(osc.frequency);
      this.detuneSource.disconnect(osc.detune);
      this.activeNodes.delete(osc);
      this.stoppedNodes.delete(osc);
      osc.disconnect();
    };
    osc.connect(this.outputGain);
    osc.start(now);
    this.activeNodes.add(osc);
    this.current = osc;
    return [osc];
  }

  private detachNode(osc: OscillatorNode): void {
    this.frequencySource.disconnect(osc.frequency);
    this.detuneSource.disconnect(osc.detune);
    osc.disconnect();
  }
}
