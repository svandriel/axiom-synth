import type { FixedArray } from '../types';
import type { Observable } from '../utils/observable';
import type { LfoWaveformType } from '../types/lfo-config';
import type { Destroyable } from './destroyable';
import type { LfoTargetCount, LfoTargetIndex } from './constants';

export class Lfo implements Destroyable {
  private osc: OscillatorNode | null = null;
  private readonly depthGains: FixedArray<GainNode, LfoTargetCount>;
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

    this.rateSource.connect(osc.frequency);
    for (const gain of this.depthGains) {
      osc.connect(gain);
    }

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
    for (const gain of this.depthGains) {
      osc.disconnect(gain);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    for (const gain of this.depthGains) {
      gain.disconnect();
    }
  }
}
