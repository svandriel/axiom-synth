import type { ActivitySink } from './activity-sink';
import type { Destroyable } from './destroyable';
import { FeedbackDelay } from './feedback-delay';
import { resumeIfSuspended } from './helpers';
import { IdleGate } from './idle-gate';
import { Meter } from './meter';
import { Reverb } from './reverb';

export class AudioEngine implements Destroyable, ActivitySink {
  public readonly ctxt: AudioContext;
  public readonly masterInput: GainNode;
  private readonly master: GainNode;
  private readonly meter: Meter;
  private readonly analyser: AnalyserNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly feedbackDelay: FeedbackDelay;
  private readonly reverb: Reverb;
  private readonly idleGate: IdleGate;
  private destroyed = false;
  public readonly id: number;

  constructor(opts: Partial<AudioContextOptions> = {}) {
    this.ctxt = new AudioContext(opts);
    this.id = Math.round(new Date().getTime() / 1000);
    console.log(`Creating AudioEngine #${this.id}`);

    this.masterInput = this.ctxt.createGain();
    this.masterInput.gain.value = 1.0;
    this.master = this.ctxt.createGain();
    this.master.gain.value = 0.5;
    this.meter = new Meter(this.ctxt);
    this.analyser = this.ctxt.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.comp = this.ctxt.createDynamicsCompressor();

    this.feedbackDelay = new FeedbackDelay(this.ctxt);
    this.feedbackDelay.wet.setValueAtTime(0.2, this.ctxt.currentTime);
    this.feedbackDelay.cutoff.setValueAtTime(400, this.ctxt.currentTime);
    this.feedbackDelay.delayTime.setValueAtTime(0.55, this.ctxt.currentTime);

    this.reverb = new Reverb(this.ctxt);
    this.reverb.wet.setValueAtTime(0.4, this.ctxt.currentTime);
    this.idleGate = new IdleGate(this.ctxt);

    this.masterInput.connect(this.feedbackDelay.input);
    this.feedbackDelay.connect(this.reverb.input);
    this.reverb.connect(this.idleGate.input);
    this.idleGate.connect(this.master);

    // Master chain; analyser and meter are leaf taps, not in the path.
    this.master.connect(this.comp);
    this.comp.connect(this.ctxt.destination);
    this.comp.connect(this.analyser);
    this.comp.connect(this.meter.input);
  }

  getScopeData(buffer: Float32Array<ArrayBuffer>) {
    this.analyser.getFloatTimeDomainData(buffer);
  }

  get meterLevel(): number {
    return this.meter.value;
  }

  get reverbBuffer(): AudioBuffer | null {
    return this.reverb.buffer;
  }

  set reverbBuffer(buffer: AudioBuffer | null) {
    this.reverb.buffer = buffer;
  }

  ensureStarted() {
    resumeIfSuspended(this.ctxt);
  }

  activate(): void {
    this.idleGate.activate();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    console.log(`Destroying AudioEngine ${this.id}`);
    this.destroyed = true;
    this.meter.destroy();
    this.comp.disconnect();
    this.analyser.disconnect();
    this.masterInput.disconnect();
    this.master.disconnect();
    this.idleGate.destroy();
    this.ctxt.close();
  }
}
