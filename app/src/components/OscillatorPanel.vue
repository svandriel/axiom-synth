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
        label="Voices"
        v-model="modelValue.unison.voices"
        size="sm"
        class="row-start-2"
        color="accent2"
        :from="1"
        :to="16"
        :default="1"
        :tick-size="1"
        :show-value="false"
      />
      <Knob
        label="Detune"
        v-model="modelValue.unison.detune"
        size="sm"
        class="row-start-2"
        color="accent2"
        :from="0"
        :to="50"
        :default="0"
        :format="fractionDisplay(1)"
        :show-value="false"
      />
      <Knob
        label="Depth"
        v-model="modelValue.unison.depth"
        size="sm"
        class="row-start-2"
        color="accent2"
        :from="0"
        :to="1"
        :default="0"
        :format="percentageDisplay"
        :show-value="false"
      />
      <Knob
        label="Blend"
        v-model="modelValue.unison.blend"
        size="sm"
        class="row-start-2"
        color="accent2"
        :from="0"
        :to="1"
        :default="1"
        :format="percentageDisplay"
        :show-value="false"
      />
    </div>
  </Panel>
</template>

<script setup lang="ts">
import type { OscillatorConfig, WaveFormType } from '@axiom/audio-engine';
import { dbDisplay, fractionDisplay, semiDisplay } from '../utils';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';

defineProps<{
  label?: string;
}>();

defineModel<OscillatorConfig>({
  required: true,
});

const percentageDisplay = (value: number) => fractionDisplay(0)(value * 100);

const waveForms: Array<{ id: WaveFormType; label: string }> = [
  { id: 'sawtooth', label: 'Saw' },
  { id: 'sine', label: 'Sin' },
  { id: 'square', label: 'Sqr' },
  { id: 'triangle', label: 'Tri' },
];
</script>
