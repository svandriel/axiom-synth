export interface SawOscillatorOptions {
  // empty for now
}
export class SawOscillatorNode {
  private readonly node: AudioWorkletNode;

  constructor(
    ctxt: AudioContext,
    _options: Partial<SawOscillatorOptions> = {},
  ) {
    this.node = new AudioWorkletNode(ctxt, 'saw-processor', {
      numberOfInputs: 0,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      parameterData: {},
    });
  }

  get frequency(): AudioParam {
    return this.node.parameters.get('frequency')!;
  }

  connect(destination: AudioNode): void;
  connect(destination: AudioParam): void;
  connect(destination: AudioParam | AudioNode): void {
    this.node.connect(destination as AudioNode);
  }
}
