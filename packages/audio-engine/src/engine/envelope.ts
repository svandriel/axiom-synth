import type { EnvelopeConfig } from '../types';

export class Envelope {
  private readonly ctxt: AudioContext;
  private readonly ampEnv: GainNode;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    this.ampEnv = this.ctxt.createGain();
    this.ampEnv.gain.setValueAtTime(0, this.ctxt.currentTime);
  }

  get node(): AudioNode {
    return this.ampEnv;
  }

  noteOn(velocity: number, config: EnvelopeConfig, now: number) {
    const targetVolume = velocity / 127;

    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);

    switch (config.attackCurve) {
      case 'analog':
        this.ampEnv.gain.setTargetAtTime(
          targetVolume,
          now,
          config.attackSeconds / 3,
        );
        break;
      case 'exponential':
        this.ampEnv.gain.exponentialRampToValueAtTime(
          targetVolume,
          now + config.attackSeconds,
        );
        break;
      case 'linear':
        this.ampEnv.gain.linearRampToValueAtTime(
          targetVolume,
          now + config.attackSeconds,
        );
        break;
      default:
        throw new Error(`Unsupported attack curve: ${config.attackCurve}`);
    }

    const decayStartTime = now + config.attackSeconds;
    const sustainVolume = targetVolume * config.sustainLevel;

    switch (config.decayCurve) {
      case 'analog':
        this.ampEnv.gain.setTargetAtTime(
          sustainVolume,
          decayStartTime,
          config.decaySeconds / 3,
        );
        break;
      case 'exponential':
        this.ampEnv.gain.exponentialRampToValueAtTime(
          sustainVolume,
          decayStartTime + config.decaySeconds,
        );
        break;
      case 'linear':
        this.ampEnv.gain.linearRampToValueAtTime(
          sustainVolume,
          decayStartTime + config.decaySeconds,
        );
        break;
      default:
        throw new Error(`Unsupported decay curve: ${config.decayCurve}`);
    }
  }

  noteOff(config: EnvelopeConfig, now: number) {
    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);

    switch (config.releaseCurve) {
      case 'analog':
        this.ampEnv.gain.setTargetAtTime(0, now, config.releaseSeconds / 3);
        break;
      case 'exponential':
        this.ampEnv.gain.exponentialRampToValueAtTime(
          0,
          now + config.releaseSeconds,
        );
        break;
      case 'linear':
        this.ampEnv.gain.linearRampToValueAtTime(
          0,
          now + config.releaseSeconds,
        );
        break;
      default:
        throw new Error(`Unsupported release curve: ${config.releaseCurve}`);
    }
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
