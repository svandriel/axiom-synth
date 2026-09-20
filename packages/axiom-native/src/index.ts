/// <reference path="./@types/vite-env.d.ts" />

import type { WorkletMessage } from './shared/worklet-message';
import wasmUrl from '../pkg/axiom_native_bg.wasm?url';

export interface SawWorkletOptions {
  frequency?: number;
}

export async function createSawWorkletNode(
  context: BaseAudioContext,
  options?: SawWorkletOptions,
): Promise<AudioWorkletNode> {
  console.log('wasmUrl', wasmUrl);
  await context.audioWorklet.addModule(
    new URL('../processor.ts', import.meta.url),
  );

  const wasmBytes = await (await fetch(wasmUrl)).arrayBuffer();

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
