import type { EnvelopeConfig } from '../types/envelope-config';

export class Voice {
  private readonly ctxt: AudioContext;
  private readonly audioSink: AudioNode;

  private readonly ampEnv: GainNode;
  // private readonly filterEnv: GainNode;
  private oscillators: OscillatorNode[] = [];
  private oscillatorsActive = false;
  private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  // private readonly filter: BiquadFilterNode;
  public currentNote: number | null = null;
  public endTime = 0;
  public lastUsed = 0;

  private readonly maxVolume = 0.2;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    this.ctxt = ctxt;
    this.audioSink = audioSink;

    this.ampEnv = this.ctxt.createGain();
    this.ampEnv.gain.setValueAtTime(0, this.ctxt.currentTime);

    this.ampEnv.connect(this.audioSink);
  }

  /**
   * Evaluates voice availability based purely on the audio hardware clock pipeline state
   */
  isAvailable(now: number): boolean {
    return this.currentNote === null || now >= this.endTime;
  }

  /**
   * Executes a 3ms micro-fade parameter envelope to truncate a stolen note cleanly
   */
  public fastChoke(time: number): void {
    this.ampEnv.gain.cancelScheduledValues(time);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, time);
    // Explicit micro-ramp down to prevent audio artifacts/clicks
    this.ampEnv.gain.linearRampToValueAtTime(0, time + 0.003);

    // this.filter.frequency.cancelScheduledValues(time);
    this.endTime = time + 0.003;
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
      this.oscillators.forEach(osc => osc.stop());
      this.oscillators.forEach(osc => osc.disconnect());
      this.oscillators = [];
    }

    this.createOscillators(now);

    const frequency = freqOf(noteNumber);
    const targetVolume = (velocity / 127) * this.maxVolume;

    this.ampEnv.gain.cancelScheduledValues(now);

    this.oscillators.forEach(osc => {
      osc.frequency.setValueAtTime(frequency, now);
    });

    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    this.ampEnv.gain.setTargetAtTime(
      targetVolume,
      now,
      ampEnvelope.attackSeconds / 3,
    );

    const decayStartTime = now + ampEnvelope.attackSeconds;
    const sustainVolume = targetVolume * ampEnvelope.sustainLevel;
    this.ampEnv.gain.setTargetAtTime(
      sustainVolume,
      decayStartTime,
      ampEnvelope.decaySeconds / 3,
    );

    this.oscillatorsActive = true;
    this.endTime = Infinity;
  }

  private createOscillators(now: number): void {
    const osc1 = this.ctxt.createOscillator();
    osc1.type = 'sawtooth';
    osc1.detune.value = -12;

    const osc2 = this.ctxt.createOscillator();
    osc2.type = 'sawtooth';
    osc2.detune.value = 0;

    const osc3 = this.ctxt.createOscillator();
    osc3.type = 'triangle';
    osc3.detune.value = 11;

    this.oscillators.push(osc1);
    this.oscillators.push(osc2);
    this.oscillators.push(osc3);

    this.oscillators.forEach(osc => osc.connect(this.ampEnv));
    this.oscillators.forEach(osc => osc.start(now));
  }

  noteOff(ampEnvelope: EnvelopeConfig) {
    const now = this.ctxt.currentTime;
    console.log(`[${now.toFixed(4)}] noteOff()`);

    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    this.ampEnv.gain.setTargetAtTime(0, now, ampEnvelope.releaseSeconds / 3);

    // 5 time-constants completely flattens setTargetAtTime
    this.endTime = now + ampEnvelope.releaseSeconds * 5;

    this.cleanupTimer = setTimeout(
      () => {
        if (!this.oscillatorsActive) return;
        this.oscillators.forEach(osc => osc.stop());
        this.oscillators.forEach(osc => osc.disconnect());
        this.oscillators = [];
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
      this.oscillators.forEach(osc => osc.stop());
      this.oscillators.forEach(osc => osc.disconnect());
      this.oscillators = [];
      this.oscillatorsActive = false;
    }
    this.ampEnv.disconnect();
    // this.filterEnv.disconnect();
    // this.filter.disconnect();
  }
}

function freqOf(semi: number) {
  return 261.6256 * Math.pow(2, semi / 12);
}
