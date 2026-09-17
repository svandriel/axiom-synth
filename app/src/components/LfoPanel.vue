<template>
  <Panel label="LFO">
    <template #top-right>
      <Toggle v-model="selectedLfo" :values="lfoSlots" />
    </template>
    <div class="mt-3 flex flex-row gap-4">
      <Knob
        v-model="rateHz"
        label="Rate"
        size="md"
        :from="0.01"
        :to="220"
        :log-base="2"
        :default="2"
        :format="rateFormat"
      />
      <Toggle v-model="waveform" :values="waveforms" class="mt-3 self-start" />
    </div>
    <div class="mt-3 grid grid-cols-3 gap-4">
      <Knob
        v-for="i in depthIndices"
        :key="depthLabels[i]!"
        :model-value="config.depths[i]!"
        @update:model-value="(v: number) => setDepth(i, v)"
        :label="depthLabels[i]!"
        size="md"
        :from="-1"
        :to="1"
        :default="0"
        :format="depthFormat"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { LfoConfig, LfoWaveformType } from '@axiom/audio-engine';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';

const config = defineModel<LfoConfig>({ required: true });
const selectedLfo = defineModel<string>('selectedLfo', { required: true });

const lfoSlots = [
  { id: '0', label: 'LFO1' },
  { id: '1', label: 'LFO2' },
  { id: '2', label: 'LFO3' },
  { id: '3', label: 'LFO4' },
];

const waveforms: Array<{ id: LfoWaveformType; label: string }> = [
  { id: 'sine', label: 'SIN' },
  { id: 'triangle', label: 'TRI' },
  { id: 'square', label: 'SQR' },
  { id: 'sawtooth', label: 'SAW' },
];

const depthLabels = ['VCO1', 'VCO2', 'VCO3', 'CUT', 'AMP', 'DRV'] as const;
const depthIndices = depthLabels.map((_, i) => i);

const rateHz = computed({
  get: () => config.value.rateHz,
  set: (v: number) => {
    config.value.rateHz = v;
  },
});

const waveform = computed({
  get: () => config.value.waveform,
  set: (v: LfoWaveformType) => {
    config.value.waveform = v;
  },
});

function setDepth(index: number, value: number): void {
  config.value.depths[index] = value;
}

function rateFormat(v: number): string {
  return v < 10 ? `${v.toFixed(2)} Hz` : `${v.toFixed(1)} Hz`;
}

function depthFormat(v: number): string {
  const pct = Math.round(v * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}
</script>
