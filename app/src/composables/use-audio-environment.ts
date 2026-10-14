import { AudioEngine } from '@axiom/audio-engine';
import { AxiomSynth } from '@axiom/axiom-synth';
import { markRaw, onUnmounted, ref, type Ref } from 'vue';

import impulseResponse from '../assets/ir/five_columns_long.wav';

export interface AudioEnvironment {
  engine: AudioEngine;
  synth: AxiomSynth;
}

const audioEnvironment = ref<AudioEnvironment>();

export function useAudioEnvironment(): Ref<AudioEnvironment> {
  if (!audioEnvironment.value) {
    const engine = new AudioEngine();
    fetch(impulseResponse)
      .then(response => response.arrayBuffer())
      .then(buffer => engine.ctxt.decodeAudioData(buffer))
      .then(audioBuffer => {
        console.log(
          `Loaded ${impulseResponse}: ${audioBuffer.duration.toFixed(1)} s, samplerate ${audioBuffer.sampleRate}, channels: ${audioBuffer.numberOfChannels}`,
        );
        engine.reverbBuffer = audioBuffer;
      })
      .catch(err => {
        console.error(`Error loading reverb ir`, err);
      });
    const synth = createSynth(engine);
    audioEnvironment.value = {
      engine,
      synth,
    };
  }

  onUnmounted(() => {
    if (audioEnvironment.value) {
      audioEnvironment.value.synth.destroy();
      audioEnvironment.value.engine.destroy();
      audioEnvironment.value = undefined;
    }
  });

  return audioEnvironment as Ref<AudioEnvironment>;
}

function createSynth(engine: AudioEngine): AxiomSynth {
  const synth = markRaw(new AxiomSynth(engine.ctxt, engine.masterInput));
  synth.output.connect(engine.masterInput);
  return synth;
}
