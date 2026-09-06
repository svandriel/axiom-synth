<template>
  <div
    class="synth b-3 min-h-100 rounded-2xl bg-default p-3 shadow-out dark:bg-default-dark dark:shadow-out-dark"
  >
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
import { ref } from 'vue';
import Toggle from './Toggle.vue';
import SynthButton from './SynthButton.vue';

const waveForm = ref('sine');
</script>

<style lang="css" scoped>
.synth {
  /* box-shadow: -3px -1px 19px 14px var(--color-primary-300/50); */
}
</style>
