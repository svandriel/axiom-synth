<template>
  <div class="section">
    <div class="flex flex-row items-center justify-between">
      <div class="text-sm tracking-wide uppercase">osc 1</div>
      <Toggle :values="waveForms" v-model="config.waveform" />
    </div>
    <div class="mt-3 flex flex-row gap-10">
      <Knob
        label="Pitch"
        v-model="config.pitch"
        class="mt-3"
        :from="-36"
        :to="36"
        :default="0"
        :tick-size="1"
      />
      <Knob
        label="Detune"
        v-model="config.detune"
        class="mt-3"
        :from="-100"
        :to="100"
        :default="0"
        :format="v => `${v.toFixed(1)}%`"
      />
      <Knob
        label="Gain"
        v-model="config.gain"
        class="mt-3"
        :from="0"
        :to="100"
        :default="50"
        :format="v => `${v.toFixed(1)}%`"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OscillatorConfig } from '../types';
import Knob from './Knob.vue';
import Toggle from './Toggle.vue';

const config = defineModel<OscillatorConfig>({
  required: true,
});

const waveForms = [
  { id: 'saw', label: 'Saw' },
  { id: 'sine', label: 'Sin' },
  { id: 'square', label: 'Sqr' },
  { id: 'triangle', label: 'Tri' },
  { id: 'pulse', label: 'Pulse' },
];
</script>
