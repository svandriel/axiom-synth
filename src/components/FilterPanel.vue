<template>
  <div class="section">
    <div class="flex flex-row items-center justify-between">
      <div class="text-sm tracking-wide uppercase">
        {{ label }}
      </div>
    </div>
    <div>
      <Knob
        label="Cutoff"
        v-model="cutoff"
        class="mt-3"
        :from="20"
        :to="20000"
        :default="20000"
        :format="v => `${v.toFixed(0)} Hz`"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import Knob from './Knob.vue';

const cutoff = defineModel<number>('cutoff', {
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
