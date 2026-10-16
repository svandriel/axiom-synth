import { vi } from 'vitest';
import { Voice } from '../engine/voice';

export class SpyVoice extends Voice {
  readonly noteOnCalls: {
    noteNumber: number;
    velocity: number;
    startTimeOffset: number;
  }[] = [];
  readonly noteOffSpy = vi.fn();
  readonly fastChokeSpy = vi.fn();
  readonly destroySpy = vi.fn();

  override noteOn(
    noteNumber: number,
    velocity: number,
    startTimeOffset: number,
  ): void {
    this.noteOnCalls.push({ noteNumber, velocity, startTimeOffset });
    this.currentNote = noteNumber;
    this.lastUsed = this.ctxt.currentTime + startTimeOffset;
    this.endTime = Infinity;
  }

  override noteOff(): void {
    this.noteOffSpy();
    this.currentNote = null;
  }

  override fastChoke(now: number): void {
    this.fastChokeSpy(now);
  }

  override destroy(): void {
    this.destroySpy();
  }

  protected override onSoundStop(): void {}
  protected override internalFastChoke(
    _chokeTime: number,
    _now: number,
  ): void {}
  protected override internalNoteOn(): void {}
  protected override internalNoteOff(): { silentAt: number } {
    return { silentAt: 0 };
  }
}
