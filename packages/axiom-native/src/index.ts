import type { WorkletMessage } from './worklet-message';

export interface SawWorkletOptions {
  frequency?: number;
}

export async function createSawWorkletNode(
  context: BaseAudioContext,
  wasmBytes: ArrayBuffer,
  options?: SawWorkletOptions,
): Promise<AudioWorkletNode> {
  await context.audioWorklet.addModule(
    new URL('../processor.ts', import.meta.url),
  );

  const node = new AudioWorkletNode(context, 'saw-processor', {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [2],
    parameterData: { frequency: options?.frequency ?? 440 },
  });

  const message: WorkletMessage = {
    type: 'INIT_WASM',
    wasmBytes,
    sampleRate: context.sampleRate,
    frequency: options?.frequency,
  };
  node.port.postMessage(message);

  return node;
}
