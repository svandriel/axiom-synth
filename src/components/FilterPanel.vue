<template>
  <Panel :label="label">
    <div class="mt-3 flex flex-row gap-10">
      <Knob
        label="Cutoff"
        v-model="cutoff"
        class="mt-3"
        :from="20"
        :to="20000"
        :log-base="2"
        :default="20000"
        :format="v => `${v.toFixed(0)} Hz`"
      />
      <Knob
        label="Res"
        v-model="resonance"
        class="mt-3"
        :from="0"
        :to="1"
        :default="0.6"
        :format="v => fractionDisplay(0)(v * 100)"
      />
      <Knob
        label="Env Amt"
        v-model="envAmount"
        class="mt-3"
        :from="-1"
        :to="1"
        :default="0"
        :format="v => fractionDisplay(0)(v * 100)"
      />
      <Knob
        label="Tracking"
        v-model="tracking"
        class="mt-3"
        :from="0"
        :to="2"
        :default="0"
        :format="v => fractionDisplay(0)(v * 100)"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { fractionDisplay } from '../utils/fraction-display.ts';
import Knob from './Knob.vue';
import Panel from './Panel.vue';

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

withDefaults(
  defineProps<{
    label?: string;
  }>(),
  {
    label: 'VCF',
  },
);
</script>
