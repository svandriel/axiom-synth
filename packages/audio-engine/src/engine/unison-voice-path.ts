import { BlendCurveCache } from './blend-curve-cache';

type PathState = 'free' | 'leased' | 'armed' | 'draining' | 'destroyed';

interface PathLease {
  readonly paths: readonly UnisonVoicePath[];
  readonly usesOverflow: boolean;
}

class UnisonVoicePath {
  readonly audioGain: GainNode;
  readonly detuneScale: GainNode;
  private readonly depthScale: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly blendInput: GainNode;
  private readonly blendMapper: GainNode;
  private readonly blendOffset: ConstantSourceNode;
  private readonly blendShaper: WaveShaperNode;
  private readonly detuneSource: ConstantSourceNode;
  private readonly depthSource: ConstantSourceNode;
  private readonly blendSource: ConstantSourceNode;
  private readonly context: AudioContext;
  private readonly overflow: boolean;
  private stateValue: PathState = 'free';
  private source: OscillatorNode | null = null;

  constructor(
    context: AudioContext,
    outputGain: GainNode,
    detuneSource: ConstantSourceNode,
    depthSource: ConstantSourceNode,
    blendSource: ConstantSourceNode,
    overflow = false,
  ) {
    this.context = context;
    this.overflow = overflow;
    this.detuneSource = detuneSource;
    this.depthSource = depthSource;
    this.blendSource = blendSource;
    this.audioGain = context.createGain();
    this.panner = context.createStereoPanner();
    this.detuneScale = context.createGain();
    this.depthScale = context.createGain();
    this.blendInput = context.createGain();
    this.blendMapper = context.createGain();
    this.blendOffset = context.createConstantSource();
    this.blendShaper = context.createWaveShaper();

    // Blend maps the shared [0, 1] input into the shaper's [-1, 1] range.
    this.audioGain.gain.setValueAtTime(0, context.currentTime);
    this.blendMapper.gain.setValueAtTime(2, context.currentTime);
    this.blendOffset.offset.setValueAtTime(-1, context.currentTime);
    // ConstantSourceNode is one-shot; each path must stop its own offset source.
    this.blendOffset.start();

    detuneSource.connect(this.detuneScale);
    depthSource.connect(this.depthScale);
    blendSource.connect(this.blendInput);
    this.depthScale.connect(this.panner.pan);
    this.blendInput.connect(this.blendMapper);
    this.blendMapper.connect(this.blendShaper);
    this.blendOffset.connect(this.blendShaper);
    this.blendShaper.connect(this.audioGain.gain);
    this.audioGain.connect(this.panner);
    this.panner.connect(outputGain);
  }

  get state(): PathState {
    return this.stateValue;
  }

  get isOverflow(): boolean {
    return this.overflow;
  }

  configure(voiceCount: number, index: number, position: number): void {
    this.expectState('free');
    // Free paths are silent; reset every reusable control before attachment.
    this.audioGain.gain.cancelScheduledValues(this.context.currentTime);
    this.audioGain.gain.setValueAtTime(0, this.context.currentTime);
    this.detuneScale.gain.setValueAtTime(position, this.context.currentTime);
    this.depthScale.gain.setValueAtTime(position, this.context.currentTime);
    this.panner.pan.setValueAtTime(0, this.context.currentTime);
    BlendCurveCache.applyTo(this.blendShaper, voiceCount, index);
    this.source = null;
    this.stateValue = 'leased';
  }

  arm(source: OscillatorNode): void {
    this.expectState('leased');
    this.source = source;
    source.connect(this.audioGain);
    this.detuneScale.connect(source.detune);
    this.stateValue = 'armed';
  }

  beginDrain(): void {
    this.expectState('armed');
    this.stateValue = 'draining';
  }

  disarm(source: OscillatorNode): void {
    if (this.stateValue !== 'draining' || this.source !== source) {
      return;
    }
    this.disconnect(() => this.detuneScale.disconnect(source.detune));
    this.disconnect(() => source.disconnect(this.audioGain));
    this.source = null;
    this.audioGain.gain.cancelScheduledValues(this.context.currentTime);
    this.audioGain.gain.setValueAtTime(0, this.context.currentTime);
    this.stateValue = 'free';
  }

  abort(): void {
    if (this.stateValue === 'destroyed' || this.stateValue === 'free') {
      return;
    }
    const source = this.source;
    if (source) {
      this.disconnect(() => this.detuneScale.disconnect(source.detune));
      this.disconnect(() => source.disconnect(this.audioGain));
    }
    this.source = null;
    this.audioGain.gain.cancelScheduledValues(this.context.currentTime);
    this.audioGain.gain.setValueAtTime(0, this.context.currentTime);
    this.stateValue = 'free';
  }

  destroy(): void {
    if (this.stateValue === 'destroyed') {
      return;
    }
    this.stateValue = 'destroyed';
    const source = this.source;
    if (source) {
      this.disconnect(() => this.detuneScale.disconnect(source.detune));
      this.disconnect(() => source.disconnect(this.audioGain));
    }
    this.source = null;
    // Node disconnect is outbound only; remove every shared inbound link exactly.
    this.disconnect(() => this.detuneSource.disconnect(this.detuneScale));
    this.disconnect(() => this.depthSource.disconnect(this.depthScale));
    this.disconnect(() => this.blendSource.disconnect(this.blendInput));
    [
      this.detuneScale,
      this.depthScale,
      this.blendInput,
      this.blendMapper,
      this.blendOffset,
      this.blendShaper,
      this.audioGain,
      this.panner,
    ].forEach(node => this.disconnect(() => node.disconnect()));
    this.disconnect(() => this.blendOffset.stop());
  }

  private expectState(expected: PathState): void {
    if (this.stateValue !== expected) {
      throw new Error(
        `Invalid UnisonVoicePath transition from ${this.stateValue}; expected ${expected}`,
      );
    }
  }

  private disconnect(action: () => void): void {
    try {
      action();
    } catch {
      // Teardown remains best-effort when context or node is already closed.
    }
  }
}

export class UnisonVoicePathPool {
  private readonly stablePaths: UnisonVoicePath[] = [];
  private readonly overflowPaths = new Set<UnisonVoicePath>();
  private readonly countersValue = {
    created: 0,
    acquired: 0,
    released: 0,
    overflowCreated: 0,
    overflowDestroyed: 0,
  };
  private destroyed = false;

  private readonly context: AudioContext;
  private readonly outputGain: GainNode;
  private readonly detuneSource: ConstantSourceNode;
  private readonly depthSource: ConstantSourceNode;
  private readonly blendSource: ConstantSourceNode;

  constructor(
    context: AudioContext,
    outputGain: GainNode,
    detuneSource: ConstantSourceNode,
    depthSource: ConstantSourceNode,
    blendSource: ConstantSourceNode,
  ) {
    this.context = context;
    this.outputGain = outputGain;
    this.detuneSource = detuneSource;
    this.depthSource = depthSource;
    this.blendSource = blendSource;
  }

  get counters(): Readonly<typeof this.countersValue> {
    return { ...this.countersValue };
  }

  acquire(voiceCount: number): PathLease {
    if (this.destroyed) {
      throw new Error('UnisonVoicePathPool is destroyed');
    }
    if (!Number.isInteger(voiceCount) || voiceCount < 2 || voiceCount > 16) {
      throw new RangeError('Invalid unison voice count');
    }

    this.countersValue.acquired++;
    // Draining paths remain unavailable until their exact source has ended.
    const available = this.stablePaths.filter(path => path.state === 'free');
    const paths = available.slice(0, voiceCount);
    // Stable capacity covers the current bundle and one normal draining bundle.
    while (paths.length < voiceCount && this.stablePaths.length < voiceCount) {
      const path = this.createPath(false);
      this.stablePaths.push(path);
      paths.push(path);
    }
    const usesOverflow = paths.length < voiceCount;
    // Concurrent generations beyond stable capacity use temporary overflow paths.
    while (paths.length < voiceCount) {
      const path = this.createPath(true);
      this.overflowPaths.add(path);
      this.countersValue.overflowCreated++;
      paths.push(path);
    }
    try {
      paths.forEach((path, index) => {
        const position = -1 + (2 * index) / (voiceCount - 1);
        path.configure(voiceCount, index, position);
      });
    } catch (error) {
      this.abort({ paths, usesOverflow });
      throw error;
    }
    return { paths, usesOverflow };
  }

  release(lease: PathLease): void {
    this.countersValue.released++;
    lease.paths.forEach(path => {
      if (path.state === 'free' && path.isOverflow) {
        this.overflowPaths.delete(path);
        path.destroy();
        this.countersValue.overflowDestroyed++;
      }
    });
  }

  abort(lease: PathLease): void {
    lease.paths.forEach(path => path.abort());
    this.release(lease);
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.countersValue.overflowDestroyed += this.overflowPaths.size;
    [...this.stablePaths, ...this.overflowPaths].forEach(path =>
      path.destroy(),
    );
    this.stablePaths.length = 0;
    this.overflowPaths.clear();
  }

  private createPath(overflow: boolean): UnisonVoicePath {
    this.countersValue.created++;
    return new UnisonVoicePath(
      this.context,
      this.outputGain,
      this.detuneSource,
      this.depthSource,
      this.blendSource,
      overflow,
    );
  }
}
