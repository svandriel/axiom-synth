import type { EnvelopeConfig } from '../types/envelope-config';
import { Envelope } from './envelope';

export abstract class Voice {
  protected readonly ctxt: AudioContext;
  protected readonly audioSink: AudioNode;

  private readonly chokeTime = 0.003;

  protected readonly ampEnvelope: Envelope;
  // private readonly filterEnv: GainNode;
  private oscillatorsActive = false;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  // private readonly filter: BiquadFilterNode;
  public currentNote: number | null = null;
  public endTime = 0;
  public lastUsed = 0;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    this.ctxt = ctxt;
    this.audioSink = audioSink;

    this.ampEnvelope = new Envelope(ctxt, audioSink);
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
   * Executes a micro-fade parameter envelope to truncate a stolen note cleanly
   */
  fastChoke(time: number): void {
    this.ampEnvelope.fastChoke(this.chokeTime, time);
    this.endTime = time + this.chokeTime;
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
    this.setOscillatorNote(noteNumber, now);

    this.ampEnvelope.noteOn(velocity, ampEnvelope, now);

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

    this.ampEnvelope.noteOff(ampEnvelope, now);

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
    this.ampEnvelope.disconnect();
    // this.filterEnv.disconnect();
    // this.filter.disconnect();
  }
}
