<template>
  <div class="flex items-center justify-between">
    <h1 class="text-3xl tracking-tight">
      <span class="tracking-tighter">axiom</span>
      <span class="font-mono text-accent-600">xs</span>

      <span class="text-primary-500">&raquo;</span>

      <span class="">poly</span>
    </h1>
    <div>
      <Toggle
        :values="[
          { id: 'dark', label: 'Dark' },
          { id: 'light', label: 'Light' },
        ]"
        v-model="themeMode"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { useThemeMode } from '../composables/use-theme-mode.ts';
import Toggle from './Toggle.vue';

const themeMode = useThemeMode();
</script>
