export type FakeAudioDestination = FakeAudioNode | FakeAudioParam;

export interface FakeConnection {
  source: FakeAudioNode;
  destination: FakeAudioDestination;
}

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
  readonly connections: FakeConnection[] = [];
  throwOnDisconnect = false;
  readonly context: FakeAudioContext;

  constructor(context: FakeAudioContext) {
    this.context = context;
  }

  connect(destination: FakeAudioDestination): void {
    const connection = { source: this, destination };
    this.connections.push(connection);
    this.context.connections.push(connection);
  }

  disconnect(destination?: FakeAudioDestination): void {
    if (this.throwOnDisconnect) {
      throw new Error('FakeAudioNode disconnect failed');
    }

    const matches = (connection: FakeConnection) =>
      connection.source === this &&
      (destination === undefined || connection.destination === destination);
    for (const connection of this.connections.filter(matches)) {
      this.connections.splice(this.connections.indexOf(connection), 1);
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
  type: OscillatorType = 'sine';
  onended: (() => void) | null = null;
  stopped = false;
  stopTime: number | undefined;

  start(_when?: number): void {}

  stop(when?: number): void {
    this.stopped = true;
    this.stopTime = when;
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
  curve: Float32Array<ArrayBuffer> | null = null;
}

export class FakeConstantSourceNode extends FakeAudioNode {
  readonly offset = new FakeAudioParam();
  stopped = false;

  start(_when?: number): void {}

  stop(_when?: number): void {
    this.stopped = true;
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
  currentTime = 0;

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

Object.defineProperty(globalThis, 'AudioParam', {
  configurable: true,
  value: FakeAudioParam,
});
