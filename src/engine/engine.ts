import { Voice } from './voice';

export class AudioEngine {
  public readonly ctxt: AudioContext;
  private readonly master: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly analyser: AnalyserNode;
  private readonly dry: GainNode;
  private readonly comp: DynamicsCompressorNode;

  private readonly voice: Voice;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    console.log('Initializing AudioEngine, ctxt.state:', ctxt.state);

    this.master = ctxt.createGain();
    this.master.gain.value = 0.5;
    this.filter = ctxt.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1000;
    this.filter.Q.value = 3;
    this.analyser = ctxt.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    //   const delay = ctx.createDelay(1.0);
    //   delay.delayTime.value = 0.32;
    //   const feedback = ctx.createGain();
    //   feedback.gain.value = 0.42;
    //   const delayWet = ctx.createGain();
    //   delayWet.gain.value = 0;
    this.dry = ctxt.createGain();
    this.dry.gain.value = 1;

    this.comp = ctxt.createDynamicsCompressor();

    this.filter.connect(this.dry);
    //   filter.connect(delay);

    this.dry.connect(this.master);

    //   feedback.connect(delay);
    //   delay.connect(feedback);

    //   delay.connect(delayWet);
    //   delayWet.connect(master);

    this.master.connect(this.comp);
    this.comp.connect(this.analyser);
    this.analyser.connect(ctxt.destination);

    this.voice = new Voice(this);
  }

  public ensureStarted() {
    if (this.ctxt.state === 'suspended') {
      this.ctxt.resume();
    }
  }

  public noteOn(semi: number) {
    this.ensureStarted();
    this.voice.noteOn(semi);
  }

  public noteOff() {
    this.voice.noteOff();
  }

  public get noteSignalSink() {
    return this.filter;
  }

  public destroy() {
    this.voice.destroy();
    this.comp.disconnect();
    this.analyser.disconnect();
    this.master.disconnect();
    this.filter.disconnect();
    this.dry.disconnect();
    this.ctxt.close();
  }
}
