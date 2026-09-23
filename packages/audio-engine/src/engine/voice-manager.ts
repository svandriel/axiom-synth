import { resumeIfSuspended } from './helpers';
import type { Voice } from './voice';

export class VoiceManager<V extends Voice> {
  private readonly maxVoices: number;
  private voicePool: V[] | undefined;
  private readonly noteToVoiceMap = new Map<number, V>();
  private readonly ctxt: AudioContext;
  private readonly createVoice: () => V;

  constructor(
    ctxt: AudioContext,
    createVoice: () => V,
    options?: { maxVoices?: number },
  ) {
    this.ctxt = ctxt;
    this.createVoice = createVoice;
    this.maxVoices = options?.maxVoices ?? 16;
  }

  noteOn(noteNumber: number, velocity: number): void {
    resumeIfSuspended(this.ctxt);
    const now = this.ctxt.currentTime;
    const voicePool = this.ensureVoicePool();

    if (this.noteToVoiceMap.has(noteNumber)) {
      console.log(
        `[${now.toFixed(4)}] noteOn(${noteNumber}) - already active, retriggering`,
      );
      this.noteOff(noteNumber);
    }

    let targetVoice = voicePool.find(voice => voice.isAvailable(now));
    let startDelay = 0;

    if (targetVoice) {
      console.log(
        `[${now.toFixed(4)}] Voice ${targetVoice.id} available for note ${noteNumber}`,
      );
    } else {
      targetVoice = this.pickStealVictim(now, voicePool);

      if (targetVoice) {
        const age = now - targetVoice.lastUsed;
        console.warn(
          `[${now.toFixed(4)}] Voice stealing triggered for note ${noteNumber} - victim is ${targetVoice.id}, age ${age.toFixed(1)} s`,
        );
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
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - releasing voice`,
      );
      voice.noteOff();
      this.noteToVoiceMap.delete(noteNumber);
    } else {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - no active voice found`,
      );
    }
  }

  allNotesOff(): void {
    console.log('allNotesOff');
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

  private pickStealVictim(now: number, voicePool: V[]): V | null {
    const heldVoices = new Set(this.noteToVoiceMap.values());
    let bestReleased: V | null = null;
    let bestProgress = -Infinity;
    let oldestHeld: V | null = null;
    let oldestTime = Infinity;

    for (const voice of voicePool) {
      if (voice.isAvailable(now)) {
        continue;
      }
      if (heldVoices.has(voice)) {
        if (voice.lastUsed < oldestTime) {
          oldestTime = voice.lastUsed;
          oldestHeld = voice;
        }
        continue;
      }
      if (voice.releasedAt === null) {
        continue;
      }
      const tailMs = voice.endTime - voice.releasedAt;
      const progress = tailMs > 0 ? (now - voice.releasedAt) / tailMs : 1;
      if (progress > bestProgress) {
        bestProgress = progress;
        bestReleased = voice;
      }
    }

    return bestReleased ?? oldestHeld;
  }
}
