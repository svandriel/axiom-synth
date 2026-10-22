import { describe, expect, it, vi } from 'vitest';

class FakeAudioWorkletNode {
  readonly parameters = new Map([
    ['frequency', {}],
    ['waveform', {}],
  ]);
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly port = {
    onmessage: undefined as ((event: MessageEvent) => void) | undefined,
    postMessage: vi.fn(),
  };
  readonly options: AudioWorkletNodeOptions;
  readonly context: AudioContext;
  readonly name: string;

  constructor(
    context: AudioContext,
    name: string,
    options: AudioWorkletNodeOptions,
  ) {
    this.context = context;
    this.name = name;
    this.options = options;
  }
}

Object.assign(globalThis, { AudioWorkletNode: FakeAudioWorkletNode });

const { MoogOscillatorWorkletNode } =
  await import('./moog-oscillator-worklet-node');

describe('MoogOscillatorWorkletNode', () => {
  it('creates a mono worklet with the default frequency', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };

    expect(workletNode.node.name).toBe('moog-oscillator-processor');
    expect(workletNode.node.options).toEqual({
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {},
      processorOptions: {
        sampleRate: undefined,
        wasmModule: expect.any(ArrayBuffer),
      },
    });
  });

  it('passes a custom frequency and exposes the worklet parameter', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };

    expect(workletNode.node.options.parameterData).toEqual({});
    expect(node.frequency).toBe(workletNode.node.parameters.get('frequency'));
    expect(node.waveform).toBe(workletNode.node.parameters.get('waveform'));
  });

  it('connects to both audio nodes and audio parameters', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };
    const destinationNode = {} as AudioNode;
    const destinationParam = {} as AudioParam;

    node.connect(destinationNode);
    node.connect(destinationParam);

    expect(workletNode.node.connect).toHaveBeenNthCalledWith(
      1,
      destinationNode,
    );
    expect(workletNode.node.connect).toHaveBeenNthCalledWith(
      2,
      destinationParam,
    );
  });

  it('destroys the worklet once', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };

    node.destroy();
    node.destroy();

    expect(workletNode.node.port.postMessage).toHaveBeenCalledTimes(1);
    expect(workletNode.node.port.postMessage).toHaveBeenCalledWith({
      type: 'DESTROY',
    });
    expect(workletNode.node.disconnect).toHaveBeenCalledTimes(1);
  });

  it('posts START once and STOP once with their times', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };

    node.start(1);
    node.start(2);

    expect(workletNode.node.port.postMessage).toHaveBeenCalledTimes(1);
    expect(workletNode.node.port.postMessage).toHaveBeenCalledWith({
      type: 'START',
      when: 1,
    });

    node.stop(3);
    node.stop(4);

    expect(workletNode.node.port.postMessage).toHaveBeenCalledTimes(2);
    expect(workletNode.node.port.postMessage).toHaveBeenLastCalledWith({
      type: 'STOP',
      when: 3,
    });
  });

  it('fires onended exactly once on ENDED', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };
    const onended = vi.fn();
    node.onended = onended;
    const receive = workletNode.node.port.onmessage!;

    receive({ data: { type: 'ENDED' } } as MessageEvent);
    receive({ data: { type: 'ENDED' } } as MessageEvent);

    expect(onended).toHaveBeenCalledTimes(1);
  });

  it('delegates disconnect to the worklet node', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };
    const destinationNode = {} as AudioNode;
    const destinationParam = {} as AudioParam;

    node.disconnect();
    node.disconnect(destinationNode);
    node.disconnect(destinationParam);

    expect(workletNode.node.disconnect).toHaveBeenCalledTimes(3);
  });

  it('ignores start and stop after destroy', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };

    node.destroy();
    node.destroy();
    node.start(1);
    node.stop(1);

    expect(workletNode.node.port.postMessage).toHaveBeenCalledTimes(1);
    expect(workletNode.node.disconnect).toHaveBeenCalledTimes(1);
    expect(workletNode.node.port.onmessage).toBeNull();
  });

  it('does not fire onended after destroy', () => {
    const node = new MoogOscillatorWorkletNode(
      {} as AudioContext,
      new ArrayBuffer(0),
    );
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };
    const onended = vi.fn();
    node.onended = onended;

    node.destroy();
    workletNode.node.port.onmessage?.({
      data: { type: 'ENDED' },
    } as MessageEvent);

    expect(onended).not.toHaveBeenCalled();
  });
});
