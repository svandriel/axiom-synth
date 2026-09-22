export type FakeAudioDestination = FakeAudioNode | FakeAudioParam;

export interface FakeConnection {
  readonly source: FakeAudioNode;
  readonly destination: FakeAudioDestination;
}

export type FakeOperation =
  | {
      readonly type: 'connect';
      readonly source: FakeAudioNode;
      readonly destination: FakeAudioDestination;
    }
  | {
      readonly type: 'disconnect';
      readonly source: FakeAudioNode;
      readonly destination?: FakeAudioDestination;
    }
  | {
      readonly type: 'stop';
      readonly source: FakeOscillatorNode | FakeConstantSourceNode;
      readonly when?: number;
    };

export class FakeAudioParam {
  value = 0;
  readonly connections: FakeConnection[] = [];

  setValueAtTime(value: number, _time: number): void {
    this.value = value;
  }

  linearRampToValueAtTime(value: number, _time: number): void {
    this.value = value;
  }

  exponentialRampToValueAtTime(value: number, _time: number): void {
    this.value = value;
  }

  cancelScheduledValues(_time: number): void {}
}

export class FakeAudioNode {
  private readonly activeConnections: FakeConnection[] = [];
  throwOnConnect = false;
  throwOnDisconnect = false;
  readonly context: FakeAudioContext;

  get connections(): readonly FakeConnection[] {
    return this.activeConnections;
  }

  constructor(context: FakeAudioContext) {
    this.context = context;
  }

  connect(destination: FakeAudioDestination): void {
    if (this.throwOnConnect) {
      throw new Error('FakeAudioNode connect failed');
    }
    const connection = { source: this, destination };
    this.activeConnections.push(connection);
    this.context.connections.push(connection);
    this.context.record({
      type: 'connect',
      source: this,
      destination,
    });
  }

  disconnect(destination?: FakeAudioDestination): void {
    if (this.throwOnDisconnect) {
      throw new Error('FakeAudioNode disconnect failed');
    }

    this.context.record({
      type: 'disconnect',
      source: this,
      destination,
    });
    const matches = (connection: FakeConnection) =>
      connection.source === this &&
      (destination === undefined || connection.destination === destination);
    for (const connection of this.activeConnections.filter(matches)) {
      this.activeConnections.splice(
        this.activeConnections.indexOf(connection),
        1,
      );
      this.context.connections.splice(
        this.context.connections.indexOf(connection),
        1,
      );
    }
  }
}

export class FakeOscillatorNode extends FakeAudioNode {
  readonly frequency = new FakeAudioParam();
  readonly detune = new FakeAudioParam();
  private typeValue: OscillatorType = 'sine';
  throwOnTypeSet = false;
  onended: (() => void) | null = null;
  stopped = false;
  throwOnStop = false;
  stopTime: number | undefined;
  readonly startCalls: { when?: number }[] = [];
  readonly stopCalls: { when?: number }[] = [];

  get type(): OscillatorType {
    return this.typeValue;
  }

  set type(value: OscillatorType) {
    if (this.throwOnTypeSet) {
      throw new Error('FakeOscillatorNode type assignment failed');
    }
    this.typeValue = value;
  }

  start(when?: number): void {
    this.startCalls.push({ when });
  }

  stop(when?: number): void {
    if (this.throwOnStop) {
      throw new Error('FakeOscillatorNode stop failed');
    }
    this.stopped = true;
    this.stopTime = when;
    this.stopCalls.push({ when });
    this.context.record({ type: 'stop', source: this, when });
  }

  end(): void {
    this.onended?.();
  }
}

export class FakeGainNode extends FakeAudioNode {
  readonly gain = new FakeAudioParam();
}

export class FakeStereoPannerNode extends FakeAudioNode {
  readonly pan = new FakeAudioParam();
}

export class FakeWaveShaperNode extends FakeAudioNode {
  private curveValue: Float32Array<ArrayBuffer> | null = null;
  throwOnCurveSet = false;

  get curve(): Float32Array<ArrayBuffer> | null {
    return this.curveValue;
  }

  set curve(value: Float32Array<ArrayBuffer> | null) {
    if (this.throwOnCurveSet) {
      throw new Error('FakeWaveShaperNode curve assignment failed');
    }
    this.curveValue = value;
  }
}

export class FakeConstantSourceNode extends FakeAudioNode {
  readonly offset = new FakeAudioParam();
  readonly stopCalls: { when?: number }[] = [];
  stopped = false;

  start(_when?: number): void {}

  stop(when?: number): void {
    this.stopped = true;
    this.stopCalls.push({ when });
    this.context.record({ type: 'stop', source: this, when });
  }
}

export class FakeBiquadFilterNode extends FakeAudioNode {
  readonly frequency = new FakeAudioParam();
  readonly detune = new FakeAudioParam();
  readonly Q = new FakeAudioParam();
  readonly gain = new FakeAudioParam();
  type: BiquadFilterType = 'lowpass';
}

export class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 2048;
  smoothingTimeConstant = 0.8;

  getFloatTimeDomainData(array: Float32Array<ArrayBuffer>): void {
    array.fill(0);
  }
}

export class FakeDynamicsCompressorNode extends FakeAudioNode {}

export class FakeAudioContext {
  readonly destination = new FakeAudioNode(this);
  readonly connections: FakeConnection[] = [];
  readonly oscillators: FakeOscillatorNode[] = [];
  readonly gains: FakeGainNode[] = [];
  readonly stereoPanners: FakeStereoPannerNode[] = [];
  readonly waveShapers: FakeWaveShaperNode[] = [];
  readonly constantSources: FakeConstantSourceNode[] = [];
  readonly biquadFilters: FakeBiquadFilterNode[] = [];
  readonly analysers: FakeAnalyserNode[] = [];
  readonly compressors: FakeDynamicsCompressorNode[] = [];
  private readonly operationHistory: FakeOperation[] = [];
  currentTime = 0;
  state: AudioContextState = 'running';
  resume(): Promise<void> {
    return Promise.resolve();
  }

  get operations(): readonly FakeOperation[] {
    return Object.freeze([...this.operationHistory]);
  }

  record(operation: FakeOperation): void {
    this.operationHistory.push(Object.freeze(operation));
  }

  createOscillator(): FakeOscillatorNode {
    const node = new FakeOscillatorNode(this);
    this.oscillators.push(node);
    return node;
  }

  createGain(): FakeGainNode {
    const node = new FakeGainNode(this);
    this.gains.push(node);
    return node;
  }

  createStereoPanner(): FakeStereoPannerNode {
    const node = new FakeStereoPannerNode(this);
    this.stereoPanners.push(node);
    return node;
  }

  createWaveShaper(): FakeWaveShaperNode {
    const node = new FakeWaveShaperNode(this);
    this.waveShapers.push(node);
    return node;
  }

  createConstantSource(): FakeConstantSourceNode {
    const node = new FakeConstantSourceNode(this);
    this.constantSources.push(node);
    return node;
  }

  createBiquadFilter(): FakeBiquadFilterNode {
    const node = new FakeBiquadFilterNode(this);
    this.biquadFilters.push(node);
    return node;
  }

  createAnalyser(): FakeAnalyserNode {
    const node = new FakeAnalyserNode(this);
    this.analysers.push(node);
    return node;
  }

  createDynamicsCompressor(): FakeDynamicsCompressorNode {
    const node = new FakeDynamicsCompressorNode(this);
    this.compressors.push(node);
    return node;
  }

  close(): Promise<void> {
    return Promise.resolve();
  }
}

export function installFakeAudioParam(): () => void {
  // Vitest's Node environment has no native AudioParam constructor. Install it
  // only for tests that exercise instanceof checks, then restore global state.
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'AudioParam');
  Object.defineProperty(globalThis, 'AudioParam', {
    configurable: true,
    value: FakeAudioParam,
  });

  return () => {
    if (previous) {
      Object.defineProperty(globalThis, 'AudioParam', previous);
    } else {
      delete (
        globalThis as unknown as {
          AudioParam?: typeof FakeAudioParam;
        }
      ).AudioParam;
    }
  };
}
