<template>
  <div
    class="synth b-3 min-h-100 rounded-2xl bg-default p-3 shadow-out dark:bg-default-dark dark:shadow-out-dark"
  >
    <div class="grid grid-cols-12 grid-rows-3 gap-3">
      <OscillatorPanel
        class="col-span-12 row-start-1 sm:col-span-6 lg:col-span-4"
        v-model="osc1"
      />
      <OscillatorPanel
        class="col-span-12 row-start-2 sm:col-span-6 lg:col-span-4"
        v-model="osc2"
      />
      <OscillatorPanel
        class="col-span-12 row-start-3 sm:col-span-6 lg:col-span-4"
        v-model="osc3"
      />
      <FilterPanel
        class="col-span-12 col-start-5 row-start-1 sm:col-span-6 lg:col-span-4"
        v-model:cutoff="cutoff"
        v-model:resonance="resonance"
        v-model:envAmount="envAmount"
      />
    </div>

    <Keyboard class="mt-3" />
  </div>
</template>
<script setup lang="ts">
import { onUnmounted, reactive, ref, watch } from 'vue';
import { useAudioEngine } from '../composables/use-audio-context.ts';
import type { OscillatorConfig } from '../types/oscillator-config.ts';
import Keyboard from './Keyboard.vue';
import OscillatorPanel from './OscillatorPanel.vue';
import FilterPanel from './FilterPanel.vue';

const engine = useAudioEngine();
const filterQ = Math.log2(2 * engine.value.filterConfig.q) / Math.log2(40);
const cutoff = ref(engine.value.filterConfig.frequency);
const resonance = ref(filterQ);
const envAmount = ref(engine.value.filterConfig.envAmount / 9600);

let osc1 = reactive<OscillatorConfig>({
  label: 'VCO 1',
  detune: -0.1,
  pitch: 0,
  gain: 1,
  waveform: 'saw',
});
let osc2 = reactive<OscillatorConfig>({
  label: 'VCO 2',
  detune: 0.1,
  pitch: 0,
  gain: 1,
  waveform: 'saw',
});
let osc3 = reactive<OscillatorConfig>({
  label: 'VCO 3',
  detune: 0,
  pitch: -12,
  gain: 0.75,
  waveform: 'sine',
});

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

onUnmounted(() => {
  engine.value.destroy();
});
</script>
