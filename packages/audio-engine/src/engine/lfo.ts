import type { FixedArray } from '../types';
import type { Observable } from '../utils/observable';
import type { LfoWaveformType } from '../types/lfo-config';
import type { Destroyable } from './destroyable';
import {
  LFO_TARGET_INDEX,
  LFO_TARGETS,
  type LfoTargetCount,
  type LfoTargetIndex,
} from './constants';

export class Lfo implements Destroyable {
  private osc: OscillatorNode | null = null;
  private readonly depthGains: FixedArray<GainNode, LfoTargetCount>;
  private readonly driveWaveShaper: WaveShaperNode;
  private readonly waveForm: Observable<LfoWaveformType>;
  private readonly rateSource: ConstantSourceNode;
  private readonly ctxt: AudioContext;
  private waveFormUnsubscribe: (() => void) | null = null;
  private destroyed = false;

  constructor(
    ctxt: AudioContext,
    waveForm: Observable<LfoWaveformType>,
    rateSource: ConstantSourceNode,
    depthSources: FixedArray<ConstantSourceNode, LfoTargetCount>,
  ) {
    this.ctxt = ctxt;
    this.waveForm = waveForm;
    this.rateSource = rateSource;

    // The drive target modulates a gain (Waveshaper pre-gain). Modulating
    // it with the bipolar LFO signal swings the gain through zero —
    // polarity flip + silence side-effects. Unipolarize the signal for
    // that target only: a 2-point linear WaveShaper curve remaps the
    // bipolar oscillator [-1,1] to [0,1], so the drive gain rides
    // [base, base + depth*scale] instead of dipping negative.
    this.driveWaveShaper = ctxt.createWaveShaper();
    this.driveWaveShaper.curve = new Float32Array([0, 1]);

    this.depthGains = depthSources.map(src => {
      const gain = ctxt.createGain();
      gain.gain.value = 0;
      src.connect(gain.gain);
      return gain;
    }) as FixedArray<GainNode, LfoTargetCount>;
  }

  targetOutput(index: LfoTargetIndex): AudioNode {
    return this.depthGains[index]!;
  }

  start(now: number): void {
    if (this.osc) return;

    const osc = this.ctxt.createOscillator();
    osc.type = this.waveForm.value;
    // AudioParams sum connected inputs with their intrinsic value; an
    // OscillatorNode defaults to 440 Hz, so zero it so the rate source
    // becomes the LFO frequency outright.
    osc.frequency.setValueAtTime(0, now);

    this.rateSource.connect(osc.frequency);
    for (const target of LFO_TARGETS) {
      if (target === 'drive') continue;
      osc.connect(this.depthGains[LFO_TARGET_INDEX[target]]!);
    }
    osc.connect(this.driveWaveShaper);
    this.driveWaveShaper.connect(this.depthGains[LFO_TARGET_INDEX.drive]!);

    this.waveFormUnsubscribe = this.waveForm.subscribe(v => {
      osc.type = v;
    }).unsubscribe;

    osc.onended = () => {
      this.cleanupOsc(osc);
    };

    osc.start(now);
    this.osc = osc;
  }

  stop(): void {
    if (!this.osc) return;
    const osc = this.osc;
    this.osc = null;
    osc.onended = null;
    osc.stop();
    this.cleanupOsc(osc);
  }

  private cleanupOsc(osc: OscillatorNode): void {
    this.waveFormUnsubscribe?.();
    this.waveFormUnsubscribe = null;
    this.rateSource.disconnect(osc.frequency);
    for (const target of LFO_TARGETS) {
      if (target === 'drive') continue;
      osc.disconnect(this.depthGains[LFO_TARGET_INDEX[target]]!);
    }
    osc.disconnect(this.driveWaveShaper);
    this.driveWaveShaper.disconnect(this.depthGains[LFO_TARGET_INDEX.drive]!);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    for (const gain of this.depthGains) {
      gain.disconnect();
    }
    this.driveWaveShaper.disconnect();
  }
}
