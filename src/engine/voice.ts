import type { EnvelopeConfig } from '../types/envelope-config';

export abstract class Voice {
  protected readonly ctxt: AudioContext;
  protected readonly audioSink: AudioNode;

  protected readonly ampEnv: GainNode;
  // private readonly filterEnv: GainNode;
  private oscillatorsActive = false;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  // private readonly filter: BiquadFilterNode;
  public currentNote: number | null = null;
  public endTime = 0;
  public lastUsed = 0;

  private readonly maxVolume = 0.2;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    this.ctxt = ctxt;
    this.audioSink = audioSink;

    this.ampEnv = this.ctxt.createGain();
    this.ampEnv.gain.setValueAtTime(0, this.ctxt.currentTime);

    this.ampEnv.connect(this.audioSink);
  }

  protected abstract createOscillators(now: number): void;

  protected abstract destroyOscillators(): void;

  protected abstract setOscillatorNote(noteNumber: number, now: number): void;

  /**
   * Evaluates voice availability based purely on the audio hardware clock pipeline state
   */
  isAvailable(now: number): boolean {
    return this.currentNote === null || now >= this.endTime;
  }

  /**
   * Executes a 3ms micro-fade parameter envelope to truncate a stolen note cleanly
   */
  public fastChoke(time: number): void {
    this.ampEnv.gain.cancelScheduledValues(time);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, time);
    // Explicit micro-ramp down to prevent audio artifacts/clicks
    this.ampEnv.gain.linearRampToValueAtTime(0, time + 0.003);

    // this.filter.frequency.cancelScheduledValues(time);
    this.endTime = time + 0.003;
  }

  noteOn(
    noteNumber: number,
    velocity: number,
    ampEnvelope: EnvelopeConfig,
    startTimeOffset: number,
  ) {
    const now = this.ctxt.currentTime + startTimeOffset;

    this.currentNote = noteNumber;
    this.lastUsed = this.ctxt.currentTime + startTimeOffset;

    console.log(`[${now.toFixed(4)}] noteOn(${noteNumber})`);

    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    if (this.oscillatorsActive) {
      this.destroyOscillators();
    }

    this.createOscillators(now);

    const targetVolume = (velocity / 127) * this.maxVolume;

    this.ampEnv.gain.cancelScheduledValues(now);

    this.setOscillatorNote(noteNumber, now);

    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    this.ampEnv.gain.setTargetAtTime(
      targetVolume,
      now,
      ampEnvelope.attackSeconds / 3,
    );

    const decayStartTime = now + ampEnvelope.attackSeconds;
    const sustainVolume = targetVolume * ampEnvelope.sustainLevel;
    this.ampEnv.gain.setTargetAtTime(
      sustainVolume,
      decayStartTime,
      ampEnvelope.decaySeconds / 3,
    );

    this.oscillatorsActive = true;
    this.endTime = Infinity;
  }

  noteOff(ampEnvelope: EnvelopeConfig) {
    const now = this.ctxt.currentTime;
    console.log(`[${now.toFixed(4)}] noteOff()`);

    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    this.ampEnv.gain.setTargetAtTime(0, now, ampEnvelope.releaseSeconds / 3);

    // 5 time-constants completely flattens setTargetAtTime
    this.endTime = now + ampEnvelope.releaseSeconds * 5;

    this.cleanupTimer = setTimeout(
      () => {
        if (!this.oscillatorsActive) return;
        this.destroyOscillators();
        this.oscillatorsActive = false;
        this.currentNote = null;
        this.cleanupTimer = null;
      },
      ampEnvelope.releaseSeconds * 5 * 1000,
    );
  }

  destroy() {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    if (this.oscillatorsActive) {
      this.destroyOscillators();
      this.oscillatorsActive = false;
    }
    this.ampEnv.disconnect();
    // this.filterEnv.disconnect();
    // this.filter.disconnect();
  }
}
