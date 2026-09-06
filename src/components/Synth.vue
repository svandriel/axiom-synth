<template>
  <div
    class="synth b-3 min-h-100 rounded-2xl bg-default p-3 shadow-out dark:bg-default-dark dark:shadow-out-dark"
  >
    <div class="grid grid-cols-12 grid-rows-6 gap-3">
      <div class="col-span-4 row-start-1 section">
        Osc 1

        <Knob v-model="osc1Gain" :min="0" :max="100" :default="50" />
      </div>
      <div class="col-span-4 row-start-2 section">Osc 2</div>
      <div class="col-span-4 row-start-3 section">Osc 3</div>
    </div>

    <div class="flex flex-col">
      <Toggle
        :values="[
          { id: 'sine', label: 'Sin' },
          { id: 'square', label: 'Square' },
          { id: 'triangle', label: 'Triangle' },
        ]"
        v-model="waveForm"
      />

      <div class="ml-3 flex flex-row items-center gap-5">
        <SynthButton>osc 1</SynthButton>
        <SynthButton>osc 2</SynthButton>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref, watch } from 'vue';
import Toggle from './Toggle.vue';
import SynthButton from './SynthButton.vue';
import Knob from './Knob.vue';

const waveForm = ref('sine');

const osc1Gain = ref(0.5);

watch(osc1Gain, newValue => {
  console.log('osc1Gain changed:', newValue);
});
</script>

<style lang="css" scoped>
.synth {
  /* box-shadow: -3px -1px 19px 14px var(--color-primary-300/50); */
}
</style>
