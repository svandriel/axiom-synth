import type { AudioEngine } from './engine';

export class Voice {
  private readonly ctxt: AudioContext;
  private readonly ampEnv: GainNode;
  // private readonly filterEnv: GainNode;
  private readonly oscillators: OscillatorNode[] = [];
  // private readonly filter: BiquadFilterNode;
  private started: boolean = false;
  public currentSemi: number | null = null;

  constructor(engine: AudioEngine) {
    this.ctxt = engine.ctxt;
    this.ampEnv = this.ctxt.createGain();
    // this.filterEnv = this.ctxt.createGain();
    // this.filter = this.ctxt.createBiquadFilter();

    // this.filterEnv.connect(this.filter.frequency);

    const osc1 = this.ctxt.createOscillator();
    osc1.type = 'sawtooth';
    osc1.connect(this.ampEnv);

    const osc2 = this.ctxt.createOscillator();
    osc2.type = 'sawtooth';
    osc2.connect(this.ampEnv);

    const osc3 = this.ctxt.createOscillator();
    osc3.type = 'triangle';
    osc3.connect(this.ampEnv);

    this.oscillators.push(osc1);
    this.oscillators.push(osc2);
    this.oscillators.push(osc3);

    this.ampEnv.connect(engine.noteSignalSink);
  }

  noteOn(semi: number) {
    this.currentSemi = semi;

    const now = this.ctxt.currentTime;
    console.log(`[${now.toFixed(4)}] noteOn(${semi})`);

    this.oscillators[0].frequency.value = freqOf(semi + 0.011916);
    this.oscillators[1].frequency.value = freqOf(semi - 0.011916);
    this.oscillators[2].frequency.value = freqOf(semi - 12);

    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(0.0001, now);
    this.ampEnv.gain.exponentialRampToValueAtTime(0.35, now + 0.012);
    this.ampEnv.gain.exponentialRampToValueAtTime(0.22, now + 0.25);

    if (!this.started) {
      this.started = true;
      this.oscillators.forEach(osc => osc.start(now));
    }
  }

  noteOff() {
    const now = this.ctxt.currentTime;
    console.log(`[${now.toFixed(4)}] noteOff()`);
    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    this.ampEnv.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
  }

  destroy() {
    if (this.started) {
      this.oscillators.forEach(osc => {
        osc.stop();
        osc.disconnect();
      });
    }
    this.ampEnv.disconnect();
  }
}

function freqOf(semi: number) {
  return 261.6256 * Math.pow(2, semi / 12);
}
