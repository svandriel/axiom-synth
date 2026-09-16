import type { OscillatorConfigSource } from './oscillator-config-source';
import type { Destroyable } from './destroyable';

export class Oscillator implements Destroyable {
  private osc: OscillatorNode | null = null;
  private readonly activeOscillators = new Set<OscillatorNode>();
  private readonly stoppedOscillators = new Set<OscillatorNode>();
  private readonly waveformUnsubscribers = new Map<
    OscillatorNode,
    () => void
  >();
  private readonly gain: GainNode;
  private readonly configSource: OscillatorConfigSource;
  private readonly ctxt: AudioContext;
  private destroyed = false;

  constructor(ctxt: AudioContext, configSource: OscillatorConfigSource) {
    this.ctxt = ctxt;
    this.configSource = configSource;
    this.gain = ctxt.createGain();
    this.gain.gain.setValueAtTime(0, this.ctxt.currentTime);
    this.configSource.gainSource.connect(this.gain.gain);
  }

  connect(destination: AudioParam | AudioNode) {
    if (destination instanceof AudioParam) {
      this.gain.connect(destination);
    } else {
      this.gain.connect(destination);
    }
  }

  disconnect(destination: null | AudioParam | AudioNode = null) {
    if (destination === null) {
      this.gain.disconnect();
    } else if (destination instanceof AudioParam) {
      this.gain.disconnect(destination);
    } else {
      this.gain.disconnect(destination);
    }
  }

  start(frequency: number, now: number) {
    if (this.osc) {
      this.stop();
    }
    const osc = this.ctxt.createOscillator();
    osc.type = this.configSource.waveForm.value;
    const { unsubscribe } = this.configSource.waveForm.subscribe(value => {
      osc.type = value;
    });
    osc.onended = () => {
      unsubscribe();
      this.waveformUnsubscribers.delete(osc);
      this.activeOscillators.delete(osc);
      this.stoppedOscillators.delete(osc);
      if (this.configSource.modInputs) {
        for (const modInput of this.configSource.modInputs) {
          modInput.disconnect(osc.detune);
        }
      }
      this.configSource.detuneSource.disconnect(osc.detune);
      // Detach the node once it has stopped so it does not linger, still
      // connected to the gain, in the audio graph.
      osc.disconnect();
    };
    this.configSource.detuneSource.connect(osc.detune);
    if (this.configSource.modInputs) {
      for (const modInput of this.configSource.modInputs) {
        modInput.connect(osc.detune);
      }
    }
    osc.connect(this.gain);
    osc.frequency.setValueAtTime(frequency, now);
    osc.start(now);

    this.osc = osc;
    this.activeOscillators.add(osc);
    this.waveformUnsubscribers.set(osc, unsubscribe);
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
    if (!this.osc) {
      return;
    }
    const osc = this.osc;
    this.osc = null;
    if (this.stoppedOscillators.has(osc)) {
      return;
    }
    this.stoppedOscillators.add(osc);
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
    this.activeOscillators.forEach(osc => {
      osc.onended = null;
      this.waveformUnsubscribers.get(osc)?.();
      this.configSource.detuneSource.disconnect(osc.detune);
      if (this.configSource.modInputs) {
        for (const modInput of this.configSource.modInputs) {
          modInput.disconnect(osc.detune);
        }
      }
      if (!this.stoppedOscillators.has(osc)) {
        osc.stop();
      }
      osc.disconnect();
    });
    this.activeOscillators.clear();
    this.stoppedOscillators.clear();
    this.waveformUnsubscribers.clear();
    this.osc = null;
    this.configSource.gainSource.disconnect(this.gain.gain);
    this.disconnect();
  }
}
