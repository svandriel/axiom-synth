import { Voice } from '../engine/voice';

export class TestVoice extends Voice {
  readonly label: string;
  noteOnCalls: Array<{ note: number; velocity: number; now: number }> = [];
  fastChokeCalls: Array<{ chokeTime: number; now: number }> = [];
  noteOffCount = 0;
  silentAt = 0.2;

  constructor(ctxt: AudioContext, audioSink: AudioNode, label: string) {
    super(ctxt, audioSink);
    this.label = label;
  }

  protected internalNoteOn(note: number, velocity: number, now: number): void {
    this.noteOnCalls.push({ note, velocity, now });
  }

  protected internalNoteOff(_now: number): { silentAt: number } {
    this.noteOffCount++;
    return { silentAt: this.silentAt };
  }

  protected internalFastChoke(chokeTime: number, now: number): void {
    this.fastChokeCalls.push({ chokeTime, now });
  }

  protected onSoundStop(): void {}
}
