export abstract class Voice {
  protected readonly ctxt: AudioContext;
  protected readonly audioSink: AudioNode;

  private readonly chokeTime = 0.003;

  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  public currentNote: number | null = null;
  public endTime = 0;
  public lastUsed = 0;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    this.ctxt = ctxt;
    this.audioSink = audioSink;
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
    this.internalFastChoke(this.chokeTime, now);
    this.endTime = now + this.chokeTime;
  }

  protected abstract internalFastChoke(chokeTime: number, now: number): void;

  noteOn(noteNumber: number, velocity: number, startTimeOffset: number) {
    const now = this.ctxt.currentTime + startTimeOffset;

    this.currentNote = noteNumber;
    this.lastUsed = this.ctxt.currentTime + startTimeOffset;

    console.log(`[${now.toFixed(4)}] noteOn(${noteNumber})`);

    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    this.internalNoteOn(noteNumber, velocity, now);

    this.endTime = Infinity;
  }

  protected abstract internalNoteOn(
    noteNumber: number,
    velocity: number,
    now: number,
  ): void;

  noteOff() {
    const now = this.ctxt.currentTime;
    console.log(`[${now.toFixed(4)}] noteOff()`);

    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }

    const { silentAt } = this.internalNoteOff(now);

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

  protected abstract internalNoteOff(now: number): { silentAt: number };

  destroy() {
    if (this.cleanupTimer !== null) {
      clearTimeout(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
