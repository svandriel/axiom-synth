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
    };
    this.configSource.detuneSource.connect(osc.detune);
    osc.connect(this.gain);
    osc.frequency.setValueAtTime(frequency, now);
    osc.start();

    this.osc = osc;
  }

  stop() {
    if (!this.osc) {
      return;
    }
    this.configSource.detuneSource.disconnect(this.osc.detune);
    this.osc.stop();
    this.osc.disconnect();
    this.osc = null;
  }
}
