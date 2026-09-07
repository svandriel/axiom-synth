import type { AudioEngine } from './engine';

export class Voice {
  private readonly ctxt: AudioContext;
  private readonly env: GainNode;
  private readonly oscillators: OscillatorNode[] = [];
  private started: boolean = false;

  constructor(engine: AudioEngine) {
    this.ctxt = engine.ctxt;
    this.env = this.ctxt.createGain();

    const osc1 = this.ctxt.createOscillator();
    osc1.type = 'sawtooth';
    osc1.connect(this.env);

    const osc2 = this.ctxt.createOscillator();
    osc2.type = 'sawtooth';
    osc2.connect(this.env);

    this.oscillators.push(osc1);
    this.oscillators.push(osc2);

    this.env.connect(engine.noteSignalSink);
    // var sub = null;
    // if (subOn) {
    //     sub = ctx.createOscillator(); sub.type = 'sine'; sub.frequency.value = freqOf(semi) / 2;
    //     var subG = ctx.createGain(); subG.gain.value = 0.5;
    //     sub.connect(subG); subG.connect(env); sub.start(now);
    // }
  }

  noteOn(semi: number) {
    const now = this.ctxt.currentTime;

    this.oscillators[0].frequency.value = freqOf(semi + 0.04);
    this.oscillators[1].frequency.value = freqOf(semi - 0.04);

    this.env.gain.setValueAtTime(0.0001, now);
    this.env.gain.exponentialRampToValueAtTime(0.35, now + 0.012);
    this.env.gain.exponentialRampToValueAtTime(0.22, now + 0.25);

    if (!this.started) {
      this.started = true;
      this.oscillators.forEach(osc => osc.start(now));
    }
  }

  noteOff() {
    const now = this.ctxt.currentTime;
    this.env.gain.cancelScheduledValues(now);
    this.env.gain.setValueAtTime(this.env.gain.value, now);
    this.env.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
  }

  destroy() {
    if (this.started) {
      this.oscillators.forEach(osc => {
        osc.stop();
        osc.disconnect();
      });
    }
    this.env.disconnect();
  }
}

function freqOf(semi: number) {
  return 261.6256 * Math.pow(2, semi / 12);
}
