import { describe, expect, it, vi } from 'vitest';

class FakeAudioWorkletNode {
  readonly parameters = new Map([['frequency', {}]]);
  readonly connect = vi.fn();
  readonly disconnect = vi.fn();
  readonly port = { postMessage: vi.fn() };
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

const { SawOscillatorNode } = await import('./saw-oscillator-node');

describe('SawOscillatorNode', () => {
  it('creates a mono worklet with the default frequency', () => {
    const node = new SawOscillatorNode({} as AudioContext, new ArrayBuffer(0));
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };

    expect(workletNode.node.name).toBe('saw-processor');
    expect(workletNode.node.options).toEqual({
      numberOfInputs: 0,
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
    const node = new SawOscillatorNode({} as AudioContext, new ArrayBuffer(0), {
      frequency: 220,
    });
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };

    expect(workletNode.node.options.parameterData).toEqual({});
    expect(node.frequency).toBe(workletNode.node.parameters.get('frequency'));
  });

  it('connects to both audio nodes and audio parameters', () => {
    const node = new SawOscillatorNode({} as AudioContext, new ArrayBuffer(0));
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
    const node = new SawOscillatorNode({} as AudioContext, new ArrayBuffer(0));
    const workletNode = node as unknown as { node: FakeAudioWorkletNode };

    node.destroy();
    node.destroy();

    expect(workletNode.node.port.postMessage).toHaveBeenCalledTimes(1);
    expect(workletNode.node.port.postMessage).toHaveBeenCalledWith({
      type: 'DESTROY',
    });
    expect(workletNode.node.disconnect).toHaveBeenCalledTimes(1);
  });
});
