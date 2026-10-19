import { AudioEngine } from '@axiom/audio-engine';
import { AxiomSynth } from '@axiom/axiom-synth';
import { markRaw, onUnmounted } from 'vue';
import { useAsyncData } from './use-async-data';

import impulseResponse from '../assets/ir/five_columns_long.wav';

export interface AudioEnvironment {
  engine: AudioEngine;
  synth: AxiomSynth;
}

export function useAudioEnvironment() {
  const result = useAsyncData<AudioEnvironment>(async () => {
    const engine = new AudioEngine();
    const response = await fetch(impulseResponse);
    const buffer = await response.arrayBuffer();
    const audioBuffer = await engine.ctxt.decodeAudioData(buffer);
    console.log(
      `Loaded ${impulseResponse}: ${audioBuffer.duration.toFixed(1)} s, samplerate ${audioBuffer.sampleRate}, channels: ${audioBuffer.numberOfChannels}`,
    );
    engine.reverbBuffer = audioBuffer;
    const synth = await createSynth(engine);
    return {
      engine,
      synth,
    };
  });

  onUnmounted(() => {
    const audioEnvironment = result.data.value;
    if (audioEnvironment) {
      audioEnvironment.synth.destroy();
      audioEnvironment.engine.destroy();
    }
  });

  return result;
}

async function createSynth(engine: AudioEngine): Promise<AxiomSynth> {
  const synth = markRaw(
    await AxiomSynth.create(engine.ctxt, engine.masterInput, {
      activity: engine,
    }),
  );
  synth.output.connect(engine.masterInput);
  return synth;
}
