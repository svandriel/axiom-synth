import type { EnvelopeConfig } from '../types';
import type { Destroyable } from './destroyable';

export class Envelope implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly ampEnv: GainNode;
  private destroyed = false;

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
    // Every attack must start from silence. Re-pinning to the current gain
    // makes stolen voices attack from the previous note's sustain level,
    // which hides the attack phase entirely.
    const minimumAttackValue =
      config.attackCurve === 'exponential' ? 0.0001 : 0;
    this.ampEnv.gain.setValueAtTime(minimumAttackValue, now);

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
    // End the fade slightly before the steal's delayed noteOn so that
    // noteOn's cancelScheduledValues() cannot erase the fade endpoint and
    // leave the gain pinned at the old note's loud level.
    const fadeLead = 0.0005;
    const fadeDuration = Math.max(chokeTime - fadeLead, 0.0001);

    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    // Explicit micro-ramp down to prevent audio artifacts/clicks
    this.ampEnv.gain.linearRampToValueAtTime(0, now + fadeDuration);
  }

  disconnect() {
    this.ampEnv.disconnect();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.disconnect();
  }
}
