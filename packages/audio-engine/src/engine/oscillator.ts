import type { OscillatorConfigSource } from './oscillator-config-source';

export class Oscillator {
  private osc: OscillatorNode | null = null;
  private readonly gain: GainNode;
  private readonly configSource: OscillatorConfigSource;
  private readonly ctxt: AudioContext;

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
      this.configSource.detuneSource.disconnect(osc.detune);
      // Detach the node once it has stopped so it does not linger, still
      // connected to the gain, in the audio graph.
      osc.disconnect();
    };
    this.configSource.detuneSource.connect(osc.detune);
    osc.connect(this.gain);
    osc.frequency.setValueAtTime(frequency, now);
    osc.start(now);

    this.osc = osc;
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
    if (time === undefined) {
      this.osc.stop();
    } else {
      this.osc.stop(time);
    }
    this.osc = null;
  }
}
