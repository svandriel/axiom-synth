<script setup lang="ts">
import effectsIcon from '../assets/icons/effects.svg';
import filterIcon from '../assets/icons/filter-shape.svg';
import oscillatorIcon from '../assets/icons/oscillators.svg';
import modulationIcon from '../assets/icons/modulation.svg';

const icons: Record<string, string> = {
  effects: effectsIcon,
  filter: filterIcon,
  oscillator: oscillatorIcon,
  modulation: modulationIcon,
};

export type IconName = keyof typeof icons;
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const sizeMap: Record<IconSize, string> = {
  xs: 'h-3 w-3',
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
  xl: 'h-7 w-7',
};

withDefaults(
  defineProps<{
    name: IconName;
    size?: IconSize;
  }>(),
  {
    size: 'md',
  },
);
</script>

<template>
  <component
    :is="icons[name]"
    v-if="icons[name]"
    class="inline-block"
    :class="sizeMap[size]"
    role="img"
    :aria-label="name"
    focusable="false"
  />
</template>
