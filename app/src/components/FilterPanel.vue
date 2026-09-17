<template>
  <Panel :label="label">
    <template #top-right>
      <Toggle v-model="type" :values="types" />
    </template>
    <div class="flex flex-row justify-between gap-4">
      <Knob
        label="Cutoff"
        v-model="cutoff"
        size="md"
        :from="20"
        :to="20000"
        :log-base="2"
        :default="20000"
        :format="v => `${v.toFixed(0)} Hz`"
      />
      <Knob
        label="Res"
        v-model="resonance"
        size="md"
        :from="0"
        :to="1"
        :default="0.6"
        :format="v => fractionDisplay(0)(v * 100)"
      />
      <Knob
        label="Env Amt"
        v-model="envAmount"
        size="md"
        :from="-1"
        :to="1"
        :default="0"
        :format="v => fractionDisplay(0)(v * 100)"
      />
      <Knob
        label="Tracking"
        v-model="tracking"
        size="md"
        :from="0"
        :to="2"
        :default="0"
        :format="v => fractionDisplay(0)(v * 100)"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { type FilterType } from '@axiom/audio-engine';
import { fractionDisplay } from '../utils/fraction-display.ts';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';

const type = defineModel<FilterType>('type', {
  required: true,
});

const cutoff = defineModel<number>('cutoff', {
  required: true,
});

const resonance = defineModel<number>('resonance', {
  required: true,
});

const envAmount = defineModel<number>('envAmount', {
  required: true,
});

const tracking = defineModel<number>('tracking', {
  required: true,
});

const types: Array<{ id: FilterType; label: string }> = [
  { id: 'lowpass12', label: 'LP12' },
  { id: 'lowpass24', label: 'LP24' },
  { id: 'highpass12', label: 'HP12' },
  { id: 'highpass24', label: 'HP24' },
  { id: 'bandpass', label: 'BP' },
  { id: 'notch', label: 'Notch' },
];

withDefaults(
  defineProps<{
    label?: string;
  }>(),
  {
    label: 'VCF',
  },
);
</script>
