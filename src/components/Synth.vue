<template>
  <div
    class="synth min-h-100 p-3 rounded-2xl b-3 shadow-out dark:shadow-out-dark"
  >
    synth
    <div class="">
      <Toggle
        :values="[
          { id: 'sine', label: 'Sin' },
          { id: 'square', label: 'Square' },
          { id: 'triangle', label: 'Triangle' },
        ]"
        v-model="waveForm"
      />
    </div>
  </div>
</template>
<script setup lang="ts">
import { ref } from "vue";
import Toggle from "./Toggle.vue";

const waveForm = ref("sine");
</script>
