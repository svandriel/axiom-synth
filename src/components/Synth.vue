<template>
  <div
    class="synth bg-primary-300 dark:bg-primary-700 min-h-100 p-3 rounded-2xl b-3 shadow-out dark:shadow-out-dark"
  >
    <div class="flex flex-col">
      <Toggle
        :values="[
          { id: 'sine', label: 'Sin' },
          { id: 'square', label: 'Square' },
          { id: 'triangle', label: 'Triangle' }
        ]"
        v-model="waveForm"
      />

      <div class="flex flex-row gap-5 items-center ml-3">
        <SynthButton>osc 1</SynthButton>
        <SynthButton>osc 2</SynthButton>
      </div>
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from 'vue'
import Toggle from './Toggle.vue'
import SynthButton from './SynthButton.vue'

const waveForm = ref('sine')
</script>

<style lang="css" scoped>
.synth {
  /* box-shadow: -3px -1px 19px 14px var(--color-primary-300/50); */
}
</style>
