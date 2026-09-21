<template>
  <div
    class="synth b-3 min-h-100 rounded-2xl bg-default p-3 shadow-out dark:bg-default-dark dark:shadow-out-dark"
  >
    <div
      class="grid grid-cols-12 grid-rows-9 gap-3 sm:grid-rows-6 lg:grid-rows-3"
    >
      <OscillatorPanel
        class="col-span-12 row-start-1 sm:col-span-6 lg:col-span-4"
        label="vco1"
        v-model="osc1"
      />
      <OscillatorPanel
        class="col-span-12 row-start-2 sm:col-span-6 lg:col-span-4"
        label="vco2"
        v-model="osc2"
      />
      <OscillatorPanel
        class="col-span-12 row-start-3 sm:col-span-6 lg:col-span-4"
        label="vco3"
        v-model="osc3"
      />
      <FilterPanel
        class="col-span-12 row-start-4 sm:col-span-6 sm:col-start-7 sm:row-start-1 lg:col-span-4"
        v-model:cutoff="cutoff"
        v-model:resonance="resonance"
        v-model:envAmount="envAmount"
        v-model:tracking="tracking"
        v-model:type="filterType"
      />
      <EnvelopePanel
        class="col-span-12 row-start-5 sm:col-span-6 sm:col-start-7 sm:row-start-2 lg:col-span-4"
        v-model:amp="ampEnvelope"
        v-model:filter="filterEnvelope"
      />
      <WaveshaperPanel
        class="col-span-12 row-start-6 sm:col-span-6 sm:col-start-7 sm:row-start-3 lg:col-span-4 lg:col-start-9 lg:row-start-1"
        v-model:distortionAmount="waveshaperDistortion"
        v-model:drive="waveshaperDrive"
        v-model:type="waveshaperType"
        :curve="synth.shaperCurve"
      />
      <LfoPanel
        class="col-span-12 row-span-2 row-start-7 sm:col-span-12 sm:col-start-1 sm:row-start-4 lg:col-span-4 lg:row-start-2"
        v-model="activeLfo"
        v-model:selected-lfo="selectedLfo"
      />
      <ScopePanel
        class="col-span-12 row-start-9 sm:col-span-12 sm:col-start-1 sm:row-start-6 lg:col-span-4 lg:col-start-5 lg:row-start-3"
      />
    </div>

    <Keyboard class="mt-3" />
  </div>
</template>
<script setup lang="ts">
import { computed, onUnmounted, reactive, ref, watch } from 'vue';
import type { LfoConfig, LfoIndex } from '@axiom/audio-engine';
import { useAudioEngine } from '../composables/use-audio-context.ts';
import { useAxiomSynth } from '../composables/use-axiom-synth.ts';
import EnvelopePanel from './EnvelopePanel.vue';
import FilterPanel from './FilterPanel.vue';
import Keyboard from './Keyboard.vue';
import LfoPanel from './LfoPanel.vue';
import OscillatorPanel from './OscillatorPanel.vue';
import ScopePanel from './ScopePanel.vue';
import WaveshaperPanel from './WaveshaperPanel.vue';

const synth = useAxiomSynth();
const engine = useAudioEngine();
const filterQ = Math.log2(2 * synth.value.filterConfig.q) / Math.log2(40);
const cutoff = ref(synth.value.filterConfig.frequency);
const resonance = ref(filterQ);
const envAmount = ref(synth.value.filterConfig.envAmount / 9600);
const tracking = ref(synth.value.filterConfig.tracking);
const filterType = ref(synth.value.filterType);
const waveshaperType = ref(synth.value.waveshaperType);
const waveshaperDistortion = ref(synth.value.distortionAmount);
const waveshaperDrive = ref(synth.value.waveshaperDrive);

function cloneLfoConfig(c: LfoConfig): LfoConfig {
  return {
    rateHz: c.rateHz,
    waveform: c.waveform,
    depths: c.depths.slice() as LfoConfig['depths'],
  };
}

const lfoConfigs = [
  reactive(cloneLfoConfig(synth.value.lfoConfigs[0])),
  reactive(cloneLfoConfig(synth.value.lfoConfigs[1])),
  reactive(cloneLfoConfig(synth.value.lfoConfigs[2])),
  reactive(cloneLfoConfig(synth.value.lfoConfigs[3])),
];

const ampEnvelope = reactive({ ...synth.value.ampEnvelope });
const filterEnvelope = reactive({ ...synth.value.filterEnvelope });

watch(
  ampEnvelope,
  cfg => {
    synth.value.ampEnvelope = cfg;
  },
  { deep: true },
);

watch(
  filterEnvelope,
  cfg => {
    synth.value.filterEnvelope = cfg;
  },
  { deep: true },
);

const selectedLfo = ref('0');
const activeLfo = computed(() => lfoConfigs[Number(selectedLfo.value)]!);

watch(
  activeLfo,
  cfg => {
    synth.value.setLfoConfiguration(Number(selectedLfo.value) as LfoIndex, cfg);
  },
  { deep: true },
);

let osc1 = reactive({ ...synth.value.oscillatorConfigs[0] });
let osc2 = reactive({ ...synth.value.oscillatorConfigs[1] });
let osc3 = reactive({ ...synth.value.oscillatorConfigs[2] });

watch(cutoff, newCutoff => {
  synth.value.filterCutOff = newCutoff;
});

watch(resonance, newResonance => {
  const q = 0.5 * Math.pow(40, newResonance);
  synth.value.filterQ = q;
});

watch(envAmount, newEnvAmount => {
  synth.value.filterEnvAmount = newEnvAmount * 9600;
});

watch(tracking, newTracking => {
  synth.value.filterKeyTrack = newTracking;
});

watch(filterType, newType => {
  synth.value.filterType = newType;
});

watch(osc1, newOsc1 => {
  synth.value.setOscillatorConfiguration(0, newOsc1);
});
watch(osc2, newOsc2 => {
  synth.value.setOscillatorConfiguration(1, newOsc2);
});
watch(osc3, newOsc3 => {
  synth.value.setOscillatorConfiguration(2, newOsc3);
});

watch(waveshaperDistortion, value => {
  synth.value.distortionAmount = value;
});
watch(waveshaperDrive, value => {
  synth.value.waveshaperDrive = value;
});
watch(waveshaperType, value => {
  synth.value.waveshaperType = value;
});

onUnmounted(() => {
  synth.value.destroy();
  engine.value.destroy();
});
</script>
