<template>
  <div class="section">
    <div class="flex flex-row items-center justify-between">
      <div class="text-sm tracking-wide uppercase">
        {{ modelValue.label ?? 'osc' }}
      </div>
      <Toggle :values="waveForms" v-model="modelValue.waveform" />
    </div>
    <div class="mt-3 flex flex-row gap-10">
      <Knob
        label="Semi"
        v-model="modelValue.pitch"
        class="mt-3"
        :from="-36"
        :to="36"
        :default="0"
        :tick-size="1"
        :format="semiDisplay"
      />
      <Knob
        label="Detune"
        v-model="modelValue.detune"
        class="mt-3"
        :from="-100"
        :to="100"
        :default="0"
        :format="fractionDisplay(1)"
      />
      <Knob
        label="Gain"
        v-model="modelValue.gain"
        class="mt-3"
        size="md"
        :from="0"
        :to="2"
        :default="1"
        :format="dbDisplay"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OscillatorConfig } from '../types';
import { dbDisplay } from '../utils/db-display.ts';
import { fractionDisplay } from '../utils/fraction-display.ts';
import { semiDisplay } from '../utils/semi-display.ts';
import Knob from './Knob.vue';
import Toggle from './Toggle.vue';

defineModel<OscillatorConfig>({
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
