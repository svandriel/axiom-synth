<template>
  <div class="flex justify-between items-center">
    <h1 class="text-3xl tracking-tight">
      Axiom <span class="text-pink-600 font-mono">xs</span>
      <span class="text-slate-500">&raquo;</span> poly synthesizer
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
import { useThemeMode } from "../composables/use-theme-mode.ts";
import Toggle from "./Toggle.vue";

const themeMode = useThemeMode();
</script>
