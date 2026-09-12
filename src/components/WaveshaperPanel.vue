<template>
  <Panel label="Shaper">
    <template #top-right>
      <Toggle v-model="type" :values="types" />
    </template>
    <div class="mt-4 flex flex-row gap-4">
      <Knob
        v-model="distortionAmount"
        :from="0"
        :to="100"
        label="Distortion"
        size="md"
        :format="v => `${v.toFixed(1)}%`"
      />
      <Knob
        v-model="drive"
        :from="0"
        :to="4"
        label="Drive"
        size="md"
        :format="d => dbDisplay(d + 1)"
      />
    </div>
  </Panel>
</template>
<script setup lang="ts">
import { type WaveshaperType } from '../engine/waveshaper.ts';
import { dbDisplay } from '../utils/db-display.ts';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';

const distortionAmount = defineModel<number>('distortionAmount', {
  required: true,
});
const drive = defineModel<number>('drive', { required: true });
const type = defineModel<WaveshaperType>('type', { required: true });

const types: Array<{ id: WaveshaperType; label: string }> = [
  {
    id: 'soft-algebraic',
    label: 'Soft',
  },
  {
    id: 'atan',
    label: 'Atan',
  },
  {
    id: 'asymmetric-tube',
    label: 'Tube',
  },
  {
    id: 'hard-clipper',
    label: 'Clip',
  },
  {
    id: 'sine-shaper',
    label: 'Sine',
  },
  {
    id: 'chebyshev',
    label: 'Cheb',
  },
];
</script>
