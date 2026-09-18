import type { WaveFormType } from '../types';
import { CurveNode } from './curve-node';
import type { Destroyable } from './destroyable';

interface Subvoice {
  oscillator: OscillatorNode;
  gain: GainNode | null;
  panner: StereoPannerNode | null;
  detuneGain: GainNode | null;
  depthGain: GainNode | null;
  blendCurve: CurveNode | null;
}

interface VoiceBundle {
  subvoices: Set<Subvoice>;
}

export class UnisonOscillator implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly outputGain: GainNode;
  private readonly frequencySource: ConstantSourceNode;
  private readonly detuneSource: ConstantSourceNode;
  private readonly unisonDetuneSource: ConstantSourceNode;
  private readonly unisonDepthSource: ConstantSourceNode;
  private readonly unisonBlendSource: ConstantSourceNode;
  private readonly activeBundles = new Set<VoiceBundle>();
  private readonly stoppedBundles = new Set<VoiceBundle>();
  private voicesValue = 1;
  private wave: WaveFormType = 'sawtooth';
  private current: VoiceBundle | null = null;
  private destroyed = false;

  constructor(ctxt: AudioContext) {
    this.ctxt = ctxt;
    this.outputGain = ctxt.createGain();
    this.outputGain.gain.setValueAtTime(0, ctxt.currentTime);

    this.frequencySource = this.createSource(0);
    this.detuneSource = this.createSource(0);
    this.unisonDetuneSource = this.createSource(0);
    this.unisonDepthSource = this.createSource(0);
    this.unisonBlendSource = this.createSource(0);
  }

  set waveform(value: WaveFormType) {
    this.wave = value;
    this.activeBundles.forEach(bundle => this.setBundleWaveform(bundle, value));
    this.stoppedBundles.forEach(bundle =>
      this.setBundleWaveform(bundle, value),
    );
  }

  get voices(): number {
    return this.voicesValue;
  }

  set voices(value: number) {
    this.voicesValue = Math.min(16, Math.max(1, Math.round(value)));
  }

  get frequency(): AudioParam {
    return this.frequencySource.offset;
  }

  get detune(): AudioParam {
    return this.detuneSource.offset;
  }

  get gain(): AudioParam {
    return this.outputGain.gain;
  }

  get unisonDetune(): AudioParam {
    return this.unisonDetuneSource.offset;
  }

  get unisonDepth(): AudioParam {
    return this.unisonDepthSource.offset;
  }

  get unisonBlend(): AudioParam {
    return this.unisonBlendSource.offset;
  }

  connect(destination: AudioNode | AudioParam): void {
    if (!this.destroyed) {
      if (destination instanceof AudioParam) {
        this.outputGain.connect(destination);
      } else {
        this.outputGain.connect(destination);
      }
    }
  }

  disconnect(destination: AudioNode | AudioParam | null = null): void {
    if (destination === null) {
      this.outputGain.disconnect();
    } else if (destination instanceof AudioParam) {
      this.outputGain.disconnect(destination);
    } else {
      this.outputGain.disconnect(destination);
    }
  }

  start(noteHz: number, now: number): void {
    if (this.destroyed) {
      return;
    }
    this.stop();

    const voices = this.voicesValue;
    const positions = Array.from({ length: voices }, (_, index) =>
      voices === 1 ? 0 : -1 + (2 * index) / (voices - 1),
    );
    const bundle: VoiceBundle = { subvoices: new Set() };
    for (let index = 0; index < voices; index += 1) {
      this.createSubvoice(bundle, noteHz, now, positions[index]!, positions);
    }
    this.activeBundles.add(bundle);
    this.current = bundle;
  }

  stop(): void;
  stop(time: number): void;
  stop(time?: number): void {
    if (!this.current) {
      return;
    }
    const bundle = this.current;
    this.current = null;
    this.activeBundles.delete(bundle);
    this.stoppedBundles.add(bundle);
    bundle.subvoices.forEach(({ oscillator }) => {
      if (time === undefined) {
        oscillator.stop();
      } else {
        oscillator.stop(time);
      }
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.current = null;
    [...this.activeBundles, ...this.stoppedBundles].forEach(bundle => {
      bundle.subvoices.forEach(subvoice => {
        subvoice.oscillator.onended = null;
        subvoice.oscillator.stop();
      });
      this.destroyBundle(bundle);
    });
    this.activeBundles.clear();
    this.stoppedBundles.clear();

    this.frequencySource.disconnect();
    this.frequencySource.stop();
    this.detuneSource.disconnect();
    this.detuneSource.stop();
    this.unisonDetuneSource.disconnect();
    this.unisonDetuneSource.stop();
    this.unisonDepthSource.disconnect();
    this.unisonDepthSource.stop();
    this.unisonBlendSource.disconnect();
    this.unisonBlendSource.stop();
    this.outputGain.disconnect();
  }

  private createSource(value: number): ConstantSourceNode {
    const source = this.ctxt.createConstantSource();
    source.offset.setValueAtTime(value, this.ctxt.currentTime);
    source.start();
    return source;
  }

  private createSubvoice(
    bundle: VoiceBundle,
    noteHz: number,
    now: number,
    position: number,
    positions: number[],
  ): void {
    const oscillator = this.ctxt.createOscillator();

    oscillator.type = this.wave;
    oscillator.frequency.setValueAtTime(noteHz, now);

    this.frequencySource.connect(oscillator.frequency);
    this.detuneSource.connect(oscillator.detune);

    if (positions.length === 1) {
      oscillator.connect(this.outputGain);
      const subvoice: Subvoice = {
        oscillator,
        gain: null,
        panner: null,
        detuneGain: null,
        depthGain: null,
        blendCurve: null,
      };
      oscillator.onended = () => this.onSubvoiceEnded(bundle, subvoice);
      bundle.subvoices.add(subvoice);
      oscillator.start(now);
      return;
    }

    const centerWeight = 1 / (1 + Math.abs(position));
    const gain = this.ctxt.createGain();
    const panner = this.ctxt.createStereoPanner();
    const detuneGain = this.ctxt.createGain();
    const depthGain = this.ctxt.createGain();
    const blendCurve = new CurveNode(
      this.ctxt,
      blend => {
        const rawGain = centerWeight + blend * (1 - centerWeight);
        const power = positions.reduce((sum, subvoicePosition) => {
          const weight = 1 / (1 + Math.abs(subvoicePosition));
          const subvoiceGain = weight + blend * (1 - weight);
          return sum + subvoiceGain * subvoiceGain;
        }, 0);
        return rawGain / Math.sqrt(power);
      },
      { inputMin: 0, inputMax: 1 },
    );

    gain.gain.setValueAtTime(0, now);
    detuneGain.gain.value = position;
    depthGain.gain.value = position;
    this.unisonDetuneSource.connect(detuneGain);
    detuneGain.connect(oscillator.detune);
    this.unisonDepthSource.connect(depthGain);
    depthGain.connect(panner.pan);
    this.unisonBlendSource.connect(blendCurve.input);
    blendCurve.connect(gain.gain);
    oscillator.connect(gain);
    gain.connect(panner);
    panner.connect(this.outputGain);

    const subvoice: Subvoice = {
      oscillator,
      gain,
      panner,
      detuneGain,
      depthGain,
      blendCurve,
    };
    oscillator.onended = () => this.onSubvoiceEnded(bundle, subvoice);
    bundle.subvoices.add(subvoice);
    oscillator.start(now);
  }

  private onSubvoiceEnded(bundle: VoiceBundle, subvoice: Subvoice): void {
    this.detachSubvoice(subvoice);
    bundle.subvoices.delete(subvoice);
    if (bundle.subvoices.size === 0) {
      this.activeBundles.delete(bundle);
      this.stoppedBundles.delete(bundle);
      this.destroyBundle(bundle);
    }
  }

  private detachSubvoice(subvoice: Subvoice): void {
    this.frequencySource.disconnect(subvoice.oscillator.frequency);
    this.detuneSource.disconnect(subvoice.oscillator.detune);
    if (subvoice.detuneGain && subvoice.depthGain && subvoice.panner) {
      subvoice.detuneGain.disconnect(subvoice.oscillator.detune);
      subvoice.depthGain.disconnect(subvoice.panner.pan);
      this.unisonDetuneSource.disconnect(subvoice.detuneGain);
      this.unisonDepthSource.disconnect(subvoice.depthGain);
      this.unisonBlendSource.disconnect(subvoice.blendCurve!.input);
    }
    subvoice.oscillator.disconnect();
    subvoice.gain?.disconnect();
    subvoice.panner?.disconnect();
    subvoice.detuneGain?.disconnect();
    subvoice.depthGain?.disconnect();
    subvoice.blendCurve?.destroy();
  }

  private destroyBundle(bundle: VoiceBundle): void {
    bundle.subvoices.forEach(subvoice => this.detachSubvoice(subvoice));
    bundle.subvoices.clear();
  }

  private setBundleWaveform(bundle: VoiceBundle, waveform: WaveFormType): void {
    bundle.subvoices.forEach(({ oscillator }) => {
      oscillator.type = waveform;
    });
  }
}
