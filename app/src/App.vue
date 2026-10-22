<script setup lang="ts">
import HeaderBar from './components/HeaderBar.vue';
import Synth from './components/Synth.vue';
import { useAudioEnvironment } from './composables/use-audio-environment.ts';

const { data, pending } = useAudioEnvironment();
</script>

<template>
  <div class="mx-auto max-w-275">
    <HeaderBar />
    <div v-if="pending">Loading...</div>
    <Synth class="mt-3" v-if="data" :env="data" />
  </div>
</template>
