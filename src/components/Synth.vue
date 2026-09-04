<template>
  <div
    class="synth bg-slate-300 dark:bg-slate-700 min-h-100 p-3 rounded-2xl b-3 shadow-lg"
  >
    synth
    <Toggle
      :values="[
        { id: 'sine', label: 'Sin' },
        { id: 'square', label: 'Square' },
        { id: 'triangle', label: 'Triangle' },
      ]"
      v-model="waveForm"
    />
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import Toggle from "./Toggle.vue";

const waveForm = ref("sine");
</script>

<style lang="css" scoped>
.synth {
  /* background:
    repeating-linear-gradient(
      90deg,
      rgba(255, 255, 255, 0.08) 0 1px,
      transparent 1px 3px
    ),
    repeating-linear-gradient(
      90deg,
      rgba(0, 0, 0, 0.04) 0 2px,
      transparent 2px 5px
    ),
    linear-gradient(180deg, var(--alu-1), var(--alu-2) 50%, var(--alu-3)); */
}
</style>
