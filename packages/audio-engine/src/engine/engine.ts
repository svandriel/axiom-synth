import type { Destroyable } from './destroyable';
import { FeedbackDelay } from './feedback-delay';
import { resumeIfSuspended } from './helpers';
import { Meter } from './meter';
import { createSawWorkletNode } from '@axiom/axiom-native';

export class AudioEngine implements Destroyable {
  public readonly ctxt: AudioContext;
  public readonly masterInput: GainNode;
  private readonly master: GainNode;
  private readonly meter: Meter;
  private readonly analyser: AnalyserNode;
  private readonly comp: DynamicsCompressorNode;
  private readonly feedbackDelay: FeedbackDelay;
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    this.masterInput = ctxt.createGain();
    this.masterInput.gain.value = 1.0;
    this.master = ctxt.createGain();
    this.master.gain.value = 0.5;
    this.meter = new Meter(ctxt);
    this.analyser = ctxt.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.comp = ctxt.createDynamicsCompressor();

    this.feedbackDelay = new FeedbackDelay(ctxt);
    this.feedbackDelay.wet.setValueAtTime(0.2, ctxt.currentTime);
    this.feedbackDelay.cutoff.setValueAtTime(400, ctxt.currentTime);
    this.feedbackDelay.delayTime.setValueAtTime(0.55, ctxt.currentTime);

    this.masterInput.connect(this.feedbackDelay.input);
    this.feedbackDelay.connect(this.master);
    this.master.connect(this.comp);
    this.comp.connect(this.analyser);
    this.comp.connect(this.meter.input);
    this.analyser.connect(ctxt.destination);

    createSawWorkletNode(this.ctxt).then(node => {
      console.log('node', node);
      // node.connect(this.master);
    });
  }

  getScopeData(buffer: Float32Array<ArrayBuffer>) {
    this.analyser.getFloatTimeDomainData(buffer);
  }

  get meterLevel(): number {
    return this.meter.value;
  }

  ensureStarted() {
    resumeIfSuspended(this.ctxt);
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.meter.destroy();
    this.comp.disconnect();
    this.analyser.disconnect();
    this.masterInput.disconnect();
    this.master.disconnect();
    this.ctxt.close();
  }
}
