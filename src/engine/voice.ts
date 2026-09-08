import type { EnvelopeConfig } from './envelope';

export class Voice {
  private readonly ctxt: AudioContext;
  private readonly audioSink: AudioNode;

  private readonly ampEnv: GainNode;
  // private readonly filterEnv: GainNode;
  private readonly oscillators: OscillatorNode[] = [];
  // private readonly filter: BiquadFilterNode;
  public currentNote: number | null = null;
  public endTime = 0;
  public lastUsed = 0;

  constructor(ctxt: AudioContext, audioSink: AudioNode) {
    this.ctxt = ctxt;
    this.audioSink = audioSink;

    this.ampEnv = this.ctxt.createGain();
    this.ampEnv.gain.setValueAtTime(0, this.ctxt.currentTime);
    // this.filterEnv = this.ctxt.createGain();
    // this.filter = this.ctxt.createBiquadFilter();

    // this.filterEnv.connect(this.filter.frequency);

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
    this.oscillators.forEach(osc => osc.start(this.ctxt.currentTime));

    this.ampEnv.connect(this.audioSink);
  }

  /**
   * Evaluates voice availability based purely on the audio hardware clock pipeline state
   */
  isAvailable(now: number): boolean {
    return this.currentNote !== null || now >= this.endTime;
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
    settings: EnvelopeConfig,
    startTimeOffset: number,
  ) {
    const now = this.ctxt.currentTime + startTimeOffset;

    this.currentNote = noteNumber;
    this.lastUsed = this.ctxt.currentTime + startTimeOffset;

    console.log(`[${now.toFixed(4)}] noteOn(${noteNumber})`);

    // Fixed: Pitch shift & envelope execution begin exactly at scheduled timeline sequence position
    const frequency = freqOf(noteNumber);
    const targetVolume = (velocity / 127) * 0.12; // Adjusted output ceiling allocation

    this.ampEnv.gain.cancelScheduledValues(now);
    // this.filter.frequency.cancelScheduledValues(now);

    // Fixed: Repitch oscillators precisely when the choke period completes
    this.oscillators.forEach(osc => {
      osc.frequency.setValueAtTime(frequency, now);
    });

    // Fixed: Replaced linear curves with true Exponential ADSR Envelopes
    // setTargetAtTime avoids click artifacts by calculating curves based on current parameters
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    this.ampEnv.gain.setTargetAtTime(
      targetVolume,
      now,
      settings.attackSeconds / 3,
    );

    const decayStartTime = now + settings.attackSeconds;
    const sustainVolume = targetVolume * settings.sustainLevel;
    this.ampEnv.gain.setTargetAtTime(
      sustainVolume,
      decayStartTime,
      settings.decaySeconds / 3,
    );

    // Exponential Filter Sweep Execution
    // const peakCutoff = Math.min(19000, settings.cutoff + settings.filterEnvAmt);
    // const sustainCutoff = Math.max(20, settings.cutoff + (settings.filterEnvAmt * settings.sustain));

    // this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
    // this.filter.frequency.setTargetAtTime(peakCutoff, now, settings.attack / 3);
    // this.filter.frequency.setTargetAtTime(sustainCutoff, decayStartTime, settings.decay / 3);

    // Mark endTime as Infinity until explicit noteOff release occurs
    this.endTime = Infinity;
  }

  noteOff(settings: EnvelopeConfig) {
    const now = this.ctxt.currentTime;
    console.log(`[${now.toFixed(4)}] noteOff()`);

    this.ampEnv.gain.cancelScheduledValues(now);
    this.ampEnv.gain.setValueAtTime(this.ampEnv.gain.value, now);
    // Exponential fade toward a non-zero floor value to prevent math calculation faults
    this.ampEnv.gain.setTargetAtTime(0, now, settings.releaseSeconds / 3);

    // this.filter.frequency.cancelScheduledValues(now);
    // this.filter.frequency.setValueAtTime(this.filter.frequency.value, now);
    // this.filter.frequency.setTargetAtTime(settings.cutoff, now, settings.release / 3);

    // Fixed: Eliminated the flaky JavaScript setTimeout state machine wrapper
    // The voice boundary availability checks now reference this absolute time parameter
    this.endTime = now + settings.releaseSeconds * 5; // 5 time-constants completely flattens setTargetAtTime
  }

  destroy() {
    this.oscillators.forEach(osc => osc.stop());
    this.ampEnv.disconnect();
    // this.filterEnv.disconnect();
    // this.filter.disconnect();
  }
}

function freqOf(semi: number) {
  return 261.6256 * Math.pow(2, semi / 12);
}
