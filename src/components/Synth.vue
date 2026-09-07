<template>
  <div
    class="synth b-3 min-h-100 min-w-5xl rounded-2xl bg-default p-3 shadow-out dark:bg-default-dark dark:shadow-out-dark"
  >
    <div class="grid grid-cols-12 grid-rows-3 gap-3">
      <OscillatorPanel class="col-span-4 row-start-1" v-model="osc1" />
      <OscillatorPanel class="col-span-4 row-start-2" v-model="osc2" />
      <OscillatorPanel class="col-span-4 row-start-3" v-model="osc3" />
    </div>

    <div class="flex flex-col">
      <div class="ml-3 flex flex-row items-center gap-5">
        <SynthButton>osc 1</SynthButton>
        <SynthButton>osc 2</SynthButton>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { reactive, watch } from 'vue';
import type { OscillatorConfig } from '../types/oscillator-config.ts';
import OscillatorPanel from './OscillatorPanel.vue';
import SynthButton from './SynthButton.vue';

const osc1 = reactive<OscillatorConfig>({
  label: 'Osc 1',
  detune: -0.1,
  pitch: 0,
  gain: 1,
  waveform: 'saw',
});
const osc2 = reactive<OscillatorConfig>({
  label: 'Osc 2',
  detune: 0.1,
  pitch: 0,
  gain: 1,
  waveform: 'saw',
});
const osc3 = reactive<OscillatorConfig>({
  label: 'Osc 3',
  detune: 0,
  pitch: -12,
  gain: 0.75,
  waveform: 'sine',
});

watch([osc1, osc2, osc3], () => {
  console.log('Oscillator configs changed:', osc1, osc2, osc3);
});
</script>
