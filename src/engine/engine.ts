import type { EnvelopeConfig, FilterConfig } from '../types';
import { AxiomVoice } from './axiom-voice';
import { Voice } from './voice';

const MAX_VOICES = 16;

export class AudioEngine {
  public readonly ctxt: AudioContext;
  private readonly master: GainNode;
  private readonly analyser: AnalyserNode;
  private readonly dry: GainNode;
  private readonly comp: DynamicsCompressorNode;

  private readonly noteToVoiceMap: Map<number, Voice> = new Map();

  private readonly voicePool: Voice[] = [];

  private readonly filterCutOffSource: ConstantSourceNode;
  private readonly filterQSource: ConstantSourceNode;
  private readonly filterEnvAmountSource: ConstantSourceNode;

  public ampEnvelope: EnvelopeConfig = {
    attackSeconds: 0.02,
    attackCurve: 'analog',
    decaySeconds: 0.3,
    decayCurve: 'analog',
    sustainLevel: 0.6,
    releaseSeconds: 0.12,
    releaseCurve: 'analog',
  };

  public filterConfig: FilterConfig = {
    frequency: 46,
    q: 4,
    envAmount: 3600, // cents, -9600 to 9600
  };

  public filterEnvelope: EnvelopeConfig = {
    attackSeconds: 0.01,
    attackCurve: 'linear',
    decaySeconds: 0.2,
    decayCurve: 'analog',
    sustainLevel: 0.4,
    releaseSeconds: 3,
    releaseCurve: 'analog',
  };

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;

    console.log('Initializing AudioEngine, ctxt.state:', ctxt.state);

    this.master = ctxt.createGain();
    this.master.gain.value = 0.5;
    this.analyser = ctxt.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.82;
    this.dry = ctxt.createGain();
    this.dry.gain.value = 0.2;

    this.comp = ctxt.createDynamicsCompressor();

    this.dry.connect(this.master);

    this.master.connect(this.comp);
    this.comp.connect(this.analyser);
    this.analyser.connect(ctxt.destination);

    this.filterCutOffSource = ctxt.createConstantSource();
    this.filterCutOffSource.offset.value = this.filterConfig.frequency;
    this.filterCutOffSource.start();

    this.filterQSource = ctxt.createConstantSource();
    this.filterQSource.offset.value = this.filterConfig.q;
    this.filterQSource.start();

    this.filterEnvAmountSource = ctxt.createConstantSource();
    this.filterEnvAmountSource.offset.value = this.filterConfig.envAmount;
    this.filterEnvAmountSource.start();

    this.voicePool = Array.from(
      { length: MAX_VOICES },
      () =>
        new AxiomVoice(
          this.ctxt,
          this.dry,
          this.ampEnvelope,
          this.filterEnvelope,
          this.filterCutOffSource,
          this.filterQSource,
          this.filterEnvAmountSource,
        ),
    );
  }

  get filterCutOff(): number {
    return this.filterConfig.frequency;
  }

  set filterCutOff(value: number) {
    this.filterCutOffSource.offset.exponentialRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
    this.filterConfig.frequency = value;
  }

  get filterQ(): number {
    return this.filterConfig.q;
  }

  set filterQ(q: number) {
    this.filterQSource.offset.linearRampToValueAtTime(
      q,
      this.ctxt.currentTime + 0.01,
    );
    this.filterConfig.q = q;
  }

  get filterEnvAmount(): number {
    return this.filterConfig.envAmount;
  }

  set filterEnvAmount(value: number) {
    this.filterEnvAmountSource.offset.linearRampToValueAtTime(
      value,
      this.ctxt.currentTime + 0.01,
    );
    console.log(`Setting filterEnvAmount to ${value}`);
    this.filterConfig.envAmount = value;
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
      targetVoice.noteOn(noteNumber, velocity, startDelay);
      this.noteToVoiceMap.set(noteNumber, targetVoice);
    }
  }

  noteOff(noteNumber: number) {
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

  allNotesOff() {
    console.log('allNotesOff');
    for (const [note, voice] of this.noteToVoiceMap.entries()) {
      voice.noteOff();
      this.noteToVoiceMap.delete(note);
    }
  }

  destroy() {
    this.voicePool.forEach(voice => voice.destroy());
    this.comp.disconnect();
    this.analyser.disconnect();
    this.master.disconnect();
    this.filterCutOffSource.disconnect();
    this.filterCutOffSource.stop();
    this.filterQSource.disconnect();
    this.filterQSource.stop();
    this.filterEnvAmountSource.disconnect();
    this.filterEnvAmountSource.stop();
    this.dry.disconnect();
    this.ctxt.close();
  }
}
