import type { WaveFormType } from '../types';
import type { Destroyable } from './destroyable';
import {
  UnisonVoicePathPool,
  type PathLease,
  type UnisonVoicePath,
} from './unison-voice-path';

/**
 * The single-voice path, which does not need the unison path pool.
 */
interface DirectSource {
  readonly oscillator: OscillatorNode;
}

/**
 * A raw note oscillator attached to one reusable unison path.
 */
interface PooledSource {
  readonly oscillator: OscillatorNode;
  readonly path: UnisonVoicePath;
}

/**
 * All sources and pool ownership belonging to one note generation.
 */
interface VoiceBundle {
  readonly direct: DirectSource | null;
  readonly pooled: readonly PooledSource[];
  readonly lease: PathLease | null;
}

/**
 * Runs one oscillator with either a direct path or a pool of blended voices.
 * The control graph persists for the lifetime of the instance, while raw
 * OscillatorNodes are created per note because Web Audio sources are one-shot.
 */
export class UnisonOscillator implements Destroyable {
  private readonly ctxt: AudioContext;
  private readonly outputGain: GainNode;
  private readonly frequencySource: ConstantSourceNode;
  private readonly detuneSource: ConstantSourceNode;
  private readonly unisonDetuneSource: ConstantSourceNode;
  private readonly unisonDepthSource: ConstantSourceNode;
  private readonly unisonBlendSource: ConstantSourceNode;
  private readonly pathPool: UnisonVoicePathPool;
  private readonly activeBundles = new Set<VoiceBundle>();
  private readonly stoppedBundles = new Set<VoiceBundle>();
  private voicesValue = 1;
  private wave: WaveFormType = 'sawtooth';
  private current: VoiceBundle | null = null;
  private destroyed = false;

  /** Build the persistent control graph and its reusable path pool. */
  constructor(ctxt: AudioContext) {
    // Shared sources fan out parameter changes to every active note source.
    this.ctxt = ctxt;
    this.outputGain = ctxt.createGain();
    this.outputGain.gain.setValueAtTime(0, ctxt.currentTime);
    this.frequencySource = this.createSource(0);
    this.detuneSource = this.createSource(0);
    this.unisonDetuneSource = this.createSource(0);
    this.unisonDepthSource = this.createSource(0);
    this.unisonBlendSource = this.createSource(1);
    this.pathPool = new UnisonVoicePathPool(
      ctxt,
      this.outputGain,
      this.unisonDetuneSource,
      this.unisonDepthSource,
      this.unisonBlendSource,
    );
  }

  /**
   * Change the waveform on both active and still-draining note bundles.
   */
  set waveform(value: WaveFormType) {
    // Stopped bundles still exist until their sources fire onended.
    this.wave = value;
    [...this.activeBundles, ...this.stoppedBundles].forEach(bundle => {
      bundle.direct?.oscillator && (bundle.direct.oscillator.type = value);
      bundle.pooled.forEach(({ oscillator }) => (oscillator.type = value));
    });
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
    if (destination === null) this.outputGain.disconnect();
    else if (destination instanceof AudioParam) {
      this.outputGain.disconnect(destination);
    } else {
      this.outputGain.disconnect(destination);
    }
  }

  /**
   * Start a new note generation, stopping the previous one first.
   */
  start(noteHz: number, now: number): void {
    if (this.destroyed) return;
    this.stop();

    const voices = this.voicesValue;
    if (voices === 1) {
      this.startDirect(noteHz, now);
      return;
    }

    // Each path selects its cached (voices, index) blend curve role.
    const lease = this.pathPool.acquire(voices);
    const sources: PooledSource[] = [];
    const bundle: VoiceBundle = { direct: null, pooled: sources, lease };
    try {
      // Raw oscillators are one-shot sources, so allocate them per note.
      lease.paths.forEach(path => {
        const oscillator = this.ctxt.createOscillator();
        sources.push({ oscillator, path });
        oscillator.type = this.wave;
        oscillator.frequency.setValueAtTime(noteHz, now);
        this.frequencySource.connect(oscillator.frequency);
        this.detuneSource.connect(oscillator.detune);
        path.arm(oscillator);
      });
      sources.forEach(source => {
        source.oscillator.onended = () =>
          this.onPooledEnded(bundle, source.path, source.oscillator);
      });
      sources.forEach(({ oscillator }) => oscillator.start(now));
    } catch (error) {
      this.rollbackPooled(lease, sources);
      throw error;
    }

    this.activeBundles.add(bundle);
    this.current = bundle;
  }

  stop(): void;
  stop(time: number): void;
  /**
   * Stop the current generation; pooled paths remain reserved while draining. */
  stop(time?: number): void {
    const bundle = this.current;
    if (!bundle) return;
    this.current = null;
    this.activeBundles.delete(bundle);
    this.stoppedBundles.add(bundle);
    if (bundle.direct) {
      if (!this.stopSource(bundle.direct.oscillator, time)) {
        bundle.direct.oscillator.onended = null;
        this.detachDirect(bundle.direct.oscillator);
        this.finishBundle(bundle);
      }
    } else {
      let stopFailed = false;
      bundle.pooled.forEach(({ path, oscillator }) => {
        path.beginDrain();
        if (!this.stopSource(oscillator, time)) stopFailed = true;
      });
      if (stopFailed) {
        bundle.pooled.forEach(({ path, oscillator }) => {
          this.detachPooled(oscillator);
          path.abort();
          oscillator.onended = null;
        });
        this.pathPool.abort(bundle.lease!);
        this.finishBundle(bundle);
      }
    }
  }

  /**
   * Stop all sources and release the persistent graph and its path pool.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    [...this.activeBundles, ...this.stoppedBundles].forEach(bundle => {
      if (bundle.direct) {
        bundle.direct.oscillator.onended = null;
        this.stopSource(bundle.direct.oscillator);
        this.detachDirect(bundle.direct.oscillator);
      } else {
        bundle.pooled.forEach(({ oscillator }) => {
          this.detachPooled(oscillator);
          oscillator.onended = null;
          this.stopSource(oscillator);
        });
      }
    });
    this.activeBundles.clear();
    this.stoppedBundles.clear();
    this.pathPool.destroy();
    [
      this.frequencySource,
      this.detuneSource,
      this.unisonDetuneSource,
      this.unisonDepthSource,
      this.unisonBlendSource,
    ].forEach(source => {
      this.safe(() => source.disconnect());
      this.safe(() => source.stop());
    });
    this.safe(() => this.outputGain.disconnect());
  }

  /**
   * Start the lightweight single-oscillator path.
   */
  private startDirect(noteHz: number, now: number): void {
    const oscillator = this.ctxt.createOscillator();
    const bundle: VoiceBundle = {
      direct: { oscillator },
      pooled: [],
      lease: null,
    };
    oscillator.onended = () => {
      oscillator.onended = null;
      if (!bundle.direct || !this.stoppedBundles.has(bundle)) return;
      this.detachDirect(oscillator);
      this.finishBundle(bundle);
    };
    try {
      oscillator.type = this.wave;
      oscillator.frequency.setValueAtTime(noteHz, now);
      this.frequencySource.connect(oscillator.frequency);
      this.detuneSource.connect(oscillator.detune);
      oscillator.connect(this.outputGain);
      oscillator.start(now);
    } catch (error) {
      oscillator.onended = null;
      this.detachDirect(oscillator);
      throw error;
    }
    this.activeBundles.add(bundle);
    this.current = bundle;
  }

  /**
   * Release a pooled lease only after every voice in its bundle has ended.
   */
  private onPooledEnded(
    bundle: VoiceBundle,
    path: PooledSource['path'],
    oscillator: OscillatorNode,
  ): void {
    if (!this.stoppedBundles.has(bundle)) return;
    oscillator.onended = null;
    this.safe(() => this.frequencySource.disconnect(oscillator.frequency));
    this.safe(() => this.detuneSource.disconnect(oscillator.detune));
    path.disarm(oscillator);
    if (bundle.pooled.every(source => source.path.state === 'free')) {
      this.pathPool.release(bundle.lease!);
      this.finishBundle(bundle);
    }
  }

  /**
   * Remove a generation after its source nodes and paths are detached.
   */
  private finishBundle(bundle: VoiceBundle): void {
    this.activeBundles.delete(bundle);
    this.stoppedBundles.delete(bundle);
    if (this.current === bundle) this.current = null;
  }

  /**
   * Undo a partial start when source creation, connection, or start fails.
   */
  private rollbackPooled(
    lease: VoiceBundle['lease'],
    sources: readonly PooledSource[],
  ): void {
    sources.forEach(({ path, oscillator }) => {
      this.detachPooled(oscillator);
      path.abort();
      oscillator.onended = null;
      this.safe(() => oscillator.stop());
    });
    this.pathPool.abort(lease!);
  }

  private detachPooled(oscillator: OscillatorNode): void {
    this.safe(() => this.frequencySource.disconnect(oscillator.frequency));
    this.safe(() => this.detuneSource.disconnect(oscillator.detune));
  }

  private detachDirect(oscillator: OscillatorNode): void {
    this.safe(() => this.frequencySource.disconnect(oscillator.frequency));
    this.safe(() => this.detuneSource.disconnect(oscillator.detune));
    this.safe(() => oscillator.disconnect());
  }

  private stopSource(oscillator: OscillatorNode, time?: number): boolean {
    try {
      if (time === undefined) oscillator.stop();
      else oscillator.stop(time);
      return true;
    } catch {
      return false;
    }
  }

  private createSource(value: number): ConstantSourceNode {
    const source = this.ctxt.createConstantSource();
    source.offset.setValueAtTime(value, this.ctxt.currentTime);
    source.start();
    return source;
  }

  private safe(action: () => void): void {
    try {
      action();
    } catch {
      // Teardown is best effort when a source or context is already gone.
    }
  }
}
