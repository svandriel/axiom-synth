import type {
  Oscillator,
  OscillatorEndSubscription,
  WaveFormType,
} from '@axiom/audio-engine';
import { MoogOscillatorWorkletNode } from './moog-oscillator-worklet-node';

export class MoogOscillator implements Oscillator {
  private readonly ctxt: AudioContext;
  private readonly wasmModule: WebAssembly.Module;
  private readonly outputGain: GainNode;
  private readonly frequencySource: ConstantSourceNode;
  private readonly detuneSource: ConstantSourceNode;
  private readonly waveformSource: ConstantSourceNode;
  private readonly activeNodes: Set<MoogOscillatorWorkletNode> = new Set();
  private readonly stoppedNodes: Set<MoogOscillatorWorkletNode> = new Set();
  private readonly endedSubscribers = new Set<() => void>();
  private current: MoogOscillatorWorkletNode | null = null;
  private wave: WaveFormType = 'sawtooth';
  private destroyed = false;

  constructor(ctxt: AudioContext, wasmModule: WebAssembly.Module) {
    this.ctxt = ctxt;
    this.wasmModule = wasmModule;

    this.outputGain = ctxt.createGain();
    this.outputGain.gain.value = 1;

    this.frequencySource = ctxt.createConstantSource();
    this.frequencySource.offset.value = 0;
    this.frequencySource.start();

    this.detuneSource = ctxt.createConstantSource();
    this.detuneSource.offset.value = 0;
    this.detuneSource.start();

    this.waveformSource = ctxt.createConstantSource();
    this.waveformSource.offset.value = 2.5; // Halfway
    this.waveformSource.start();
  }

  get waveform(): WaveFormType {
    return this.wave;
  }

  set waveform(w: WaveFormType) {
    this.wave = w;
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
  get waveformType(): AudioParam {
    return this.waveformSource.offset;
  }

  /** Modulation-input jack only; never schedule on it directly. */
  get gain(): AudioParam {
    return this.outputGain.gain;
  }

  connect(destination: AudioNode | AudioParam): void {
    if (destination instanceof AudioParam) {
      this.outputGain.connect(destination);
    } else {
      this.outputGain.connect(destination);
    }
  }

  disconnect(destination: null | AudioNode | AudioParam = null): void {
    if (destination === null) {
      this.outputGain.disconnect();
    } else if (destination instanceof AudioParam) {
      this.outputGain.disconnect(destination);
    } else {
      this.outputGain.disconnect(destination);
    }
  }

  start(now: number): void {
    if (this.current) {
      this.stop();
    }
    this.createVoiceNodes(now);
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
    osc.stop(time ?? this.ctxt.currentTime);
  }

  onEnded(subscriber: () => void): OscillatorEndSubscription {
    this.endedSubscribers.add(subscriber);
    let subscribed = true;
    return {
      unsubscribe: () => {
        if (!subscribed) return;
        subscribed = false;
        this.endedSubscribers.delete(subscriber);
      },
    };
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.endedSubscribers.clear();
    this.activeNodes.forEach(osc => {
      osc.onended = null;
      if (!this.stoppedNodes.has(osc)) {
        osc.stop(this.ctxt.currentTime);
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
    this.waveformSource.disconnect();
    this.waveformSource.stop();
    this.outputGain.disconnect();
  }

  /**
   * Builds the per-note oscillator node.
   */
  private createVoiceNodes(now: number) {
    const osc = new MoogOscillatorWorkletNode(this.ctxt, this.wasmModule);
    osc.frequency.setValueAtTime(0, now);
    this.frequencySource.connect(osc.frequency);
    this.detuneSource.connect(osc.detune);
    this.waveformSource.connect(osc.waveform);
    osc.onended = () => {
      console.log('[moog-oscillator] onended');
      this.frequencySource.disconnect(osc.frequency);
      this.detuneSource.disconnect(osc.detune);
      this.activeNodes.delete(osc);
      this.stoppedNodes.delete(osc);
      osc.disconnect();
      this.current = this.current === osc ? null : this.current;
      [...this.endedSubscribers].forEach(subscriber => subscriber());
    };
    osc.connect(this.outputGain);
    osc.start(now);
    this.activeNodes.add(osc);
    this.current = osc;
  }

  private detachNode(osc: MoogOscillatorWorkletNode): void {
    this.frequencySource.disconnect(osc.frequency);
    this.detuneSource.disconnect(osc.detune);
    osc.destroy();
  }
}
