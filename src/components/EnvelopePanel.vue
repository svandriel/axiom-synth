<template>
  <Panel label="Envelope">
    <template #top-right>
      <Toggle :values="envelopes" v-model="current" />
    </template>
    <div class="mt-4 grid grid-cols-4 grid-rows-2 gap-4">
      <Knob
        class="col-start-1 row-start-1"
        size="sm"
        :from="1"
        :to="5000"
        :default="20"
        :log-base="2"
        v-model="attack"
        label="Attack"
        :format="timeDisplayMs"
        :show-value="false"
      />
      <Knob
        class="col-start-2 row-start-1"
        size="sm"
        :from="1"
        :to="5000"
        :default="10"
        :log-base="2"
        v-model="decay"
        label="Decay"
        :format="timeDisplayMs"
        :show-value="false"
      />
      <Knob
        class="col-start-1 row-start-2"
        size="sm"
        :from="0"
        :to="1"
        :default="0.6"
        v-model="sustain"
        label="Sustain"
        :format="dbDisplay"
        :show-value="false"
      />
      <Knob
        class="col-start-2 row-start-2"
        size="sm"
        :from="1"
        :to="10000"
        :log-base="2"
        :default="400"
        v-model="release"
        label="Release"
        :format="timeDisplayMs"
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
import type { EnvelopeConfig } from '../types/envelope-config.ts';
import type { NumericKeys } from '../types/numeric-keys.ts';
import { dbDisplay } from '../utils/db-display.ts';
import { timeDisplayMs } from '../utils/time-display.ts';
import Knob from './Knob.vue';
import Panel from './Panel.vue';
import Toggle from './Toggle.vue';

const amp = defineModel<EnvelopeConfig>('amp', { required: true });
const filter = defineModel<EnvelopeConfig>('filter', { required: true });

const current = ref('amp');

function makeComputed<K extends NumericKeys<EnvelopeConfig>>(
  key: K,
  scale: number = 1,
) {
  return computed({
    get: () =>
      scale * (current.value === 'amp' ? amp.value[key] : filter.value[key]),
    set(value) {
      if (current.value === 'amp') {
        amp.value[key] = value / scale;
      } else {
        filter.value[key] = value / scale;
      }
    },
  });
}

const attack = makeComputed('attackSeconds', 1000);
const decay = makeComputed('decaySeconds', 1000);
const sustain = makeComputed('sustainLevel');
const release = makeComputed('releaseSeconds', 1000);

const envelopes = [
  { id: 'amp', label: 'Amp' },
  { id: 'filter', label: 'Filter' },
];
</script>
