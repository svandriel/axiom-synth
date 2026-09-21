import { markRaw, ref, watch } from 'vue';
import { AxiomSynth } from '@axiom/axiom-synth';
import { useAudioEngine } from './use-audio-context.ts';

let axiomSynth: AxiomSynth | null = null;

type EngineValue = ReturnType<typeof useAudioEngine>['value'];

function createSynth(engine: EngineValue): AxiomSynth {
  const synth = markRaw(new AxiomSynth(engine.ctxt, engine.masterInput));
  synth.output.connect(engine.masterInput);
  return synth;
}

export function useAxiomSynth() {
  const engine = useAudioEngine();
  const synthRef = ref<AxiomSynth>(ensureSynth(engine.value));

  watch(engine, newEngine => {
    if (axiomSynth) {
      axiomSynth.destroy();
      axiomSynth = null;
    }
    synthRef.value = ensureSynth(newEngine);
  });

  return synthRef;
}

function ensureSynth(engine: EngineValue): AxiomSynth {
  if (!axiomSynth) {
    axiomSynth = createSynth(engine);
  }
  return axiomSynth;
}
