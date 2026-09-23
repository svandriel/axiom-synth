import { resumeIfSuspended } from './helpers';
import type { Voice } from './voice';

export class VoiceManager<V extends Voice> {
  private readonly maxVoices: number;
  private voicePool: V[] | undefined;
  private readonly noteToVoiceMap = new Map<number, V>();

  constructor(
    private readonly ctxt: AudioContext,
    private readonly createVoice: () => V,
    options?: { maxVoices?: number },
  ) {
    this.maxVoices = options?.maxVoices ?? 16;
  }

  noteOn(noteNumber: number, velocity: number): void {
    resumeIfSuspended(this.ctxt);
    const now = this.ctxt.currentTime;
    const voicePool = this.ensureVoicePool();

    if (this.noteToVoiceMap.has(noteNumber)) {
      this.noteOff(noteNumber);
    }

    let targetVoice = voicePool.find(voice => voice.isAvailable(now));
    let startDelay = 0;

    if (!targetVoice) {
      let oldestTime = Infinity;
      let oldestVoice: V | null = null;
      for (const voice of voicePool) {
        if (voice.lastUsed < oldestTime) {
          oldestTime = voice.lastUsed;
          oldestVoice = voice;
        }
      }

      if (oldestVoice) {
        targetVoice = oldestVoice;
        for (const [note, voice] of this.noteToVoiceMap.entries()) {
          if (voice === targetVoice) {
            this.noteToVoiceMap.delete(note);
          }
        }
        targetVoice.fastChoke(now);
        startDelay = targetVoice.chokeDuration;
      }
    }

    if (targetVoice) {
      targetVoice.noteOn(noteNumber, velocity, startDelay);
      this.noteToVoiceMap.set(noteNumber, targetVoice);
    }
  }

  noteOff(noteNumber: number): void {
    const voice = this.noteToVoiceMap.get(noteNumber);
    if (voice) {
      voice.noteOff();
      this.noteToVoiceMap.delete(noteNumber);
    }
  }

  allNotesOff(): void {
    for (const [note, voice] of this.noteToVoiceMap.entries()) {
      voice.noteOff();
      this.noteToVoiceMap.delete(note);
    }
  }

  destroy(): void {
    this.noteToVoiceMap.clear();
    this.voicePool?.forEach(voice => voice.destroy());
  }

  private ensureVoicePool(): V[] {
    if (this.voicePool === undefined) {
      this.voicePool = Array.from({ length: this.maxVoices }, () =>
        this.createVoice(),
      );
    }
    return this.voicePool;
  }
}
