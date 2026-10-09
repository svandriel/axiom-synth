<script setup lang="ts">
import HeaderBar from './components/HeaderBar.vue';
import Synth from './components/Synth.vue';
import { useAudioEnvironment } from './composables/use-audio-environment.ts';

const env = useAudioEnvironment();
</script>

<template>
  <div class="mx-auto max-w-275">
    <HeaderBar />
    <Synth class="mt-3" :env="env" />
  </div>
</template>
