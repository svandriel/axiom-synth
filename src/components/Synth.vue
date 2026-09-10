<template>
  <div
    class="synth b-3 min-h-100 rounded-2xl bg-default p-3 shadow-out dark:bg-default-dark dark:shadow-out-dark"
  >
    <div class="grid grid-cols-12 grid-rows-5 gap-3 sm:grid-rows-3">
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
      />
      <ScopePanel
        class="col-span-12 row-start-5 sm:col-span-6 sm:col-start-7 sm:row-start-2 lg:col-span-4"
      />
    </div>

    <Keyboard class="mt-3" />
  </div>
</template>
<script setup lang="ts">
import { onUnmounted, reactive, ref, watch } from 'vue';
import { useAudioEngine } from '../composables/use-audio-context.ts';
import FilterPanel from './FilterPanel.vue';
import Keyboard from './Keyboard.vue';
import OscillatorPanel from './OscillatorPanel.vue';
import ScopePanel from './ScopePanel.vue';

const engine = useAudioEngine();
const filterQ = Math.log2(2 * engine.value.filterConfig.q) / Math.log2(40);
const cutoff = ref(engine.value.filterConfig.frequency);
const resonance = ref(filterQ);
const envAmount = ref(engine.value.filterConfig.envAmount / 9600);

let osc1 = reactive(engine.value.oscillatorConfigs[0]);
let osc2 = reactive(engine.value.oscillatorConfigs[1]);
let osc3 = reactive(engine.value.oscillatorConfigs[2]);

watch(cutoff, newCutoff => {
  engine.value.filterCutOff = newCutoff;
});

watch(resonance, newResonance => {
  const q = 0.5 * Math.pow(40, newResonance);
  engine.value.filterQ = q;
});

watch(envAmount, newEnvAmount => {
  engine.value.filterEnvAmount = newEnvAmount * 9600;
});

watch(osc1, newOsc1 => {
  engine.value.setOscillatorConfiguration(0, newOsc1);
});
watch(osc2, newOsc2 => {
  engine.value.setOscillatorConfiguration(1, newOsc2);
});
watch(osc3, newOsc3 => {
  engine.value.setOscillatorConfiguration(2, newOsc3);
});

onUnmounted(() => {
  engine.value.destroy();
});
</script>
