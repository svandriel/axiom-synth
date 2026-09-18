import type { WaveFormType } from '../types';
import { CurveNode } from './curve-node';
import type { Destroyable } from './destroyable';

interface Subvoice {
  oscillator: OscillatorNode;
  rawGain: GainNode;
  normalizerGain: GainNode;
  panner: StereoPannerNode;
  detuneGain: GainNode;
  depthGain: GainNode;
  centerWeightSource: ConstantSourceNode;
  blendGain: GainNode;
  rawGainControl: GainNode;
  rawGainSquare: CurveNode;
}

interface VoiceBundle {
  subvoices: Set<Subvoice>;
  detuneClamp: CurveNode;
  depthClamp: CurveNode;
  blendClamp: CurveNode;
  meanPowerGain: GainNode;
  reciprocalSqrt: CurveNode;
  normalizerScale: GainNode;
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

    const bundle = this.createBundle();
    const voices = this.voicesValue;
    for (let index = 0; index < voices; index += 1) {
      const position = voices === 1 ? 0 : -1 + (2 * index) / (voices - 1);
      const centerWeight = 1 / (1 + Math.abs(position));
      this.createSubvoice(bundle, noteHz, now, position, centerWeight);
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

  private createBundle(): VoiceBundle {
    const detuneClamp = new CurveNode(this.ctxt, value => value, {
      inputMin: 0,
      inputMax: 50,
    });
    const depthClamp = new CurveNode(this.ctxt, value => value, {
      inputMin: 0,
      inputMax: 1,
    });
    const blendClamp = new CurveNode(this.ctxt, value => value, {
      inputMin: 0,
      inputMax: 1,
    });
    const meanPowerGain = this.ctxt.createGain();
    meanPowerGain.gain.value = 1 / this.voicesValue;
    const reciprocalSqrt = new CurveNode(
      this.ctxt,
      value => 1 / Math.sqrt(Math.max(value, 0.0001)),
      { inputMin: 0.25, inputMax: 1 },
    );
    const normalizerScale = this.ctxt.createGain();
    normalizerScale.gain.value = 1 / Math.sqrt(this.voicesValue);

    this.unisonDetuneSource.connect(detuneClamp.input);
    this.unisonDepthSource.connect(depthClamp.input);
    this.unisonBlendSource.connect(blendClamp.input);
    meanPowerGain.connect(reciprocalSqrt.input);
    reciprocalSqrt.connect(normalizerScale);

    return {
      subvoices: new Set(),
      detuneClamp,
      depthClamp,
      blendClamp,
      meanPowerGain,
      reciprocalSqrt,
      normalizerScale,
    };
  }

  private createSubvoice(
    bundle: VoiceBundle,
    noteHz: number,
    now: number,
    position: number,
    centerWeight: number,
  ): void {
    const oscillator = this.ctxt.createOscillator();
    const rawGain = this.ctxt.createGain();
    const normalizerGain = this.ctxt.createGain();
    const panner = this.ctxt.createStereoPanner();
    const detuneGain = this.ctxt.createGain();
    const depthGain = this.ctxt.createGain();
    const centerWeightSource = this.createSource(centerWeight);
    const blendGain = this.ctxt.createGain();
    const rawGainControl = this.ctxt.createGain();
    const rawGainSquare = new CurveNode(this.ctxt, value => value * value, {
      inputMin: 0.5,
      inputMax: 1,
    });

    oscillator.type = this.wave;
    oscillator.frequency.setValueAtTime(noteHz, now);
    rawGain.gain.setValueAtTime(0, now);
    normalizerGain.gain.setValueAtTime(0, now);
    detuneGain.gain.value = position;
    depthGain.gain.value = position;
    blendGain.gain.value = 1 - centerWeight;

    this.frequencySource.connect(oscillator.frequency);
    this.detuneSource.connect(oscillator.detune);
    bundle.detuneClamp.connect(detuneGain);
    detuneGain.connect(oscillator.detune);
    bundle.depthClamp.connect(depthGain);
    depthGain.connect(panner.pan);
    centerWeightSource.connect(rawGainControl);
    bundle.blendClamp.connect(blendGain);
    blendGain.connect(rawGainControl);
    rawGainControl.connect(rawGain.gain);
    rawGainControl.connect(rawGainSquare.input);
    rawGainSquare.connect(bundle.meanPowerGain);
    bundle.normalizerScale.connect(normalizerGain.gain);
    oscillator.connect(rawGain);
    rawGain.connect(normalizerGain);
    normalizerGain.connect(panner);
    panner.connect(this.outputGain);

    const subvoice: Subvoice = {
      oscillator,
      rawGain,
      normalizerGain,
      panner,
      detuneGain,
      depthGain,
      centerWeightSource,
      blendGain,
      rawGainControl,
      rawGainSquare,
    };
    oscillator.onended = () => this.onSubvoiceEnded(bundle, subvoice);
    bundle.subvoices.add(subvoice);
    oscillator.start(now);
  }

  private onSubvoiceEnded(bundle: VoiceBundle, subvoice: Subvoice): void {
    this.detachSubvoice(bundle, subvoice);
    bundle.subvoices.delete(subvoice);
    if (bundle.subvoices.size === 0) {
      this.activeBundles.delete(bundle);
      this.stoppedBundles.delete(bundle);
      this.destroyBundle(bundle);
    }
  }

  private detachSubvoice(bundle: VoiceBundle, subvoice: Subvoice): void {
    this.frequencySource.disconnect(subvoice.oscillator.frequency);
    this.detuneSource.disconnect(subvoice.oscillator.detune);
    subvoice.detuneGain.disconnect(subvoice.oscillator.detune);
    subvoice.depthGain.disconnect(subvoice.panner.pan);
    subvoice.centerWeightSource.disconnect(subvoice.rawGainControl);
    subvoice.blendGain.disconnect(subvoice.rawGainControl);
    subvoice.rawGainControl.disconnect(subvoice.rawGain.gain);
    subvoice.rawGainControl.disconnect(subvoice.rawGainSquare.input);
    bundle.normalizerScale.disconnect(subvoice.normalizerGain.gain);
    subvoice.oscillator.disconnect();
    subvoice.rawGain.disconnect();
    subvoice.normalizerGain.disconnect();
    subvoice.panner.disconnect();
    subvoice.detuneGain.disconnect();
    subvoice.depthGain.disconnect();
    subvoice.centerWeightSource.disconnect();
    subvoice.centerWeightSource.stop();
    subvoice.blendGain.disconnect();
    subvoice.rawGainControl.disconnect();
    subvoice.rawGainSquare.destroy();
  }

  private destroyBundle(bundle: VoiceBundle): void {
    bundle.subvoices.forEach(subvoice => this.detachSubvoice(bundle, subvoice));
    bundle.subvoices.clear();
    this.unisonDetuneSource.disconnect(bundle.detuneClamp.input);
    this.unisonDepthSource.disconnect(bundle.depthClamp.input);
    this.unisonBlendSource.disconnect(bundle.blendClamp.input);
    bundle.detuneClamp.destroy();
    bundle.depthClamp.destroy();
    bundle.blendClamp.destroy();
    bundle.meanPowerGain.disconnect();
    bundle.reciprocalSqrt.destroy();
    bundle.normalizerScale.disconnect();
  }

  private setBundleWaveform(bundle: VoiceBundle, waveform: WaveFormType): void {
    bundle.subvoices.forEach(({ oscillator }) => {
      oscillator.type = waveform;
    });
  }
}
