import type { EnvelopeConfig } from '../types';

export class Envelope {
  private readonly ctxt: AudioContext;
  private readonly sink: AudioNode;
  private readonly ampEnv: GainNode;
  private readonly maxVolume = 0.2;

  constructor(ctxt: AudioContext, sink: AudioNode) {
    this.ctxt = ctxt;
    this.sink = sink;

    this.ampEnv = this.ctxt.createGain();
    this.ampEnv.gain.setValueAtTime(0, this.ctxt.currentTime);
    this.ampEnv.connect(this.sink);
  }

  get node(): AudioNode {
    return this.ampEnv;
  }

  noteOn(velocity: number, config: EnvelopeConfig, now: number) {
    const targetVolume = (velocity / 127) * this.maxVolume;

    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);

    this.ampEnv.gain.setTargetAtTime(
      targetVolume,
      now,
      config.attackSeconds / 3,
    );

    const decayStartTime = now + config.attackSeconds;
    const sustainVolume = targetVolume * config.sustainLevel;
    this.ampEnv.gain.setTargetAtTime(
      sustainVolume,
      decayStartTime,
      config.decaySeconds / 3,
    );
  }

  noteOff(config: EnvelopeConfig, now: number) {
    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    this.ampEnv.gain.setTargetAtTime(0, now, config.releaseSeconds / 3);
  }

  fastChoke(chokeTime: number, now: number) {
    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    // Explicit micro-ramp down to prevent audio artifacts/clicks
    this.ampEnv.gain.linearRampToValueAtTime(0, now + chokeTime);
  }

  disconnect() {
    this.ampEnv.disconnect();
  }
}
