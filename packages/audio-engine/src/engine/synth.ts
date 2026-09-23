import type { Destroyable } from './destroyable';
import { resumeIfSuspended } from './helpers';
import type { Voice } from './voice';
import { VoiceManager } from './voice-manager';

export abstract class Synth<V extends Voice> implements Destroyable {
  protected readonly ctxt: AudioContext;
  protected readonly audioSink: AudioNode;
  protected destroyed = false;

  private readonly voiceManager: VoiceManager<V>;

  constructor(
    ctxt: AudioContext,
    audioSink: AudioNode,
    options?: { maxVoices?: number },
  ) {
    this.ctxt = ctxt;
    this.audioSink = audioSink;
    this.voiceManager = new VoiceManager(
      ctxt,
      () => this.createVoice(),
      options,
    );
  }

  protected abstract createVoice(): V;

  noteOn(noteNumber: number, velocity: number) {
    if (this.destroyed) {
      return;
    }
    resumeIfSuspended(this.ctxt);
    this.voiceManager.noteOn(noteNumber, velocity);
  }

  noteOff(noteNumber: number) {
    if (this.destroyed) {
      return;
    }
    this.voiceManager.noteOff(noteNumber);
  }

  allNotesOff() {
    if (this.destroyed) {
      return;
    }
    this.voiceManager.allNotesOff();
  }

  destroy() {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.voiceManager.destroy();
  }
}
