import type { EnvelopeConfig } from '../types/envelope-config';
import { Envelope } from './envelope';

export abstract class Voice {
  protected readonly ctxt: AudioContext;
  protected readonly audioSink: AudioNode;

  private readonly chokeTime = 0.003;

  protected readonly ampEnvelope: Envelope;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  public currentNote: number | null = null;
  public endTime = 0;
  public lastUsed = 0;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    this.ctxt = ctxt;
    this.audioSink = audioSink;

    this.ampEnvelope = new Envelope(ctxt, audioSink);
  }

  protected abstract destroyOscillators(): void;

  /**
   * Evaluates voice availability based purely on the audio hardware clock pipeline state
   */
  isAvailable(now: number): boolean {
    return this.currentNote === null || now >= this.endTime;
  }

  /**
   * Executes a micro-fade parameter envelope to truncate a stolen note cleanly
   */
  fastChoke(now: number): void {
    this.ampEnvelope.fastChoke(this.chokeTime, now);
    this.endTime = now + this.chokeTime;
  }

  noteOn(
    noteNumber: number,
    velocity: number,
    ampEnvelopeConfig: EnvelopeConfig,
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

    this.internalNoteOn(noteNumber, velocity, ampEnvelopeConfig, now);

    this.endTime = Infinity;
  }

  protected abstract internalNoteOn(
    noteNumber: number,
    velocity: number,
    ampEnvelopeConfig: EnvelopeConfig,
    now: number,
  ): void;

  noteOff(ampEnvelopeConfig: EnvelopeConfig) {
    const now = this.ctxt.currentTime;
    console.log(`[${now.toFixed(4)}] noteOff()`);

    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const { silentAt } = this.internalNoteOff(ampEnvelopeConfig, now);

    // 5 time-constants completely flattens setTargetAtTime
    this.endTime = now + silentAt * 5;

    this.cleanupTimer = setTimeout(
      () => {
        this.destroyOscillators();
        this.currentNote = null;
        this.cleanupTimer = null;
      },
      silentAt * 5 * 1000,
    );
  }

  protected abstract internalNoteOff(
    ampEnvelopeConfig: EnvelopeConfig,
    now: number,
  ): { silentAt: number };

  destroy() {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.ampEnvelope.disconnect();
  }
}
