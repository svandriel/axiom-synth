import type { EnvelopeConfig, FilterConfig } from '../types';
import { Voice } from './voice';

const MAX_VOICES = 16;

export class AudioEngine {
  public readonly ctxt: AudioContext;
  private readonly master: GainNode;
  private readonly filter: BiquadFilterNode;
  private readonly analyser: AnalyserNode;
  private readonly dry: GainNode;
  private readonly comp: DynamicsCompressorNode;

  private readonly noteToVoiceMap: Map<number, Voice> = new Map();

  private readonly voicePool: Voice[] = [];

  public ampEnvelope: EnvelopeConfig = {
    attackSeconds: 0.01,
    decaySeconds: 0.3,
    sustainLevel: 0.6,
    releaseSeconds: 0.5,
  };

  public filterConfig: FilterConfig = {
    frequency: 1500,
    resonance: 5,
  };

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    console.log('Initializing AudioEngine, ctxt.state:', ctxt.state);

    this.master = ctxt.createGain();
    this.master.gain.value = 0.5;
    this.filter = ctxt.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = this.filterConfig.frequency;
    this.filter.Q.value = this.filterConfig.resonance;
    this.analyser = ctxt.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    //   const delay = ctx.createDelay(1.0);
    //   delay.delayTime.value = 0.32;
    //   const feedback = ctx.createGain();
    //   feedback.gain.value = 0.42;
    //   const delayWet = ctx.createGain();
    //   delayWet.gain.value = 0;
    this.dry = ctxt.createGain();
    this.dry.gain.value = 1;

    this.comp = ctxt.createDynamicsCompressor();

    this.filter.connect(this.dry);
    //   filter.connect(delay);

    this.dry.connect(this.master);

    //   feedback.connect(delay);
    //   delay.connect(feedback);

    //   delay.connect(delayWet);
    //   delayWet.connect(master);

    this.master.connect(this.comp);
    this.comp.connect(this.analyser);
    this.analyser.connect(ctxt.destination);

    this.voicePool = Array.from(
      { length: MAX_VOICES },
      () => new Voice(this.ctxt, this.filter),
    );
  }

  get filterCutoff(): number {
    return this.filter.frequency.value;
  }

  set filterCutoff(value: number) {
    this.filter.frequency.value = value;
    this.filterConfig.frequency = value;
  }

  ensureStarted() {
    if (this.ctxt.state === 'suspended') {
      this.ctxt.resume();
    }
  }

  noteOn(noteNumber: number, velocity: number) {
    this.ensureStarted();
    const now = this.ctxt.currentTime;

    if (this.noteToVoiceMap.has(noteNumber)) {
      console.log(
        `[${now.toFixed(4)}] noteOn(${noteNumber}) - already active, retriggering`,
      );
      this.noteOff(noteNumber);
    }

    // 1. Evaluate available voices in the pool
    let targetVoice = this.voicePool.find(v => v.isAvailable(now));
    let startDelay = 0;

    if (targetVoice) {
      console.log(`[${now.toFixed(4)}] Voice available for note ${noteNumber}`);
    }

    // 2. Thread-Safe Voice Stealing Logic
    if (!targetVoice) {
      console.log(
        `[${now.toFixed(4)}] Voice stealing triggered for note ${noteNumber}`,
      );
      let oldestTime = Infinity;
      let oldestVoice: Voice | null = null;

      for (const voice of this.voicePool) {
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

        // Choke the stolen voice instantly over a 3ms window
        targetVoice.fastChoke(now);
        // Fixed: Delays the new note's execution by 3ms to allow the old note to fade completely
        startDelay = 0.003;
      }
    }

    if (targetVoice) {
      targetVoice.noteOn(noteNumber, velocity, this.ampEnvelope, startDelay);
      this.noteToVoiceMap.set(noteNumber, targetVoice);
    }
  }

  noteOff(noteNumber: number) {
    const voice = this.noteToVoiceMap.get(noteNumber);
    if (voice) {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - releasing voice`,
      );
      voice.noteOff(this.ampEnvelope);
      this.noteToVoiceMap.delete(noteNumber);
    } else {
      console.log(
        `[${this.ctxt.currentTime.toFixed(4)}] noteOff(${noteNumber}) - no active voice found`,
      );
    }
  }

  allNotesOff() {
    console.log('allNotesOff');
    this.voicePool.forEach(voice => voice.noteOff(this.ampEnvelope));
  }

  destroy() {
    this.voicePool.forEach(voice => voice.destroy());
    this.comp.disconnect();
    this.analyser.disconnect();
    this.master.disconnect();
    this.filter.disconnect();
    this.dry.disconnect();
    this.ctxt.close();
  }
}
