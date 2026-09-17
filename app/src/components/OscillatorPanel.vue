<template>
  <Panel :label="label ?? 'osc'">
    <template #top-right>
      <div class="flex flex-row items-center justify-between gap-2">
        <Toggle :values="waveForms" v-model="modelValue.waveform" />
        <Knob
          label="Gain"
          v-model="modelValue.gain"
          size="xs"
          :from="0"
          :to="2"
          :default="1"
          :format="dbDisplay"
          :show-value="false"
        />
      </div>
    </template>

    <div class="grid grid-cols-4 grid-rows-2 gap-4 gap-y-2">
      <Knob
        label="Oct"
        v-model="modelValue.octave"
        size="sm"
        :from="-4"
        :to="4"
        :default="0"
        :tick-size="1"
        :format="semiDisplay"
        :show-value="false"
      />
      <Knob
        label="Semi"
        v-model="modelValue.semi"
        size="sm"
        :from="-11"
        :to="11"
        :default="0"
        :tick-size="1"
        :format="semiDisplay"
        :show-value="false"
      />
      <Knob
        label="Detune"
        v-model="modelValue.detune"
        size="sm"
        :from="-50"
        :to="50"
        :default="0"
        :format="fractionDisplay(1)"
        :show-value="false"
      />
      <Knob
        label="Unison"
        v-model="unison"
        size="sm"
        class="row-start-2"
        :from="0"
        :to="8"
        :default="0"
        :tick-size="1"
        :format="semiDisplay"
        :show-value="false"
        :disabled="true"
      />
      <Knob
        label="Detune"
        v-model="unisonDetune"
        size="sm"
        class="row-start-2"
        :from="0"
        :to="50"
        :default="0"
        :format="fractionDisplay(1)"
        :show-value="false"
        :disabled="true"
      />
      <Knob
        label="Spread"
        v-model="unisonSpread"
        size="sm"
        class="row-start-2"
        :from="-50"
        :to="50"
        :default="0"
        :format="fractionDisplay(1)"
        :show-value="false"
        :disabled="true"
      />
      <Knob
        label="Blend"
        v-model="unisonBlend"
        size="sm"
        class="row-start-2"
        :from="-50"
        :to="50"
        :default="0"
        :format="fractionDisplay(1)"
        :show-value="false"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import type { OscillatorConfig, WaveFormType } from '@axiom/audio-engine';
import { dbDisplay } from '../utils/db-display.ts';
import { fractionDisplay } from '../utils/fraction-display.ts';
import { semiDisplay } from '../utils/semi-display.ts';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';
import { ref } from 'vue';

defineProps<{
  label?: string;
}>();

defineModel<OscillatorConfig>({
  required: true,
});

const unison = ref(0);
const unisonDetune = ref(0);
const unisonSpread = ref(0);
const unisonBlend = ref(0);

const waveForms: Array<{ id: WaveFormType; label: string }> = [
  { id: 'sawtooth', label: 'Saw' },
  { id: 'sine', label: 'Sin' },
  { id: 'square', label: 'Sqr' },
  { id: 'triangle', label: 'Tri' },
];
</script>
