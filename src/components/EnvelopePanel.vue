<template>
  <Panel label="Envelope">
    <template #top-right>
      <Toggle :values="envelopes" v-model="current" />
    </template>
    <div class="mt-4 grid grid-cols-4 grid-rows-2 gap-4">
      <Knob
        class="col-start-1 row-start-1"
        size="sm"
        :from="0.0001"
        :to="5"
        :default="0.02"
        :log-base="2"
        v-model="attack"
        label="Attack"
        :format="timeDisplay"
        :show-value="false"
      />
      <Knob
        class="col-start-2 row-start-1"
        size="sm"
        :from="0.0001"
        :to="5"
        :log-base="2"
        v-model="decay"
        label="Decay"
        :format="timeDisplay"
        :show-value="false"
      />
      <Knob
        class="col-start-1 row-start-2"
        size="sm"
        :from="0"
        :to="1"
        :default="0.5"
        v-model="sustain"
        label="Sustain"
        :format="dbDisplay"
        :show-value="false"
      />
      <Knob
        class="col-start-2 row-start-2"
        size="sm"
        :from="0.001"
        :to="10"
        :log-base="2"
        v-model="release"
        label="Release"
        :format="timeDisplay"
        :show-value="false"
      />
      <div
        class="relative col-span-2 col-start-3 row-span-2 row-start-1 overflow-hidden rounded-2xl bg-black"
      >
        <canvas ref="envGraph" class="block h-full w-full bg-primary-800" />
      </div>
    </div>
  </Panel>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';
import type { EnvelopeConfig } from '../types/envelope-config.ts';
import Knob from './Knob.vue';
import { timeDisplay } from '../utils/time-display.ts';
import { dbDisplay } from '../utils/db-display.ts';

const amp = defineModel<EnvelopeConfig>('amp', { required: true });
const filter = defineModel<EnvelopeConfig>('filter', { required: true });

const current = ref('amp');

const attack = computed({
  get() {
    return current.value === 'amp'
      ? amp.value.attackSeconds
      : filter.value.attackSeconds;
  },
  set(value) {
    if (current.value === 'amp') {
      amp.value.attackSeconds = value;
    } else {
      filter.value.attackSeconds = value;
    }
  },
});

const decay = computed({
  get() {
    return current.value === 'amp'
      ? amp.value.decaySeconds
      : filter.value.decaySeconds;
  },
  set(value) {
    if (current.value === 'amp') {
      amp.value.decaySeconds = value;
    } else {
      filter.value.decaySeconds = value;
    }
  },
});

const sustain = computed({
  get() {
    return current.value === 'amp'
      ? amp.value.sustainLevel
      : filter.value.sustainLevel;
  },
  set(value) {
    if (current.value === 'amp') {
      amp.value.sustainLevel = value;
    } else {
      filter.value.sustainLevel = value;
    }
  },
});

const release = computed({
  get() {
    return current.value === 'amp'
      ? amp.value.releaseSeconds
      : filter.value.releaseSeconds;
  },
  set(value) {
    if (current.value === 'amp') {
      amp.value.releaseSeconds = value;
    } else {
      filter.value.releaseSeconds = value;
    }
  },
});

const envelopes = [
  { id: 'amp', label: 'Amp' },
  { id: 'filter', label: 'Filter' },
];
</script>
