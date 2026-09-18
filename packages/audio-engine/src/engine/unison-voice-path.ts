import { BlendCurveCache } from './blend-curve-cache';

type PathState = 'free' | 'leased' | 'armed' | 'draining' | 'destroyed';

export interface PathLease {
  readonly paths: readonly UnisonVoicePath[];
  readonly usesOverflow: boolean;
}

export class UnisonVoicePath {
  readonly audioGain: GainNode;
  readonly detuneScale: GainNode;
  private readonly depthScale: GainNode;
  private readonly panner: StereoPannerNode;
  private readonly blendInput: GainNode;
  private readonly blendMapper: GainNode;
  private readonly blendOffset: ConstantSourceNode;
  private readonly blendShaper: WaveShaperNode;
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
    this.audioGain = context.createGain();
    this.panner = context.createStereoPanner();
    this.detuneScale = context.createGain();
    this.depthScale = context.createGain();
    this.blendInput = context.createGain();
    this.blendMapper = context.createGain();
    this.blendOffset = context.createConstantSource();
    this.blendShaper = context.createWaveShaper();

    this.audioGain.gain.setValueAtTime(0, context.currentTime);
    this.blendMapper.gain.setValueAtTime(2, context.currentTime);
    this.blendOffset.offset.setValueAtTime(-1, context.currentTime);
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

  acquire(voiceCount: number): PathLease {
    if (this.destroyed) {
      throw new Error('UnisonVoicePathPool is destroyed');
    }
    if (!Number.isInteger(voiceCount) || voiceCount < 2 || voiceCount > 16) {
      throw new RangeError('Invalid unison voice count');
    }

    const available = this.stablePaths.filter(path => path.state === 'free');
    const paths = available.slice(0, voiceCount);
    while (paths.length < voiceCount && this.stablePaths.length < voiceCount) {
      const path = this.createPath(false);
      this.stablePaths.push(path);
      paths.push(path);
    }
    const usesOverflow = paths.length < voiceCount;
    while (paths.length < voiceCount) {
      const path = this.createPath(true);
      this.overflowPaths.add(path);
      paths.push(path);
    }
    paths.forEach((path, index) => {
      const position = -1 + (2 * index) / (voiceCount - 1);
      path.configure(voiceCount, index, position);
    });
    return { paths, usesOverflow };
  }

  release(lease: PathLease): void {
    lease.paths.forEach(path => {
      if (path.state === 'free' && path.isOverflow) {
        this.overflowPaths.delete(path);
        path.destroy();
      }
    });
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    [...this.stablePaths, ...this.overflowPaths].forEach(path =>
      path.destroy(),
    );
    this.stablePaths.length = 0;
    this.overflowPaths.clear();
  }

  private createPath(overflow: boolean): UnisonVoicePath {
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
